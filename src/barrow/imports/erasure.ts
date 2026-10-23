import { retireD1ImportCustody, type D1Database, type D1Sql, type Json } from '../../modules/import-kit/src/d1/index';
import { accountImportContext, authorizeAccountImport, type ImportActor } from './context';
import { accountCSVHoldsEmail } from './csv';
import { boundedText, importError, stableId } from './validation';

function containsExact(value: Json, identifier: string): boolean {
  if (typeof value === 'string') return value === identifier;
  if (Array.isArray(value)) return value.some(item => containsExact(item, identifier));
  if (value && typeof value === 'object') return Object.values(value).some(item => containsExact(item, identifier));
  return false;
}

/** Server-only integration point. The native owner supplies its complete erase
 * statements plus portability's real redactionStatements() checkpoint. These
 * commit atomically with every affected kit record, original and journal row. */
export async function retireAccountImportCustody(db: D1Database, actor: ImportActor, input: {
  accountId: string;
  email: string;
  emails?: string[];
  retainedEmail?: string;
  nativeStatements: D1Sql[];
  checkpoint: D1Sql[];
}) {
  await authorizeAccountImport(db, actor);
  stableId(input.accountId);
  const email = boundedText(input.email, 'email', 254);
  if (email !== email.toLowerCase() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) importError('ACCOUNT_EMAIL', 'Supply the account’s exact lowercase email.');
  if (!Array.isArray(input.nativeStatements) || !input.nativeStatements.length || !Array.isArray(input.checkpoint) || !input.checkpoint.length)
    importError('IMPORT_ERASURE_FENCE', 'Native erasure SQL and the portability redaction checkpoint are required.');
  const emails = [...new Set([email, ...(input.emails ?? [])])];
  const context = accountImportContext(db, actor);
  if (input.retainedEmail) {
    // Erase import custody while retaining the commercial account tombstone.
    // Only this exact non-routable, closed tombstone counts as absent to the kit.
    const targets = context.storage.targets, read = targets.read.bind(targets), matches = targets.matches.bind(targets);
    targets.read = async (...args) => {
      const row = await read(...args);
      return row?.targetId === input.accountId && (row.value as any)?.email === input.retainedEmail && (row.value as any)?.lifecycle === 'closed' ? undefined : row;
    };
    targets.matches = (row, destination, kind, id) => !row && id === input.accountId
      ? {sql: "NOT EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND (json_extract(value_json,'$.email')<>? OR json_extract(value_json,'$.lifecycle')<>'closed'))", params: [id,input.retainedEmail]}
      : matches(row,destination,kind,id);
  }
  return retireD1ImportCustody({
    target: { kind: 'account', id: input.accountId },
    values: emails,
    related: {
      source: record => emails.some(value => containsExact(record.payload, value)),
      original: bytes => emails.some(value => accountCSVHoldsEmail(bytes, value)),
    },
  }, [...input.nativeStatements,
    {sql:"UPDATE bw_platform_imports SET source_json='{}',report_json='{}' WHERE EXISTS(SELECT 1 FROM json_each(scope_json) WHERE value=?)",params:[input.accountId]},
    {sql:'DELETE FROM bw_import_history WHERE account_id=?',params:[input.accountId]},
    {sql:'DELETE FROM bw_import_invitations WHERE account_id=?',params:[input.accountId]},
    {sql:'DELETE FROM bw_import_lists WHERE account_id=?',params:[input.accountId]},
  ], context, input.checkpoint);
}
