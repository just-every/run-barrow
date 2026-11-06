from pathlib import Path
import hashlib,subprocess
root=Path.cwd()
parent=subprocess.check_output(['git','ls-tree','-r','--name-only','origin/main','migrations/core'],text=True).splitlines()
parent=[name for name in parent if name.endswith('.sql')]
for name in parent:
    original=subprocess.check_output(['git','show','origin/main:'+name])
    actual=(root/name).read_bytes()
    if hashlib.sha256(actual).digest()!=hashlib.sha256(original).digest():
        raise SystemExit('Applied parent migration changed: '+name)
names=sorted(str(p.relative_to(root)) for p in (root/'migrations/core').glob('*.sql'))
added=[name for name in names if name not in parent]
if not all(name>max(parent) for name in added):
    raise SystemExit('New migration does not append to the parent ledger')
print('MIGRATION_LEDGER parent_files='+str(len(parent))+' unchanged=true appended='+','.join(added))
