import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BASIC_REPEAT_DEFAULTS,
  withBasicRepeatReference,
  type BasicRepeatReferences,
} from "../src/animations/basicRepeatTiming";
import { basicProfiles, CAL } from "../src/animations/factoryModes";
import { initialProfiles } from "../src/animations/customPresets";
import { resolveStepTiming } from "../src/animations/timing";
import { Scheduler } from "../src/animations/scheduler";
import { durationFactor } from "../src/animations/timing";
import { BLEManager } from "../src/bluetooth/BLEManager";
import { Simulator } from "../src/simulation/Simulator";
import { PlaybackOutput } from "../src/simulation/PlaybackOutput";
import {
  calibrationByMode,
  getFrameAtTime,
} from "../src/simulation/calibrations";
import { loadBasicRepeatPreferences } from "../src/storage/basicRepeatPreferences";
import { cleanProfile } from "../src/storage/migrations";
import {
  exportConfiguration,
  importConfiguration,
  keys,
} from "../src/storage/persistence";
import { MemoryStorage } from "./helpers";

afterEach(() => vi.useRealTimers());
it("keeps unsupported default changes separate from native captures, and applies overrides only to Basic 7/8", () => {
  const references = { 7: 3000, 8: 3150 };
  expect(BASIC_REPEAT_DEFAULTS).toEqual({ 7: 3500, 8: 3500 });
  for (const profile of basicProfiles) {
    const step = profile.steps[0],
      resolved = withBasicRepeatReference(step, profile, references);
    if (profile.basicRepeatMode !== undefined) {
      expect(resolved.ms).toBe(references[profile.basicRepeatMode]);
      expect(step.ms).toBe(3500);
      expect(withBasicRepeatReference(step, profile, {}).ms).toBe(3500);
      const calibration = calibrationByMode.get(profile.basicRepeatMode)!;
      expect(calibration.cycleSeconds).toBe(3.5);
      expect(calibration.frames).toHaveLength(105);
      expect(CAL[profile.basicRepeatMode].ms).toBe(3500);
    } else expect(resolved).toBe(step);
  }
  for (const profile of initialProfiles)
    for (const step of profile.steps)
      expect(withBasicRepeatReference(step, profile, references)).toBe(step);
  expect(initialProfiles.find((p) => p.id === "overlap-cut")!.steps).toEqual([
    { type: "mode", mode: 7, ms: 1300 },
    { type: "mode", mode: 8, ms: 1300 },
  ]);
  // Imported/personal profiles cannot acquire the internal Basic timing policy.
  const personal = cleanProfile({
    ...basicProfiles.find((p) => p.id === "basic-7")!,
    id: "personal",
  })!;
  expect(personal.basicRepeatMode).toBeUndefined();
  expect(
    withBasicRepeatReference(personal.steps[0], personal, references),
  ).toBe(personal.steps[0]);
});

it("loads only valid Basic repeat settings without overwriting old data, and includes them in complete backups", () => {
  const storage = new MemoryStorage();
  expect(loadBasicRepeatPreferences(storage)).toEqual({
    version: 1,
    referenceMs: {},
  });
  const native = JSON.stringify({
    version: 2,
    scope: "per-mode",
    speeds: { 7: 65 },
    corrections: { 8: 1.5 },
  });
  storage.setItem(keys.nativeSpeed, native);
  const raw = JSON.stringify({
    version: 1,
    referenceMs: { 7: 3000, 8: 3150, 4: 1000 },
  });
  storage.setItem(keys.basicRepeat, raw);
  expect(loadBasicRepeatPreferences(storage)).toEqual({
    version: 1,
    referenceMs: { 7: 3000, 8: 3150 },
  });
  expect(storage.getItem(keys.basicRepeat)).toBe(raw);
  expect(storage.getItem(keys.nativeSpeed)).toBe(native);
  const restored = new MemoryStorage();
  importConfiguration(restored, exportConfiguration(storage));
  expect(restored.getItem(keys.basicRepeat)).toBe(raw);
  expect(restored.getItem(keys.nativeSpeed)).toBe(native);
  for (const invalid of [0, 499, 10050, 1234, NaN, "3000"]) {
    storage.setItem(
      keys.basicRepeat,
      JSON.stringify({ version: 1, referenceMs: { 7: invalid } }),
    );
    expect(loadBasicRepeatPreferences(storage).referenceMs).toEqual({});
  }
  storage.setItem(keys.basicRepeat, "{bad");
  expect(loadBasicRepeatPreferences(storage).referenceMs).toEqual({});
  expect(storage.getItem(keys.basicRepeat)).toBe("{bad");
});

function device(
  name: string,
  write: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>,
) {
  const events = new EventTarget();
  const gatt = {
    connected: false,
    connect: async () => {
      gatt.connected = true;
      return {
        getPrimaryService: async () => ({
          getCharacteristic: async () => ({
            properties: { writeWithoutResponse: true },
            writeValueWithoutResponse: write,
          }),
        }),
      };
    },
    disconnect: () => {
      gatt.connected = false;
      events.dispatchEvent(new Event("gattserverdisconnected"));
    },
  };
  return Object.assign(events, {
    name,
    id: name,
    gatt,
  }) as unknown as BluetoothDevice;
}
describe.each([7, 8] as const)(
  "Basic Mode %s configurable retrigger",
  (mode) => {
    it.each([1, 129, 255])(
      "shares reference × factor between both controller dispatches and simulator at byte %s",
      async (speed) => {
        vi.useFakeTimers();
        const referenceMs = mode === 7 ? 3000 : 3150;
        const references = { [mode]: referenceMs },
          writes = {
            left: [] as { at: number; bytes: number[] }[],
            right: [] as { at: number; bytes: number[] }[],
          };
        const ble = new BLEManager(() => undefined);
        for (const side of ["left", "right"] as const)
          await ble.linkDevice(
            side,
            device(
              side === "left" ? "Dream-CF4B" : "Dream-A90F",
              async (bytes) => {
                writes[side].push({ at: performance.now(), bytes: [...bytes] });
              },
            ),
          );
        const sim = new Simulator(),
          output = new PlaybackOutput(ble, sim, "combined");
        const scheduler = new Scheduler(
          (b, valid, options) => output.send(b, valid, options),
          undefined,
          () => speed,
          (step, profile) =>
            resolveStepTiming(
              withBasicRepeatReference(step, profile, references),
              profile,
              () => speed,
            ),
        );
        const profile = basicProfiles.find((p) => p.basicRepeatMode === mode)!;
        const run = scheduler.start(profile, 2);
        await vi.advanceTimersByTimeAsync(0);
        expect(scheduler.state?.timing?.referenceMs).toBe(referenceMs);
        expect(sim.state.startedAt).toBe(writes.left[0].at);
        const interval = referenceMs * durationFactor(mode, speed);
        expect(scheduler.state?.timing?.effectiveMs).toBe(interval);
        expect(sim.state.timeFactor).toBe(durationFactor(mode, speed));
        expect(durationFactor(mode, 129)).toBe(1);
        await vi.advanceTimersByTimeAsync(Math.floor(interval) - 1);
        expect(writes.left).toHaveLength(1);
        expect(writes.right).toHaveLength(1);
        const before = sim.sample();
        expect(before.frame).toBe(
          getFrameAtTime(calibrationByMode.get(mode)!, before.elapsed),
        );
        expect(before.elapsed).toBeGreaterThan(referenceMs / 1000 - 0.03);
        await vi.advanceTimersByTimeAsync(3);
        expect(sim.sample().elapsed).toBeLessThan(0.03);
        for (const side of ["left", "right"] as const) {
          expect(writes[side]).toHaveLength(2);
          expect(writes[side][0].bytes).toEqual([
            0x9e,
            0,
            mode - 1,
            speed,
            0x98,
            0,
            0xe9,
          ]);
          expect(writes[side][1].bytes).toEqual(writes[side][0].bytes);
          expect(
            Math.abs(writes[side][1].at - writes[side][0].at - interval),
          ).toBeLessThan(1.1);
        }
        expect(sim.state.startedAt).toBe(writes.left[1].at);
        await vi.advanceTimersByTimeAsync(Math.ceil(interval) + 2);
        await run;
        expect(scheduler.state).toBeNull();
      },
    );
  },
);

it("rebases a running Basic step on intentional reissue using its new reference without stale deadlines", async () => {
  vi.useFakeTimers();
  let references: BasicRepeatReferences = {};
  const writes: number[] = [],
    start = performance.now();
  const scheduler = new Scheduler(
    async () => {
      writes.push(performance.now() - start);
      return true;
    },
    undefined,
    () => 129,
    (step, profile) =>
      resolveStepTiming(
        withBasicRepeatReference(step, profile, references),
        profile,
      ),
  );
  const run = scheduler.start(
    basicProfiles.find((p) => p.basicRepeatMode === 7)!,
  );
  await vi.advanceTimersByTimeAsync(600);
  references = { 7: 3000 };
  scheduler.restartCurrentMode();
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(2999);
  expect(writes).toEqual([0, 600]);
  await vi.advanceTimersByTimeAsync(1);
  expect(writes).toEqual([0, 600, 3600]);
  scheduler.stop();
  await run;
  await vi.advanceTimersByTimeAsync(10000);
  expect(writes).toHaveLength(3);
});
