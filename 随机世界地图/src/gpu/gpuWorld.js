import { GPU_FIELD_GROUPS, listGpuCandidateFields } from "./fieldLayout.js";

export function createGpuWorldMirror(world, options = {}) {
  const fieldGroups = options.fieldGroups ?? GPU_FIELD_GROUPS;
  const dirtyFields = new Set();
  return {
    width: world.grid.width,
    height: world.grid.height,
    size: world.grid.size,
    cpuAuthoritative: true,
    phase: 0,
    fieldGroups,
    dirtyFields,
    note: "CPU world is authoritative. This mirror records future GPU sync intent only.",
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
        width: world.grid.width,
        height: world.grid.height,
        size: world.grid.size,
        fieldGroupNames: Object.keys(fieldGroups),
        dirtyFields: [...dirtyFields],
      };
    },
    dispose() {
      dirtyFields.clear();
    },
  };
}
