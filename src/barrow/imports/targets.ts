import { canonicalJson, sha256, type D1Database, type D1Sql, type D1TargetAdapter, type ImportPlan, type Json, type TargetRow } from '../../modules/import-kit/src/d1/index';
import { accountImportDestination } from './csv';
import { importError, validateAccountValue } from './validation';

const sql = (sql: string, ...params: unknown[]): D1Sql => ({ sql, params });
function checkScope(destination: string, kind = 'account') {
  if (destination !== accountImportDestination || kind !== 'account') importError('IMPORT_SCOPE', 'Unsupported import destination or target kind.');
}
function decode(row: { id: string; value_json: string; revision: string }): TargetRow {
  return { destination: accountImportDestination, targetKind: 'account', targetId: row.id, revision: row.revision, value: JSON.parse(row.value_json) };
}

export function accountTargets(reversing = false, review?: { plan: ImportPlan; jobId: string }): D1TargetAdapter {
  const beforeImages = new Map(review?.plan.entries.filter(entry => !entry.erased).map(entry => [entry.source.sourceId,
    (entry.source.payload as unknown as { previous: TargetRow | null }).previous]) ?? []);
  return {
    async read(db, destination, kind, id) {
      checkScope(destination, kind);
      const row = await db.prepare('SELECT id,value_json,revision FROM bw_accounts WHERE id=?').bind(id).first<{ id: string; value_json: string; revision: string }>();
      const target = row ? decode(row) : undefined;
      if (review && beforeImages.has(id) && canonicalJson(target ?? null) !== canonicalJson(beforeImages.get(id))) {
        // On explicit resume, previous batches already published some accounts.
        // Only this job's exact attributed after-image may replace the reviewed
        // before-image; publication also fences that provenance inside its batch.
        const owned = await db.prepare("SELECT record_json FROM ik_provenance WHERE job_id=? AND target_kind='account' AND target_id=? AND destination=? AND reversed=0")
          .bind(review.jobId, id, destination).first<{ record_json: string }>();
        const provenance = owned ? JSON.parse(owned.record_json) : null;
        if (!target || provenance?.appliedRevision !== target.revision || provenance?.valueHash !== sha256(canonicalJson(target.value)))
          importError('IMPORT_REVIEW_CHANGED', 'An account changed after review. Preserve that edit and create a fresh dry-run.');
      }
      return target;
    },
    matches(row, destination, kind, id) {
      checkScope(destination, kind);
      const snapshot = row
        ? sql('EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=? AND json(value_json)=json(?))', id, row.revision, JSON.stringify(row.value))
        : sql('NOT EXISTS(SELECT 1 FROM bw_accounts WHERE id=?)', id);
      // Orders are external dependencies of undo, including an order created
      // between preflight and the transaction. Neither updates nor deletes undo them.
      if (reversing) return sql(`(${snapshot.sql}) AND NOT EXISTS(SELECT 1 FROM bw_orders WHERE account_id=?)`, ...(snapshot.params ?? []), id);
      return snapshot;
    },
    write(row) {
      checkScope(row.destination, row.targetKind);
      validateAccountValue(row.value);
      // Preserve the supplied key order: Base's exact after-image predicates
      // compare the same JSON representation, including on before-image restore.
      return [sql("INSERT INTO bw_guard(value) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND json_extract(value_json,'$.email')<>?) THEN 1 ELSE 0 END", row.targetId, (row.value as Record<string, Json>).email), sql('INSERT INTO bw_accounts(id,value_json,revision) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision', row.targetId, JSON.stringify(row.value), row.revision), sql('DELETE FROM bw_guard')];
    },
    remove(destination, kind, id) {
      checkScope(destination, kind);
      return [sql('DELETE FROM bw_accounts WHERE id=?', id)];
    },
    async list(db: D1Database, destination) {
      checkScope(destination);
      const rows = await db.prepare('SELECT id,value_json,revision FROM bw_accounts ORDER BY id').all<{ id: string; value_json: string; revision: string }>();
      return rows.results.map(decode);
    },
    matchesCount(count, destination) {
      checkScope(destination);
      return sql('(SELECT COUNT(*) FROM bw_accounts)=?', count);
    },
  };
}
