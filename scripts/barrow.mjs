#!/usr/bin/env node
import { readFile,lstat } from 'node:fs/promises';
const args=process.argv.slice(2);
if(!args.length||args.includes('--help')){console.log('Barrow agent commands (read or prepare only)\nnode scripts/barrow.mjs catalogue --origin URL --token-file PRIVATE_FILE --account ID\nnode scripts/barrow.mjs prepare-order --origin URL --token-file PRIVATE_FILE --input ORDER_JSON_FILE\nVersion 1: use products, variants or price-books with --account and optional --limit or --cursor; prepare-order-v1 takes accountRevision and currency. Other entity reads require a native person. A person submits the draft and the supplier approves it in Barrow.');process.exit(0)}
const entities=['products','variants','accounts','locations','price-books','quotes','orders','invoices','fulfillment'];
const [command,...rest]=args,options={};
for(let i=0;i<rest.length;i+=2){if(!['--origin','--token-file','--account','--input','--limit','--cursor','--profile'].includes(rest[i])||!rest[i+1])throw Error('Unknown or incomplete flag. Use --help.');options[rest[i].slice(2)]=rest[i+1]}
if(!['catalogue','prepare-order','prepare-order-v1',...entities].includes(command))throw Error('Agents can read the catalogue or prepare an order; approval is a person’s action.');
const url=new URL(options.origin);if(url.origin!==options.origin||url.username||url.password||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))))throw Error('Use an HTTPS origin or local loopback HTTP.');
const file=options['token-file'],stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077))throw Error('Use a regular owner-only token file (chmod 600).');
const token=(await readFile(file,'utf8')).trim();
const prepare=['prepare-order','prepare-order-v1'].includes(command),versioned=command==='prepare-order-v1'||entities.includes(command);
const input=prepare?JSON.parse(await readFile(options.input,'utf8')):undefined;
const body=prepare?(versioned?input:{type:'order.prepare',payload:input}):undefined;
if(!prepare&&!options.account)throw Error('Entity reads require --account.');
const query=new URLSearchParams({accountId:options.account??'',...(options.limit?{limit:options.limit}:{}),...(options.cursor?{cursor:options.cursor}:{}),...(options.profile?{profileId:options.profile}:{})});
const path=versioned?`/api/barrow/v1/${prepare?'orders/prepare':command}`+(prepare?'':'?'+query):prepare?'/api/barrow/commands':'/api/barrow/catalogue?'+query;
const response=await fetch(options.origin+path,{redirect:'manual',signal:AbortSignal.timeout(20000),method:prepare?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const data=await response.json();if(!response.ok){console.error(data.error?.message??'Barrow refused the command.');process.exitCode=1}else console.log(JSON.stringify(data,null,2));
