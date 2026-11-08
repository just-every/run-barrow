import { registerHooks } from 'node:module';
import { execFileSync } from 'node:child_process';
const original=execFileSync('git',['show','origin/main:tests/api/invoice-documents.mjs'],{cwd:'/workspace/run-barrow',encoding:'utf8'});
const start='export async function readPdf(bytes) {';
const end='export async function invoiceDownload';
const oldReader=original.slice(original.indexOf(start),original.indexOf(end));
registerHooks({load(url,context,nextLoad){
 const result=nextLoad(url,context);
 if(!url.endsWith('/tests/api/invoice-documents.mjs'))return result;
 let source=result.source.toString();
 if(process.env.PROBE_OLD_READER==='1') {
  const after=source.indexOf('async function invoiceStreamBoundaries');
  source=source.slice(0,source.indexOf(start))+oldReader+source.slice(after);
  source="import { inflateSync } from 'node:zlib';\n"+source;
 }
 source=source.replace('async function invoiceStreamBoundaries','export async function invoiceStreamBoundaries');
 return {...result,source};
}});
