/** Verify routes against the user's installed Electron/Cordis/Connection runtime. */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const app=process.argv[2];
if(!app)throw new Error('Usage: node scripts/verify-desktop-ai.mjs <DeepSeek Harness executable>');
mkdirSync(join(root,'tmp'),{recursive:true});
await build({stdin:{contents:"export { createDefaultConfig } from './src/config/defaults.ts'; export { draftFromTheme } from './src/studio/model.ts'; export { artwork } from './tests/fixtures/artwork.ts';",resolveDir:root},outfile:join(root,'tmp','desktop-ai-fixture.mjs'),bundle:true,format:'esm',platform:'node'});
const result=spawnSync(app,['--expose-internals',join(root,'scripts','desktop-ai-runtime.cjs'),join(dirname(app),'resources','app.asar'),root],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',windowsHide:true,timeout:30000});
process.stdout.write(result.stdout ?? '');process.stderr.write(result.stderr ?? '');
if(result.error)throw result.error;if(result.status!==0)throw new Error('Installed Desktop AI runtime verification failed');
