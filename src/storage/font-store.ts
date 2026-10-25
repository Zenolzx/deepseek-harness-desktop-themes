/**
 * IndexedDB storage for fonts installed into the plugin.
 *
 * Kept in its own database so the wallpaper store's schema version never needs
 * to move, and so "clear my wallpapers" can never take the fonts with it.
 * Every call degrades to `undefined`/`false` when IndexedDB is unavailable.
 */

const DB_NAME = 'dsh-desktop-themes-fonts';
const DB_VERSION = 1;
const STORE = 'fonts';

export interface StoredFont {
  id: string;
  fileName: string;
  /** Exact byte length of `blob`. */
  size: number;
  /** CSS font-weight descriptor (e.g. `400` or `100 900`). */
  weight: string;
  blob: Blob;
  downloadedAt: number;
}

export interface StoredFontMeta {
  id: string;
  fileName: string;
  size: number;
  weight: string;
  downloadedAt: number;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  return openDb().then((db) => {
    if (db === null) return undefined;
    return new Promise<T | undefined>((resolve) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(STORE, mode);
      } catch {
        db.close();
        resolve(undefined);
        return;
      }
      let request: IDBRequest<T>;
      try {
        request = fn(tx.objectStore(STORE));
      } catch {
        db.close();
        resolve(undefined);
        return;
      }
      request.onsuccess = () => {
        resolve(request.result);
        db.close();
      };
      request.onerror = () => {
        resolve(undefined);
        db.close();
      };
    });
  });
}

/** Persist one downloaded font blob (replaces an existing id). */
export async function putStoredFont(record: StoredFont): Promise<boolean> {
  const result = await withStore('readwrite', (store) => store.put(record) as IDBRequest<IDBValidKey>);
  return result !== undefined;
}

/** Load a font blob by id. */
export async function getStoredFont(id: string): Promise<StoredFont | undefined> {
  return withStore<StoredFont>('readonly', (store) => store.get(id) as IDBRequest<StoredFont>);
}

/** Remove a stored font blob. */
export async function deleteStoredFont(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id) as IDBRequest<undefined>);
}

/** List installed font metadata without loading the blobs. */
export async function listStoredFonts(): Promise<StoredFontMeta[]> {
  const records = await withStore<StoredFont[]>('readonly', (store) => store.getAll() as IDBRequest<StoredFont[]>);
  if (!records) return [];
  return records
    .map((r) => ({ id: r.id, fileName: r.fileName, size: r.size, weight: r.weight, downloadedAt: r.downloadedAt }))
    .sort((a, b) => b.downloadedAt - a.downloadedAt);
}
