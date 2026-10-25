export const keys = {
  studio: "wrx-dream-studio-v7",
  oldStudio: "wrx-dream-studio-v6",
  favorites: "wrx-dream-presets-v5",
  playlists: "wrx-dream-playlists-v5",
  calibration: "wrx-calibration-logs-v1",
  autoRestore: "wrx-auto-restore",
  rainbow: "wrx-rainbow-blue-start-color-v8",
  staticColor: "wrx-dream-home-static-v8",
  tab: "wrx-dream-home-tab-v8",
  oldFixedBackup: "wrx-dream-before-fixed-v8.2",
  migrationBackup: "wrx-dream-before-react-v9",
  schema: "wrx-dream-schema-version",
} as const;
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function getBrowserStorage(): { storage: Storage; warning: string } {
  try {
    const storage = window.localStorage;
    storage.getItem(keys.schema);
    return { storage, warning: "" };
  } catch {
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return values.size;
      },
      key: (index) => [...values.keys()][index] ?? null,
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, String(value));
      },
      removeItem: (key) => {
        values.delete(key);
      },
      clear: () => values.clear(),
    };
    return {
      storage,
      warning:
        "Browser storage is unavailable. Changes last until this page is closed; export a complete backup before leaving.",
    };
  }
}
export function readText(storage: StorageLike, key: string, fallback = "") {
  try {
    return storage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
export function readJSON(storage: StorageLike, key: string): unknown {
  const raw = storage.getItem(key);
  return raw === null ? null : JSON.parse(raw);
}
export function writeJSON(storage: StorageLike, key: string, value: unknown) {
  storage.setItem(key, JSON.stringify(value));
}
export function download(
  filename: string,
  content: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function exportConfiguration(storage: Storage) {
  const values: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith("wrx-")) values[key] = storage.getItem(key)!;
  }
  return {
    format: "WRX_Configuration_v1",
    exported_at: new Date().toISOString(),
    values,
  };
}
// Validate completely before writing; preserve original values if a quota error interrupts import.
export function importConfiguration(storage: Storage, data: unknown) {
  if (
    !data ||
    typeof data !== "object" ||
    !("format" in data) ||
    data.format !== "WRX_Configuration_v1" ||
    !("values" in data) ||
    !data.values ||
    typeof data.values !== "object"
  )
    throw new Error("Invalid configuration backup");
  const entries = Object.entries(data.values);
  if (entries.some(([k, v]) => !k.startsWith("wrx-") || typeof v !== "string"))
    throw new Error("Invalid storage entries");
  const previous = new Map(entries.map(([k]) => [k, storage.getItem(k)]));
  try {
    for (const [k, v] of entries) storage.setItem(k, v as string);
  } catch (e) {
    for (const [k, v] of previous) {
      if (v === null) storage.removeItem(k);
      else storage.setItem(k, v);
    }
    throw e;
  }
}
