import { mkdirSync, writeFileSync } from 'node:fs';
const names = ['catppuccin-mocha','catppuccin-latte','catppuccin-frappe','catppuccin-macchiato','nord','dracula','rose-pine','solarized-dark','solarized-light','gruvbox-dark-hard'];
mkdirSync('tests/fixtures/themes',{recursive:true});
for (const name of names) {
  const url = `https://raw.githubusercontent.com/tinted-theming/schemes/spec-0.11/base16/${name}.yaml`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  const text = await response.text();
  writeFileSync(`tests/fixtures/themes/${name}.yaml`,text);
  console.log(name);
}
writeFileSync('tests/fixtures/themes/SOURCES.md', '# Theme fixtures\n\nImported from [Tinted Theming schemes, spec-0.11](https://github.com/tinted-theming/schemes/tree/spec-0.11/base16) on 2026-10-25. Source author metadata remains in every fixture. These are parser test inputs, not bundled product themes.\n');
