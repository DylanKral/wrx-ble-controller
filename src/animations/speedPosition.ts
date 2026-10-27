import { validNativeSpeed } from "./nativeSpeed";

// Slider position, not a percentage of physical animation speed. The extra
// 50% stop keeps reference byte 129 directly reachable between ~15% stops.
export const SPEED_POSITIONS = [0, 15, 30, 45, 50, 60, 75, 90, 100] as const;
export function percentToNativeSpeed(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100)
    throw new Error("Invalid speed position");
  return percent <= 50
    ? 1 + Math.round((percent * 128) / 50)
    : 129 + Math.round(((percent - 50) * 126) / 50);
}
export function nativeSpeedToPercent(speed: number): number {
  if (!validNativeSpeed(speed)) throw new Error("Invalid native speed");
  return speed <= 129
    ? ((speed - 1) * 50) / 128
    : 50 + ((speed - 129) * 50) / 126;
}
export function snapSpeedPercent(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100)
    throw new Error("Invalid speed position");
  return SPEED_POSITIONS.reduce<number>(
    (closest, stop) =>
      Math.abs(stop - percent) < Math.abs(closest - percent) ? stop : closest,
    0,
  );
}
export function nextSpeedPercent(percent: number, direction: -1 | 1): number {
  return direction === 1
    ? (SPEED_POSITIONS.find((stop) => stop > percent + 0.001) ?? 100)
    : ([...SPEED_POSITIONS].reverse().find((stop) => stop < percent - 0.001) ??
        0);
}
