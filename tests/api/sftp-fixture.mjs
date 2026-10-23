import ssh2 from 'ssh2';
const {Server,utils}=ssh2;
import {generateKeyPairSync,createHash,randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readdir,stat,open,rename,unlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {once} from 'node:events';

/** Real SSH authentication and SFTP packets, backed by a temporary filesystem. */
export async function sftpFixture(t) {
 const directory=await mkdtemp(join(tmpdir(),'barrow-sftp-')),privateKey=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
 for(const path of ['imports','exports','acknowledgments'])await mkdir(join(directory,path));
 await writeFile(join(directory,'imports','products.csv'),'Product ID,SKU,Name\nsynthetic-barrow-1,OAT-1,Toasted oat granola\n');
 const {STATUS_CODE}=utils.sftp,publicKey=utils.parseKey(privateKey).getPublicSSH(),hostKey='SHA256:'+createHash('sha256').update(publicKey).digest('base64').replace(/=+$/,'');
 let logins=0,paused=false,releaseWrite,noticeWrite;const connections=new Set();
 const pathFor=path=>{const result=resolve(directory,'.'+(path.startsWith('/')?path:'/'+path));if(result!==directory&&!result.startsWith(directory+sep))throw Error('Outside fixture');return result};
 const attributes=info=>({mode:info.mode,size:info.size,uid:0,gid:0,atime:Math.floor(info.atimeMs/1000),mtime:Math.floor(info.mtimeMs/1000)});
 const server=new Server({hostKeys:[privateKey]},connection=>{
  connections.add(connection);connection.once('close',()=>connections.delete(connection));connection.on('error',()=>{});
  connection.on('authentication',context=>{if(context.method==='password'&&context.username==='synthetic-barrow-1'&&context.password==='synthetic-barrow-2'){logins++;context.accept()}else context.reject()});
  connection.on('ready',()=>connection.on('session',accept=>accept().on('sftp',accept=>{
   const stream=accept(),handles=new Map();
   const handler=(name,fn)=>stream.on(name,(request,...args)=>Promise.resolve().then(()=>fn(request,...args)).catch(()=>stream.status(request,STATUS_CODE.FAILURE)));
   const handle=value=>{const bytes=Buffer.from(randomUUID());handles.set(bytes.toString('hex'),value);return bytes};
   const entry=value=>handles.get(value.toString('hex'));
   handler('REALPATH',async(request,path)=>{await stat(pathFor(path));stream.name(request,[{filename:path.startsWith('/')?path:'/'+path,longname:path,attrs:{}}])});
   for(const command of ['STAT','LSTAT'])handler(command,async(request,path)=>stream.attrs(request,attributes(await stat(pathFor(path)))));
   handler('OPENDIR',async(request,path)=>{const rows=await readdir(pathFor(path));stream.handle(request,handle({path,rows,done:false}))});
   handler('READDIR',async(request,value)=>{const item=entry(value);if(!item||item.done){stream.status(request,STATUS_CODE.EOF);return}item.done=true;const rows=await Promise.all(item.rows.map(async name=>({filename:name,longname:name,attrs:attributes(await stat(pathFor(item.path+'/'+name)))})));stream.name(request,rows)});
   handler('OPEN',async(request,path,flags)=>{const descriptor=await open(pathFor(path),flags&utils.sftp.OPEN_MODE.WRITE?'w':'r');stream.handle(request,handle({descriptor}))});
   handler('FSTAT',async(request,value)=>stream.attrs(request,attributes(await entry(value).descriptor.stat())));
   handler('READ',async(request,value,offset,length)=>{const bytes=Buffer.alloc(Math.min(length,1024*1024)),read=await entry(value).descriptor.read(bytes,0,bytes.length,offset);if(!read.bytesRead)stream.status(request,STATUS_CODE.EOF);else stream.data(request,bytes.subarray(0,read.bytesRead))});
   handler('WRITE',async(request,value,offset,data)=>{if(paused){noticeWrite?.();await new Promise(resolve=>{releaseWrite=resolve})}await entry(value).descriptor.write(data,0,data.length,offset);stream.status(request,STATUS_CODE.OK)});
   handler('CLOSE',async(request,value)=>{const item=entry(value);if(item?.descriptor)await item.descriptor.close();handles.delete(value.toString('hex'));stream.status(request,STATUS_CODE.OK)});
   handler('RENAME',async(request,from,to)=>{await rename(pathFor(from),pathFor(to));stream.status(request,STATUS_CODE.OK)});
   handler('REMOVE',async(request,path)=>{await unlink(pathFor(path));stream.status(request,STATUS_CODE.OK)});
   stream.on('close',()=>{for(const item of handles.values())void item.descriptor?.close().catch(()=>{});handles.clear()});
  })));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{for(const connection of connections)connection.end();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true})});
 return {directory,pauseWrites(){paused=true;return new Promise(resolve=>{noticeWrite=resolve})},resumeWrites(){paused=false;releaseWrite?.();releaseWrite=undefined},get logins(){return logins},config:{host:'127.0.0.1',port:server.address().port,username:'synthetic-barrow-1',secretId:'synthetic-barrow-1',hostKey,importDirectory:'/imports',exportDirectory:'/exports',ackDirectory:'/acknowledgments'},secrets:JSON.stringify({'synthetic-barrow-1':{password:'synthetic-barrow-2'}})};
}
