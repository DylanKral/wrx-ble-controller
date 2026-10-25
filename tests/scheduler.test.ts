import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Scheduler } from "../src/animations/scheduler";
import { hex } from "../src/bluetooth/commands";
import {
  favoriteDuration,
  favoriteProfile,
  defaultFavorites,
} from "../src/storage/legacy";
import type { Profile } from "../src/animations/types";
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const makeProfile = (change: Partial<Profile> = {}): Profile => ({
  id: "test",
  name: "Test",
  repeat: false,
  experimental: false,
  steps: [{ type: "mode", mode: 4, ms: 2200 }],
  ...change,
});
function setup() {
  const writes: { hex: string; at: number }[] = [],
    send = vi.fn(async (b: Uint8Array) => {
      writes.push({ hex: hex(b), at: performance.now() });
      return true;
    });
  return { scheduler: new Scheduler(send), send, writes };
}
describe("animation scheduling", () => {
  it("sends a single mode, waits its full duration, then stops scheduling", async () => {
    const { scheduler, writes } = setup(),
      run = scheduler.start(makeProfile());
    await vi.advanceTimersByTimeAsync(2199);
    expect(writes.map((x) => x.hex)).toEqual(["9E0003819800E9"]);
    expect(scheduler.state).not.toBe(null);
    await vi.advanceTimersByTimeAsync(1);
    await run;
    expect(scheduler.state).toBe(null);
  });
  it("uses step-level early transitions, color commands, waits and fixed repeat counts", async () => {
    const { scheduler, writes } = setup();
    const start = performance.now(),
      run = scheduler.start(
        makeProfile({
          steps: [
            { type: "mode", mode: 4, ms: 700 },
            { type: "color", color: "#0000ff", ms: 100 },
            { type: "wait", ms: 50 },
            { type: "mode", mode: 7, ms: 1300 },
          ],
        }),
        2,
      );
    await vi.advanceTimersByTimeAsync(4300);
    await run;
    expect(writes.map((x) => x.hex)).toEqual([
      "9E0003819800E9",
      "560000FF00F0AA",
      "9E0006819800E9",
      "9E0003819800E9",
      "560000FF00F0AA",
      "9E0006819800E9",
    ]);
    expect(writes.slice(0, 3).map((x) => Math.round(x.at - start))).toEqual([
      0, 700, 850,
    ]);
  });
  it("sends internally looping Basic modes once", async () => {
    const { scheduler, send } = setup();
    await scheduler.start(makeProfile({ nativeLoop: true, repeat: true }));
    await vi.advanceTimersByTimeAsync(60000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(scheduler.state?.internal).toBe(true);
    scheduler.stop();
  });
  it("preserves repeated custom mode commands while suppressing redundant legacy continuous sends", async () => {
    const custom = setup(),
      run = custom.scheduler.start(makeProfile(), 2);
    await vi.advanceTimersByTimeAsync(4400);
    await run;
    expect(custom.send).toHaveBeenCalledTimes(2);
    const legacy = setup(),
      favorite = defaultFavorites.find((p) => p.kind === "continuous")!,
      legacyRun = legacy.scheduler.start(
        favoriteProfile([favorite], false, true),
        2,
      );
    await vi.advanceTimersByTimeAsync(favorite.fullMs * 2);
    await legacyRun;
    expect(legacy.send).toHaveBeenCalledTimes(1);
  });
  it("cancels before the next step and can restart immediately", async () => {
    const { scheduler, writes } = setup(),
      p = makeProfile({
        repeat: true,
        steps: [
          { type: "mode", mode: 4, ms: 100 },
          { type: "mode", mode: 7, ms: 100 },
        ],
      });
    const run = scheduler.start(p);
    await vi.advanceTimersByTimeAsync(50);
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(1000);
    await run;
    expect(writes).toHaveLength(1);
    const restart = scheduler.start(makeProfile());
    await vi.advanceTimersByTimeAsync(2200);
    await restart;
    expect(writes).toHaveLength(2);
  });
  it("does not issue stale writes after stop during a pending transmission", async () => {
    let finish!: (ok: boolean) => void;
    const send = vi.fn(() => new Promise<boolean>((r) => (finish = r))),
      scheduler = new Scheduler(send);
    const run = scheduler.start(makeProfile({ repeat: true }));
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();
    finish(true);
    await run;
    await vi.advanceTimersByTimeAsync(10000);
    expect(scheduler.state).toBe(null);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("keeps command starts independent of write completion and avoids cumulative write-latency drift", async () => {
    const writes: number[] = [],
      scheduler = new Scheduler(async () => {
        writes.push(performance.now());
        await new Promise((r) => setTimeout(r, 30));
        return true;
      });
    const start = performance.now(),
      run = scheduler.start(
        makeProfile({
          steps: [
            { type: "mode", mode: 4, ms: 100 },
            { type: "mode", mode: 7, ms: 100 },
          ],
        }),
        3,
      );
    await vi.advanceTimersByTimeAsync(600);
    await run;
    expect(writes.map((t) => Math.round(t - start))).toEqual([
      0, 100, 200, 300, 400, 500,
    ]);
  });
  it("rejects a zero-duration infinite loop and handles write failure", async () => {
    const { scheduler, send } = setup();
    await scheduler.start(
      makeProfile({ repeat: true, steps: [{ type: "wait", ms: 0 }] }),
    );
    expect(send).not.toHaveBeenCalled();
    expect(scheduler.message).toContain("nonzero");
    const failure = new Scheduler(async () => false);
    await failure.start(makeProfile());
    expect(failure.message).toContain("failed");
  });
  it("preserves full, cut, and same-mode favorite guards", () => {
    const p = {
      ...defaultFavorites[0],
      transition: "cut" as const,
      fullMs: 2200,
      cutMs: 1300,
    };
    expect(favoriteDuration(p, 7)).toBe(1300);
    expect(favoriteDuration(p, 4)).toBe(2300);
    expect(favoriteDuration(p, 7, true)).toBe(2300);
  });
});
