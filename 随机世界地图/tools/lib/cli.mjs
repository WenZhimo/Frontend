export function parseOptions(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq >= 0) {
      options[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = true;
    }
  }
  return { positional, options };
}

export function parseCsv(value, fallback = []) {
  if (value === undefined || value === null || value === true || value === "") return fallback;
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseNumberList(value, fallback = []) {
  const parts = parseCsv(value, fallback.map(String));
  return parts
    .map((part) => Number(part))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
}

export function parseIntOption(options, name, fallback) {
  const value = Number(options[name]);
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

export function parseBoolOption(options, name) {
  return options[name] === true || options[name] === "true" || options[name] === "1";
}

export function parseTopologyOptions(options = {}) {
  const topologyMode = options.topology ?? options["topology-mode"] ?? options.topologyMode ?? "cylindrical";
  const projectionMode = options.projection ?? options["projection-mode"] ?? options.projectionMode ?? "equirectangular";
  const faceSize = parseIntOption(options, "face-size", parseIntOption(options, "faceSize", undefined));
  const parsed = {
    topologyMode,
    projectionMode,
  };
  if (Number.isFinite(faceSize)) parsed.faceSize = faceSize;
  return parsed;
}
