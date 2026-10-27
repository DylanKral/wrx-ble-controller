import type { Profile, Step } from "./types";

export type OverlapMode = 7 | 8;
export const isOverlapMode = (mode: number): mode is OverlapMode =>
  mode === 7 || mode === 8;
// App retrigger references, separate from native duration and approved captures.
// The new videos do not establish a shorter BLE dispatch interval.
export const BASIC_REPEAT_DEFAULTS: Readonly<Record<OverlapMode, number>> = {
  7: 3500,
  8: 3500,
};
export type BasicRepeatReferences = Partial<Record<OverlapMode, number>>;
export const validBasicRepeatMs = (ms: number) =>
  Number.isInteger(ms) && ms >= 500 && ms <= 10000 && ms % 50 === 0;
export function basicRepeatReference(
  mode: OverlapMode,
  references: BasicRepeatReferences,
) {
  return references[mode] ?? BASIC_REPEAT_DEFAULTS[mode];
}
export function withBasicRepeatReference(
  step: Step,
  profile: Profile,
  references: BasicRepeatReferences,
): Step {
  const mode = profile.basicRepeatMode;
  if (mode === undefined || step.type !== "mode" || step.mode !== mode)
    return step;
  const ms = basicRepeatReference(mode, references);
  if (!validBasicRepeatMs(ms))
    throw new Error("Invalid Basic retrigger reference");
  return { ...step, ms };
}
