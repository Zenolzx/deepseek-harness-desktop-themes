/**
 * Font runtime: download a font file into the plugin, keep it in IndexedDB, and
 * register it with the browser's `FontFace` set.
 *
 * This is the layer that makes "one-click install" real: the page can use a
 * font the operating system has never seen, and it keeps working offline after
 * one download. The registered family is the preset's canonical family, so the
 * existing CSS stack picks it up with no extra selector. A small observable
 * registry lets the settings UI show installed/downloading state.
 */

import { familyForDownload, invalidateFontAvailability, type FontDownload } from './presets.ts';
import { deleteStoredFont, getStoredFont, listStoredFonts, putStoredFont } from '../storage/font-store.ts';

export type FontInstallPhase = 'download' | 'install';

export interface FontInstallProgress {
  loaded: number;
  total: number;
  phase: FontInstallPhase;
}

export type FontInstallErrorCode = 'network' | 'http' | 'quota' | 'storage' | 'invalid' | 'unsupported' | 'aborted';

export class FontInstallError extends Error {
  readonly code: FontInstallErrorCode;

  constructor(code: FontInstallErrorCode, message: string) {
    super(message);
    this.name = 'FontInstallError';
    this.code = code;
  }
}

const faces = new Map<string, FontFace>();
const listeners = new Set<() => void>();
let revision = 0;

function notify(): void {
  revision += 1;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* one broken subscriber must not starve the rest */
    }
  }
}

/** Monotonic revision, suitable for `useSyncExternalStore`. */
export function fontsRevision(): number {
  return revision;
}

/** Subscribe to installed-font changes. */
export function subscribeFonts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True when this resource is registered in the current page. */
export function isFontInstalled(id: string): boolean {
  return faces.has(id);
}

/** Installed resource ids, in registration order. */
export function installedFontIds(): string[] {
  return [...faces.keys()];
}

function supportsFontFace(): boolean {
  return typeof document !== 'undefined' && typeof FontFace !== 'undefined';
}

async function registerFace(id: string, family: string, weight: string, blob: Blob): Promise<boolean> {
  if (family.trim().length === 0 || !supportsFontFace()) return false;
  if (faces.has(id)) return true;
  const buffer = await blob.arrayBuffer();
  const face = new FontFace(family, buffer, { weight, style: 'normal', display: 'swap' });
  await face.load();
  document.fonts.add(face);
  faces.set(id, face);
  return true;
}

/** Register every previously downloaded font. Safe to call once at startup. */
export async function hydrateInstalledFonts(): Promise<void> {
  if (!supportsFontFace()) return;
  const metas = await listStoredFonts();
  let changed = false;
  for (const meta of metas) {
    if (faces.has(meta.id)) continue;
    const record = await getStoredFont(meta.id);
    if (record === undefined) continue;
    const family = familyForDownload(meta.id);
    if (family.length === 0) continue;
    try {
      const ok = await registerFace(meta.id, family, record.weight, record.blob);
      changed = changed || ok;
    } catch (error) {
      console.warn(`[dsh-desktop-themes] cannot register stored font "${meta.id}":`, error);
    }
  }
  if (changed) {
    invalidateFontAvailability();
    notify();
  }
}

function readWithProgress(
  response: Response,
  total: number,
  onProgress: (progress: FontInstallProgress) => void,
  signal: AbortSignal | undefined,
): Promise<Blob> {
  if (response.body === null) {
    return response.blob().then((blob) => {
      onProgress({ loaded: blob.size, total: Math.max(total, blob.size), phase: 'download' });
      return blob;
    });
  }
  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  const pump = async (): Promise<Blob> => {
    for (;;) {
      if (signal?.aborted === true) {
        await reader.cancel().catch(() => undefined);
        throw new FontInstallError('aborted', 'download aborted');
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== undefined) {
        chunks.push(value);
        loaded += value.byteLength;
        onProgress({ loaded, total: Math.max(total, loaded), phase: 'download' });
      }
    }
    return new Blob(chunks, { type: 'font/woff2' });
  };
  return pump();
}

function looksLikeWoff2(blob: Blob): Promise<boolean> {
  return blob
    .slice(0, 4)
    .arrayBuffer()
    .then((buffer) => {
      const bytes = new Uint8Array(buffer);
      // 'wOF2'
      return bytes.length === 4 && bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x32;
    })
    .catch(() => false);
}

/**
 * Download + persist + register one font. Resolves once the family is usable;
 * throws a {@link FontInstallError} with a UI-addressable code on failure.
 */
export async function installFont(
  download: FontDownload,
  onProgress: (progress: FontInstallProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (isFontInstalled(download.id)) return;
  let response: Response;
  try {
    response = await fetch(download.url, { signal, cache: 'no-store', credentials: 'omit' });
  } catch (error) {
    if (signal?.aborted === true || (error as { name?: string })?.name === 'AbortError') {
      throw new FontInstallError('aborted', 'download aborted');
    }
    throw new FontInstallError('network', 'cannot reach the font source');
  }
  if (!response.ok) {
    throw new FontInstallError('http', `font source answered ${response.status}`);
  }
  const total = Number(response.headers.get('content-length')) || download.sizeBytes;
  const blob = await readWithProgress(response, total, onProgress, signal);
  if (blob.size < 1024) {
    throw new FontInstallError('invalid', 'downloaded file is too small');
  }
  if (!(await looksLikeWoff2(blob))) {
    throw new FontInstallError('invalid', 'downloaded file is not a woff2 font');
  }
  onProgress({ loaded: blob.size, total: blob.size, phase: 'install' });
  const stored = await putStoredFont({
    id: download.id,
    fileName: download.fileName,
    size: blob.size,
    weight: download.weight,
    blob,
    downloadedAt: Date.now(),
  });
  if (!stored) {
    throw new FontInstallError('storage', 'cannot persist the font');
  }
  const family = familyForDownload(download.id);
  try {
    await registerFace(download.id, family.length > 0 ? family : download.id, download.weight, blob);
  } catch (error) {
    await deleteStoredFont(download.id);
    const name = (error as { name?: string })?.name;
    if (name === 'QuotaExceededError') {
      throw new FontInstallError('quota', 'browser storage is full');
    }
    throw new FontInstallError('unsupported', 'browser cannot register this font');
  }
  invalidateFontAvailability();
  notify();
}

/** Delete a stored font and unregister its face. */
export async function removeInstalledFont(id: string): Promise<void> {
  const face = faces.get(id);
  if (face !== undefined) {
    try {
      document.fonts.delete(face);
    } catch {
      /* already gone */
    }
    faces.delete(id);
  }
  await deleteStoredFont(id);
  invalidateFontAvailability();
  notify();
}

/** Unregister every in-memory face (plugin unload). Blobs stay in IndexedDB. */
export function disposeFontFaces(): void {
  if (!supportsFontFace()) {
    faces.clear();
    return;
  }
  for (const face of faces.values()) {
    try {
      document.fonts.delete(face);
    } catch {
      /* already gone */
    }
  }
  faces.clear();
  invalidateFontAvailability();
  notify();
}
