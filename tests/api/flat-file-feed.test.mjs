import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {installation} from './harness.mjs';
import {sftpFixture} from './sftp-fixture.mjs';

test('owner tests a pinned merchant SFTP destination through the Worker; wrong host trust, credentials and non-owner calls refuse',async t=>{
 const source=await sftpFixture(t),h=await installation({bindings:{BARROW_SFTP_SECRETS:source.secrets}});t.after(()=>h.close());
 const input={config:source.config,consent:true,reason:'Owner explicitly reviewed this merchant destination and its server host key.'};
 const probe=await h.api('/api/barrow/feeds/probe',input);
 assert.equal(probe.hostKeyVerified,true);assert.equal(source.logins,1);
 assert.equal(probe.directories.find(row=>row.kind==='imports').files.some(row=>row.name==='products.csv'&&!row.directory),true);
 assert.deepEqual(probe.directories.find(row=>row.kind==='exports').files,[]);
 assert.equal(JSON.stringify(probe).includes('synthetic-barrow-2'),false);
 await h.api('/api/barrow/feeds/probe',{...input,consent:false},{status:400});
 const wrong=await h.request('/api/barrow/feeds/probe',{method:'POST',body:{...input,config:{...source.config,hostKey:'SHA256:'+createHash('sha256').update('synthetic-barrow-3').digest('base64').replace(/=+$/,'')}}});assert.equal(wrong.status,502);assert.equal((await wrong.json()).error.code,'SFTP_HOST_KEY');
 await h.configure({BARROW_SFTP_SECRETS:JSON.stringify({'synthetic-barrow-1':{password:'synthetic-barrow-6'}})});
 const refused=await h.request('/api/barrow/feeds/probe',{method:'POST',body:input});assert.equal(refused.status,502);assert.equal((await refused.json()).error.code,'SFTP_FAILED');
 await h.configure({BARROW_SFTP_SECRETS:source.secrets});
 const admin={as:await h.signIn('synthetic-barrow-4@example.test','admin')};await h.api('/api/barrow/feeds/probe',input,{...admin,status:403});
 const {token}=await h.api('/api/barrow/agent-token',{});await h.api('/api/barrow/feeds/probe',input,{as:'',headers:{authorization:`Bearer ${token}`},status:403});
 const missing=await h.request('/api/barrow/feeds/probe',{method:'POST',body:{...input,config:{...source.config,secretId:'synthetic-barrow-5'}}});assert.ok(missing.status>=400);
 assert.equal((await h.api('/api/barrow/audit')).events.filter(row=>row.action==='feed.destination-tested').length,1);
 const demo=await installation({bindings:{RER_DEMO:'1',BARROW_SFTP_SECRETS:source.secrets}});t.after(()=>demo.close());const beforeDemo=source.logins;
 await demo.api('/api/barrow/feeds/probe',input,{status:409});assert.equal(source.logins,beforeDemo);
});
