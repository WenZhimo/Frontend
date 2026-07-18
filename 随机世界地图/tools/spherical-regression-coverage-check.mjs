import { readdirSync, readFileSync } from "node:fs";
import { basename } from "node:path";

const toolsDir = new URL("./", import.meta.url);
const regressionPath = new URL("./spherical-regression-check.mjs", import.meta.url);

const sphericalTools = readdirSync(toolsDir)
  .filter((name) => /^spherical-.*\.mjs$/.test(name))
  .sort();

const regressionSource = readFileSync(regressionPath, "utf8");
const referenced = new Set(
  [...regressionSource.matchAll(/tools\/(spherical-[^"\]\s]+\.mjs)/g)]
    .map((match) => basename(match[1])),
);

const excluded = new Set([
  "spherical-regression-check.mjs",
]);

const required = sphericalTools.filter((name) => !excluded.has(name));
const missingFromRegression = required.filter((name) => !referenced.has(name));
const unknownReferences = [...referenced]
  .filter((name) => /^spherical-.*\.mjs$/.test(name))
  .filter((name) => !sphericalTools.includes(name))
  .sort();

const result = {
  valid: missingFromRegression.length === 0 && unknownReferences.length === 0,
  sphericalToolCount: sphericalTools.length,
  requiredRegressionToolCount: required.length,
  regressionReferenceCount: referenced.size,
  regressionCoverageRatio: required.length > 0 ? (required.length - missingFromRegression.length) / required.length : 1,
  excluded: [...excluded].sort(),
  missingFromRegression,
  unknownReferences,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);
