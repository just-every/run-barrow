import datetime,json,subprocess,sys,time
from pathlib import Path
packet=Path.home()/'rer-consolidation/work/sx-barrow-bar002-1/packet'
sha=sys.argv[1]
repo='just-every/run-barrow'
rows=[]
run_id=None
while True:
 calls=json.loads((packet/'github-call-budget.json').read_text())
 if len(calls)>=8:
  print('CI_WATCH_BUDGET_LIMIT: two calls reserved for failed-job diagnosis',flush=True)
  raise SystemExit(3)
 if run_id is None:
  args=['api',f'repos/{repo}/actions/runs?head_sha={sha}&per_page=100']
 else:
  args=['api',f'repos/{repo}/actions/runs/{run_id}','--jq','{status,conclusion,head_sha,html_url}']
 requested=datetime.datetime.now(datetime.timezone.utc).isoformat()
 result=subprocess.run(['python3','/tmp/fleet-gh.py',*args],capture_output=True,text=True)
 if result.returncode:
  (packet/'ci-api-error.log').write_text(result.stderr)
  print('CI_API_FAILED exit='+str(result.returncode),flush=True)
  raise SystemExit(2)
 raw=json.loads(result.stdout)
 if run_id is None:
  (packet/'ci-discovery.json').write_text(json.dumps(raw,indent=2)+'\n')
  candidates=[r for r in raw['workflow_runs'] if r['name']=='Verify' and r['head_sha']==sha and r['event']=='push' and r['head_branch']=='cloud/sx-barrow-bar002-1']
  if candidates:
   current=max(candidates,key=lambda r:r['id']);run_id=current['id']
  else:current={}
 else: current=raw
 row={'requested_at':requested,'run_id':run_id,**{k:current.get(k) for k in ('status','conclusion','head_sha','html_url')}}
 rows.append(row)
 (packet/'ci-receipt.json').write_text(json.dumps(rows,indent=2)+'\n')
 print(json.dumps(row),flush=True)
 if current:
  if current['head_sha']!=sha:raise SystemExit('CI exact SHA mismatch')
  if current['status']=='completed':
   raise SystemExit(0 if current['conclusion']=='success' else 1)
 # Only this watcher reads this candidate run; the next request is >=300s away.
 until=time.monotonic()+301
 while time.monotonic()<until:
  time.sleep(min(30,until-time.monotonic()))
