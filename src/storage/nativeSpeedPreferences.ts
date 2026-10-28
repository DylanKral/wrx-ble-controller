import {
  DEFAULT_NATIVE_SPEED,
  validNativeSpeed,
} from "../animations/nativeSpeed";
import { validMode } from "../animations/types";
import type { TimingCorrections } from "../animations/timing";
import { keys, readJSON, type StorageLike } from "./persistence";
export interface NativeSpeedPreferences {
  version: 2;
  scope: "global" | "per-mode";
  globalSpeed: number;
  bundledFollow: boolean;
  corrections: TimingCorrections;
  speeds: Record<number, number>;
  previewTiming: Record<number, boolean>;
}
export function loadNativeSpeedPreferences(
  storage: StorageLike,
): NativeSpeedPreferences {
  const result: NativeSpeedPreferences = {
    version: 2,
    scope: "global",
    globalSpeed: DEFAULT_NATIVE_SPEED,
    bundledFollow: true,
    corrections: {},
    speeds: {},
    previewTiming: {},
  };
  try {
    const saved = readJSON(storage, keys.nativeSpeed) as
      | (Omit<Partial<NativeSpeedPreferences>, "version"> & {
          version?: number;
        })
      | null;
    if (!saved || ![1, 2].includes(Number(saved.version))) return result;
    for (const [mode, speed] of Object.entries(saved.speeds ?? {}))
      if (validMode(Number(mode)) && validNativeSpeed(speed))
        result.speeds[Number(mode)] = speed;
    result.scope =
      saved.scope === "per-mode" ||
      (saved.version === 1 && Object.keys(result.speeds).length > 0)
        ? "per-mode"
        : "global";
    if (validNativeSpeed(saved.globalSpeed!))
      result.globalSpeed = saved.globalSpeed!;
    if (typeof saved.bundledFollow === "boolean")
      result.bundledFollow = saved.bundledFollow;
    for (const [mode, correction] of Object.entries(saved.corrections ?? {}))
      if (
        validMode(Number(mode)) &&
        Number.isFinite(correction) &&
        correction >= 0.25 &&
        correction <= 4
      )
        result.corrections[Number(mode)] = correction;
    for (const mode of [4, 10])
      if (saved.previewTiming?.[mode] === true)
        result.previewTiming[mode] = true;
  } catch {
    /* Preserve malformed source; initialization never writes defaults over it. */
  }
  return result;
}
export function nativeSpeedFor(
  preferences: NativeSpeedPreferences,
  mode: number,
): number {
  return preferences.scope === "global"
    ? preferences.globalSpeed
    : (preferences.speeds[mode] ?? DEFAULT_NATIVE_SPEED);
}

// A single immutable update lets callers persist a whole profile atomically.
export function withNativeSpeeds(
  preferences: NativeSpeedPreferences,
  modes: readonly number[],
  speed: number,
): NativeSpeedPreferences {
  if (!validNativeSpeed(speed)) return preferences;
  const unique = [...new Set(modes.filter(validMode))];
  if (!unique.length || unique.every((mode) => nativeSpeedFor(preferences, mode) === speed))
    return preferences;
  return preferences.scope === "global"
    ? { ...preferences, globalSpeed: speed }
    : { ...preferences, speeds: { ...preferences.speeds, ...Object.fromEntries(unique.map((mode) => [mode, speed])) } };
}
