/**
 * Import / export of the desktop-themes config as a JSON document.
 *
 * Exports carry a `schemaVersion` envelope for forward migration; imports run
 * through `importConfig` (validation.ts), which migrates older versions and
 * coerces every field, so a malformed document can never crash the plugin.
 * No secrets, tokens, or image bytes are ever written to the export.
 */

import { coerceConfig, importConfig, isProbablyConfig } from './validation.ts';
import { SCHEMA_VERSION, type DesktopThemesConfig } from './types.ts';

/** Serialize a config to a pretty-printed JSON document string. */
export function exportConfigJson(config: DesktopThemesConfig): string {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, config: { ...config, wallpaper: { ...config.wallpaper, path: '' } } }, null, 2);
}

/** Download the current config as `dsh-desktop-themes.json` (backup action). */
export function downloadConfigJson(config: DesktopThemesConfig): void {
  if (typeof document === 'undefined') return;
  const text = exportConfigJson(config);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'dsh-desktop-themes.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export type ImportResult = { ok: true; config: DesktopThemesConfig } | { ok: false; reason: 'parse' | 'schema' };

/** Parse and validate an imported JSON document. */
export function parseImportedConfig(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'parse' };
  }
  if (!isProbablyConfig(parsed)) {
    return { ok: false, reason: 'schema' };
  }
  return { ok: true, config: importConfig(parsed) };
}

/** Re-export the coercer so callers have one transfer surface. */
export { coerceConfig };
