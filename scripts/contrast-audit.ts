/**
 * CI gate: every built-in theme must pass the WCAG AA contrast audit.
 *
 * Usage: `npm run audit:contrast`
 * Exit code 1 lists the failing pairs and suggests the palette field to raise.
 */
import { THEMES } from '../src/themes/index.ts';
import { auditPalette } from '../src/themes/contrast.ts';

let failed = 0;
for (const theme of THEMES) {
  const report = auditPalette(theme.palette);
  const status = report.grade === 'fail' ? 'FAIL' : ' ok ';
  console.log(
    `[${status}] ${theme.id.padEnd(14)} grade=${report.grade.padEnd(4)} text=${report.minTextRatio.toFixed(2)} ui=${report.minUiRatio.toFixed(2)}`,
  );
  for (const issue of report.issues) {
    console.log(
      `         ${issue.label.padEnd(28)} ${issue.ratio.toFixed(2)}:1 < ${issue.required}:1  (${issue.foreground} on ${issue.background})`,
    );
  }
  if (report.grade === 'fail') failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} theme(s) failed the contrast gate.`);
  process.exit(1);
}
console.log('\nAll built-in themes pass WCAG AA.');
