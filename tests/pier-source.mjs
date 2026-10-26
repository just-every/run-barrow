import { access,mkdir,readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
export const pierCommit='60fde60ffa1f44c2ae6a3ef47225117f36cf546a';
export async function pierSource() {
 // A fleet cloud may read other repositories only through the GitHub API.
 // Its pinned tarball has the same immutable source, without another Git clone.
 if(process.env.BARROW_PIER_SOURCE) {
  const path=resolve(process.env.BARROW_PIER_SOURCE);
  if((await readFile(path+'/.rer-source-revision','utf8')).trim()!==pierCommit)throw Error('Pinned Pier archive revision mismatch');
  return path;
 }
 const path=resolve('.cache/pier-source');
 try { await access(path+'/.git'); } catch { await mkdir('.cache',{recursive:true}); execFileSync('git',['clone','--no-checkout','https://github.com/just-every/run-pier.git',path],{stdio:'pipe'}); }
 execFileSync('git',['checkout','--detach',pierCommit],{cwd:path,stdio:'pipe'});
 return path;
}
