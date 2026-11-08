/** Package only reviewed runtime artifacts; publish no source images or local data. */
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
const manifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
assert.equal(pkg.version,manifest.version,'package and manifest versions must match');
if(process.env.GITHUB_REF_TYPE==='tag')assert.equal(process.env.GITHUB_REF_NAME,`v${pkg.version}`,'release tag must match the package');
const output=join(root,'dist','release');mkdirSync(output,{recursive:true});
const npmCli=process.env.npm_execpath || join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
const packed=spawnSync(process.execPath,[npmCli,'pack','--ignore-scripts','--json','--pack-destination',output],{cwd:root,encoding:'utf8'});
if(packed.status!==0)throw new Error(packed.stderr || 'npm pack failed');
const info=JSON.parse(packed.stdout)[0],files=info.files.map(file=>file.path);
for(const required of ['lib/client.js','lib/index.js','cordis.patch.yml','package.json','README.md','LICENSE','THIRD_PARTY_NOTICES.md','docs/ai-theme-studio.md'])assert.ok(files.includes(required),`missing ${required}`);
for(const file of files)assert.ok(['lib/client.js','lib/index.js','cordis.patch.yml','package.json','README.md','LICENSE','THIRD_PARTY_NOTICES.md'].includes(file)||file==='docs/workspace.md'||file==='docs/install.md'||file==='docs/ai-theme-studio.md'||/^docs\/screenshots\/studio\/[\w-]+\.png$/.test(file),`unreviewed package file: ${file}`);
const versioned=join(output,info.filename),alias=join(output,'dsh-desktop-themes.tgz');
copyFileSync(versioned,alias);
const digest=createHash('sha256').update(readFileSync(versioned)).digest('hex');
writeFileSync(join(output,'SHA256SUMS'),`${digest}  ${info.filename}\n${digest}  dsh-desktop-themes.tgz\n`);
console.log(JSON.stringify({version:pkg.version,filename:info.filename,files:files.length,size:info.size,sha256:digest},null,2));
