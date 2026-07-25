import { readFileSync } from "node:fs";

const indexHtml = readFileSync("index.html", "utf8");
const appJs = readFileSync("src/app.js", "utf8");
const bundler = readFileSync("tools/bundle-app.mjs", "utf8");

const appScriptTags = [...indexHtml.matchAll(/<script\b[^>]*src=["']\.\/src\/app\.js["'][^>]*>/gi)]
  .map((match) => match[0]);
const moduleScriptTags = [...indexHtml.matchAll(/<script\b[^>]*type=["']module["'][^>]*>/gi)]
  .map((match) => match[0]);
const appHasTopLevelEsm = /^\s*(?:export|import)\s/m.test(appJs);
const appWrappedForClassicScript = /^\(function\s*\(\)\s*\{/.test(appJs.trimStart()) && /\}\)\(\);\s*$/.test(appJs.trimEnd());
const appUsesStrict = /^\(function\s*\(\)\s*\{\s*"use strict";/s.test(appJs.trimStart());
const appHasWebGpuCandidate = /runWebGpuIsostasyCandidate|runWebGpuElevationCandidate/.test(appJs);
const appHasCpuProductionPath = /function\s+stepWorld\s*\(|function\s+runGeologyV2Step\s*\(|function\s+rebuildGeologyElevation\s*\(/.test(appJs);

const exportStripPatterns = {
  asyncFunction: bundler.includes('.replace(/^export async function /gm, "async function ")'),
  classDeclaration: bundler.includes('.replace(/^export class /gm, "class ")'),
  constDeclaration: bundler.includes('.replace(/^export const /gm, "const ")'),
  letDeclaration: bundler.includes('.replace(/^export let /gm, "let ")'),
  varDeclaration: bundler.includes('.replace(/^export var /gm, "var ")'),
  functionDeclaration: bundler.includes('.replace(/^export function /gm, "function ")'),
  namedExports: bundler.includes(".replace(/^export \\{.*?\\};\\r?\\n/gm, \"\")"),
};
const importStripPatterns = {
  namedImports: bundler.includes('.replace(/^\\s*import\\s+[\\s\\S]*?\\s+from\\s+["\'][^"\']+["\'];\\r?\\n/gm, "")'),
  sideEffectImports: bundler.includes('.replace(/^\\s*import\\s+["\'][^"\']+["\'];\\r?\\n/gm, "")'),
};

const checks = {
  indexLoadsClassicAppScript: appScriptTags.length === 1,
  indexDoesNotUseModuleScript: moduleScriptTags.length === 0,
  appBundleWrappedForClassicScript: appWrappedForClassicScript,
  appBundleUsesStrict: appUsesStrict,
  appBundleHasNoTopLevelEsm: !appHasTopLevelEsm,
  appBundleIncludesGpuCandidatesWithoutEsm: appHasWebGpuCandidate && !appHasTopLevelEsm,
  appBundleIncludesCpuProductionPath: appHasCpuProductionPath,
  bundlerStripsAsyncFunctionExports: exportStripPatterns.asyncFunction,
  bundlerStripsClassExports: exportStripPatterns.classDeclaration,
  bundlerStripsConstExports: exportStripPatterns.constDeclaration,
  bundlerStripsLetExports: exportStripPatterns.letDeclaration,
  bundlerStripsVarExports: exportStripPatterns.varDeclaration,
  bundlerStripsFunctionExports: exportStripPatterns.functionDeclaration,
  bundlerStripsNamedExports: exportStripPatterns.namedExports,
  bundlerStripsNamedImports: importStripPatterns.namedImports,
  bundlerStripsSideEffectImports: importStripPatterns.sideEffectImports,
};

const failures = Object.entries(checks)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);

const result = {
  valid: failures.length === 0,
  failures,
  checks,
  metrics: {
    appScriptTags,
    moduleScriptTags,
    appBundleBytes: appJs.length,
    appBundleLineCount: appJs.split(/\r?\n/).length,
    topLevelEsmMatches: [...appJs.matchAll(/^\s*(?:export|import)\s.*$/gm)].map((match) => match[0]).slice(0, 12),
    exportStripPatterns,
    importStripPatterns,
  },
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);
