import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, it } from "vitest";
import { initialProfiles } from "../src/animations/customPresets";
import { basicProfiles, CAL } from "../src/animations/factoryModes";
import { modeSpecs, timingSpecs, compareSpecs } from "../src/calibration/specs";
import { legacyFixedProfiles } from "../src/storage/legacyFixedProfiles";
import type { Profile } from "../src/animations/types";
const html = readFileSync("tests/fixtures/original-v8.2.html", "utf8");
it("preserves original definitions except the requested Custom removals and overlap correction", () => {
  const code = html.slice(
    html.indexOf("const M=(mode"),
    html.indexOf("// These are immutable"),
  );
  const data = vm.runInNewContext(
    `(()=>{${code};return JSON.parse(JSON.stringify({initialProfiles,basicProfiles}))})()`,
  );
  const removed = new Set(["blue-overlap", "basic-chase", "flash"]);
  const expected: Profile[] = data.initialProfiles
    .filter((p: Profile) => !removed.has(p.id))
    .map((p: Profile) =>
      p.id === "overlap-cut"
        ? {
            ...p,
            steps: [
              { type: "mode", mode: 7, ms: 1300 },
              { type: "mode", mode: 8, ms: 1300 },
            ],
          }
        : p,
    );
  expect(initialProfiles.filter((p) => p.id !== "velocity-full-spectrum")).toEqual(expected);
  // Legacy recognition must continue comparing old saved slots to old defaults.
  for (const p of data.initialProfiles)
    expect(legacyFixedProfiles.get(p.id)).toEqual(p);
  expect(basicProfiles).toEqual(
    data.basicProfiles.map((p: Profile) => ({
      ...p,
      followAnimationSpeed: true,
      ...(p.id === "basic-7"
        ? { basicRepeatMode: 7 }
        : p.id === "basic-8"
          ? { basicRepeatMode: 8 }
          : {}),
      ...(p.id === "basic-10"
        ? {
            name: "Mode 10 · Breathe",
            nativeLoop: true,
            steps: [{ type: "mode", mode: 10, ms: 3540 }],
          }
        : {}),
    })),
  );
  const originalCal = vm.runInNewContext(
    "(" + html.match(/const CAL=(.*);\r?\n/)![1] + ")",
  );
  expect(CAL).toEqual({
    ...originalCal,
    10: {
      ms: 3540,
      kind: "continuous",
      note: "~3.54s breathing cycle in recordings; preview is only a 2.50s capture",
    },
  });
});
it("matches every calibration test command, offset and observation from the original source", () => {
  const code = html.slice(
    html.indexOf("const modeSpecs="),
    html.indexOf("function makeButton("),
  );
  const original = vm.runInNewContext(
    `(()=>{${code};return {modeSpecs,tests,compare}})()`,
  );
  const normalize = (specs: typeof modeSpecs) =>
    specs.map(({ commands, ...s }) => ({ ...s, commands: commands() }));
  expect(normalize(modeSpecs)).toEqual(normalize(original.modeSpecs));
  expect(normalize(timingSpecs)).toEqual(normalize(original.tests));
  expect(normalize(compareSpecs)).toEqual(normalize(original.compare));
});
