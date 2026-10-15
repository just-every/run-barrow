import { Buffer } from 'node:buffer';
import { canonicalJson, sha256, type SourceBundle } from '../../modules/import-kit/src/d1/index';
import { boundedText, importError, stableId, validateAccountValue, type AccountValue } from './validation';

export const accountCSVHeaders = ['accountId', 'name', 'email', 'pierCustomerId', 'termsDays', 'minimumCents', 'sku', 'unitCents', 'minQty'] as const;
export const defaultAccountNamespace = 'barrow-trade-accounts';
export const accountImportMappingVersion = 'barrow-trade-accounts-v1';
export const accountImportDestination = 'barrow-trade-accounts';
const maxRows = 1000;

function parseCSV(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  const finishCell = () => { row.push(cell); cell = ''; closed = false; };
  const finishRow = () => {
    finishCell();
    if (row.some(Boolean)) rows.push(row);
    row = [];
    if (rows.length > maxRows + 1) importError('CSV_ROWS', 'Supply at most 1000 account/price rows.');
  };
  for (let n = input.startsWith('\uFEFF') ? 1 : 0; n < input.length; n++) {
    const ch = input[n];
    if (quoted) {
      if (ch === '"' && input[n + 1] === '"') { cell += '"'; n++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else cell += ch;
    } else if (ch === ',') finishCell();
    else if (ch === '\r' || ch === '\n') { if (ch === '\r' && input[n + 1] === '\n') n++; finishRow(); }
    else if (ch === '"' && !cell && !closed) quoted = true;
    else if (ch === '"' || closed) importError('CSV_QUOTES', 'A quoted field must end at a separator or line ending.');
    else cell += ch;
  }
  if (quoted) importError('CSV_QUOTES', 'Unclosed quoted CSV field.');
  if (cell || row.length || closed) finishRow();
  return rows;
}

/** Exact email-field matching only; never a substring search over personal data. */
export function accountCSVHoldsEmail(bytes: Uint8Array, email: string): boolean {
  const rows = parseCSV(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (rows.shift()?.join(',') !== accountCSVHeaders.join(',')) importError('CSV_HEADERS', 'Retained account CSV has unexpected headers.');
  return rows.some(row => row[2] === email);
}

function integerCell(value: string, field: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) importError('CSV_NUMBER', `${field} must contain an integer without a sign, decimals or currency symbol.`);
  return Number(value);
}

export function accountImportSource(csv: string, namespace = defaultAccountNamespace): SourceBundle {
  stableId(namespace, 'namespace');
  if (typeof csv !== 'string' || csv.length > 256 * 1024) importError('CSV_SIZE', 'CSV must be UTF-8 text of at most 256 KiB.');
  const bytes = Buffer.from(csv, 'utf8');
  if (bytes.length > 256 * 1024 || bytes.toString('utf8') !== csv) importError('CSV_SIZE', 'CSV must be valid UTF-8 text of at most 256 KiB.');
  const rows = parseCSV(csv);
  if (rows.shift()?.join(',') !== accountCSVHeaders.join(',')) importError('CSV_HEADERS', `Use these exact headers: ${accountCSVHeaders.join(',')}`);
  if (!rows.length) importError('CSV_EMPTY', 'Supply at least one account.');
  const accounts = new Map<string, { value: AccountValue; row: number }>();
  for (const [index, cells] of rows.entries()) {
    if (cells.length !== accountCSVHeaders.length) importError('CSV_COLUMNS', `CSV row ${index + 2} must have nine columns.`);
    const [sourceId, name, email, pierCustomerId, terms, minimum, sku, unit, quantity] = cells;
    const id = stableId(sourceId);
    const value = validateAccountValue({ name, email, pierCustomerId, termsDays: integerCell(terms, 'termsDays'), minimumCents: integerCell(minimum, 'minimumCents'), prices: [] });
    const prior = accounts.get(id);
    if (prior && canonicalJson({ ...prior.value, prices: [] }) !== canonicalJson(value)) importError('CSV_ACCOUNT_CONFLICT', `Repeated accountId ${id} has conflicting account details.`);
    if (!prior) accounts.set(id, { value, row: index + 2 });
    const current = accounts.get(id)!;
    if (sku || unit || quantity) {
      if (!sku || !unit || !quantity) importError('CSV_PRICE', `CSV row ${index + 2} requires all three price fields.`);
      current.value.prices.push({ sku: boundedText(sku, 'sku', 100), unitCents: integerCell(unit, 'unitCents'), minQty: integerCell(quantity, 'minQty') });
    } else if (prior) importError('CSV_ACCOUNT_DUPLICATE', 'Repeated account rows must each provide a distinct SKU.');
  }
  if (accounts.size > 200) importError('CSV_ACCOUNTS', 'Supply at most 200 accounts per import.');
  const emails = new Set<string>(), hash = sha256(bytes), artifact = 'trade-accounts.csv';
  const records = [...accounts.entries()].map(([sourceId, account]) => {
    const value = validateAccountValue(account.value);
    if (emails.has(value.email)) importError('CSV_EMAIL_DUPLICATE', 'Different accounts cannot use the same email.');
    emails.add(value.email);
    // Sorted prices make grouping independent of CSV price-row order.
    value.prices.sort((a, b) => a.sku.localeCompare(b.sku, 'en'));
    return { namespace, kind: 'trade-account', sourceId, payload: value, payloadHash: sha256(canonicalJson(value)), artifactHash: hash, location: { artifact, row: account.row } };
  });
  return { records, diagnostics: [], artifacts: [{ name: artifact, sha256: hash, size: bytes.length, original: { status: 'available', base64: bytes.toString('base64') } }] };
}
