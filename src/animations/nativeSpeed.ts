// Tentative byte assignments: these were NOT logged alongside the supplied videos.
export const DEFAULT_NATIVE_SPEED = 0x81;
export const validNativeSpeed = (value: number) =>
  Number.isInteger(value) && value >= 1 && value <= 255;
export const speedObservations: Readonly<
  Record<
    number,
    {
      metric: "illuminated transition" | "full breathing cycle";
      slow: number;
      reference: number;
      fast: number;
    }
  >
> = {
  4: {
    metric: "illuminated transition",
    slow: 3.79,
    reference: 1.69,
    fast: 0.6,
  },
  10: {
    metric: "full breathing cycle",
    slow: 6.3,
    reference: 3.54,
    fast: 0.54,
  },
};
export const tentativeAnchorBytes = [1, DEFAULT_NATIVE_SPEED, 255] as const;

export function provisionalDurationFactor(
  mode: number,
  speed: number,
  enabled = false,
): number {
  if (!validNativeSpeed(speed))
    throw new Error("Native speed must be an integer from 1 to 255");
  const observed = speedObservations[mode];
  if (!enabled || !observed) return 1;
  const durations = [observed.slow, observed.reference, observed.fast];
  const anchorIndex = tentativeAnchorBytes.findIndex((byte) => byte === speed);
  if (anchorIndex !== -1) return durations[anchorIndex] / observed.reference;
  const segment = speed < DEFAULT_NATIVE_SPEED ? 0 : 1;
  const fraction =
    (speed - tentativeAnchorBytes[segment]) /
    (tentativeAnchorBytes[segment + 1] - tentativeAnchorBytes[segment]);
  // Interpolate duration in log space, rather than treating byte as a linear rate.
  return (
    Math.exp(
      Math.log(durations[segment]) +
        fraction *
          (Math.log(durations[segment + 1]) - Math.log(durations[segment])),
    ) / observed.reference
  );
}
