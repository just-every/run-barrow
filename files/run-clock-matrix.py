import datetime,hashlib,json,os,subprocess
from pathlib import Path
packet=Path.home()/'rer-consolidation/work/sx-barrow-bar002-1/packet'
rows=[]
for instant in ('2026-11-07T01:00:00Z','2026-11-08T00:00:00Z'):
 for zone in ('UTC','Australia/Sydney'):
  label=instant[:10]+'-'+zone.replace('/','_')
  path=packet/('after-'+label+'.log')
  command=['timeout','240','node','--import','/tmp/barrow-clock.mjs','--test','--test-concurrency=1','tests/api/order-guarantee.test.mjs']
  started=datetime.datetime.now(datetime.timezone.utc).isoformat()
  with path.open('w') as log:
   result=subprocess.run(command,env=dict(os.environ,PROBE_CLOCK=instant,TZ=zone),stdout=log,stderr=subprocess.STDOUT)
  rows.append(dict(clock=instant,timezone=zone,command=command,exit=result.returncode,started_at=started,finished_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),log=path.name,log_sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
  print(f'{label} exit={result.returncode}',flush=True)
  (packet/'clock-matrix-receipt.json').write_text(json.dumps(rows,indent=2)+'\n')
raise SystemExit(0 if all(row['exit']==0 for row in rows) else 1)
