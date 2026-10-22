// Product pre/post conditions around Base's unchanged archive transport. Local
// CLI commands must honor the same outside-D1 journal as HTTP and cron doors.
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {parseJsonc} from '@runeditrun/rer/jsonc';
import {fileRecords} from '@runeditrun/rer/modules/portability/files';
import {localPortability} from '@runeditrun/rer/portability';
import {refuse} from '@runeditrun/rer/errors';
export function erasurePortability() {
 const base=localPortability({database:'foundation',policyModule:'src/barrow/portability-policy.mjs',transient:['local runtime caches and logs']});
 async function guarded(context,direction) {
  if(context.platform==='container')return base[direction](context);
  await journalCheck(context,direction==='import'?context.path:undefined);
  const receipt=await base[direction](context);
  if(direction==='import')await journalCheck(context);
  return receipt;
 }
 return {...base,export:context=>guarded(context,'export'),import:context=>guarded(context,'import')};
}
async function journalCheck({root},archive) {
 await mkdir(join(root,'.wrangler'),{recursive:true});
 const directory=await mkdtemp(join(root,'.wrangler','erasure-bridge-'));let proxy;
 try {
  const config=parseJsonc(await readFile(join(root,'wrangler.jsonc'),'utf8'));
  const path=join(directory,'bindings.json');
  await writeFile(path,JSON.stringify(Object.fromEntries(['name','compatibility_date','compatibility_flags','d1_databases','r2_buckets'].filter(key=>config[key]!==undefined).map(key=>[key,config[key]]))),{mode:0o600});
  const {getPlatformProxy}=createRequire(join(root,'package.json'))('wrangler');
  proxy=await getPlatformProxy({configPath:path,persist:{path:join(root,'.wrangler/state/v3')},remoteBindings:false});
  const bridge=join(directory,'journal.mjs');
  await build({entryPoints:[join(root,'src/barrow/erasure-journal.ts')],outfile:bridge,bundle:true,format:'esm',platform:'node',target:'node22',external:['node:*','cloudflare:*']});
  const {reconcileErasureJournal,requireArchiveJournal}=await import(pathToFileURL(bridge).href);
  const env={DB:proxy.env.DB,ERASURE_JOURNAL:proxy.env.ERASURE_JOURNAL};
  await reconcileErasureJournal(env);
  if(archive){for await(const row of fileRecords(archive)){if(row.kind==='manifest'){await requireArchiveJournal(env,row.sourceIdentity);break}}}
 } catch {
  // Database/transport errors can contain private fields. Report only the door.
  throw refuse('Erasure restore fence: start this installation and initialize or attach the complete current independent source journal before export/import. Missing, conflicting or incomplete journal data cannot be bypassed.');
 } finally {await proxy?.dispose();await rm(directory,{recursive:true,force:true})}
}
