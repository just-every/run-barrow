import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Each native Pier installation has its own trusted local TLS certificate.
export async function localTls(directory) {
 const certificatePath=join(directory,'certificate.pem'),keyPath=join(directory,'key.pem');
 await promisify(execFile)('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost','-keyout',keyPath,'-out',certificatePath]);
 return {certificatePath,httpsCert:await readFile(certificatePath,'utf8'),httpsKey:await readFile(keyPath,'utf8')};
}
