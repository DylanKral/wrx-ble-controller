// One-time, reproducible extraction from the reviewed, byte-for-byte source fixture.
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const html = fs.readFileSync("tests/fixtures/original-v8.2.html", "utf8");
for (const dir of [
  "src/animations",
  "src/bluetooth",
  "src/storage",
  "src/styles",
  "src/context",
  "src/components",
  "src/pages",
  "src/calibration",
])
  fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  "src/styles/app.css",
  html.match(/<style>([\s\S]*?)<\/style>/)[1],
);
const definitions = html.slice(
  html.indexOf("const M=(mode"),
  html.indexOf("// These are immutable"),
);
const data = vm.runInNewContext(
  `(()=>{${definitions};return {initialProfiles,BASIC_MODES,basicProfiles}})()`,
);
fs.writeFileSync(
  "src/animations/customPresets.ts",
  `import type { Profile } from './types';\n// Verbatim values from initialProfiles at baseline 351e770. Never replace these from storage.\nexport const initialProfiles: readonly Profile[] = ${JSON.stringify(data.initialProfiles, null, 2)};\nexport const curatedIds = new Set(initialProfiles.map(p=>p.id));\nexport const curatedButtons = initialProfiles.map(p=>({id:'btn-'+p.id,label:p.name,profileId:p.id}));\n`,
);
const cal = vm.runInNewContext(
  "(" + html.match(/const CAL=(.*);\r?\n/)[1] + ")",
);
const starter = vm.runInNewContext(
  "(" + html.match(/const starter=(.*);\r?\n/)[1] + ")",
);
fs.writeFileSync(
  "src/animations/factoryModes.ts",
  `import type { Calibration, Profile } from './types';\nexport const CAL: Record<number, Calibration> = ${JSON.stringify(cal, null, 2)};\nexport const starter = ${JSON.stringify(starter, null, 2)};\nexport const basicProfiles: readonly Profile[] = ${JSON.stringify(data.basicProfiles, null, 2)};\n`,
);
const functions = [...html.matchAll(/(?:async )?function (\w+)\(/g)].map(
  (x) => x[1],
);
const keys = [
  ...new Set([...html.matchAll(/['"](wrx-[\w.\-]+)['"]/g)].map((x) => x[1])),
].sort();
fs.writeFileSync(
  "docs/baseline-inventory.json",
  JSON.stringify({ commit: "351e770", functions, keys }, null, 2) + "\n",
);
const functionInventory = [];
for (const [scriptIndex, match] of [
  ...html.matchAll(/<script>([\s\S]*?)<\/script>/g),
].entries()) {
  const source = ts.createSourceFile(
    "baseline.js",
    match[1],
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const lineOffset = html.slice(0, match.index + 8).split("\n").length;
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)
    ) {
      const parent = node.parent;
      const name =
        node.name?.getText(source) ??
        (ts.isVariableDeclaration(parent)
          ? parent.name.getText(source)
          : ts.isPropertyAssignment(parent)
            ? parent.name.getText(source)
            : ts.isBinaryExpression(parent)
              ? parent.left.getText(source)
              : "anonymous callback / IIFE");
      functionInventory.push({
        script: scriptIndex + 1,
        line:
          lineOffset +
          source.getLineAndCharacterOfPosition(node.getStart(source)).line,
        name,
        kind: ts.SyntaxKind[node.kind],
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
fs.writeFileSync(
  "docs/baseline-functions.json",
  JSON.stringify(functionInventory, null, 2) + "\n",
);
