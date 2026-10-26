/**
 * Install the already-built plugin into a DSH profile without invoking pnpm.
 *
 * The desktop app caches the host and client bundles at startup; copying the
 * artifacts directly is the reliable way to update a running profile without
 * tripping the `file:` same-version cache. The desktop app still needs a
 * restart afterwards.
 *
 * Usage:
 *   node scripts/install-desktop.mjs
 *   node scripts/install-desktop.mjs --profile web
 */
import { copyFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const profileIndex = args.indexOf('--profile');
const profile = profileIndex >= 0 ? args[profileIndex + 1] : 'desktop';
const target = join(homedir(), '.dsh', 'profiles', profile, 'node_modules', 'dsh-desktop-themes');

if (!existsSync(target)) {
  console.error(`[install] ${target} does not exist. Install the package into the ${profile} profile first.`);
  process.exit(1);
}

const targetPackage = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
if (targetPackage.name !== 'dsh-desktop-themes') {
  console.error(`[install] ${target} is not dsh-desktop-themes.`);
  process.exit(1);
}

const files = ['lib/client.js', 'lib/index.js', 'package.json', 'cordis.patch.yml', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'docs/workspace.md', 'docs/screenshots/studio/mint-breeze-1280.png', 'docs/screenshots/studio/obsidian-gold-1920.png', 'docs/screenshots/studio/workspace-home-1280.png', 'docs/screenshots/studio/share-card.png'];
const backup=join(root,'tmp','desktop-backups',`${profile}-${new Date().toISOString().replace(/[:.]/g,'-')}`);
for (const file of files) {
  const existing=join(target,file);
  if(!existsSync(existing))continue;
  const destination=join(backup,file);mkdirSync(dirname(destination),{recursive:true});copyFileSync(existing,destination);
}
console.log(`[install] previous plugin backed up to ${backup}`);
for (const file of files) {
  const source = join(root, file);
  if (!existsSync(source)) continue;
  mkdirSync(dirname(join(target,file)),{recursive:true});
  copyFileSync(source, join(target, file));
}

const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const packageJson = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
for (const file of ['lib/client.js', 'lib/index.js', 'package.json']) {
  const same = hash(join(root, file)) === hash(join(target, file));
  console.log(`[install] ${file.padEnd(16)} ${same ? 'ok' : 'MISMATCH'}`);
  if (!same) process.exitCode = 1;
}
console.log(`[install] dsh-desktop-themes ${packageJson.version} -> ${target}`);
console.log('[install] restart the DSH desktop app (not just refresh) to load the new host schema and client bundle.');
