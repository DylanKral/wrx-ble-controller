import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, it } from "vitest";
import { initialProfiles } from "../src/animations/customPresets";
import { basicProfiles, CAL } from "../src/animations/factoryModes";
import { modeSpecs, timingSpecs, compareSpecs } from "../src/calibration/specs";
const html = readFileSync("tests/fixtures/original-v8.2.html", "utf8");
it("matches all 13 actual hard-coded profiles and all Basic mode values from the original source", () => {
  const code = html.slice(
    html.indexOf("const M=(mode"),
    html.indexOf("// These are immutable"),
  );
  const data = vm.runInNewContext(
    `(()=>{${code};return JSON.parse(JSON.stringify({initialProfiles,basicProfiles}))})()`,
  );
  expect(initialProfiles).toEqual(data.initialProfiles);
  expect(basicProfiles).toEqual(data.basicProfiles);
  expect(CAL).toEqual(
    vm.runInNewContext("(" + html.match(/const CAL=(.*);\r?\n/)![1] + ")"),
  );
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
