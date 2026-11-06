import test from 'node:test';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.cwd()+'/node_modules/@playwright/test/index.mjs'));
const launch=chromium.launch.bind(chromium);
chromium.launch=options=>launch({...options,executablePath:'/usr/bin/chromium'});
test('original AUTO-004 public-door probe',async()=>{await import('./original-probe.mjs')});
