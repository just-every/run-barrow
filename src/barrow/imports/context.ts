import type { D1Database, D1ImportContext, D1Sql } from '../../modules/import-kit/src/d1/index';
import { accountImportDestination, accountImportMappingVersion, defaultAccountNamespace } from './csv';
import { accountTargets } from './targets';
import { importError } from './validation';

export type ImportActor = { id: string; role: string };
// Durable custody belongs to the installation's trade administration grant.
// Identity IDs change on restore; current actor authority always comes from SQL.
export const accountImportPrincipal = 'grant:barrow-trade-administration';

export function importAuthority(actor: ImportActor): D1Sql {
  if (!actor || typeof actor.id !== 'string' || !actor.id || !['owner', 'admin'].includes(actor.role))
    importError('FORBIDDEN', 'An active owner or admin must perform this import action.');
  return { sql: "EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role=? AND role IN ('owner','admin') AND status='active')", params: [actor.id, actor.role] };
}

export async function authorizeAccountImport(db: D1Database, actor: ImportActor): Promise<void> {
  const authority = importAuthority(actor);
  const row = await db.prepare(`SELECT CASE WHEN (${authority.sql}) THEN 1 ELSE 0 END AS allowed`).bind(...(authority.params ?? [])).first<{ allowed: number }>();
  if (row?.allowed !== 1) importError('FORBIDDEN', 'An active owner or admin must perform this import action.');
}

export function accountImportContext(db: D1Database, actor: ImportActor, namespace = defaultAccountNamespace, reversing = false): D1ImportContext {
  importAuthority(actor);
  return {
    destination: accountImportDestination, namespace, mappingVersion: accountImportMappingVersion,
    batchSize: 10, maxBatches: 1,
    storage: { database: db, targets: accountTargets(reversing) },
    authorization: { principalId: accountImportPrincipal, predicate: () => importAuthority(actor) },
  };
}
