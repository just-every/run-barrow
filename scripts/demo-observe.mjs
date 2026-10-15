// Test-host admission observation. Run only in the run-demo environment;
// retain admission metadata, never request headers, bodies or credentials.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { ownerWorkerName } from '@runeditrun/rer/modules/deploy-kit/owner';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (account !== 'b20c0ca9cab0c2b70e13d7cf724b89bd' || process.env.DEMO_ENVIRONMENT !== 'demo-test') throw Error('Test host on RunEditRun required');
const { project } = JSON.parse(await readFile('deploy.json', 'utf8'));
const worker = `${ownerWorkerName(project, 'demo-test')}--demo`;
const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/tails`;
const headers = { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' };
const response = await fetch(base, { method: 'POST', headers, body: '{}' });
const result = await response.json();
if (!response.ok || !result.success) throw Error(`Tail creation failed: ${response.status}`);
const tail = result.result, admissions = [], startedAt = new Date().toISOString();
const socket = new WebSocket(tail.url, 'trace-v1');
socket.binaryType = 'arraybuffer';
let interrupted = false;
socket.addEventListener('close', () => { interrupted = true; });
socket.addEventListener('message', ({ data }) => {
  const event = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
  for (const log of event.logs ?? []) for (const part of log.message ?? []) {
    if (typeof part !== 'string' || !part.includes('demo_admitted')) continue;
    let value; try { value = JSON.parse(part); } catch { continue; }
    admissions.push({ at: log.timestamp, event: value.event, correlation: value.correlation, agent: value.agent, network: value.network });
    console.log('Admission observed at ' + log.timestamp);
  }
});
try {
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(Error('Tail connection failed')), { once: true }); });
  console.log('Observing test-host admissions for 15 minutes');
  await new Promise(resolve => setTimeout(resolve, 15 * 60 * 1000));
  if (interrupted) throw Error('Tail interrupted: repeat observation before cohort');
  await mkdir('demo-observation', { recursive: true });
  await writeFile('demo-observation/admissions.json', JSON.stringify({ worker, startedAt, endedAt: new Date().toISOString(), admissions }, null, 2));
  console.log(`Observation complete: ${admissions.length} admissions`);
} finally {
  socket.close();
  const removed = await fetch(`${base}/${tail.id}`, { method: 'DELETE', headers });
  if (!removed.ok) throw Error(`Tail cleanup failed: ${removed.status}`);
}
