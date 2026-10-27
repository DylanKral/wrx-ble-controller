import { afterEach, describe, expect, it, vi } from "vitest";
import {
  durationFactor,
  estimatedAnchors,
  resolveStepTiming,
} from "../src/animations/timing";
import { basicProfiles, CAL } from "../src/animations/factoryModes";
import { initialProfiles } from "../src/animations/customPresets";
import { Scheduler } from "../src/animations/scheduler";
import type { Profile } from "../src/animations/types";
import type { DispatchOptions } from "../src/animations/dispatch";
import { Simulator } from "../src/simulation/Simulator";
import { PlaybackOutput } from "../src/simulation/PlaybackOutput";
import { BLEManager } from "../src/bluetooth/BLEManager";
import { colorBytes, modeBytes } from "../src/bluetooth/commands";
import { calibrationByMode } from "../src/simulation/calibrations";
import { cleanProfile, migrateStudio } from "../src/storage/migrations";
import {
  loadNativeSpeedPreferences,
  nativeSpeedFor,
} from "../src/storage/nativeSpeedPreferences";
import { keys } from "../src/storage/persistence";
import { MemoryStorage } from "./helpers";
import {
  cleanFavorite,
  defaultFavorites,
  validFavoriteDuration,
} from "../src/storage/legacy";

afterEach(() => vi.useRealTimers());
const profile = (followAnimationSpeed?: boolean): Profile => ({
  id: "personal",
  name: "Personal cuts",
  repeat: false,
  experimental: false,
  ...(followAnimationSpeed === undefined ? {} : { followAnimationSpeed }),
  steps: [
    { type: "mode", mode: 4, ms: 1300 },
    { type: "mode", mode: 10, ms: 1300 },
  ],
});
const flush = () => vi.advanceTimersByTimeAsync(0);
describe("shared timing and non-destructive preferences", () => {
  it("accepts the measured Breathe favorite reference and preserves older manual Mode 10 durations", () => {
    expect(validFavoriteDuration(3540, 10)).toBe(true);
    expect(validFavoriteDuration(3540, 4)).toBe(false);
    expect(validFavoriteDuration(3500, 10)).toBe(true);
    const old = {
      name: "My Breathe",
      mode: 10,
      kind: "unknown" as const,
      fullMs: 3000,
      cutMs: 1250,
      transition: "finish" as const,
    };
    expect(cleanFavorite(old, defaultFavorites[0], true)).toEqual(old);
    const measured = { ...old, kind: "continuous" as const, fullMs: 3540 };
    expect(cleanFavorite(measured, defaultFavorites[0])).toEqual(measured);
  });
  it("keeps reference exact and all curves positive, bounded and monotonic at every byte", () => {
    for (const mode of [3, 4, 5, 6, 7, 8, 9, 10, 255]) {
      expect(durationFactor(mode, 129)).toBe(1);
      expect(durationFactor(mode, 1)).toBeGreaterThan(1);
      expect(durationFactor(mode, 255)).toBeLessThan(1);
      for (const correction of [0.25, 1, 4]) {
        expect(durationFactor(mode, 129, { [mode]: correction })).toBe(1);
        let previous = Infinity;
        for (let speed = 1; speed <= 255; speed++) {
          const factor = durationFactor(mode, speed, { [mode]: correction });
          expect(Number.isFinite(factor)).toBe(true);
          expect(factor).toBeGreaterThanOrEqual(0.05);
          expect(factor).toBeLessThanOrEqual(10);
          expect(factor).toBeLessThanOrEqual(previous);
          previous = factor;
        }
      }
    }
    expect(durationFactor(3, 1)).toBeCloseTo(estimatedAnchors.slow, 12);
    expect(durationFactor(3, 255)).toBeCloseTo(estimatedAnchors.fast, 12);
    for (const value of [0, 256, 1.1, NaN, Infinity])
      expect(() => durationFactor(4, value)).toThrow();
    for (const value of [0, 5, NaN])
      expect(() => durationFactor(7, 65, { 7: value })).toThrow();
  });
  it("scales bundled cuts by their own modes without changing any reference definitions", () => {
    const original = JSON.stringify(initialProfiles),
      cut = initialProfiles.find((p) => p.id === "overlap-cut")!;
    const getSpeed = (mode: number) => (mode === 7 ? 1 : 255);
    expect(
      resolveStepTiming(cut.steps[0], cut, getSpeed).effectiveMs,
    ).toBeCloseTo(1300 * durationFactor(7, 1));
    expect(
      resolveStepTiming(cut.steps[1], cut, getSpeed).effectiveMs,
    ).toBeCloseTo(1300 * durationFactor(8, 255));
    for (const p of initialProfiles)
      for (const step of p.steps) {
        expect(resolveStepTiming(step, p).effectiveMs).toBe(step.ms);
        expect(
          resolveStepTiming(step, p, getSpeed, durationFactor, false)
            .effectiveMs,
        ).toBe(step.ms);
      }
    expect(JSON.stringify(initialProfiles)).toBe(original);
  });
  it("keeps personal cuts, RGB and Wait fixed unless explicitly opted in", () => {
    const p = profile(),
      slow = () => 1;
    expect(resolveStepTiming(p.steps[0], p, slow).effectiveMs).toBe(1300);
    expect(
      resolveStepTiming(p.steps[0], profile(false), slow).effectiveMs,
    ).toBe(1300);
    expect(
      resolveStepTiming(p.steps[0], profile(true), slow).effectiveMs,
    ).toBeCloseTo((1300 * 3.79) / 1.69);
    for (const type of ["color", "wait"] as const) {
      const step =
        type === "color"
          ? { type, color: "#0000ff", ms: 100 }
          : { type, ms: 100 };
      expect(resolveStepTiming(step, profile(true), slow).effectiveMs).toBe(
        100,
      );
      expect(
        resolveStepTiming({ ...step, timingMode: 10 }, profile(true), slow)
          .effectiveMs,
      ).toBeCloseTo((100 * 6.3) / 3.54);
      expect(
        resolveStepTiming({ ...step, timingMode: 10 }, profile(false), slow)
          .effectiveMs,
      ).toBe(100);
    }
    expect(() =>
      resolveStepTiming(p.steps[0], profile(true), slow, () => NaN),
    ).toThrow();
  });
  it("preserves saved profiles, explicit timing opt-ins, independent speeds and backups", () => {
    const old = profile(),
      before = JSON.stringify(old);
    const normalized = migrateStudio({ version: 9, profiles: [old] });
    expect(normalized.profiles[0]).toEqual(old);
    expect(JSON.stringify(old)).toBe(before);
    expect(
      resolveStepTiming(
        normalized.profiles[0].steps[0],
        normalized.profiles[0],
        () => 1,
      ).effectiveMs,
    ).toBe(1300);
    const optedIn = {
      ...profile(true),
      steps: [{ type: "wait", ms: 500, timingMode: 10 }],
    };
    expect(cleanProfile(optedIn)).toEqual(optedIn);
    const storage = new MemoryStorage();
    const raw = JSON.stringify({
      version: 1,
      speeds: { 4: 65, 10: 192 },
      previewTiming: { 4: true },
    });
    storage.setItem(keys.nativeSpeed, raw);
    const prefs = loadNativeSpeedPreferences(storage);
    expect(prefs.scope).toBe("per-mode");
    expect(nativeSpeedFor(prefs, 4)).toBe(65);
    expect(nativeSpeedFor(prefs, 10)).toBe(192);
    expect(nativeSpeedFor(prefs, 7)).toBe(129);
    const linked = { ...prefs, scope: "global" as const, globalSpeed: 200 };
    expect(nativeSpeedFor(linked, 4)).toBe(200);
    expect(nativeSpeedFor(linked, 10)).toBe(200);
    expect(nativeSpeedFor({ ...linked, scope: "per-mode" }, 4)).toBe(65);
    expect(storage.getItem(keys.nativeSpeed)).toBe(raw);
    storage.setItem(
      keys.nativeSpeed,
      JSON.stringify({
        ...linked,
        corrections: { 7: 1.5 },
        bundledFollow: false,
      }),
    );
    expect(loadNativeSpeedPreferences(storage)).toMatchObject({
      scope: "global",
      globalSpeed: 200,
      speeds: { 4: 65, 10: 192 },
      corrections: { 7: 1.5 },
      bundledFollow: false,
    });
  });
});

describe("effective monotonic playback", () => {
  it.each([1, 129, 255])(
    "repeats Basic Chase at 2200ms × factor for byte %s, restarting preview intentionally",
    async (speed) => {
      vi.useFakeTimers();
      const sim = new Simulator(),
        output = new PlaybackOutput(
          new BLEManager(() => undefined),
          sim,
          "simulation",
        );
      const writes: number[] = [],
        start = performance.now();
      const scheduler = new Scheduler(
        (b, valid, options) => {
          writes.push(performance.now() - start);
          return output.send(b, valid, options);
        },
        undefined,
        () => speed,
      );
      const duration = 2200 * durationFactor(4, speed),
        run = scheduler.start(
          basicProfiles.find((p) => p.id === "basic-4")!,
          2,
        );
      await vi.advanceTimersByTimeAsync(Math.floor(duration) - 1);
      expect(writes).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(2);
      expect(writes).toHaveLength(2);
      expect(Math.abs(writes[1] - duration)).toBeLessThan(1.1);
      expect(sim.sample().elapsed).toBeLessThan(0.02);
      await vi.advanceTimersByTimeAsync(Math.ceil(duration) + 2);
      await run;
    },
  );
  it("uses a different factor for each cut and leaves RGB/Wait gaps exact", async () => {
    vi.useFakeTimers();
    const start = performance.now(),
      writes: { mode: number; speed: number; at: number }[] = [];
    const scheduler = new Scheduler(
      async (b) => {
        writes.push({
          mode: b[0] === 0x9e ? b[2] + 1 : 0,
          speed: b[3],
          at: performance.now() - start,
        });
        return true;
      },
      undefined,
      (mode) => (mode === 4 ? 1 : 255),
    );
    const p = profile(true);
    p.steps.splice(
      1,
      0,
      { type: "color", color: "#0000ff", ms: 100 },
      { type: "wait", ms: 50 },
    );
    const run = scheduler.start(p),
      firstCut = 1300 * durationFactor(4, 1);
    await vi.advanceTimersByTimeAsync(Math.ceil(firstCut) + 150);
    expect(writes.map((w) => w.mode)).toEqual([4, 0, 10]);
    expect(writes[2].speed).toBe(255);
    expect(Math.abs(writes[1].at - firstCut)).toBeLessThan(1.1);
    expect(writes[2].at - writes[1].at).toBe(150);
    await vi.advanceTimersByTimeAsync(
      Math.ceil(1300 * durationFactor(10, 255)) + 2,
    );
    await run;
  });
  it("keeps future preference edits from retiming the active cut, then applies them on the next step", async () => {
    vi.useFakeTimers();
    let speed = 129;
    const writes: { speed: number; at: number }[] = [],
      start = performance.now();
    const scheduler = new Scheduler(
      async (b) => {
        writes.push({ speed: b[3], at: performance.now() - start });
        return true;
      },
      undefined,
      () => speed,
    );
    const run = scheduler.start(profile(true));
    await vi.advanceTimersByTimeAsync(500);
    speed = 255;
    await vi.advanceTimersByTimeAsync(800);
    expect(writes).toEqual([
      { speed: 129, at: 0 },
      { speed: 255, at: 1300 },
    ]);
    await vi.advanceTimersByTimeAsync(250);
    await run;
  });
  it("reissues active speed through the same runner and rebases the deadline from dispatch", async () => {
    vi.useFakeTimers();
    let speed = 129;
    const writes: { speed: number; at: number }[] = [],
      start = performance.now(),
      sim = new Simulator();
    const output = new PlaybackOutput(
      new BLEManager(() => undefined),
      sim,
      "simulation",
    );
    const scheduler = new Scheduler(
      (b, valid, options) => {
        writes.push({ speed: b[3], at: performance.now() - start });
        return output.send(b, valid, options);
      },
      undefined,
      () => speed,
    );
    const run = scheduler.start(profile(true));
    await vi.advanceTimersByTimeAsync(600);
    speed = 255;
    expect(scheduler.restartCurrentMode()).toBe(true);
    await flush();
    expect(writes.map((w) => w.speed)).toEqual([129, 255]);
    expect(sim.sample().elapsed).toBe(0);
    const cut = 1300 * durationFactor(4, 255);
    await vi.advanceTimersByTimeAsync(Math.floor(cut) - 1);
    expect(writes).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(3);
    expect(writes).toHaveLength(3);
    expect(Math.abs(writes[2].at - (600 + cut))).toBeLessThan(1.1);
    scheduler.stop();
    await run;
    await vi.advanceTimersByTimeAsync(5000);
    expect(writes).toHaveLength(3);
  });
  it("invalidates multiple stale queued generations and Stop cancels their continuations", async () => {
    vi.useFakeTimers();
    let speed = 129;
    const queued: {
      valid: () => boolean;
      finish: (ok: boolean) => void;
      options?: DispatchOptions;
      speed: number;
    }[] = [];
    const scheduler = new Scheduler(
      (b, valid, options) =>
        new Promise<boolean>((finish) =>
          queued.push({ speed: b[3], valid, finish, options }),
        ),
      undefined,
      () => speed,
    );
    const run = scheduler.start(profile(true));
    await flush();
    speed = 1;
    scheduler.restartCurrentMode();
    await flush();
    speed = 255;
    scheduler.restartCurrentMode();
    await flush();
    expect(queued.map((q) => q.valid())).toEqual([false, false, true]);
    expect(queued.map((q) => q.speed)).toEqual([129, 1, 255]);
    queued[0].finish(false);
    queued[1].finish(false);
    queued[2].options?.onDispatch?.(performance.now());
    queued[2].finish(true);
    await flush();
    expect(scheduler.state?.timing?.speed).toBe(255);
    scheduler.stop();
    await run;
    expect(queued[2].valid()).toBe(false);
    await vi.advanceTimersByTimeAsync(10000);
    expect(queued).toHaveLength(3);
  });
  it("runs Breathe natively once while holding the final approved partial-capture frame", async () => {
    vi.useFakeTimers();
    const sim = new Simulator("#00ff00"),
      ble = new BLEManager(() => undefined),
      output = new PlaybackOutput(ble, sim, "simulation");
    const sending = vi.spyOn(output, "send");
    const scheduler = new Scheduler((b, valid, options) =>
      output.send(b, valid, options),
    );
    await scheduler.start(basicProfiles.find((p) => p.id === "basic-10")!);
    await vi.advanceTimersByTimeAsync(20000);
    expect(CAL[10].kind).toBe("continuous");
    expect(sending).toHaveBeenCalledTimes(1);
    expect(sim.sample().record?.frames).toHaveLength(75);
    expect(sim.sample().duration).toBe(2.5);
    expect(sim.sample().running).toBe(false);
    expect(sim.sample().frame).toBe(calibrationByMode.get(10)!.frames.at(-1));
    sim.setRepeat(true);
    expect(sim.state.repeat).toBe(false);
    expect(sim.state.selectedColor).toBe("#00ff00");
    scheduler.restartCurrentMode();
    await flush();
    expect(sending).toHaveBeenCalledTimes(2);
    expect(sim.sample().elapsed).toBe(0);
    scheduler.stop();
  });
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
describe("dispatch anchoring and independent delivery", () => {
  it("anchors simulator and transition at actual dispatch after a blocked BLE queue", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const writes: { mode: number; at: number }[] = [],
      start = performance.now();
    const ble = new BLEManager(() => undefined),
      sim = new Simulator();
    const left = device("Dream-CF4B", async (bytes) => {
      writes.push({
        mode: bytes[0] === 0x9e ? bytes[2] + 1 : 0,
        at: performance.now() - start,
      });
      if (bytes[0] === 0x56)
        await new Promise<void>((r) => {
          release = r;
        });
    });
    await ble.linkDevice("left", left);
    const blocked = ble.writeSide("left", colorBytes("#000000"));
    const output = new PlaybackOutput(ble, sim, "combined"),
      scheduler = new Scheduler((b, valid, options) =>
        output.send(b, valid, options),
      );
    const p = profile(false);
    p.steps[0].ms = 100;
    const run = scheduler.start(p);
    await vi.advanceTimersByTimeAsync(200);
    expect(sim.state.mode).toBeNull();
    release();
    await flush();
    await blocked;
    expect(sim.state.startedAt - start).toBe(200);
    expect(scheduler.state?.dispatchedAt! - start).toBe(200);
    await vi.advanceTimersByTimeAsync(99);
    expect(writes.map((w) => w.mode)).toEqual([0, 4]);
    await vi.advanceTimersByTimeAsync(1);
    expect(writes.map((w) => w.at)).toEqual([0, 200, 300]);
    scheduler.stop();
    await run;
  });
  it("snapshots the curve with the byte so future correction edits cannot change a queued preview clock", async () => {
    vi.useFakeTimers();
    let correction = 1,
      release!: () => void;
    const ble = new BLEManager(() => undefined);
    await ble.linkDevice(
      "left",
      device("Dream-CF4B", async (bytes) => {
        if (bytes[0] === 0x56)
          await new Promise<void>((r) => {
            release = r;
          });
      }),
    );
    const block = ble.writeSide("left", colorBytes("#000000"));
    const getFactor = (mode: number, speed: number) =>
      durationFactor(mode, speed, { [mode]: correction });
    const sim = new Simulator("#ff0000", undefined, undefined, getFactor);
    const output = new PlaybackOutput(ble, sim, "combined");
    const scheduler = new Scheduler(
      (b, valid, options) => output.send(b, valid, options),
      undefined,
      () => 1,
      (step, p) => resolveStepTiming(step, p, () => 1, getFactor),
    );
    const run = scheduler.start(profile(true));
    await flush();
    correction = 2;
    release();
    await block;
    await flush();
    expect(sim.state.timeFactor).toBe(durationFactor(4, 1));
    expect(scheduler.state?.timing?.factor).toBe(sim.state.timeFactor);
    scheduler.stop();
    await run;
  });
  it("continues Combined simulation while separately reporting left success, right failure, and disconnection", async () => {
    const ble = new BLEManager(() => undefined),
      leftWrite = vi.fn(async (_b: Uint8Array<ArrayBuffer>) => {}),
      rightWrite = vi.fn(async (_b: Uint8Array<ArrayBuffer>) => {
        throw new Error("Right radio failed");
      });
    await ble.linkDevice("left", device("Dream-CF4B", leftWrite));
    await ble.linkDevice("right", device("Dream-A90F", rightWrite));
    const sim = new Simulator(),
      output = new PlaybackOutput(ble, sim, "combined");
    expect(await output.send(modeBytes(7, 192))).toBe(true);
    expect(sim.state.mode).toBe(7);
    expect(sim.state.nativeSpeed).toBe(192);
    expect(output.state).toMatchObject({
      simulator: "updated",
      left: { status: "sent" },
      right: {
        status: "error",
        error: expect.stringContaining("Right radio failed"),
      },
    });
    for (const write of [leftWrite, rightWrite])
      expect([...write.mock.calls[0][0]]).toEqual([...modeBytes(7, 192)]);
    await output.writeSide("left", modeBytes(4, 65));
    await expect(output.writeSide("right", modeBytes(4, 65))).rejects.toThrow(
      "Right radio failed",
    );
    expect(output.state.left.status).toBe("sent");
    expect(output.state.right.status).toBe("error");
    ble.disconnect("right");
    output.syncConnections();
    expect(output.state.right.status).toBe("disconnected");
    ble.disconnect("left");
    await output.send(modeBytes(8, 65));
    expect(sim.state.mode).toBe(8);
    expect(output.statusText()).toContain("Left: disconnected");
    expect(output.statusText()).toContain("Right: disconnected");
    output.setMode("simulation");
    await output.send(modeBytes(4, 255));
    expect(leftWrite).toHaveBeenCalledTimes(2);
    expect(rightWrite).toHaveBeenCalledTimes(2);
    expect(output.state.left.status).toBe("disabled");
  });
  it("drops a blocked old speed command, dispatches only the new speed, then preserves Stop + Red", async () => {
    vi.useFakeTimers();
    let release!: () => void,
      speed = 129;
    const packets: number[][] = [],
      ble = new BLEManager(() => undefined),
      sim = new Simulator();
    await ble.linkDevice(
      "left",
      device("Dream-CF4B", async (bytes) => {
        packets.push([...bytes]);
        if (bytes[0] === 0x56 && bytes[1] === 0)
          await new Promise<void>((r) => {
            release = r;
          });
      }),
    );
    const block = ble.writeSide("left", colorBytes("#000000"));
    const output = new PlaybackOutput(ble, sim, "combined"),
      scheduler = new Scheduler(
        (b, valid, options) => output.send(b, valid, options),
        undefined,
        () => speed,
      );
    const run = scheduler.start(profile(true));
    await flush();
    speed = 255;
    scheduler.restartCurrentMode();
    await flush();
    release();
    await block;
    await flush();
    expect(packets.filter((b) => b[0] === 0x9e).map((b) => b[3])).toEqual([
      255,
    ]);
    scheduler.stop();
    output.cancelPending();
    await output.send(colorBytes("#ff0000"));
    await run;
    await vi.advanceTimersByTimeAsync(10000);
    expect(packets.at(-1)).toEqual([...colorBytes("#ff0000")]);
    expect(packets.filter((b) => b[0] === 0x9e)).toHaveLength(1);
    expect(sim.state.mode).toBeNull();
    expect(sim.state.selectedColor).toBe("#ff0000");
  });
});
