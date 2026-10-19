/** Build, cache-bust, install, verify, and optionally restart the DSH web profile. */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const profileArg = process.argv.findIndex((arg) => arg === '--profile');
const profile = profileArg >= 0 ? process.argv[profileArg + 1] : 'web';
const restart = args.has('--restart');
const port = 3080;
const sourcePackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const buildId = `${sourcePackage.version}+local.${stamp}`;
const installVersion = `${sourcePackage.version}-dev.${stamp}`;
const npmCli = process.env.npm_execpath && existsSync(process.env.npm_execpath)
  ? process.env.npm_execpath
  : join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const dshCli = process.platform === 'win32'
  ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  : null;

function run(command, commandArgs, options = {}) {
  const { echo = true, ...spawnOptions } = options;
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
    ...spawnOptions,
  });
  if (echo && result.stdout) process.stdout.write(result.stdout);
  if (echo && result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status ?? 'no status'}`);
  return result.stdout.trim();
}

function runNpm(commandArgs, options = {}) {
  if (!existsSync(npmCli)) throw new Error(`npm CLI not found: ${npmCli}`);
  return run(process.execPath, [npmCli, ...commandArgs], options);
}

function runDsh(commandArgs, options = {}) {
  if (dshCli !== null) {
    if (!existsSync(dshCli)) throw new Error(`DSH CLI not found: ${dshCli}`);
    return run(process.execPath, [dshCli, ...commandArgs], options);
  }
  return run('dsh', commandArgs, options);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function isHarnessReady() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return response.ok && (await response.text()).includes('DeepSeek Harness');
  } catch {
    return false;
  }
}

async function waitForHarness(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isHarnessReady()) return true;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  return false;
}

function windowsListenerPid() {
  const output = run('netstat', ['-ano'], { echo: false });
  const pattern = new RegExp(`^\\s*TCP\\s+127\\.0\\.0\\.1:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`, 'mi');
  const match = output.match(pattern);
  return match === null ? null : Number(match[1]);
}

async function restartWeb() {
  if (process.platform !== 'win32') {
    console.log('[deploy] install verified; restart `dsh web` to load the new build');
    return;
  }
  if (await isHarnessReady()) {
    const pid = windowsListenerPid();
    if (pid === null) throw new Error(`DSH responded on ${port}, but its listener PID could not be resolved`);
    run('taskkill', ['/PID', String(pid), '/T', '/F']);
  }
  if (dshCli === null || !existsSync(dshCli)) throw new Error(`DSH CLI not found: ${dshCli}`);
  const child = spawn(process.execPath, [dshCli, 'web'], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  if (!(await waitForHarness(30000))) throw new Error(`DSH did not become ready on port ${port} within 30 seconds`);
  console.log(`[deploy] restarted DSH web on http://127.0.0.1:${port}`);
}

const staging = mkdtempSync(join(tmpdir(), 'dsh-desktop-themes-'));
try {
  console.log(`[deploy] building ${buildId}`);
  runNpm(['run', 'build'], { env: { ...process.env, DTH_BUILD_ID: buildId } });
  console.log('[deploy] build completed; staging package');

  const stagedPackage = {
    ...sourcePackage,
    version: installVersion,
    // This staging directory contains prebuilt lib files but no build script.
    scripts: { ...sourcePackage.scripts },
  };
  delete stagedPackage.scripts.prepare;
  mkdirSync(join(staging, 'lib'), { recursive: true });
  for (const file of ['client.js', 'index.js']) copyFileSync(join(root, 'lib', file), join(staging, 'lib', file));
  copyFileSync(join(root, 'cordis.patch.yml'), join(staging, 'cordis.patch.yml'));
  writeFileSync(join(staging, 'package.json'), `${JSON.stringify(stagedPackage, null, 2)}\n`);
  if (existsSync(join(root, 'README.md'))) copyFileSync(join(root, 'README.md'), join(staging, 'README.md'));
  if (existsSync(join(root, 'LICENSE'))) copyFileSync(join(root, 'LICENSE'), join(staging, 'LICENSE'));
  console.log(`[deploy] staged ${installVersion}`);

  const packageDir = join(root, 'dist', 'local');
  mkdirSync(packageDir, { recursive: true });
  console.log(`[deploy] packing into ${packageDir}`);
  const packed = runNpm(['pack', '--silent', '--pack-destination', packageDir], { cwd: staging });
  console.log(`[deploy] npm pack returned ${packed || '<empty>'}`);
  const packageName = packed.split(/\r?\n/).filter(Boolean).at(-1);
  if (!packageName?.endsWith('.tgz')) throw new Error(`npm pack did not return a tarball name: ${packed}`);
  const tarball = join(packageDir, basename(packageName));

  console.log(`[deploy] installing ${basename(tarball)} into profile ${profile}`);
  runDsh(['plugin', '--profile', profile, 'add', tarball]);

  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh');
  const installedRoot = join(dshHome, 'profiles', profile, 'node_modules', sourcePackage.name);
  for (const file of ['client.js', 'index.js']) {
    const source = join(root, 'lib', file);
    const installed = join(installedRoot, 'lib', file);
    if (!existsSync(installed)) throw new Error(`Installed artifact is missing: ${installed}`);
    const sourceHash = sha256(source);
    const installedHash = sha256(installed);
    if (sourceHash !== installedHash) throw new Error(`Hash mismatch for ${file}: ${sourceHash} != ${installedHash}`);
  }
  const installedPackage = JSON.parse(readFileSync(join(installedRoot, 'package.json'), 'utf8'));
  if (installedPackage.dsh?.bundle?.patch !== './cordis.patch.yml') {
    throw new Error('Installed package does not declare the desktop-themes bundle patch');
  }
  if (!existsSync(join(installedRoot, 'cordis.patch.yml'))) {
    throw new Error('Installed bundle patch is missing');
  }
  console.log(`[deploy] verified ${installedPackage.name}@${installedPackage.version}; client/index hashes match`);

  if (restart) await restartWeb();
  else console.log('[deploy] restart DSH web to load the verified build');
} finally {
  rmSync(staging, { recursive: true, force: true });
}
