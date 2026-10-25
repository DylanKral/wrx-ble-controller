// Generate only the complete function inventory without overwriting extracted modules/styles.
import fs from "node:fs";
import ts from "typescript";
const html = fs.readFileSync("tests/fixtures/original-v8.2.html", "utf8"),
  functions = [];
for (const [index, match] of [
  ...html.matchAll(/<script>([\s\S]*?)<\/script>/g),
].entries()) {
  const source = ts.createSourceFile(
      "baseline.js",
      match[1],
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    ),
    offset = html.slice(0, match.index + 8).split("\n").length;
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)
    ) {
      const parent = node.parent,
        name =
          node.name?.getText(source) ??
          (ts.isVariableDeclaration(parent)
            ? parent.name.getText(source)
            : ts.isPropertyAssignment(parent)
              ? parent.name.getText(source)
              : ts.isBinaryExpression(parent)
                ? parent.left.getText(source)
                : "anonymous callback / IIFE");
      functions.push({
        script: index + 1,
        line:
          offset +
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
  JSON.stringify(functions, null, 2) + "\n",
);
