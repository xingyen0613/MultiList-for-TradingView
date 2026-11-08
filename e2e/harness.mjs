// Shared setup for the real-browser checks: an in-memory server from the server repo,
// a copy of the extension that points at it, and Chromium with the copy loaded.
// Needs playwright-core (PLAYWRIGHT_CORE=<path>, or one found in the npx cache) and the
// server repo next to this one (MULTILIST_SERVER_DIR=<path> to change it).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

// The server checks allowedOrigins on every request, so a check can allow the extension later.
export async function startStack() {
  const { chromium } = await import(pathToFileURL(join(findPlaywright(), 'index.mjs')));
  const { createServer } = await import(pathToFileURL(join(serverDir, 'src/server.js')));
  const { createMemoryStore } = await import(pathToFileURL(join(serverDir, 'src/store-memory.js')));

  const allowedOrigins = [];
  const store = createMemoryStore();
  const server = createServer({ store, allowedOrigins });
  const seen = { POST: 0, OPTIONS: 0 };
  server.on('request', (req) => {
    if (req.method in seen) seen[req.method] += 1;
  });
  const serverUrl = `http://localhost:${await listen(server)}`;

  const work = await mkdtemp(join(tmpdir(), 'multilist-e2e-'));
  const extDir = join(work, 'extension');
  await cp(join(root, 'extension'), extDir, { recursive: true });
  const configPath = join(extDir, 'lib/config.js');
  const config = await readFile(configPath, 'utf8');
  if (!config.includes("SERVER_URL = '';")) throw new Error('config.js no longer has an empty SERVER_URL');
  await writeFile(configPath, config.replace("SERVER_URL = '';", `SERVER_URL = '${serverUrl}';`));

  const context = await chromium.launchPersistentContext(join(work, 'profile'), {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;

  const docs = (collection) =>
    [...store.docs.entries()].filter(([key]) => key.startsWith(`${collection}/`)).map(([, value]) => value);

  return {
    store,
    docs,
    allowedOrigins,
    seen,
    serverUrl,
    extDir,
    context,
    worker,
    extensionId,
    origin: `chrome-extension://${extensionId}`,
    async close() {
      await context.close();
      server.close();
      await rm(work, { recursive: true, force: true });
    },
  };
}
