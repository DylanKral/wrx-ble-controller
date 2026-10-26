import {
  DEFAULT_NATIVE_SPEED,
  validNativeSpeed,
} from "../animations/nativeSpeed";
import { validMode } from "../animations/types";
import { keys, readJSON, type StorageLike } from "./persistence";
export interface NativeSpeedPreferences {
  version: 1;
  speeds: Record<number, number>;
  previewTiming: Record<number, boolean>;
}
export function loadNativeSpeedPreferences(
  storage: StorageLike,
): NativeSpeedPreferences {
  const result: NativeSpeedPreferences = {
    version: 1,
    speeds: {},
    previewTiming: {},
  };
  try {
    const saved = readJSON(
      storage,
      keys.nativeSpeed,
    ) as Partial<NativeSpeedPreferences> | null;
    if (saved?.version !== 1) return result;
    for (const [mode, speed] of Object.entries(saved.speeds ?? {}))
      if (validMode(Number(mode)) && validNativeSpeed(speed))
        result.speeds[Number(mode)] = speed;
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
  return preferences.speeds[mode] ?? DEFAULT_NATIVE_SPEED;
}
