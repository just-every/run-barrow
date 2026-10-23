import { Buffer } from 'node:buffer';
import { inspectWorkbook } from './cutover-xlsx';
import readExcelFile from 'read-excel-file/universal';
import { fail as problem } from '../model';
import { sha256 } from '../../modules/import-kit/src/provenance/identity';

export type CutoverInput = {
  workbook: { name: string; base64: string };
  ledger: { name: string; csv: string };
  scope: string[];
  runId: string;
  consent: boolean;
  mappings?: Record<string, string>;
};
export type CutoverRecord = {
  kind: 'accounts' | 'variants' | 'prices' | 'locations' | 'orders' | 'releases' | 'receivables';
  id: string; accountId?: string; orderId?: string; name?: string; sku?: string;
  currency?: string; amountCents?: number; quantity?: number;
  citation: { artifact: string; sha256: string; sheet: string; row: number };
  [key: string]: unknown;
};
type Kind = CutoverRecord['kind'];
type Column = { field: string; headers: string[]; type?: 'id' | 'currency' | 'money' | 'integer'; optional?: boolean };
type Layout = { kind: Kind; sheets: string[]; columns: Column[] };
const column = (field: string, headers: string[], type?: Column['type'], optional = false): Column => ({ field, headers, type, optional });
const account = column('accountId', ['Customer ID', 'Account ID'], 'id');
const currency = column('currency', ['Currency', 'Currency Code'], 'currency');
const quantity = column('quantity', ['Quantity', 'Qty'], 'integer', true);
const layouts: Layout[] = [
  { kind: 'accounts', sheets: ['Accounts', 'Customers'], columns: [column('id', ['Customer ID', 'Account ID'], 'id'), column('name', ['Company Name', 'Customer Name'])] },
  { kind: 'variants', sheets: ['Products', 'Variants'], columns: [column('id', ['Product ID', 'Variant ID'], 'id'), column('sku', ['SKU', 'Product SKU']), column('name', ['Product Name', 'Name'], undefined, true)] },
  { kind: 'prices', sheets: ['Prices', 'Price Book', 'Price Books'], columns: [column('id', ['Price ID'], 'id'), account, column('sku', ['SKU', 'Product SKU']), currency, column('amountCents', ['Unit Price', 'Price'], 'money')] },
  { kind: 'locations', sheets: ['Locations', 'Ship To Locations'], columns: [column('id', ['Location ID', 'Ship To ID'], 'id'), account, column('name', ['Location Name', 'Ship To Name'])] },
  { kind: 'orders', sheets: ['Orders', 'Open Orders', 'Order/Quote'], columns: [column('id', ['Order ID', 'Document System ID'], 'id'), account, currency, column('amountCents', ['Order Total', 'Total', 'Total Order Value'], 'money'), column('documentType', ['Type'], undefined, true), column('poNumber', ['PO Number', 'PO Reference', 'Customer PO'], undefined, true), column('releaseCount', ['Release Count', 'Expected Releases'], 'integer', true), quantity] },
  { kind: 'releases', sheets: ['Releases', 'Order Releases'], columns: [column('id', ['Release ID'], 'id'), column('orderId', ['Order ID'], 'id'), account, currency, column('amountCents', ['Release Total', 'Total'], 'money'), column('releaseNumber', ['Release Number', 'Release No'], 'integer', true), quantity] },
  { kind: 'receivables', sheets: ['Invoices'], columns: [column('id', ['Invoice ID', 'Invoice Number'], 'id'), account, column('orderId', ['Order ID'], 'id'), currency, column('amountCents', ['Balance', 'Outstanding Balance'], 'money')] },
];
const maxBytes = 1024 * 1024, maxRows = 5000;
function fail(code: string, message: string): never { problem(`CUTOVER_${code}`, message, 400); }
const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
function text(value: unknown, label: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value))
    fail('FIELD', `${label} must be trimmed text of at most ${max} characters.`);
  return value;
}
function identity(value: unknown, label: string): string {
  const result = text(value, label, 100);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) fail('IDENTITY', `${label} must be a stable ID (letters, digits, dot, underscore, colon or dash).`);
  return result;
}
function money(value: unknown, label: string): number {
  const source = text(value, label, 40);
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(source)) fail('MONEY', `${label} requires plain dollars with at most two decimal places.`);
  const negative = source.startsWith('-'), [whole, fraction = ''] = source.replace(/^-/, '').split('.');
  const cents = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (negative ? -1n : 1n);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) fail('MONEY', `${label} exceeds the exact cents range.`);
  return Number(cents);
}
function integer(value: unknown, label: string): number {
  const source = text(value, label, 20), result = Number(source);
  if (!/^(?:0|[1-9]\d*)$/.test(source) || !Number.isSafeInteger(result)) fail('NUMBER', `${label} must be an exact nonnegative whole number.`);
  return result;
}


function csvRows(csv: string): { row: number; cells: string[] }[] {
  const rows: { row: number; cells: string[] }[] = [];
  let cells: string[] = [], cell = '', quoted = false, closed = false, line = 1, rowLine = 1;
  const finishCell = () => { cells.push(cell); cell = ''; closed = false; };
  const finishRow = () => { finishCell(); rows.push({ row: rowLine, cells }); cells = []; if (rows.length > maxRows + 1) fail('ROWS', 'Ledger exceeds 5000 data rows.'); };
  for (let n = csv.startsWith('\uFEFF') ? 1 : 0; n < csv.length; n++) {
    const ch = csv[n];
    if (quoted) {
      if (ch === '"' && csv[n + 1] === '"') { cell += '"'; n++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else { cell += ch; if (ch === '\n' || ch === '\r' && csv[n + 1] !== '\n') line++; }
    } else if (ch === ',') finishCell();
    else if (ch === '\r' || ch === '\n') { if (ch === '\r' && csv[n + 1] === '\n') n++; finishRow(); line++; rowLine = line; }
    else if (ch === '"' && !cell && !closed) quoted = true;
    else if (ch === '"' || closed) fail('CSV', 'Ledger has malformed CSV quoting.');
    else cell += ch;
  }
  if (quoted) fail('CSV', 'Ledger has an unclosed quoted field.');
  if (cell || cells.length || closed) finishRow();
  return rows;
}

export async function parseCutoverSource(input: CutoverInput) {
  if (!input || typeof input !== 'object') fail('INPUT', 'Supply a workbook and ledger export.');
  identity(input.runId, 'runId');
  if (!Array.isArray(input.scope) || input.scope.some(id => typeof id !== 'string') || new Set(input.scope).size !== input.scope.length) fail('SCOPE', 'Scope must list distinct native target account IDs.');
  const workbookName = text(input.workbook?.name, 'Workbook filename', 200), ledgerName = text(input.ledger?.name, 'Ledger filename', 200);
  if (!/\.xlsx$/i.test(workbookName) || !/\.csv$/i.test(ledgerName) || /[\\/]/.test(workbookName + ledgerName)) fail('INPUT', 'Supply an XLSX workbook and CSV ledger with plain filenames.');
  const base64 = input.workbook.base64;
  if (typeof base64 !== 'string' || !base64 || base64.length > Math.ceil(maxBytes / 3) * 4 || base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) fail('SIZE', 'Workbook must be canonical base64 encoding at most 1 MiB of XLSX bytes.');
  const workbook = Buffer.from(base64, 'base64');
  if (workbook.length > maxBytes || workbook.toString('base64') !== base64) fail('INPUT', 'Workbook base64 is not canonical.');
  const csv = input.ledger.csv;
  if (typeof csv !== 'string' || csv.length > maxBytes) fail('SIZE', 'Ledger must be UTF-8 CSV of at most 1 MiB.');
  const ledger = Buffer.from(csv, 'utf8');
  if (ledger.length > maxBytes || ledger.toString('utf8') !== csv) fail('SIZE', 'Ledger must be valid UTF-8 CSV of at most 1 MiB.');
  const workbookData = inspectWorkbook(workbook);
  const artifacts = [{ name: workbookName, sha256: sha256(workbook), base64 }, { name: ledgerName, sha256: sha256(ledger), base64: ledger.toString('base64') }];
  // Keep numeric XML lexemes intact: never round dollar values through a JS float.
  let sheets: Awaited<ReturnType<typeof readExcelFile<string>>> = [];
  try { sheets = await readExcelFile(workbookData, { trim: false, parseNumber: value => value }); }
  catch { fail('XLSX', 'Workbook could not be read as an XLSX export.'); }
  const records: CutoverRecord[] = [], fields: { kind: Kind; sheet: string; field: string; column: string }[] = [], missing: string[] = [];
  const sourceKeys = new Set<string>(), suppliedKinds = new Set<Kind>();
  let rowCount = 0;
  for (const layout of layouts) {
    const matches = layout.kind === 'receivables' ? [] : sheets.filter(sheet => layout.sheets.some(alias => normalize(alias) === normalize(sheet.sheet)));
    if (matches.length > 1) fail('SHEET', `Multiple sheets represent ${layout.kind}.`);
    const sheet = matches[0]?.sheet ?? 'Invoices';
    const rows = layout.kind === 'receivables' ? csvRows(csv) : matches[0]?.data.map((cells, index) => ({ cells: cells as unknown[], row: index + 1 }));
    if (!rows?.length) { missing.push(`${layout.kind}: source ${layout.kind === 'receivables' ? 'ledger' : 'sheet'} is missing or empty`); continue; }
    suppliedKinds.add(layout.kind);
    const headers = rows[0].cells.map((value, index) => { text(typeof value === 'string' ? value.trim() : value, `${sheet} header ${index + 1}`, 100); return value as string; });
    if (headers.length > 256 || new Set(headers.map(normalize)).size !== headers.length) fail('HEADERS', `${sheet} has duplicate headers or more than 256 columns.`);
    const columns = layout.columns.map(spec => {
      const indexes = headers.flatMap((header, index) => spec.headers.some(alias => normalize(alias) === normalize(header)) ? [index] : []);
      if (indexes.length > 1 || !indexes.length && !spec.optional) fail('HEADERS', `${sheet} requires one unambiguous ${spec.headers[0]} column.`);
      if (indexes.length) fields.push({ kind: layout.kind, sheet, field: spec.field, column: headers[indexes[0]] });
      return { ...spec, index: indexes[0] ?? -1 };
    });
    let count = 0;
    for (const row of rows.slice(1)) {
      if (row.cells.every(value => value === null || value === '')) continue;
      if (++rowCount > maxRows) fail('ROWS', 'Combined workbook and ledger exceed 5000 data rows.');
      if (row.cells.length > headers.length || layout.kind === 'receivables' && row.cells.length !== headers.length) fail('COLUMNS', `${sheet} row ${row.row} has the wrong column count.`);
      const originalFields = Object.create(null) as Record<string, string | null>;
      headers.forEach((header, index) => {
        const value = row.cells[index] ?? null;
        if (value !== null && (typeof value !== 'string' || value.length > 8000 || /[\u0000\u007f]/u.test(value))) fail('FIELD', `${sheet} row ${row.row} contains an unsupported cell value.`);
        originalFields[header] = value as string | null;
      });
      const record: CutoverRecord = { kind: layout.kind, id: '', citation: { artifact: layout.kind === 'receivables' ? ledgerName : workbookName, sha256: artifacts[layout.kind === 'receivables' ? 1 : 0].sha256, sheet, row: row.row }, originalFields };
      for (const spec of columns) {
        const value = row.cells[spec.index], label = `${sheet} row ${row.row} ${spec.headers[0]}`;
        if (spec.optional && (spec.index < 0 || value === null || value === undefined || value === '')) continue;
        record[spec.field] = spec.type === 'money' ? money(value, label) : spec.type === 'integer' ? integer(value, label) : spec.type === 'id' ? identity(value, label) : text(value, label, spec.field === 'sku' ? 100 : 500);
        if (spec.type === 'currency' && !/^[A-Z]{3}$/.test(record[spec.field] as string)) fail('CURRENCY', `${label} requires an uppercase three-letter currency code.`);
      }
      if(record.kind==='orders'&&record.documentType!==undefined&&record.documentType!=='Order')fail('DOCUMENT_TYPE', `${sheet} row ${row.row} is not an Order. Keep quotes in a separate retained source export; never map them as accepted orders.`);
      const key = `${record.kind}:${record.id}`;
      if (sourceKeys.has(key)) fail('DUPLICATE', `${sheet} row ${row.row} repeats a source ID.`);
      sourceKeys.add(key); records.push(record); count++;
    }
    if (!count) missing.push(`${layout.kind}: source contains no records`);
  }
  const byKey = new Map(records.map(record => [`${record.kind}:${record.id}`, record]));
  const variantSkus = records.filter(record => record.kind === 'variants').map(record => record.sku), skus = new Set(variantSkus);
  if (skus.size !== variantSkus.length) fail('IDENTITY', 'Products must use distinct SKUs.');
  for (const record of records) {
    if (suppliedKinds.has('accounts') && record.accountId && !byKey.has(`accounts:${record.accountId}`)) fail('IDENTITY', `${record.citation.sheet} row ${record.citation.row} references an absent customer ID.`);
    const order = record.orderId ? byKey.get(`orders:${record.orderId}`) : undefined;
    if (suppliedKinds.has('orders') && record.orderId && (!order || order.accountId !== record.accountId || order.currency !== record.currency)) fail('IDENTITY', `${record.citation.sheet} row ${record.citation.row} has an absent order or mismatched customer/currency.`);
    if (suppliedKinds.has('variants') && record.kind === 'prices' && !skus.has(record.sku)) fail('IDENTITY', `${record.citation.sheet} row ${record.citation.row} references an absent SKU.`);
  }
  return { records, artifacts, fields, missing };
}
