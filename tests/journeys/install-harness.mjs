import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, mkdir, rm, open, copyFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const exec = promisify(execFile);
const source = resolve('.');
const rerBin = join(source, 'node_modules', '.bin', 'rer');
export async function freshCheckout(parent, name) {
 const root = join(parent, name);
 await exec('git', ['clone', '--quiet', '--no-hardlinks', source, root]);
 await exec('git', ['remote', 'set-url', 'origin', 'https://github.com/just-every/run-barrow'], { cwd: root });
 return root;
}
export const workspace = () => mkdtemp(join(tmpdir(), 'barrow-install-journey-'));
export const removeWorkspace = path => rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
export async function rer(root, args) {
 try { return await exec(rerBin, args, { cwd: root, maxBuffer: 1024 * 1024 }); }
 catch (error) { throw new Error(`rer ${args[0]} failed (exit ${error.code}); inspect the private checkout ${root}`); }
}
export async function start(root) {
 // The documented dev door installs a fresh clone itself, including its pinned runtime.
 const logPath = join(root, 'journey-private.log'), log = await open(logPath, 'w', 0o600);
 const child = spawn(rerBin, ['dev'], { cwd: root, stdio: ['ignore', log.fd, log.fd] });
 let startupError;
 child.once('error', error => { startupError = error; });
 await log.close();
 let serverPid;
 try {
  const exit = new Promise(resolve => child.once('exit', resolve));
  for (let attempt = 0; attempt < 600; attempt++) {
   if (startupError) throw startupError;
   const text = await readFile(logPath, 'utf8');
   serverPid = Number(text.match(/background \(PID (\d+)\)/)?.[1]) || serverPid;
   const origin = text.match(/RER_READY (https?:\/\/\S+)/)?.[1];
   if (origin && serverPid) {
    const openUrl = (await readFile(join(root, '.rer/local/open-url'), 'utf8')).trim();
    return { origin, openUrl, async stop() {
     try { process.kill(serverPid, 'SIGTERM'); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
     for (let attempt = 0; attempt < 100; attempt++) {
      try { process.kill(serverPid, 0); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
      await new Promise(resolve => setTimeout(resolve, 100));
     }
     throw new Error(`Owned dev PID ${serverPid} did not stop.`);
    } };
   }
   if (child.exitCode !== null && child.exitCode !== 0) throw new Error(`Fresh dev failed; private log: ${logPath}`);
   await Promise.race([new Promise(resolve => setTimeout(resolve, 1000)), child.exitCode === null ? exit : new Promise(() => {})]);
  }
  throw new Error(`Fresh dev did not become ready; private log: ${logPath}`);
 } catch (error) {
  if (process.env.BARROW_JOURNEY_EVIDENCE) {
   const failure = join(process.env.BARROW_JOURNEY_EVIDENCE, 'base-dev-failure.log');
   await copyFile(logPath, failure); await chmod(failure, 0o600);
  }
  if (serverPid) process.kill(serverPid, 'SIGTERM');
  if (child.exitCode === null) child.kill('SIGTERM');
  throw error;
 }
}
export async function signIn(browser, app) {
 const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
 const page = await context.newPage();
 await page.goto(app.openUrl);
 await page.waitForURL(url => ['/app', '/setup'].includes(url.pathname));
 if (new URL(page.url()).pathname === '/setup') {
  for (const width of [1440, 390]) {
   await page.setViewportSize({ width, height: 1000 });
   await capture(page, `base-setup-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel('Your name').fill('Barrow installation owner');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Finish setup', exact: true }).click();
 }
 await page.getByRole('button', { name: 'Data', exact: true }).waitFor();
 return { context, page };
}
export async function api(context, app, path, body) {
 const response = await context.request.fetch(app.origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { origin: app.origin }, ...(body === undefined ? {} : { data: body }) });
 assert.ok(response.ok(), `${path}: HTTP ${response.status()}`);
 return response.json();
}
export async function capture(page, name) {
 const directory = process.env.BARROW_JOURNEY_EVIDENCE;
 if (!directory) return;
 await mkdir(directory, { recursive: true });
 await page.screenshot({ path: join(directory, name + '.png'), fullPage: true });
}
