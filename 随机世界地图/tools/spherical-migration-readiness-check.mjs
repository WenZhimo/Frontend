import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const forbiddenPatterns = [
  { name: "grid.width", regex: /\bgrid\.width\b/g },
  { name: "grid.height", regex: /\bgrid\.height\b/g },
  { name: "y_times_width_plus_x", regex: /\by\s*\*\s*width\s*\+\s*x\b/g },
  { name: "ny_times_width_plus_nx", regex: /\bny\s*\*\s*width\s*\+\s*nx\b/g },
  { name: "id_mod_grid_width", regex: /\b\w+\s*%\s*grid\.width\b/g },
  { name: "id_div_grid_width", regex: /Math\.floor\(\s*\w+\s*\/\s*grid\.width\s*\)/g },
];

const helperDependencyPatterns = [
  { name: "indexOf", regex: /\bindexOf\s*\(/g },
  { name: "xyOf", regex: /\bxyOf\s*\(/g },
  { name: "sampleGridWrapped", regex: /\bsampleGridWrapped\s*\(/g },
  { name: "sampleGridBilinear", regex: /\bsampleGridBilinear\s*\(/g },
  { name: "gridParamWidth", regex: /\bgridParamWidth\s*\(/g },
  { name: "gridParamHeight", regex: /\bgridParamHeight\s*\(/g },
  { name: "wrapGridParamX", regex: /\bwrapGridParamX\s*\(/g },
  { name: "gridParamToU", regex: /\bgridParamToU\s*\(/g },
  { name: "gridParamToV", regex: /\bgridParamToV\s*\(/g },
];

const sphericalProductionPaths = [
  "src/sim/sphere",
];

const allowedSphericalMatches = [];

const legacyMigrationScopes = [
  "src/sim/geology",
  "src/sim/derived",
  "src/sim/tectonics.js",
  "src/sim/terrain.js",
  "src/sim/hydrology.js",
  "src/sim/scale.js",
];

const topologyAwareLegacyFiles = new Set([
  "src/sim/scale.js",
]);

const graphRoutedLegacyFiles = new Map([
  [
    "src/sim/tectonics.js",
    {
      reason: "assignPlates routes graph-backed worlds to spherical plates before the legacy raster tectonics helpers",
      patterns: new Set(["indexOf", "sampleGridBilinear", "xyOf"]),
    },
  ],
]);

const sphericalMatches = scanPaths(sphericalProductionPaths).filter((match) => {
  return !isAllowedSphericalMatch(match);
});
const legacyMatches = scanPaths(legacyMigrationScopes).filter((match) => {
  return !topologyAwareLegacyFiles.has(match.file);
});
const legacyHelperMatches = scanPaths(legacyMigrationScopes, helperDependencyPatterns).filter((match) => {
  return !topologyAwareLegacyFiles.has(match.file);
});
const classifiedLegacyHelperMatches = legacyHelperMatches.map(classifyHelperMatch);
const sphericalByFile = summarizeByFile(sphericalMatches);
const legacyByFile = summarizeByFile(legacyMatches);
const legacyHelperByFile = summarizeByFile(legacyHelperMatches);
const legacyFallbackHelperMatches = classifiedLegacyHelperMatches.filter((match) => match.classification === "legacyFallback");
const guardedHelperMatches = classifiedLegacyHelperMatches.filter((match) => match.classification === "guardedHelper");
const possibleSphericalPathHelperMatches = classifiedLegacyHelperMatches.filter((match) => match.classification === "possibleSphericalPath");
const graphRoutedFallbackMatches = legacyFallbackHelperMatches.filter((match) => match.routeKind === "graphRoutedFile");
const explicitLegacyWrapperMatches = legacyFallbackHelperMatches.filter((match) => match.routeKind === "explicitLegacyFunction");
const graphBranchFallbackMatches = legacyFallbackHelperMatches.filter((match) => match.routeKind === "graphBranchFallback");
const legacyFallbackHelperByFile = summarizeByFile(legacyFallbackHelperMatches);
const guardedHelperByFile = summarizeByFile(guardedHelperMatches);
const possibleSphericalPathHelperByFile = summarizeByFile(possibleSphericalPathHelperMatches);
const graphRoutedFallbackByFile = summarizeByFile(graphRoutedFallbackMatches);
const explicitLegacyWrapperByFile = summarizeByFile(explicitLegacyWrapperMatches);
const graphBranchFallbackByFile = summarizeByFile(graphBranchFallbackMatches);

const productionAdapterReady = sphericalMatches.length === 0;
const fullMigrationReady = legacyMatches.length === 0;
const helperMigrationReady = possibleSphericalPathHelperMatches.length === 0;
const result = {
  valid: productionAdapterReady && helperMigrationReady,
  productionAdapterReady,
  fullMigrationReady,
  helperMigrationReady,
  sphericalForbiddenCount: sphericalMatches.length,
  sphericalForbiddenFiles: Object.keys(sphericalByFile).length,
  legacyRiskCount: legacyMatches.length,
  legacyRiskFiles: Object.keys(legacyByFile).length,
  legacyDirectRectangularRiskCount: legacyMatches.length,
  legacyDirectRectangularRiskFiles: Object.keys(legacyByFile).length,
  legacyHelperRiskCount: legacyHelperMatches.length,
  legacyHelperRiskFiles: Object.keys(legacyHelperByFile).length,
  legacyFallbackHelperCount: legacyFallbackHelperMatches.length,
  legacyFallbackHelperFiles: Object.keys(legacyFallbackHelperByFile).length,
  graphRoutedFallbackCount: graphRoutedFallbackMatches.length,
  graphRoutedFallbackFiles: Object.keys(graphRoutedFallbackByFile).length,
  explicitLegacyWrapperCount: explicitLegacyWrapperMatches.length,
  explicitLegacyWrapperFiles: Object.keys(explicitLegacyWrapperByFile).length,
  graphBranchFallbackCount: graphBranchFallbackMatches.length,
  graphBranchFallbackFiles: Object.keys(graphBranchFallbackByFile).length,
  guardedHelperCount: guardedHelperMatches.length,
  guardedHelperFiles: Object.keys(guardedHelperByFile).length,
  possibleSphericalPathHelperCount: possibleSphericalPathHelperMatches.length,
  possibleSphericalPathHelperFiles: Object.keys(possibleSphericalPathHelperByFile).length,
  topologyAwareLegacyFiles: Array.from(topologyAwareLegacyFiles).sort(),
  topLegacyRiskFiles: Object.entries(legacyByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  topLegacyHelperRiskFiles: Object.entries(legacyHelperByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  topPossibleSphericalPathHelperFiles: Object.entries(possibleSphericalPathHelperByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  topLegacyFallbackHelperFiles: Object.entries(legacyFallbackHelperByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  topGraphRoutedFallbackFiles: Object.entries(graphRoutedFallbackByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  topExplicitLegacyWrapperFiles: Object.entries(explicitLegacyWrapperByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  topGraphBranchFallbackFiles: Object.entries(graphBranchFallbackByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  topGuardedHelperFiles: Object.entries(guardedHelperByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  notes: [
    "valid means the spherical production adapter boundary is clean and no unclassified possible spherical-path helpers remain",
    fullMigrationReady
      ? "fullMigrationReady means scanned legacy migration scopes have no unclassified rectangular-indexing risks"
      : "fullMigrationReady remains false while scanned legacy migration scopes still contain rectangular-indexing risks",
    helperMigrationReady
      ? "helperMigrationReady means all scanned topology helper usage is classified as guarded or legacy fallback"
      : "helperMigrationReady is false while possibleSphericalPathHelperCount is non-zero",
    "legacyHelperRiskCount is diagnostic: topology helpers are migration dependencies, not automatic failures",
    "possibleSphericalPathHelperCount is the next migration target; legacyFallbackHelperCount is split into graphRoutedFallback, explicitLegacyWrapper, and graphBranchFallback buckets",
  ],
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function scanPaths(paths, patterns = forbiddenPatterns) {
  const matches = [];
  for (const relativePath of paths) {
    const absolutePath = path.join(root, relativePath);
    if (!existsSync(absolutePath)) continue;
    const stat = statSync(absolutePath);
    const files = stat.isDirectory() ? listJsFiles(absolutePath) : [absolutePath];
    for (const file of files) matches.push(...scanFile(file, patterns));
  }
  return matches;
}

function listJsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const absolutePath = path.join(dir, entry);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      files.push(...listJsFiles(absolutePath));
    } else if (/\.(js|mjs)$/.test(entry)) {
      files.push(absolutePath);
    }
  }
  return files;
}

function scanFile(file, patterns = forbiddenPatterns) {
  const text = readFileSync(file, "utf8");
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const lines = text.split(/\r?\n/);
  const matches = [];
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    for (const match of text.matchAll(pattern.regex)) {
      const line = lineNumberAt(text, match.index ?? 0);
      matches.push({
        file: relative,
        line,
        lineText: lines[line - 1] ?? "",
        contextBefore: lines.slice(Math.max(0, line - 80), Math.max(0, line - 1)),
        contextAfter: lines.slice(line, Math.min(lines.length, line + 24)),
        pattern: pattern.name,
      });
    }
  }
  return matches;
}

function lineNumberAt(text, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function summarizeByFile(matches) {
  const byFile = {};
  for (const match of matches) {
    if (!byFile[match.file]) byFile[match.file] = { count: 0, patternSet: new Set() };
    byFile[match.file].count += 1;
    byFile[match.file].patternSet.add(match.pattern);
  }
  for (const summary of Object.values(byFile)) {
    summary.patterns = Array.from(summary.patternSet).sort();
    delete summary.patternSet;
  }
  return byFile;
}

function classifyHelperMatch(match) {
  const before = match.contextBefore.join("\n");
  const after = match.contextAfter.join("\n");
  const context = `${before}\n${match.lineText}\n${after}`;
  if (isInsideLegacyFunction(match)) {
    return {
      ...match,
      classification: "legacyFallback",
      routeKind: "explicitLegacyFunction",
      routeReason: "helper call is inside an explicitly named legacy fallback function",
    };
  }
  const graphRoutedFile = graphRoutedLegacyFiles.get(match.file);
  if (graphRoutedFile?.patterns.has(match.pattern)) {
    return {
      ...match,
      classification: "legacyFallback",
      routeKind: "graphRoutedFile",
      routeReason: graphRoutedFile.reason,
    };
  }
  const hasGraphGuard = /isGraphBackedGrid\s*\(|graphBacked|topology\.forEachNeighbor|topology\.shortestDistanceSeeds/.test(context);
  const precededByGraphReturn = /if\s*\([^\n]*(?:isGraphBackedGrid|graphBacked)[^\n]*\)\s*\{[\s\S]{0,2600}\breturn\s*;[\s\S]{0,1600}$/.test(before);
  const precededByGraphBranch = /if\s*\([^\n]*(?:isGraphBackedGrid|graphBacked)[^\n]*\)\s*\{[\s\S]{0,2600}$/.test(before);
  const followedByFallbackReturn = /\breturn\b/.test(after.slice(0, 260));
  const classification = precededByGraphReturn || (precededByGraphBranch && followedByFallbackReturn)
    ? "legacyFallback"
    : hasGraphGuard
      ? "guardedHelper"
      : "possibleSphericalPath";
  return {
    ...match,
    classification,
    routeKind: classification === "legacyFallback" ? "graphBranchFallback" : null,
  };
}

function isInsideLegacyFunction(match) {
  const lines = [...match.contextBefore, match.lineText];
  let depth = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    depth += countChar(line, "}") - countChar(line, "{");
    const fn = line.match(/^\s*function\s+(legacy[A-Za-z0-9_]*)\s*\(/);
    if (!fn) continue;
    return depth < countChar(line, "{") || line.includes("{");
  }
  return false;
}

function countChar(text, char) {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === char) count += 1;
  }
  return count;
}

function isAllowedSphericalMatch(match) {
  return allowedSphericalMatches.some((allowed) => {
    return (
      match.file === allowed.file &&
      match.pattern === allowed.pattern &&
      match.lineText.trim() === allowed.lineText
    );
  });
}
