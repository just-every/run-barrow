import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const shard = process.env.BARROW_TEST_SHARD;
let shardIndex = 0;
let shardCount = 1;

if (shard !== undefined) {
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(shard);
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);
  if (match?.[0] !== shard || !Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index > count) {
    console.error('BARROW_TEST_SHARD must be a valid one-based shard such as 1/4.');
    process.exit(1);
  }
  shardIndex = index - 1;
  shardCount = count;
}

const files = (await readdir(new URL('../tests/api/', import.meta.url)))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .filter((_, index) => index % shardCount === shardIndex)
  .map((name) => `tests/api/${name}`);

if (files.length === 0) {
  console.error('No API test files selected.');
  process.exit(1);
}

const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files], {
  cwd: root,
  stdio: 'inherit',
});

const handlers = new Map();
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  const handler = () => child.kill(signal);
  handlers.set(signal, handler);
  process.on(signal, handler);
}

const cleanup = () => {
  for (const [signal, handler] of handlers) process.off(signal, handler);
};

child.once('error', (error) => {
  cleanup();
  console.error(error);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  cleanup();
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
