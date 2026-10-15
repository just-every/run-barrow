// Test-host admission observation in run-demo. Retain admission metadata only:
// never request headers, bodies or credentials.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import WebSocket from 'ws';
import { ownerWorkerName } from '@runeditrun/rer/modules/deploy-kit/owner';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (account !== 'b20c0ca9cab0c2b70e13d7cf724b89bd' || process.env.DEMO_ENVIRONMENT !== 'demo-test') throw Error('Test host on RunEditRun required');
const { project } = JSON.parse(await readFile('deploy.json', 'utf8'));
const worker = `${ownerWorkerName(project, 'demo-test')}--demo`;
const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/tails`;
const headers = { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' };
const admissions = [], connections = [];
let completed = false, startedAt;
function record(data) {
  const event = JSON.parse(data.toString());
  for (const log of event.logs ?? []) for (const part of log.message ?? []) {
    if (typeof part !== 'string' || !part.includes('demo_admitted')) continue;
    let value; try { value = JSON.parse(part); } catch { continue; }
    admissions.push({ at: log.timestamp, event: value.event, correlation: value.correlation, agent: value.agent, network: value.network });
    console.log('Admission observed at ' + log.timestamp);
  }
}
try {
  while (!completed) {
    const response = await fetch(base, { method: 'POST', headers, body: '{}' });
    const result = await response.json();
    if (!response.ok || !result.success) throw Error(`Tail creation failed: ${response.status}`);
    const tail = result.result, socket = new WebSocket(tail.url, 'trace-v1');
    let heartbeat, timer, waitingForPong = false;
    const connection = { startedAt: new Date().toISOString() };
    connections.push(connection);
    try {
      socket.on('message', record);
      const ended = new Promise(resolve => {
        socket.once('close', code => resolve({ code }));
        socket.once('error', () => resolve({ error: 'connection-error' }));
      });
      await Promise.race([
        new Promise(resolve => socket.once('open', resolve)),
        ended.then(() => { throw Error('Tail connection failed'); }),
      ]);
      // Wrangler tail uses protocol pings to keep this stream alive. Browser
      // WebSocket lacks ping(), so use the same ws transport explicitly.
      socket.send(JSON.stringify({ debug: false }));
      socket.on('pong', () => { waitingForPong = false; });
      heartbeat = setInterval(() => {
        if (waitingForPong) { socket.terminate(); return; }
        waitingForPong = true;
        socket.ping('Barrow demo observation');
      }, 10000);
      startedAt = new Date().toISOString();
      console.log('Observing test-host admissions for 15 continuous minutes');
      const outcome = await Promise.race([
        ended,
        new Promise(resolve => { timer = setTimeout(() => resolve({ complete: true }), 15 * 60 * 1000); }),
      ]);
      Object.assign(connection, { endedAt: new Date().toISOString(), ...outcome });
      completed = outcome.complete === true;
      if (!completed) console.log('Tail disconnected; reconnecting and restarting the full observation window');
    } finally {
      clearInterval(heartbeat); clearTimeout(timer); socket.terminate();
      const removed = await fetch(`${base}/${tail.id}`, { method: 'DELETE', headers });
      if (!removed.ok) throw Error(`Tail cleanup failed: ${removed.status}`);
    }
  }
  console.log(`Observation complete: ${admissions.length} admissions`);
} finally {
  await mkdir('demo-observation', { recursive: true });
  await writeFile('demo-observation/admissions.json', JSON.stringify({ worker, completed, startedAt, endedAt: new Date().toISOString(), connections, admissions }, null, 2));
}
