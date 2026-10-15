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
  nativeStatements: D1Sql[];
  checkpoint: D1Sql[];
}) {
  await authorizeAccountImport(db, actor);
  stableId(input.accountId);
  const email = boundedText(input.email, 'email', 254);
  if (email !== email.toLowerCase() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) importError('ACCOUNT_EMAIL', 'Supply the account’s exact lowercase email.');
  if (!Array.isArray(input.nativeStatements) || !input.nativeStatements.length || !Array.isArray(input.checkpoint) || !input.checkpoint.length)
    importError('IMPORT_ERASURE_FENCE', 'Native erasure SQL and the portability redaction checkpoint are required.');
  return retireD1ImportCustody({
    target: { kind: 'account', id: input.accountId },
    values: [email],
    related: {
      source: record => containsExact(record.payload, email),
      original: bytes => accountCSVHoldsEmail(bytes, email),
    },
  }, input.nativeStatements, accountImportContext(db, actor), input.checkpoint);
}
