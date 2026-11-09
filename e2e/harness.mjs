// Shared setup for the real-browser checks: an in-memory server from the server repo,
// a copy of the extension that points at it, and Chromium with the copy loaded.
// Needs playwright-core (PLAYWRIGHT_CORE=<path>, or one found in the npx cache) and the
// server repo next to this one (MULTILIST_SERVER_DIR=<path> to change it).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = process.env.MULTILIST_SERVER_DIR ?? resolve(root, '../MultiList-server');

// Finds a released playwright-core whose Chromium is already downloaded.
function findPlaywright() {
  if (process.env.PLAYWRIGHT_CORE) return process.env.PLAYWRIGHT_CORE;
  const cache = join(homedir(), '.npm/_npx');
  const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), 'Library/Caches/ms-playwright');
  for (const dir of readdirSync(cache)) {
    const core = join(cache, dir, 'node_modules/playwright-core');
    if (!existsSync(join(core, 'browsers.json'))) continue;
    if (JSON.parse(readFileSync(join(core, 'package.json'))).version.includes('-')) continue;
    const { revision } = JSON.parse(readFileSync(join(core, 'browsers.json'))).browsers.find((b) => b.name === 'chromium');
    if (existsSync(join(browsers, `chromium-${revision}`))) return core;
  }
  throw new Error('playwright-core not found; set PLAYWRIGHT_CORE');
}

export const listen = (server) => new Promise((done) => server.listen(0, '127.0.0.1', () => done(server.address().port)));
export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export async function waitFor(check, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await sleep(200);
  }
  return false;
}

// Collects PASS/FAIL lines, so one failed step does not hide the others.
export function createSteps() {
  const results = [];
  return {
    results,
    async step(name, body) {
      try {
        await body();
        results.push(`PASS ${name}`);
      } catch (error) {
        results.push(`FAIL ${name}: ${error.message}`);
      }
    },
    finish(extra = '') {
      console.log(results.join('\n'));
      if (extra) console.log(extra);
      if (results.some((line) => line.startsWith('FAIL'))) process.exitCode = 1;
    },
  };
}

const base64url = (buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// The server checks allowedOrigins on every request, so a check can allow the extension later.
// With { google: true } the server gets a fake Google token exchange, and the extension points
// at a local page that stands in for Google's consent page: it records code_challenge and state,
// then redirects back with code=test-code and the recorded state (or google.badState).
// beforeLaunch(extDir) can change the extension copy before any browser loads it.
// openProfile() starts another Chromium profile with the same copy, so the extension id is the same.
export async function startStack({ google = false, beforeLaunch = null } = {}) {
  const { chromium } = await import(pathToFileURL(join(findPlaywright(), 'index.mjs')));
  const { createServer } = await import(pathToFileURL(join(serverDir, 'src/server.js')));
  const { createMemoryStore } = await import(pathToFileURL(join(serverDir, 'src/store-memory.js')));

  const allowedOrigins = [];
  const store = createMemoryStore();
  // google.requests: the authorization requests seen; google.exchanges: results of the fake exchange.
  const googleState = { requests: [], exchanges: [], badState: false };
  const googleExchange = google
    ? async ({ code, codeVerifier }) => {
        const last = googleState.requests.at(-1);
        const challenge = base64url(createHash('sha256').update(codeVerifier).digest());
        const ok = code === 'test-code' && last?.code_challenge === challenge;
        googleState.exchanges.push(ok);
        if (!ok) throw new Error('PKCE verifier does not match the recorded challenge');
        return { sub: 'sub-1', email: 'tester@example.com' };
      }
    : null;
  const server = createServer({ store, allowedOrigins, googleExchange });
  const seen = { POST: 0, OPTIONS: 0 };
  server.on('request', (req) => {
    if (req.method in seen) seen[req.method] += 1;
  });
  const serverUrl = `http://localhost:${await listen(server)}`;
  let googleHttp = null;
  let googleUrl = '';
  if (google) {
    googleHttp = createHttpServer((req, res) => {
      const params = new URL(req.url, 'http://x').searchParams;
      googleState.requests.push(Object.fromEntries(params));
      const state = googleState.badState ? 'not-the-state' : params.get('state');
      res.writeHead(302, { Location: `${params.get('redirect_uri')}?code=test-code&state=${state}` });
      res.end();
    });
    googleUrl = `http://127.0.0.1:${await listen(googleHttp)}/auth`;
  }

  const work = await mkdtemp(join(tmpdir(), 'multilist-e2e-'));
  const extDir = join(work, 'extension');
  await cp(join(root, 'extension'), extDir, { recursive: true });
  const configPath = join(extDir, 'lib/config.js');
  const config = await readFile(configPath, 'utf8');
  if (!config.includes("SERVER_URL = '';")) throw new Error('config.js no longer has an empty SERVER_URL');
  let patched = config.replace("SERVER_URL = '';", `SERVER_URL = '${serverUrl}';`);
  if (google) {
    if (!patched.includes("GOOGLE_CLIENT_ID = '';")) throw new Error('config.js no longer has an empty GOOGLE_CLIENT_ID');
    patched = patched
      .replace("GOOGLE_CLIENT_ID = '';", "GOOGLE_CLIENT_ID = 'test-client-id';")
      .replace(/GOOGLE_AUTH_URL = '[^']*';/, `GOOGLE_AUTH_URL = '${googleUrl}';`);
  }
  await writeFile(configPath, patched);
  await beforeLaunch?.(extDir);

  const contexts = [];
  async function launch(name) {
    const context = await chromium.launchPersistentContext(join(work, name), {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
    });
    contexts.push(context);
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    return { context, worker };
  }
  const { context, worker } = await launch('profile');
  const extensionId = new URL(worker.url()).host;

  const docs = (collection) =>
    [...store.docs.entries()].filter(([key]) => key.startsWith(`${collection}/`)).map(([, value]) => value);

  return {
    server,
    store,
    docs,
    allowedOrigins,
    seen,
    google: googleState,
    serverUrl,
    extDir,
    context,
    worker,
    extensionId,
    origin: `chrome-extension://${extensionId}`,
    openProfile: () => launch(`profile-${contexts.length}`),
    async close() {
      for (const each of contexts) await each.close();
      server.close();
      googleHttp?.close();
      await rm(work, { recursive: true, force: true });
    },
  };
}
