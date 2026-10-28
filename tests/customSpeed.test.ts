import { expect, it } from "vitest";
import { loadNativeSpeedPreferences, withNativeSpeeds, nativeSpeedFor } from "../src/storage/nativeSpeedPreferences";
import { initialProfiles } from "../src/animations/customPresets";

it("updates unique preset modes atomically without mutating unrelated independent settings", () => {
  const original = { ...loadNativeSpeedPreferences({ getItem: () => null, setItem: () => {} }), scope: "per-mode" as const, speeds: { 3: 25, 4: 73, 7: 129, 10: 201 } };
  const next = withNativeSpeeds(original, [10, 7, 10], 192);
  expect(next.speeds).toEqual({ 3: 25, 4: 73, 7: 192, 10: 192 });
  expect(original.speeds).toEqual({ 3: 25, 4: 73, 7: 129, 10: 201 });
  expect(withNativeSpeeds(next, [7, 10], 192)).toBe(next);
  expect(withNativeSpeeds(next, [7], 0)).toBe(next);
  expect(withNativeSpeeds(next, [], 129)).toBe(next);
  const global = withNativeSpeeds({ ...original, scope: "global" }, [7, 10], 255);
  expect(global.speeds).toEqual(original.speeds);
  expect(nativeSpeedFor(global, 3)).toBe(255);
});

it.each([
  ["breathe-to-overlap", [10, 7]], ["overlap-cut", [7, 8]],
  ["chase-rainbow", [4, 3]], ["black-blue-chase", [4]],
] as const)("selects the factory modes of %s without altering reference durations", (id, modes) => {
  const profile = initialProfiles.find(p => p.id === id)!;
  expect([...new Set(profile.steps.flatMap(s => s.type === "mode" ? [s.mode] : []))]).toEqual(modes);
});
