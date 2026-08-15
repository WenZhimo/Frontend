import { state } from '../state.js';
import { SphereMesh } from '../sphere-mesh.js';
import { cloneEvolutionState, createEvolutionState, formatEvolutionLabel } from './evolution-state.js';

const SNAPSHOT_SCHEMA = 'world-orogen-snapshot';
const SNAPSHOT_VERSION = 1;

function makeSnapshotId() {
    const rand = Math.random().toString(36).slice(2, 8);
    return `snap_${Date.now().toString(36)}_${rand}`;
}

function isTypedArray(value) {
    return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function cloneTypedArray(value) {
    return new value.constructor(value);
}

function cloneMesh(mesh) {
    if (!mesh) return mesh;
    return new SphereMesh(
        cloneTypedArray(mesh.triangles),
        cloneTypedArray(mesh.halfedges),
        mesh.numRegions
    );
}

function cloneValue(value) {
    if (value == null || typeof value !== 'object') return value;
    if (isTypedArray(value)) return cloneTypedArray(value);
    if (value instanceof DataView) return new DataView(value.buffer.slice(0));
    if (value instanceof ArrayBuffer) return value.slice(0);
    if (value instanceof Set) return new Set(Array.from(value));
    if (Array.isArray(value)) return value.map(cloneValue);
    if (value instanceof SphereMesh || (
        value.triangles && value.halfedges && Number.isFinite(value.numRegions)
    )) {
        return cloneMesh(value);
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) return value;
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = cloneValue(item);
    return out;
}

export function cloneCurDataForSnapshot(curData) {
    if (!curData) return null;
    const out = {};
    for (const [key, value] of Object.entries(curData)) out[key] = cloneValue(value);
    return out;
}

export function restoreCurDataFromSnapshot(snapshot) {
    return cloneCurDataForSnapshot(snapshot?.payload?.curData);
}

export class SnapshotCache {
    constructor({ maxSnapshots = 24 } = {}) {
        this.currentId = null;
        this.order = [];
        this.byId = new Map();
        this.maxSnapshots = maxSnapshots;
        this.memoryPolicy = 'manual-prune';
    }

    capture({ label = '', source = 'manual', params = {}, evolutionState = null } = {}) {
        if (!state.curData) throw new Error('没有可用于快照的已生成世界。');
        if (this.order.length >= this.maxSnapshots) {
            throw new Error(`快照缓存已满（${this.maxSnapshots}）。请删除一张快照后再捕获。`);
        }

        const id = makeSnapshotId();
        const parentId = this.currentId;
        const baseEvolution = evolutionState || state.curData.evolutionState || null;
        const resolvedEvolution = createEvolutionState({
            previous: baseEvolution,
            seed: state.curData.seed,
            time: baseEvolution?.time || null,
            snapshotId: id,
            parentId,
            label: label || formatEvolutionLabel(baseEvolution),
            source,
            climateComputed: !!state.climateComputed,
        });
        const resolvedLabel = label || resolvedEvolution.snapshot.label;
        const curData = cloneCurDataForSnapshot({
            ...state.curData,
            evolutionState: resolvedEvolution,
        });
        const debugLayers = curData.debugLayers ? Object.keys(curData.debugLayers) : [];
        const snapshot = {
            schema: SNAPSHOT_SCHEMA,
            version: SNAPSHOT_VERSION,
            id,
            label: resolvedLabel,
            createdAt: resolvedEvolution.snapshot.createdAt,
            evolutionState: cloneEvolutionState(resolvedEvolution),
            params: cloneValue(params),
            payload: { curData },
            availability: {
                terrain: !!curData.r_elevation,
                climate: !!resolvedEvolution.dependencies.climateComputed,
                debugLayers,
            },
            metrics: {
                terrainMetrics: cloneValue(curData.terrainMetrics || null),
            },
        };

        this.order.push(id);
        this.byId.set(id, snapshot);
        this.currentId = id;
        state.curData.evolutionState = cloneEvolutionState(resolvedEvolution);
        state.evolution.currentId = id;
        state.evolution.time = cloneValue(resolvedEvolution.time);
        return snapshot;
    }

    apply(id) {
        const snapshot = this.byId.get(id);
        if (!snapshot) throw new Error(`未知快照：${id}`);
        const curData = restoreCurDataFromSnapshot(snapshot);
        state.curData = curData;
        state.climateComputed = !!snapshot.evolutionState.dependencies?.climateComputed;
        this.currentId = id;
        state.evolution.currentId = id;
        state.evolution.time = cloneValue(snapshot.evolutionState.time);
        state.evolution.compare.baseId = null;
        return curData;
    }

    delete(id) {
        if (!this.byId.has(id)) return false;
        this.byId.delete(id);
        this.order = this.order.filter(item => item !== id);
        if (this.currentId === id) {
            this.currentId = this.order[this.order.length - 1] || null;
            state.evolution.currentId = this.currentId;
        }
        return true;
    }

    get(id) {
        return this.byId.get(id) || null;
    }

    list() {
        return this.order.map(id => {
            const snapshot = this.byId.get(id);
            return {
                id,
                label: snapshot.label,
                createdAt: snapshot.createdAt,
                source: snapshot.evolutionState.snapshot.source,
                time: cloneValue(snapshot.evolutionState.time),
                climate: !!snapshot.availability.climate,
            };
        });
    }

    previousOf(id) {
        const index = this.order.indexOf(id);
        if (index <= 0) return null;
        return this.get(this.order[index - 1]);
    }
}

export const snapshotCache = new SnapshotCache();
