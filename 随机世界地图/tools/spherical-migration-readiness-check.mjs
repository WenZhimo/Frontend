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

const allowedSphericalMatches = [
  {
    file: "src/sim/sphere/productionGridAdapter.js",
    pattern: "grid.width",
    lineText: "grid.width = sphericalGrid.faceSize;",
  },
  {
    file: "src/sim/sphere/productionGridAdapter.js",
    pattern: "grid.height",
    lineText: "grid.height = sphericalGrid.faceCount * sphericalGrid.faceSize;",
  },
];

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

const sphericalMatches = scanPaths(sphericalProductionPaths).filter((match) => {
  return !isAllowedSphericalMatch(match);
});
const legacyMatches = scanPaths(legacyMigrationScopes).filter((match) => {
  return !topologyAwareLegacyFiles.has(match.file);
});
const legacyHelperMatches = scanPaths(legacyMigrationScopes, helperDependencyPatterns).filter((match) => {
  return !topologyAwareLegacyFiles.has(match.file);
});
const sphericalByFile = summarizeByFile(sphericalMatches);
const legacyByFile = summarizeByFile(legacyMatches);
const legacyHelperByFile = summarizeByFile(legacyHelperMatches);

const productionAdapterReady = sphericalMatches.length === 0;
const fullMigrationReady = legacyMatches.length === 0;
const result = {
  valid: productionAdapterReady,
  productionAdapterReady,
  fullMigrationReady,
  sphericalForbiddenCount: sphericalMatches.length,
  sphericalForbiddenFiles: Object.keys(sphericalByFile).length,
  legacyRiskCount: legacyMatches.length,
  legacyRiskFiles: Object.keys(legacyByFile).length,
  legacyDirectRectangularRiskCount: legacyMatches.length,
  legacyDirectRectangularRiskFiles: Object.keys(legacyByFile).length,
  legacyHelperRiskCount: legacyHelperMatches.length,
  legacyHelperRiskFiles: Object.keys(legacyHelperByFile).length,
  topologyAwareLegacyFiles: Array.from(topologyAwareLegacyFiles).sort(),
  topLegacyRiskFiles: Object.entries(legacyByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  topLegacyHelperRiskFiles: Object.entries(legacyHelperByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  notes: [
    "valid only means the spherical production adapter boundary is clean",
    fullMigrationReady
      ? "fullMigrationReady means scanned legacy migration scopes have no unclassified rectangular-indexing risks"
      : "fullMigrationReady remains false while scanned legacy migration scopes still contain rectangular-indexing risks",
    "legacyHelperRiskCount is diagnostic: topology helpers are migration dependencies, not automatic failures",
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
      matches.push({ file: relative, line, lineText: lines[line - 1] ?? "", pattern: pattern.name });
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

function isAllowedSphericalMatch(match) {
  return allowedSphericalMatches.some((allowed) => {
    return (
      match.file === allowed.file &&
      match.pattern === allowed.pattern &&
      match.lineText.trim() === allowed.lineText
    );
  });
}
