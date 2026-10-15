import {
  applyD1ImportBatches, canonicalJson, createD1ImportJob, planD1Import, readD1ImportJob,
  readD1ImportOriginals, readD1ImportUndoReport, resumeD1Import, sha256, undoD1Import,
  type D1Database, type ImportPlan, type Json,
} from '../../modules/import-kit/src/d1/index';
import { accountImportContext, accountImportPrincipal, authorizeAccountImport, type ImportActor } from './context';
import { accountImportDestination, accountImportMappingVersion, accountImportSource } from './csv';
import { importError, stableId, validateAccountValue } from './validation';
import { accountTargets } from './targets';
import { stored } from '../../modules/import-kit/src/d1/jobs';

export type AccountImportInput = { csv: string; namespace?: string };

async function preparePlan(db: D1Database, actor: ImportActor, input: AccountImportInput) {
  await authorizeAccountImport(db, actor);
  const source = accountImportSource(input.csv, input.namespace);
  // A source identity names one immutable export. Account target IDs remain the
  // caller's stable, non-email IDs, permitting later exports to supersede them.
  const namespace = `${source.records[0].namespace}:${source.artifacts[0].sha256}`;
  const context = accountImportContext(db, actor, namespace);
  const native = await context.storage.targets.list(db, context.destination);
  const existing = new Map(native.map(row => [row.targetId, row]));
  for (const record of source.records) {
    record.namespace = namespace;
    const account = validateAccountValue(record.payload);
    if (native.some(row => row.targetId !== record.sourceId && (row.value as Record<string, Json>).email === account.email))
      importError('ACCOUNT_EMAIL_DUPLICATE', 'That email already belongs to another trade account.');
    // Bind the complete before-image into the reviewed fingerprint, including
    // edits whose writer failed to change revision. The kit fences it on apply.
    record.payload = { account, previous: (existing.get(record.sourceId) ?? null) as unknown as Json };
    record.payloadHash = sha256(canonicalJson(record.payload));
  }
  const plan = await planD1Import(source, {
    version: accountImportMappingVersion,
    map(record) {
      const payload = record.payload as { account: Json; previous: { revision: string } | null };
      return { effects: [{ targetKind: 'account', targetId: record.sourceId, value: payload.account,
        ...(payload.previous ? { expectedRevision: payload.previous.revision } : {}) }] };
    },
  }, context);
  return { plan, context };
}

export async function dryRunAccountImport(db: D1Database, actor: ImportActor, input: AccountImportInput) {
  const { plan } = await preparePlan(db, actor, input);
  return { plan, fingerprint: plan.fingerprint, counts: plan.counts, diagnostics: plan.diagnostics };
}

export async function applyAccountImport(db: D1Database, actor: ImportActor, input: AccountImportInput & { fingerprint: string }) {
  await authorizeAccountImport(db, actor);
  if (typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint)) importError('IMPORT_APPROVAL', 'Supply the exact fingerprint approved after dry-run.');
  const source = accountImportSource(input.csv, input.namespace);
  const namespace = `${source.records[0].namespace}:${source.artifacts[0].sha256}`;
  const context = accountImportContext(db, actor, namespace);
  context.reviewedFingerprint = input.fingerprint;
  context.operationKey = `barrow-account-import:${input.fingerprint}`;
  const prior = await db.prepare('SELECT id FROM ik_jobs WHERE destination=? AND principal_id=? AND operation_key=?')
    .bind(context.destination, accountImportPrincipal, context.operationKey).first<{ id: string }>();
  if (prior) {
    const retained = await stored(prior.id, context, 'apply');
    context.storage.targets = accountTargets(false, { plan: retained.plan, jobId: prior.id });
    return resumeD1Import(prior.id, context);
  }
  const prepared = await preparePlan(db, actor, input);
  if (prepared.plan.fingerprint !== input.fingerprint) importError('IMPORT_REVIEW_CHANGED', 'The source or account state changed. Dry-run and approve the new fingerprint.');
  if (prepared.plan.diagnostics.some(diagnostic => diagnostic.severity === 'error')) importError('IMPORT_DIAGNOSTICS', 'Resolve all dry-run errors before applying.');
  // Recheck the reviewed before-images immediately before creating custody.
  // Batch publication additionally fences each complete native snapshot.
  const job = await createD1ImportJob(prepared.plan, context);
  context.storage.targets = accountTargets(false, { plan: prepared.plan, jobId: job.id });
  return applyD1ImportBatches(job.id, context);
}

async function jobContext(db: D1Database, actor: ImportActor, id: string, reversing = false) {
  await authorizeAccountImport(db, actor);
  stableId(id, 'jobId');
  const row = await db.prepare('SELECT namespace FROM ik_jobs WHERE id=? AND destination=? AND mapping_version=? AND principal_id=?')
    .bind(id, accountImportDestination, accountImportMappingVersion, accountImportPrincipal).first<{ namespace: string }>();
  if (!row) importError('IMPORT_JOB_NOT_FOUND', 'Import journal was not found or has been retired.');
  return accountImportContext(db, actor, row.namespace, reversing);
}

export async function listAccountImports(db: D1Database, actor: ImportActor, limit = 50) {
  await authorizeAccountImport(db, actor);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) importError('IMPORT_LIMIT', 'Journal limit must be from 1 through 100.');
  const rows = await db.prepare('SELECT id,namespace FROM ik_jobs WHERE destination=? AND mapping_version=? AND principal_id=? ORDER BY rowid DESC LIMIT ?')
    .bind(accountImportDestination, accountImportMappingVersion, accountImportPrincipal, limit).all<{ id: string; namespace: string }>();
  const jobs = [];
  for (const row of rows.results) jobs.push(await readD1ImportJob(row.id, accountImportContext(db, actor, row.namespace)));
  await authorizeAccountImport(db, actor);
  return jobs;
}

export async function getAccountImport(db: D1Database, actor: ImportActor, id: string) {
  const context = await jobContext(db, actor, id);
  const job = await readD1ImportJob(id, context);
  const originals = await readD1ImportOriginals(id, context);
  const undoReport = await readD1ImportUndoReport(id, context);
  return { job, originals, undoReport };
}

export async function undoAccountImport(db: D1Database, actor: ImportActor, id: string) {
  const context = await jobContext(db, actor, id, true);
  const dependency = await db.prepare("SELECT 1 AS found FROM bw_orders o JOIN ik_provenance p ON p.target_id=o.account_id WHERE p.job_id=? AND p.target_kind='account' AND p.reversed=0 LIMIT 1")
    .bind(id).first();
  if (dependency) importError('IMPORT_ORDER_DEPENDENCY', 'An order refers to an imported account. Preserve that account and order history.');
  return undoD1Import(id, context);
}

export type { ImportPlan };
