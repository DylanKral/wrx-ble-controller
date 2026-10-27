import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { speedObservations } from "../src/animations/nativeSpeed";
import { durationFactor, resolveStepTiming } from "../src/animations/timing";
import {
  SPEED_POSITIONS,
  nativeSpeedToPercent,
  percentToNativeSpeed,
  snapSpeedPercent,
  nextSpeedPercent,
} from "../src/animations/speedPosition";
import { Simulator } from "../src/simulation/Simulator";
import {
  calibrationByMode,
  getFrameAtTime,
} from "../src/simulation/calibrations";
import { basicProfiles } from "../src/animations/factoryModes";
import { initialProfiles } from "../src/animations/customPresets";
import { withBasicRepeatReference } from "../src/animations/basicRepeatTiming";

it("maps percentage position monotonically, with a dedicated exact 50% reference and lossless advanced bytes", () => {
  expect(SPEED_POSITIONS.map(percentToNativeSpeed)).toEqual([
    1, 39, 78, 116, 129, 154, 192, 230, 255,
  ]);
  expect(percentToNativeSpeed(50)).toBe(129);
  expect(nativeSpeedToPercent(129)).toBe(50);
  for (let byte = 1; byte <= 255; byte++)
    expect(percentToNativeSpeed(nativeSpeedToPercent(byte))).toBe(byte);
  let previous = 0;
  for (let p = 0; p <= 100; p++) {
    const byte = percentToNativeSpeed(p);
    expect(byte).toBeGreaterThanOrEqual(previous);
    previous = byte;
  }
  expect(snapSpeedPercent(73)).toBe(75);
  expect(nextSpeedPercent(45, 1)).toBe(50);
  expect(nextSpeedPercent(50, -1)).toBe(45);
  expect(nextSpeedPercent(50, 1)).toBe(60);
  expect(nextSpeedPercent(25, 1)).toBe(30);
  for (const p of [-1, 101, NaN, Infinity])
    expect(() => percentToNativeSpeed(p)).toThrow();
});

describe.each([7, 8])("independent native Mode %s response", (mode) => {
  it("uses the measured optical phase durations, with tentative byte anchors and exact reference", () => {
    const report = JSON.parse(
      readFileSync("docs/analysis/native-overlap/review.json", "utf8"),
    );
    const video = report.videos[mode === 7 ? "IMG_1602.mp4" : "IMG_1603.mp4"];
    expect(video.mode_from_direction).toBe(mode);
    expect(video.frames).toBe(mode === 7 ? 931 : 738);
    for (const segment of video.measurements) {
      const redFront = segment.zones.filter(
        (zone: { red_frame: number | null }) => zone.red_frame !== null,
      );
      const direction = Math.sign(
        redFront.at(-1).red_frame - redFront[0].red_frame,
      );
      expect(direction).toBe(mode === 7 ? -1 : 1);
    }
    const obs = speedObservations[mode];
    expect(obs.reference).toBe(video.measurements[0].median_red_to_cyan_s);
    expect(obs.slow).toBe(video.measurements[1].median_red_to_cyan_s);
    expect(obs.fast).toBe(video.measurements[2].median_red_to_cyan_s);
    expect(durationFactor(mode, 129)).toBe(1);
    expect(durationFactor(mode, 1)).toBeCloseTo(obs.slow / obs.reference, 12);
    expect(durationFactor(mode, 255)).toBeCloseTo(obs.fast / obs.reference, 12);
    expect(durationFactor(mode, 65)).toBeCloseTo(
      Math.sqrt(obs.slow / obs.reference),
      12,
    );
    expect(durationFactor(mode, 192)).toBeCloseTo(
      Math.sqrt(obs.fast / obs.reference),
      12,
    );
    expect(durationFactor(mode, 1)).toBeGreaterThan(1);
    expect(durationFactor(mode, 255)).toBeLessThan(1);
  });
  it("keeps identical 19-zone reference frames at equivalent phase for every slider stop", () => {
    const cal = calibrationByMode.get(mode)!;
    for (const stop of SPEED_POSITIONS) {
      let now = 0;
      const byte = percentToNativeSpeed(stop),
        factor = durationFactor(mode, byte);
      const sim = new Simulator("#00ff00", undefined, () => now);
      sim.mode(mode, byte, true);
      now = 1.215 * factor * 1000;
      expect(sim.sample().elapsed).toBeCloseTo(1.215, 12);
      expect(sim.sample().frame).toBe(getFrameAtTime(cal, 1.215));
      expect(sim.sample().colors).toEqual(getFrameAtTime(cal, 1.215).colors);
      expect(sim.sample().wallDuration).toBe(3.5 * factor);
    }
  });
  it("scales its own Custom cuts and independent saved Basic reference without rewriting either", () => {
    const cut = initialProfiles.find((p) => p.id === "overlap-cut")!,
      step = cut.steps[mode === 7 ? 0 : 1];
    const original = JSON.stringify(cut),
      getSpeed = (m: number) => (m === 7 ? 1 : 255);
    const timing = resolveStepTiming(step, cut, getSpeed);
    expect(timing.effectiveMs).toBe(
      1300 * durationFactor(mode, getSpeed(mode)),
    );
    expect(
      resolveStepTiming(step, { ...cut, followAnimationSpeed: false }, getSpeed)
        .effectiveMs,
    ).toBe(1300);
    const basic = basicProfiles.find((p) => p.basicRepeatMode === mode)!;
    const selected = withBasicRepeatReference(basic.steps[0], basic, {
      7: 3000,
      8: 3150,
    });
    expect(resolveStepTiming(selected, basic, getSpeed).effectiveMs).toBe(
      (mode === 7 ? 3000 : 3150) * durationFactor(mode, getSpeed(mode)),
    );
    expect(basic.steps[0].ms).toBe(3500);
    expect(JSON.stringify(cut)).toBe(original);
  });
});

it("keeps Modes 4/10 observations and other generic models unchanged", () => {
  expect(speedObservations[4]).toEqual({
    metric: "illuminated transition",
    slow: 3.79,
    reference: 1.69,
    fast: 0.6,
  });
  expect(speedObservations[10]).toEqual({
    metric: "full breathing cycle",
    slow: 6.3,
    reference: 3.54,
    fast: 0.54,
  });
  for (const mode of [3, 5, 6, 9, 255]) {
    expect(durationFactor(mode, 1)).toBeCloseTo(
      Math.sqrt((3.79 / 1.69) * (6.3 / 3.54)),
      12,
    );
    expect(durationFactor(mode, 255)).toBeCloseTo(
      Math.sqrt((0.6 / 1.69) * (0.54 / 3.54)),
      12,
    );
  }
  // Separate measurements remain separate curves; this small difference is not
  // a claim of statistically resolved firmware differences at 30fps.
  expect(durationFactor(7, 1)).toBeCloseTo(139 / 59, 12);
  expect(durationFactor(8, 1)).toBeCloseTo(139 / 58, 12);
});
