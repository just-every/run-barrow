#!/usr/bin/env node
import { readFile,lstat,writeFile,rename,rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
const args=process.argv.slice(2),get=key=>args[args.indexOf(key)+1];
if(args.includes('--help')||!args.length){console.log('node scripts/connect-pier.mjs --origin PIER_ORIGIN --session-file PRIVATE_COOKIE_FILE\nValidates the current Pier operator session and saves the connection in this checkout’s private .dev.vars. Stop Barrow before running; restart with rer dev.');process.exit(0)}
if(args.length!==4||!args.includes('--origin')||!args.includes('--session-file'))throw Error('Use --origin and --session-file; credentials never belong in arguments.');
const origin=get('--origin'),url=new URL(origin),file=resolve(get('--session-file'));
if(url.origin!==origin||url.username||url.password||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))))throw Error('Use an HTTPS Pier origin, or local loopback HTTP.');
const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)||stat.uid!==process.getuid()||stat.size>16384)throw Error('The session file must be a regular owner-only file (chmod 600).');
const cookie=(await readFile(file,'utf8')).trim();if(!cookie||/[\r\n]/.test(cookie))throw Error('Save the Cookie request header as one line in the private session file.');
let response;try{response=await fetch(origin+'/api/pier/state',{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{cookie,origin}})}catch{throw Error('Pier could not be reached.')}
if(!response.ok)throw Error('Pier refused the session. Sign in again and replace the private session file.');
const state=await response.json();if(!['owner','operator'].includes(state.actor?.role))throw Error('Pier requires an owner or stock operator for sales orders.');
const target=resolve('.dev.vars');let text='';
try{const prior=await lstat(target);if(!prior.isFile()||prior.isSymbolicLink())throw Error('Private settings must be a regular file.');text=await readFile(target,'utf8')}catch(error){if(error.code!=='ENOENT')throw error}
text=text.split('\n').filter(line=>!/^PIER_(ORIGIN|SESSION)=/.test(line)).join('\n').replace(/\n*$/,'\n');
const next=target+'.new.'+randomUUID();
try{await writeFile(next,text+`PIER_ORIGIN=${JSON.stringify(origin)}\nPIER_SESSION=${JSON.stringify(cookie)}\n`,{mode:0o600,flag:'wx'});await rename(next,target)}finally{await rm(next,{force:true})}
console.log('Pier supplier connection saved privately. Restart Barrow to use it; the next authenticated API request records configuration or rotation without its value. Revoke the replaced session in Pier.');
