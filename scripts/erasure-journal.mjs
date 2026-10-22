#!/usr/bin/env node
import {readFile,writeFile,lstat} from 'node:fs/promises';
const args=process.argv.slice(2),[command,...rest]=args;
if(!command||args.includes('--help')){console.log('Owner independent erasure journal: export | attach | initialize\n--origin URL --session-file PRIVATE_FILE --file JOURNAL_FILE (export/attach)\nattach/initialize also require --confirm JOURNAL --reason TEXT. Keep this separate from older database archives.');process.exit(0)}
const options={};for(let i=0;i<rest.length;i+=2){if(!['--origin','--session-file','--file','--confirm','--reason'].includes(rest[i])||!rest[i+1])throw Error('Use --help.');options[rest[i].slice(2)]=rest[i+1]}
if(!['export','attach','initialize'].includes(command))throw Error('Use --help.');
const url=new URL(options.origin);if(url.origin!==options.origin||url.username||url.password||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))))throw Error('Use HTTPS or local loopback.');
async function privateRead(path){const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077))throw Error('Use a regular owner-only private file (chmod 600).');return readFile(path,'utf8')}
const cookie=(await privateRead(options['session-file'])).trim(),body=command==='export'?undefined:{...(command==='initialize'?{initialize:true}:{bundle:JSON.parse(await privateRead(options.file))}),confirm:options.confirm,reason:options.reason};
if(body&&(body.confirm!=='JOURNAL'||!body.reason))throw Error('An explicit JOURNAL confirmation and reason are required.');
const response=await fetch(url.origin+'/api/barrow/erasure-journal',{redirect:'manual',method:body?'POST':'GET',headers:{cookie,origin:url.origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
if(!response.ok)throw Error('Journal operation refused; check the owner session, source journal and restore instructions.');
if(command==='export'){await writeFile(options.file,await response.text(),{mode:0o600,flag:'wx'});console.log('Independent journal saved privately. Keep it with the source installation; use its latest version for a restore.')}else console.log('Independent journal operation completed.');
