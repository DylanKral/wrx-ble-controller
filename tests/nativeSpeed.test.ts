import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_NATIVE_SPEED,
  provisionalDurationFactor,
  speedObservations,
} from "../src/animations/nativeSpeed";
import { hex, modeBytes } from "../src/bluetooth/commands";
import { Simulator } from "../src/simulation/Simulator";
import { PlaybackOutput } from "../src/simulation/PlaybackOutput";
import { BLEManager } from "../src/bluetooth/BLEManager";
import {
  getFrameAtTime,
  calibrationByMode,
} from "../src/simulation/calibrations";
import { Scheduler } from "../src/animations/scheduler";
import {
  loadNativeSpeedPreferences,
  nativeSpeedFor,
} from "../src/storage/nativeSpeedPreferences";
import { MemoryStorage } from "./helpers";
import { keys } from "../src/storage/persistence";

afterEach(() => vi.useRealTimers());
describe("native speed protocol and provisional model", () => {
  it("retains the default and encodes every legal speed without changing other bytes", () => {
    expect(DEFAULT_NATIVE_SPEED).toBe(129);
    expect(hex(modeBytes(4))).toBe("9E0003819800E9");
    for (let speed = 1; speed <= 255; speed++)
      expect([...modeBytes(10, speed)]).toEqual([
        0x9e,
        0,
        9,
        speed,
        0x98,
        0,
        0xe9,
      ]);
    for (const speed of [0, 256, -1, 1.5, NaN, Infinity])
      expect(() => modeBytes(4, speed)).toThrow();
  });
  it.each([4, 10])(
    "uses tentative anchors and log-duration interpolation for Mode %s",
    (mode) => {
      const observed = speedObservations[mode];
      expect(provisionalDurationFactor(mode, 1, true)).toBeCloseTo(
        observed.slow / observed.reference,
        12,
      );
      expect(provisionalDurationFactor(mode, 129, true)).toBe(1);
      expect(provisionalDurationFactor(mode, 255, true)).toBeCloseTo(
        observed.fast / observed.reference,
        12,
      );
      // Two independent inter-anchor checks per mode. These are mathematical tests, not physical measurements.
      expect(provisionalDurationFactor(mode, 65, true)).toBeCloseTo(
        Math.sqrt(observed.slow / observed.reference),
        12,
      );
      expect(provisionalDurationFactor(mode, 192, true)).toBeCloseTo(
        Math.sqrt(observed.fast / observed.reference),
        12,
      );
      for (let speed = 2; speed <= 255; speed++)
        expect(
          provisionalDurationFactor(mode, speed, true),
        ).toBeLessThanOrEqual(provisionalDurationFactor(mode, speed - 1, true));
    },
  );
  it("is opt-in per mode and leaves all unmeasured modes at their original preview timing", () => {
    for (const mode of [4, 10])
      for (const speed of [1, 65, 129, 192, 255])
        expect(provisionalDurationFactor(mode, speed)).toBe(1);
    for (const mode of [3, 5, 6, 7, 8, 9, 255])
      for (const speed of [1, 255])
        expect(provisionalDurationFactor(mode, speed, true)).toBe(1);
  });
  it("scales the captured clock and keeps Mode 4 transition metrics and Mode 10 full cycles separate", () => {
    let now = 0;
    const sim = new Simulator(
      "#00ff00",
      undefined,
      () => now,
      (mode, speed) => provisionalDurationFactor(mode, speed, true),
    );
    sim.mode(4, 1);
    const factor4 = 3.79 / 1.69;
    now = 0.7 * factor4 * 1000;
    expect(sim.sample().elapsed).toBeCloseTo(0.7);
    expect(sim.sample().wallDuration).toBeCloseTo(2.2 * factor4);
    expect(sim.sample().frame).toBe(
      getFrameAtTime(calibrationByMode.get(4)!, sim.sample().elapsed),
    );
    sim.mode(10, 1);
    const factor10 = 6.3 / 3.54;
    expect(sim.sample().duration).toBe(2.5);
    expect(sim.sample().wallDuration).toBeCloseTo(2.5 * factor10);
    expect(sim.sample().wallDuration).not.toBeCloseTo(6.3);
    expect(calibrationByMode.get(10)!.frames).toHaveLength(75);
  });
  it("retimes opt-in changes without jumping frames, and assumes restart only when a mode request changes speed", async () => {
    let now = 0,
      enabled = false;
    const sim = new Simulator(
      "#ff0000",
      undefined,
      () => now,
      (mode, speed) => provisionalDurationFactor(mode, speed, enabled),
    );
    const ble = new BLEManager(() => undefined),
      send = vi.spyOn(ble, "send"),
      output = new PlaybackOutput(ble, sim, "simulation");
    await output.send(modeBytes(4, 1));
    now = 600;
    const frame = sim.sample().frame;
    enabled = true;
    sim.refreshSpeedMapping();
    expect(sim.sample().frame).toBe(frame);
    expect(sim.sample().elapsed).toBeCloseTo(0.6);
    await output.send(modeBytes(4, 1));
    expect(sim.sample().elapsed).toBeCloseTo(0.6);
    await output.send(modeBytes(4, 255));
    expect(sim.sample().elapsed).toBe(0);
    expect(sim.state.nativeSpeed).toBe(255);
    expect(sim.state.timeFactor).toBeCloseTo(0.6 / 1.69);
    expect(send).not.toHaveBeenCalled();
  });
  it("keeps Custom transition times independent from native speed and the scaled preview window", async () => {
    vi.useFakeTimers();
    const writes: { bytes: number[]; at: number }[] = [],
      sim = new Simulator("#ff0000", undefined, undefined, (mode, speed) =>
        provisionalDurationFactor(mode, speed, true),
      ),
      ble = new BLEManager(() => undefined),
      output = new PlaybackOutput(ble, sim, "simulation");
    const start = performance.now(),
      scheduler = new Scheduler(
        async (bytes, valid) => {
          writes.push({ bytes: [...bytes], at: performance.now() - start });
          return output.send(bytes, valid);
        },
        undefined,
        (mode) => (mode === 4 ? 1 : 255),
      );
    const run = scheduler.start({
      id: "user",
      name: "Unchanged cuts",
      repeat: false,
      experimental: false,
      steps: [
        { type: "mode", mode: 4, ms: 1300 },
        { type: "mode", mode: 10, ms: 1800 },
      ],
    });
    await vi.advanceTimersByTimeAsync(1300);
    expect(sim.state.mode).toBe(10);
    expect(writes.map((w) => w.at)).toEqual([0, 1300]);
    expect(writes.map((w) => w.bytes[3])).toEqual([1, 255]);
    await vi.advanceTimersByTimeAsync(1800);
    await run;
    expect(performance.now() - start).toBe(3100);
  });
  it("reissues a continuous mode when its speed changes while suppressing identical subsequent requests", async () => {
    vi.useFakeTimers();
    let speed = 1;
    const writes: number[] = [],
      scheduler = new Scheduler(
        async (bytes) => {
          writes.push(bytes[3]);
          return true;
        },
        undefined,
        () => speed,
      );
    const run = scheduler.start(
      {
        id: "user",
        name: "Native loop",
        repeat: false,
        experimental: false,
        steps: [{ type: "mode", mode: 5, ms: 100, suppressRepeated: true }],
      },
      3,
    );
    await vi.advanceTimersByTimeAsync(50);
    speed = 255;
    await vi.advanceTimersByTimeAsync(250);
    await run;
    expect(writes).toEqual([1, 255]);
  });
  it("loads only valid speed preferences and does not change old profiles or malformed source on initialization", () => {
    const storage = new MemoryStorage(),
      profile = JSON.stringify({
        profiles: [
          { id: "user", steps: [{ type: "mode", mode: 4, ms: 1300 }] },
        ],
      });
    storage.setItem(keys.studio, profile);
    expect(nativeSpeedFor(loadNativeSpeedPreferences(storage), 4)).toBe(129);
    const raw = JSON.stringify({
      version: 1,
      speeds: { 4: 65, 10: 192, 3: 0, 5: 256 },
      previewTiming: { 4: true, 10: false, 3: true },
    });
    storage.setItem(keys.nativeSpeed, raw);
    const prefs = loadNativeSpeedPreferences(storage);
    expect(prefs.speeds).toEqual({ 4: 65, 10: 192 });
    expect(prefs.previewTiming).toEqual({ 4: true });
    expect(nativeSpeedFor(prefs, 3)).toBe(129);
    expect(storage.getItem(keys.nativeSpeed)).toBe(raw);
    expect(storage.getItem(keys.studio)).toBe(profile);
    storage.setItem(keys.nativeSpeed, "{bad");
    expect(loadNativeSpeedPreferences(storage)).toEqual({
      version: 1,
      speeds: {},
      previewTiming: {},
    });
    expect(storage.getItem(keys.nativeSpeed)).toBe("{bad");
  });
});
