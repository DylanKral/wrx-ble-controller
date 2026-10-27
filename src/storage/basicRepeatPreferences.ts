import {
  isOverlapMode,
  validBasicRepeatMs,
  type BasicRepeatReferences,
} from "../animations/basicRepeatTiming";
import { keys, readJSON, type StorageLike } from "./persistence";
export interface BasicRepeatPreferences {
  version: 1;
  referenceMs: BasicRepeatReferences;
}
export function loadBasicRepeatPreferences(
  storage: StorageLike,
): BasicRepeatPreferences {
  const result: BasicRepeatPreferences = { version: 1, referenceMs: {} };
  try {
    const raw = readJSON(
      storage,
      keys.basicRepeat,
    ) as Partial<BasicRepeatPreferences> | null;
    if (raw?.version !== 1) return result;
    for (const [key, ms] of Object.entries(raw.referenceMs ?? {})) {
      const mode = Number(key);
      if (isOverlapMode(mode) && validBasicRepeatMs(ms))
        result.referenceMs[mode] = ms;
    }
  } catch {
    /* Initialization never rewrites source settings or old profiles. */
  }
  return result;
}
