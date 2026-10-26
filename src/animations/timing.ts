import { curatedIds } from "./customPresets";
import {
  DEFAULT_NATIVE_SPEED,
  provisionalDurationFactor,
  speedObservations,
  validNativeSpeed,
} from "./nativeSpeed";
import type { Profile, Step } from "./types";

export const FACTOR_LIMITS = [0.05, 10] as const;
// Geometric mean of the two observed relative endpoint responses. This is an
// estimate for unmeasured modes, not a measurement of their firmware behavior.
export const estimatedAnchors = {
  slow: Math.sqrt((3.79 / 1.69) * (6.3 / 3.54)),
  fast: Math.sqrt((0.6 / 1.69) * (0.54 / 3.54)),
};
export type TimingCorrections = Record<number, number>;
export function durationFactor(
  mode: number,
  speed: number,
  corrections: TimingCorrections = {},
): number {
  if (!validNativeSpeed(speed)) throw new Error("Invalid native speed");
  if (speed === DEFAULT_NATIVE_SPEED) return 1;
  const measured = speedObservations[mode];
  const raw = measured
    ? provisionalDurationFactor(mode, speed, true)
    : Math.exp(
        speed < 129
          ? (Math.log(estimatedAnchors.slow) * (129 - speed)) / 128
          : (Math.log(estimatedAnchors.fast) * (speed - 129)) / 126,
      );
  const correction = corrections[mode] ?? 1;
  if (!Number.isFinite(correction) || correction < 0.25 || correction > 4)
    throw new Error("Timing correction must be between 0.25 and 4");
  const factor = raw ** correction;
  if (!Number.isFinite(factor) || factor <= 0)
    throw new Error("Invalid timing factor");
  return Math.max(FACTOR_LIMITS[0], Math.min(FACTOR_LIMITS[1], factor));
}
export const timingSource = (mode: number) =>
  speedObservations[mode]
    ? "Video-derived provisional curve (tentative byte anchors)"
    : "Estimated curve · unmeasured mode";
export function followsAnimationSpeed(profile: Profile, bundledFollow = true) {
  return (
    profile.followAnimationSpeed ??
    (curatedIds.has(profile.id) && bundledFollow)
  );
}
export interface StepTiming {
  referenceMs: number;
  effectiveMs: number;
  factor: number;
  speed?: number;
  timingMode?: number;
  animationFactor?: number;
}
export function resolveStepTiming(
  step: Step,
  profile: Profile,
  getSpeed: (mode: number) => number = () => DEFAULT_NATIVE_SPEED,
  getFactor: (mode: number, speed: number) => number = durationFactor,
  bundledFollow = true,
): StepTiming {
  const timingMode = followsAnimationSpeed(profile, bundledFollow)
    ? step.type === "mode"
      ? step.mode
      : step.timingMode
    : undefined;
  const speed =
    step.type === "mode"
      ? getSpeed(step.mode)
      : timingMode === undefined
        ? undefined
        : getSpeed(timingMode);
  const animationFactor =
    step.type === "mode" ? getFactor(step.mode, speed!) : undefined;
  const factor =
    timingMode === undefined
      ? 1
      : (animationFactor ?? getFactor(timingMode, speed!));
  if (
    !Number.isFinite(step.ms) ||
    step.ms < 0 ||
    !Number.isFinite(factor) ||
    factor < 0.05 ||
    factor > 10 ||
    (animationFactor !== undefined &&
      (!Number.isFinite(animationFactor) ||
        animationFactor < 0.05 ||
        animationFactor > 10))
  )
    throw new Error("Invalid effective step duration");
  return {
    referenceMs: step.ms,
    effectiveMs: step.ms * factor,
    factor,
    speed,
    timingMode,
    animationFactor,
  };
}
