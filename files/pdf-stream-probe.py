from pathlib import Path
import re,zlib,json
results=[]
for path in sorted(Path('/tmp').glob('barrow-probe-*.pdf')):
 data=path.read_bytes(); row={'file':path.name,'regex_streams':[]}
 for m in re.finditer(rb'stream\r?\n([\s\S]*?)\r?\nendstream',data):
  dictionary=data[max(0,m.start()-100):m.start()]
  length=re.search(rb'/Length (\d+)\s*>>\s*$',dictionary)
  if not length: continue
  expected=int(length[1]); payload=m[1]
  try: plain=zlib.decompress(payload); error=None
  except zlib.error as e: plain=b''; error=str(e)
  if expected!=len(payload) or error:
   actual=data[m.start(1):m.start(1)+expected]
   try: true_plain=zlib.decompress(actual); true_error=None
   except zlib.error as e: true_plain=b''; true_error=str(e)
   row['regex_streams'].append({'declared':expected,'regex':len(payload),'last_declared_hex':actual[-6:].hex(),'regex_error':error,'length_decode_error':true_error,'header_sample':true_plain[:180].decode('latin1')})
 if row['regex_streams']:results.append(row)
print(json.dumps(results,indent=2))
