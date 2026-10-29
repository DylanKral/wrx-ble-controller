import { afterEach, expect, it, vi } from "vitest";
import { initialProfiles, curatedButtons } from "../src/animations/customPresets";
import { Scheduler } from "../src/animations/scheduler";
import { durationFactor, resolveStepTiming } from "../src/animations/timing";
import { hex, modeBytes } from "../src/bluetooth/commands";
import { fixedProfiles, loadStudio, migrateStudio, saveStudio } from "../src/storage/migrations";
import { keys } from "../src/storage/persistence";
import { MemoryStorage } from "./helpers";

const id = "velocity-full-spectrum";
const preset = initialProfiles.find(p => p.id === id)!;
const modes = [4, 7, 8, 3, 5, 9];
const durations = [2200, 3200, 3200, 2250, 4100, 1000];
afterEach(() => vi.useRealTimers());

it("defines the exact repeating Mode-only show and scales cuts without changing references", () => {
  expect(preset).toEqual({ id, name: "Velocity — Full Spectrum", repeat: true,
    experimental: false, followAnimationSpeed: true, nativeLoop: false,
    steps: modes.map((mode, i) => ({ type: "mode", mode, ms: durations[i] })) });
  expect(durations.reduce((a, b) => a + b, 0)).toBe(15950);
  const original = structuredClone(preset);
  for (const speed of [129, 192]) {
    preset.steps.forEach((step, i) => {
      const timing = resolveStepTiming(step, preset, () => speed);
      expect(timing.speed).toBe(speed);
      expect(timing.effectiveMs).toBe(durations[i] * durationFactor(modes[i], speed));
      expect(timing.referenceMs).toBe(durations[i]);
    });
  }
  expect(preset).toEqual(original);
});

it("dispatches every transition at byte 129 and repeats until explicitly stopped", async () => {
  vi.useFakeTimers();
  const writes: { packet: string; at: number }[] = [];
  const scheduler = new Scheduler(async bytes => {
    writes.push({ packet: hex(bytes), at: performance.now() });
    return true;
  });
  const start = performance.now();
  const run = scheduler.start(preset);
  await vi.advanceTimersByTimeAsync(31900);
  const offsets = [0, 2200, 5400, 8600, 10850, 14950];
  expect(writes.map(w => w.packet)).toEqual([...modes, ...modes, 4].map(m => hex(modeBytes(m, 129))));
  expect(writes.map(w => Math.round(w.at - start))).toEqual([...offsets, ...offsets.map(t => t + 15950), 31900]);
  expect(scheduler.state?.cycles).toBe(2);
  scheduler.stop();
  await vi.advanceTimersByTimeAsync(20000);
  await run;
  expect(writes).toHaveLength(13);
});

it.each([6, 8, 9])("adds exactly one bundled button to version %s storage and preserves user data across reloads", version => {
  const storage = new MemoryStorage();
  const personal = { ...preset, id: "personal", name: "My show" };
  const button = { id: "my-button", label: "My button", profileId: "personal" };
  storage.setItem(keys.studio, JSON.stringify({ version, profiles: [personal], buttons: [button], selectedId: "personal" }));
  const source = storage.getItem(keys.studio);
  const { studio, warning } = loadStudio(storage);
  expect(warning).toBe("");
  expect(storage.getItem(keys.studio)).toBe(source);
  expect(studio.profiles[0]).toMatchObject({ id: "personal", steps: preset.steps, followAnimationSpeed: true });
  expect(studio.buttons).toContainEqual(button);
  expect(studio.selectedId).toBe("personal");
  expect(fixedProfiles(storage).find(p => p.id === id)).toEqual(preset);
  saveStudio(storage, studio);
  expect(loadStudio(storage).studio).toEqual(studio);
  expect(studio.buttons.filter(b => b.profileId === id)).toEqual(curatedButtons.filter(b => b.profileId === id));
});

it("preserves a saved assignment colliding with the new bundled button ID", () => {
  const studio = migrateStudio({ version: 9, profiles: [], buttons: [
    { id: "btn-" + id, label: "My overlap", profileId: "overlap-double" },
  ] });
  expect(studio.buttons).toContainEqual({ id: "saved-assignment-btn-" + id, label: "My overlap", profileId: "overlap-double" });
  expect(studio.buttons).toContainEqual(curatedButtons.find(b => b.profileId === id));
  expect(migrateStudio(studio)).toEqual(studio);
});
