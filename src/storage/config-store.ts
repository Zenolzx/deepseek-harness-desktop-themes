import type { DesktopThemesConfig } from '../config/types.ts';
import { coerceConfig } from '../config/validation.ts';

export const LOCAL_CONFIG_KEY = 'dsh-desktop-themes:explicit-config:v4';
const LEGACY_LOCAL_CONFIG_KEY = 'dsh-desktop-themes:explicit-config:v3';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface SavedEnvelope {
  savedAt: number;
  config: unknown;
}

function browserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Store the user's explicit save without runtime-only object URLs. */
export function saveConfigSnapshot(config: DesktopThemesConfig, storage: StorageLike | null = browserStorage()): boolean {
  if (storage === null) return false;
  try {
    const durable: DesktopThemesConfig = {
      ...config,
      wallpaper: { ...config.wallpaper, path: '' },
    };
    storage.setItem(LOCAL_CONFIG_KEY, JSON.stringify({ savedAt: Date.now(), config: durable } satisfies SavedEnvelope));
    return true;
  } catch {
    return false;
  }
}

/** Load only snapshots created by the explicit Save button. */
export function loadConfigSnapshot(storage: StorageLike | null = browserStorage()): DesktopThemesConfig | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(LOCAL_CONFIG_KEY) ?? storage.getItem(LEGACY_LOCAL_CONFIG_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<SavedEnvelope>;
    if (typeof parsed.savedAt !== 'number' || parsed.config === undefined) return null;
    return coerceConfig(parsed.config);
  } catch {
    return null;
  }
}
