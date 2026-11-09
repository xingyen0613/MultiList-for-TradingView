// Builds the zip to upload to the Chrome Web Store: dist/multilist-<version>.zip.
// The store gives the item its own key, so the development "key" in the manifest is left out.
// Run: npm run package

import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = await mkdtemp(join(tmpdir(), 'multilist-package-'));
const extDir = join(work, 'extension');
await cp(join(root, 'extension'), extDir, { recursive: true, filter: (path) => !path.endsWith('.DS_Store') });

const manifestPath = join(extDir, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
delete manifest.key;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const out = join(root, 'dist', `multilist-${manifest.version}.zip`);
await mkdir(dirname(out), { recursive: true });
await rm(out, { force: true });
execFileSync('zip', ['-r', '-X', '-q', out, '.'], { cwd: extDir });
await rm(work, { recursive: true, force: true });
console.log(out);
