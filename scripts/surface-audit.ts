/**
 * CI gate for surface hierarchy (chrome / canvas / panel / raised).
 *
 * Usage: `npm run audit:surfaces`
 */
import { THEMES } from '../src/themes/index.ts';
import { auditSurfaces } from '../src/themes/surfaces.ts';

let failed = 0;
for (const theme of THEMES) {
  const report = auditSurfaces(theme.palette);
  console.log(`\n[${report.passed ? ' ok ' : 'FAIL'}] ${theme.id.padEnd(14)} ${report.passed ? '' : `${report.issues.length} issue(s)`}`);
  for (const check of report.checks) {
    const flag = check.ratio < check.min || check.ratio > check.max ? '!' : ' ';
    console.log(`   ${flag} ${check.label.padEnd(18)} ${check.ratio.toFixed(2)}  target ${check.min.toFixed(2)}–${check.max.toFixed(2)}`);
  }
  if (!report.passed) failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} theme(s) failed the surface hierarchy gate.`);
  process.exit(1);
}
console.log('\nAll built-in themes have a readable surface hierarchy.');
