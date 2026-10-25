import { CAL, starter } from "../animations/factoryModes";
import {
  validMode,
  validMs,
  type Behavior,
  type Favorite,
  type Playlist,
  type Profile,
  type Step,
} from "../animations/types";
import { keys, readJSON, type StorageLike } from "./persistence";
export function fallback(p: { name: string; mode: number }): Favorite {
  const c = CAL[p.mode],
    fullMs = c?.ms || 3000;
  return {
    ...p,
    kind: c?.kind || "unknown",
    fullMs,
    cutMs: Math.max(
      50,
      Math.min(Math.round((fullMs * 0.65) / 50) * 50, fullMs - 50),
    ),
    transition: "finish",
  };
}
export const defaultFavorites = starter.map(fallback);
export function cleanFavorite(
  value: unknown,
  d: Favorite,
  legacy = false,
): Favorite {
  const o = (value || {}) as Partial<Favorite>,
    mode = validMode(Number(o.mode)) ? Number(o.mode) : d.mode,
    c = CAL[mode];
  let fullMs = Number(o.fullMs),
    cutMs = Number(o.cutMs);
  if (
    legacy &&
    fullMs === 3000 &&
    cutMs === 1250 &&
    o.transition === "finish" &&
    c
  )
    fullMs = c.ms;
  if (!validMs(fullMs, 50)) fullMs = c?.ms || 3000;
  if (!validMs(cutMs, 50) || cutMs >= fullMs)
    cutMs = Math.max(
      50,
      Math.min(Math.round((fullMs * 0.65) / 50) * 50, fullMs - 50),
    );
  return {
    name:
      typeof o.name === "string" && o.name.trim()
        ? o.name.trim().slice(0, 28)
        : d.name,
    mode,
    fullMs,
    cutMs,
    kind: ["oneshot", "continuous", "unknown"].includes(o.kind || "")
      ? (o.kind as Behavior)
      : c?.kind || "unknown",
    transition: o.transition === "cut" ? "cut" : "finish",
  };
}
export interface LegacyState {
  presets: Favorite[];
  selected: number;
  items: Playlist[];
  active: string;
  steps: number[];
}
export function loadLegacy(storage: StorageLike): {
  state: LegacyState;
  warning: string;
} {
  const state: LegacyState = {
    presets: defaultFavorites.map((p) => ({ ...p })),
    selected: 0,
    items: [],
    active: "",
    steps: [],
  };
  try {
    let raw = readJSON(storage, keys.favorites) as {
        presets?: unknown[];
        selected?: number;
      } | null,
      legacy = false;
    if (!raw?.presets || raw.presets.length !== 10) {
      raw = readJSON(storage, "wrx-dream-presets-v4") as typeof raw;
      legacy = true;
    }
    if (raw?.presets?.length === 10) {
      state.presets = raw.presets.map((p, i) =>
        cleanFavorite(p, defaultFavorites[i], legacy),
      );
      if (
        Number.isInteger(raw.selected) &&
        raw.selected! >= 0 &&
        raw.selected! < 10
      )
        state.selected = raw.selected!;
    } else {
      const v3 = readJSON(storage, "wrx-dream-presets-v3");
      if (Array.isArray(v3) && v3.length === 10)
        state.presets = v3.map((p, i) => cleanFavorite(p, defaultFavorites[i]));
    }
    const pl = readJSON(storage, keys.playlists) as {
      items?: Playlist[];
      active?: string;
      steps?: number[];
    } | null;
    const valid = (n: number) => Number.isInteger(n) && n >= 0 && n < 10;
    if (Array.isArray(pl?.items)) {
      state.items = pl.items
        .filter((p) => p && typeof p.id === "string" && Array.isArray(p.steps))
        .slice(0, 30)
        .map((p) => ({
          ...p,
          name: String(p.name || "Playlist").slice(0, 36),
          steps: p.steps.filter(valid).slice(0, 50),
        }));
      state.active = state.items.some((p) => p.id === pl.active)
        ? pl.active!
        : "";
      state.steps = (
        state.items.find((p) => p.id === state.active)?.steps ??
        pl.steps ??
        []
      )
        .filter(valid)
        .slice(0, 50);
    }
    if (!state.items.length && !state.steps.length) {
      const v4 = readJSON(storage, "wrx-dream-presets-v4") as {
        presets?: { include?: boolean }[];
      } | null;
      state.steps =
        v4?.presets?.flatMap((p, i) => (p.include ? [i] : [])) ?? [];
      if (!state.steps.length) state.steps = [0, 2, 1];
    }
    return { state, warning: "" };
  } catch (e) {
    return {
      state,
      warning:
        "Legacy data could not be loaded; original storage retained: " +
        String(e),
    };
  }
}
export function favoriteDuration(
  item: Favorite,
  nextMode: number,
  single = false,
) {
  if (single)
    return item.kind === "continuous" ? item.fullMs : item.fullMs + 100;
  if (item.transition === "cut")
    return nextMode !== item.mode ? item.cutMs : item.fullMs + 100;
  return item.fullMs;
}
export function favoriteProfile(
  queue: Favorite[],
  repeat: boolean,
  single = false,
): Profile {
  const steps: Step[] = queue.map((p, i) => {
    const ms = favoriteDuration(p, queue[(i + 1) % queue.length].mode, single);
    return {
      type: "mode",
      mode: p.mode,
      ms,
      suppressRepeated: p.kind === "continuous",
    };
  });
  return {
    id: "legacy-playback",
    name: single ? queue[0].name : "Favorite playlist",
    repeat,
    experimental: false,
    nativeLoop: single && queue[0].kind === "continuous" && repeat,
    steps,
  };
}
