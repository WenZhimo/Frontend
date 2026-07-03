export const GpuFieldGroup = {
  RENDER: "render",
  ISOSTASY: "isostasy",
  ELEVATION: "elevation",
  LOCAL_TERRAIN: "localTerrain",
  MARGIN_SEDIMENT: "marginSediment",
};

export const GpuFieldKind = {
  FLOAT: "float32",
  UINT: "uint32",
  INT: "int32",
  MASK: "mask-u32",
};

export const GPU_FIELD_GROUPS = {
  [GpuFieldGroup.RENDER]: {
    purpose: "Read-only map coloring and future render-only overlay experiments.",
    fields: [
      field("elev", GpuFieldKind.FLOAT),
      field("btype", GpuFieldKind.INT),
      field("activeBoundary", GpuFieldKind.MASK),
      field("boundaryDensity", GpuFieldKind.FLOAT),
      field("boundaryCoherence", GpuFieldKind.FLOAT),
      field("plateCheckerboard", GpuFieldKind.FLOAT),
    ],
  },
  [GpuFieldGroup.ISOSTASY]: {
    purpose: "Dense per-cell isostasy terms; CPU remains authoritative in Phase 0.",
    fields: [
      field("crustType", GpuFieldKind.MASK),
      field("crustThickness", GpuFieldKind.FLOAT),
      field("crustAge", GpuFieldKind.FLOAT),
      field("crustDensity", GpuFieldKind.FLOAT),
      field("sediment", GpuFieldKind.FLOAT),
      field("sedimentLoadSubsidence", GpuFieldKind.FLOAT),
      field("ridge", GpuFieldKind.FLOAT),
      field("trench", GpuFieldKind.FLOAT),
      field("isostaticBase", GpuFieldKind.FLOAT, "output"),
      field("crustBuoyancy", GpuFieldKind.FLOAT, "output"),
      field("densitySubsidence", GpuFieldKind.FLOAT, "output"),
      field("lithosphereCooling", GpuFieldKind.FLOAT, "output"),
      field("ageSubsidence", GpuFieldKind.FLOAT, "output"),
      field("thicknessBuoyancy", GpuFieldKind.FLOAT, "output"),
      field("sedimentFill", GpuFieldKind.FLOAT, "output"),
      field("ridgeUplift", GpuFieldKind.FLOAT, "output"),
      field("trenchDepression", GpuFieldKind.FLOAT, "output"),
      field("oceanDepthTerms", GpuFieldKind.FLOAT, "output"),
    ],
  },
  [GpuFieldGroup.ELEVATION]: {
    purpose: "Dense geology-v2 elevation rebuild candidates.",
    fields: [
      field("isostaticBase", GpuFieldKind.FLOAT),
      field("orogeny", GpuFieldKind.FLOAT),
      field("activeOrogeny", GpuFieldKind.FLOAT),
      field("oldOrogeny", GpuFieldKind.FLOAT),
      field("orogenyAge", GpuFieldKind.FLOAT),
      field("sediment", GpuFieldKind.FLOAT),
      field("sedimentFill", GpuFieldKind.FLOAT),
      field("sedimentLoadSubsidence", GpuFieldKind.FLOAT),
      field("ridgeUplift", GpuFieldKind.FLOAT),
      field("trenchDepression", GpuFieldKind.FLOAT),
      field("passiveMargin", GpuFieldKind.FLOAT),
      field("continentalShelf", GpuFieldKind.FLOAT),
      field("continentalSlope", GpuFieldKind.FLOAT),
      field("continentalRise", GpuFieldKind.FLOAT),
      field("abyssalPlain", GpuFieldKind.FLOAT),
      field("sedimentWedge", GpuFieldKind.FLOAT),
      field("forelandBasin", GpuFieldKind.FLOAT),
      field("activeTransform", GpuFieldKind.FLOAT),
      field("transformMemory", GpuFieldKind.FLOAT),
      field("fractureZoneMemory", GpuFieldKind.FLOAT),
      field("inactiveBoundaryRelief", GpuFieldKind.FLOAT),
      field("geologyBroadNoise", GpuFieldKind.FLOAT),
      field("geologyMicroNoise", GpuFieldKind.FLOAT),
      field("mountainBelt", GpuFieldKind.FLOAT),
      field("trench", GpuFieldKind.FLOAT),
      field("ridge", GpuFieldKind.FLOAT),
      field("rift", GpuFieldKind.FLOAT),
      field("islandArc", GpuFieldKind.FLOAT),
      field("basin", GpuFieldKind.FLOAT),
      field("baseElev", GpuFieldKind.FLOAT, "output"),
      field("relief", GpuFieldKind.FLOAT, "output"),
      field("boundaryRelief", GpuFieldKind.FLOAT, "output"),
      field("elev", GpuFieldKind.FLOAT, "output"),
    ],
  },
  [GpuFieldGroup.LOCAL_TERRAIN]: {
    purpose: "Fixed-neighborhood terrain derived fields such as slope and ruggedness.",
    fields: [
      field("elev", GpuFieldKind.FLOAT),
      field("slope", GpuFieldKind.FLOAT, "output"),
      field("aspect", GpuFieldKind.FLOAT, "output"),
      field("ruggedness", GpuFieldKind.FLOAT, "output"),
      field("localRelief", GpuFieldKind.FLOAT, "output"),
    ],
  },
  [GpuFieldGroup.MARGIN_SEDIMENT]: {
    purpose: "Passive margin smoothing and sediment-capacity candidates; topology searches stay on CPU.",
    fields: [
      field("passiveMargin", GpuFieldKind.FLOAT),
      field("continentalShelf", GpuFieldKind.FLOAT),
      field("continentalSlope", GpuFieldKind.FLOAT),
      field("continentalRise", GpuFieldKind.FLOAT),
      field("sedimentWedge", GpuFieldKind.FLOAT),
      field("abyssalPlain", GpuFieldKind.FLOAT),
      field("sedimentCapacity", GpuFieldKind.FLOAT),
      field("sedimentSink", GpuFieldKind.FLOAT),
    ],
  },
};

export function listGpuCandidateFields(groupName) {
  if (groupName) {
    return [...(GPU_FIELD_GROUPS[groupName]?.fields ?? [])];
  }
  const seen = new Map();
  for (const group of Object.values(GPU_FIELD_GROUPS)) {
    for (const item of group.fields) {
      if (!seen.has(item.name)) seen.set(item.name, item);
    }
  }
  return [...seen.values()];
}

function field(name, kind, role = "input") {
  return { name, kind, role };
}
