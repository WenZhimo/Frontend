import { GPU_FIELD_GROUPS, listGpuCandidateFields } from "./fieldLayout.js";

export function createGpuWorldMirror(world, options = {}) {
  const fieldGroups = options.fieldGroups ?? GPU_FIELD_GROUPS;
  const dirtyFields = new Set();
  const graphBacked = isGraphBackedGrid(world.grid);
  const width = Number.isFinite(world.grid.width) ? world.grid.width : null;
  const height = Number.isFinite(world.grid.height) ? world.grid.height : null;
  return {
    width,
    height,
    size: world.grid.size,
    graphBacked,
    renderCompatible: !graphBacked && Number.isFinite(width) && Number.isFinite(height),
    cpuAuthoritative: true,
    phase: 0,
    fieldGroups,
    dirtyFields,
    note: graphBacked
      ? "CPU spherical graph world is authoritative. Phase 0 GPU mirror records sync intent only and does not expose rectangular texture dimensions."
      : "CPU world is authoritative. This mirror records future GPU sync intent only.",
    markDirty(fieldName) {
      dirtyFields.add(fieldName);
    },
    clearDirty(fieldName) {
      dirtyFields.delete(fieldName);
    },
    uploadFields(fieldNames = listGpuCandidateFields().map((field) => field.name)) {
      return {
        uploaded: [],
        skipped: [...fieldNames],
        reason: "Phase 0 does not upload fields to GPU buffers.",
      };
    },
    downloadFields(fieldNames = listGpuCandidateFields().map((field) => field.name)) {
      return {
        downloaded: [],
        skipped: [...fieldNames],
        reason: "Phase 0 does not download fields from GPU buffers.",
      };
    },
    snapshotMetadata() {
      return {
        width,
        height,
        size: world.grid.size,
        graphBacked,
        renderCompatible: !graphBacked && Number.isFinite(width) && Number.isFinite(height),
        fieldGroupNames: Object.keys(fieldGroups),
        dirtyFields: [...dirtyFields],
      };
    },
    dispose() {
      dirtyFields.clear();
    },
  };
}

function isGraphBackedGrid(grid) {
  return Boolean(grid?.topologyOptions?.graphBacked || grid?.topologyKind === "cubed-sphere");
}
