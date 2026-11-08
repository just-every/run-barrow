import datetime,hashlib,json,os,subprocess
from pathlib import Path
packet=Path.home()/'rer-consolidation/work/sx-barrow-bar002-1/packet'
rows=[]
def run(name,args,expected=0,extra=None):
 path=packet/(name+'.log')
 started=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with path.open('w') as log:
  result=subprocess.run(args,env=dict(os.environ,**(extra or {})),stdout=log,stderr=subprocess.STDOUT)
 rows.append(dict(name=name,command=args,exit=result.returncode,expected_exit=expected,started_at=started,finished_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),log=path.name,log_sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
 (packet/'local-checks-receipt.json').write_text(json.dumps(rows,indent=2)+'\n')
 print(f'{name} exit={result.returncode} expected={expected}',flush=True)
 if result.returncode!=expected: raise SystemExit(result.returncode or 1)
run('reader-regression-before',['timeout','30','node','--import','/tmp/reader-regression-hook.mjs','/tmp/reader-regression.mjs','/tmp/barrow-probe-2041-9.pdf'],expected=1,extra={'PROBE_OLD_READER':'1'})
run('reader-regression-after',['timeout','30','node','--import','/tmp/reader-regression-hook.mjs','/tmp/reader-regression.mjs','/tmp/barrow-probe-2041-9.pdf'])
run('source-lock-regenerate',['timeout','120','node','scripts/edition-authoring/cli.mjs','lock'])
run('source-lock-check',['timeout','120','node','scripts/edition-authoring/cli.mjs','check'])
run('barrow-1',['nice','-n','15','timeout','1200','node','scripts/verify-ci.mjs','barrow-1'])
