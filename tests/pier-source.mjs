import { access,mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
export const pierCommit='dcd4c5916a96b3237eafbec6abd6591df5c75dcd';
export async function pierSource() {
 const path=resolve('.cache/pier-source');
 try { await access(path+'/.git'); } catch { await mkdir('.cache',{recursive:true}); execFileSync('git',['clone','--no-checkout','https://github.com/just-every/run-pier.git',path],{stdio:'pipe'}); }
 execFileSync('git',['checkout','--detach',pierCommit],{cwd:path,stdio:'pipe'});
 return path;
}
