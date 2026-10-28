import {readFileSync,writeFileSync} from 'node:fs';
// CONTRACT.md owns acceptance and status; derived documents retain its full clauses.
const mode=process.argv[2];
if(!['write','check'].includes(mode))throw Error('Use contract-docs.mjs write or check.');
let contract=readFileSync('CONTRACT.md','utf8');
const rows=[...contract.matchAll(/^\| `([A-Z0-9-]+)` \| (.+) \| (published|target|push-further) \| (done|partial|missing) \|\s*(.*?)\s*\|\s*(.*?)\s*\|$/gm)].map(m=>({id:m[1],title:m[2],kind:m[3],status:m[4],evidence:m[5],gap:m[6]}));
const count=selected=>['done','partial','missing'].map(status=>selected.filter(row=>row.status===status).length).concat(selected.length).join(' | ');
for(const [label,selected]of [['Published',rows.filter(row=>row.kind==='published')],['Target and push further',rows.filter(row=>row.kind!=='published')],['All',rows]])contract=contract.replace(new RegExp('^\\| '+label+' \\|.*$','m'),'| '+label+' | '+count(selected)+' |');
const definitions=new Map([...contract.matchAll(/^- \*\*([A-Z0-9-]+) — ([^\n]+)$/gm)].map(m=>[m[1],m[0].slice(2)]));
if(rows.length!==definitions.size||new Set(rows.map(row=>row.id)).size!==rows.length)throw Error('Refuse incomplete or duplicate contract status rows.');
const acceptance='# Acceptance journeys\n\nGenerated from [CONTRACT.md](CONTRACT.md) by `node scripts/contract-docs.mjs write`. The complete canonical clause precedes its current proof and remaining work.\n\n'+rows.map((row,index)=>{
 const clause=definitions.get(row.id);if(!clause)throw Error('Missing definition for '+row.id);
 return `${index+1}. ${clause} **Status:** ${row.status}. **Current evidence:** ${row.evidence||'None yet.'}${row.gap?' **Remaining:** '+row.gap:''}`;
}).join('\n\n')+'\n';
const claims='# Product claims\n\nGenerated from the canonical status rows in [CONTRACT.md](../CONTRACT.md) by `node scripts/contract-docs.mjs write`. Done rows describe the recorded current scope; partial and missing rows retain their named gaps.\n\n| Clause | Title | Status | Evidence | Gap |\n| --- | --- | --- | --- | --- |\n'+rows.map(row=>`| \`${row.id}\` | ${row.title} | ${row.status} | ${row.evidence} | ${row.gap} |`).join('\n')+'\n';
for(const [file,expected]of [['CONTRACT.md',contract],['ACCEPTANCE.md',acceptance],['docs/CLAIMS.md',claims]]){
 if(mode==='write')writeFileSync(file,expected);else if(readFileSync(file,'utf8')!==expected)throw Error(file+' is stale; run node scripts/contract-docs.mjs write.');
}
console.log('Contract documents '+(mode==='check'?'match':'generated')+'; '+count(rows));
