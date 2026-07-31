// TerrainDataGenerator.js
class TerrainDataGenerator {
    constructor(width, depth, options = {}) {
        this.width = width;
        this.depth = depth;
        // 默认参数
        this.seed = options.seed || Math.random();
        this.roughness = options.roughness || 60; // 崎岖度
        this.amplitude = options.amplitude || 30; // 高度振幅

        // 初始化噪声库 (需确保外部已加载 SimplexNoise)
        if (typeof SimplexNoise === 'undefined') {
            console.error('SimplexNoise library is required!');
        } else {
            this.simplex = new SimplexNoise(this.seed.toString());
        }

        this.minH = 0;
        this.maxH = 0;
        this._heightmapCache = null;
        this._heightmapCacheKey = null;
    }

    _clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    _smoothstep(edge0, edge1, value) {
        const t = this._clamp((value - edge0) / (edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    }

    _sampleNoise(x, z, scale) {
        return this.simplex.noise2D(x / scale, z / scale);
    }

    _fbm(x, z, scale, octaves = 4, lacunarity = 2, gain = 0.5) {
        let value = 0;
        let amplitude = 0.5;
        let totalAmplitude = 0;
        let currentScale = Math.max(scale, 0.0001);

        for (let i = 0; i < octaves; i++) {
            value += this._sampleNoise(x, z, currentScale) * amplitude;
            totalAmplitude += amplitude;
            amplitude *= gain;
            currentScale /= lacunarity;
        }

        return value / totalAmplitude;
    }

    _ridged(x, z, scale, octaves = 4, lacunarity = 2, gain = 0.5) {
        let value = 0;
        let amplitude = 0.5;
        let totalAmplitude = 0;
        let currentScale = Math.max(scale, 0.0001);

        for (let i = 0; i < octaves; i++) {
            const ridge = 1 - Math.abs(this._sampleNoise(x, z, currentScale));
            value += ridge * ridge * amplitude;
            totalAmplitude += amplitude;
            amplitude *= gain;
            currentScale /= lacunarity;
        }

        return value / totalAmplitude;
    }

    _warp2D(x, z, scale, strength) {
        return {
            x: x + this._fbm(x + 91.7, z - 37.2, scale, 3) * strength,
            z: z + this._fbm(x - 12.4, z + 68.9, scale, 3) * strength
        };
    }

    _getHeightmapCacheKey(segments) {
        return [
            this.width,
            this.depth,
            this.seed,
            this.roughness,
            this.amplitude,
            segments
        ].join('|');
    }

    _invalidateHeightmapCache() {
        this._heightmapCache = null;
        this._heightmapCacheKey = null;
    }

    _buildHeightmapCache(segments = 200) {
        const safeSegments = Math.max(1, Math.floor(segments));
        const cacheKey = this._getHeightmapCacheKey(safeSegments);

        if (this._heightmapCache && this._heightmapCacheKey === cacheKey) {
            return this._heightmapCache;
        }

        const size = safeSegments + 1;
        const heights = new Float32Array(size * size);
        let min = Infinity;
        let max = -Infinity;

        for (let i = 0; i <= safeSegments; i++) {
            for (let j = 0; j <= safeSegments; j++) {
                const x = (i / safeSegments) * this.width;
                const z = (j / safeSegments) * this.depth;
                const h = this._sampleLayeredHeight(x, z);
                heights[i * size + j] = h;
                if (h < min) min = h;
                if (h > max) max = h;
            }
        }

        this._applyThermalErosion(heights, size, {
            iterations: 2,
            talus: Math.max(0.75, this.amplitude * 0.06),
            strength: 0.18
        });

        min = Infinity;
        max = -Infinity;
        for (let i = 0; i < heights.length; i++) {
            const h = heights[i];
            if (h < min) min = h;
            if (h > max) max = h;
        }

        const slopeMap = this._buildSlopeMap(heights, size);

        this._heightmapCache = {
            width: this.width,
            depth: this.depth,
            seed: this.seed,
            roughness: this.roughness,
            amplitude: this.amplitude,
            segments: safeSegments,
            size,
            heights,
            slopeMap: slopeMap.values,
            slopeMin: slopeMap.min,
            slopeMax: slopeMap.max,
            min,
            max
        };
        this._heightmapCacheKey = cacheKey;

        return this._heightmapCache;
    }

    _buildSlopeMap(heights, size) {
        if (!heights || heights.length !== size * size) {
            throw new Error('Slope map requires a square height array and matching size.');
        }

        const slopes = new Float32Array(heights.length);
        const cellWidth = this.width / Math.max(size - 1, 1);
        const cellDepth = this.depth / Math.max(size - 1, 1);
        let min = Infinity;
        let max = -Infinity;

        for (let x = 0; x < size; x++) {
            for (let z = 0; z < size; z++) {
                const index = x * size + z;
                const leftX = Math.max(x - 1, 0);
                const rightX = Math.min(x + 1, size - 1);
                const lowerZ = Math.max(z - 1, 0);
                const upperZ = Math.min(z + 1, size - 1);
                const dxDistance = Math.max((rightX - leftX) * cellWidth, 0.0001);
                const dzDistance = Math.max((upperZ - lowerZ) * cellDepth, 0.0001);
                const dhdx = (heights[rightX * size + z] - heights[leftX * size + z]) / dxDistance;
                const dhdz = (heights[x * size + upperZ] - heights[x * size + lowerZ]) / dzDistance;
                const slope = Math.sqrt(dhdx * dhdx + dhdz * dhdz);
                const safeSlope = Number.isFinite(slope) ? Math.max(0, slope) : 0;

                slopes[index] = safeSlope;
                if (safeSlope < min) min = safeSlope;
                if (safeSlope > max) max = safeSlope;
            }
        }

        return {
            values: slopes,
            min,
            max
        };
    }

    _sampleHeightmapCache(u, v, segments = 200) {
        const cache = this._buildHeightmapCache(segments);
        const gridU = this._clamp(u, 0, 1) * cache.segments;
        const gridV = this._clamp(v, 0, 1) * cache.segments;

        const u0 = Math.floor(gridU);
        const v0 = Math.floor(gridV);
        const u1 = Math.min(u0 + 1, cache.segments);
        const v1 = Math.min(v0 + 1, cache.segments);
        const uT = gridU - u0;
        const vT = gridV - v0;

        const h00 = cache.heights[u0 * cache.size + v0];
        const h10 = cache.heights[u1 * cache.size + v0];
        const h01 = cache.heights[u0 * cache.size + v1];
        const h11 = cache.heights[u1 * cache.size + v1];
        const h0 = h00 + (h10 - h00) * uT;
        const h1 = h01 + (h11 - h01) * uT;

        return h0 + (h1 - h0) * vT;
    }

    _sampleNormalizedHeightmapCache(u, v, segments = 200) {
        const cache = this._buildHeightmapCache(segments);
        const heightRange = cache.max - cache.min;

        if (!Number.isFinite(heightRange) || heightRange <= 0) {
            return 0;
        }

        const height = this._sampleHeightmapCache(u, v, segments);
        const normalizedHeight = (height - cache.min) / heightRange;

        return Number.isFinite(normalizedHeight) ? this._clamp(normalizedHeight, 0, 1) : 0;
    }

    _sampleElevationBandCache(u, v, segments = 200) {
        const normalizedHeight = this._sampleNormalizedHeightmapCache(u, v, segments);

        if (!Number.isFinite(normalizedHeight)) {
            return 0;
        }
        if (normalizedHeight < 0.33) {
            return 0;
        }
        if (normalizedHeight < 0.66) {
            return 1;
        }

        return 2;
    }

    _sampleSlopeMapCache(u, v, segments = 200) {
        const cache = this._buildHeightmapCache(segments);
        const gridU = this._clamp(u, 0, 1) * cache.segments;
        const gridV = this._clamp(v, 0, 1) * cache.segments;

        const u0 = Math.floor(gridU);
        const v0 = Math.floor(gridV);
        const u1 = Math.min(u0 + 1, cache.segments);
        const v1 = Math.min(v0 + 1, cache.segments);
        const uT = gridU - u0;
        const vT = gridV - v0;

        const s00 = cache.slopeMap[u0 * cache.size + v0];
        const s10 = cache.slopeMap[u1 * cache.size + v0];
        const s01 = cache.slopeMap[u0 * cache.size + v1];
        const s11 = cache.slopeMap[u1 * cache.size + v1];
        const s0 = s00 + (s10 - s00) * uT;
        const s1 = s01 + (s11 - s01) * uT;
        const slope = s0 + (s1 - s0) * vT;

        return Number.isFinite(slope) ? Math.max(0, slope) : 0;
    }

    _sampleNormalizedSlopeMapCache(u, v, segments = 200) {
        const cache = this._buildHeightmapCache(segments);
        const slopeRange = cache.slopeMax - cache.slopeMin;

        if (!Number.isFinite(slopeRange) || slopeRange <= 0) {
            return 0;
        }

        const slope = this._sampleSlopeMapCache(u, v, segments);
        const normalizedSlope = (slope - cache.slopeMin) / slopeRange;

        return Number.isFinite(normalizedSlope) ? this._clamp(normalizedSlope, 0, 1) : 0;
    }

    _sampleSlopeBandCache(u, v, segments = 200) {
        const normalizedSlope = this._sampleNormalizedSlopeMapCache(u, v, segments);

        if (!Number.isFinite(normalizedSlope)) {
            return 0;
        }
        if (normalizedSlope < 0.33) {
            return 0;
        }
        if (normalizedSlope < 0.66) {
            return 1;
        }

        return 2;
    }

    _sampleTerrainZoneCache(u, v, segments = 200) {
        const elevationBand = this._sampleElevationBandCache(u, v, segments);
        const slopeBand = this._sampleSlopeBandCache(u, v, segments);

        if (![0, 1, 2].includes(elevationBand) || ![0, 1, 2].includes(slopeBand)) {
            return 0;
        }

        return elevationBand * 3 + slopeBand;
    }

    _sampleRockExposureCache(u, v, segments = 200) {
        const normalizedSlope = this._sampleNormalizedSlopeMapCache(u, v, segments);
        const normalizedHeight = this._sampleNormalizedHeightmapCache(u, v, segments);
        const exposure = normalizedSlope * 0.7 + normalizedHeight * 0.3;

        return Number.isFinite(exposure) ? this._clamp(exposure, 0, 1) : 0;
    }

    _sampleSurfaceClassCache(u, v, segments = 200) {
        const elevationBand = this._sampleElevationBandCache(u, v, segments);
        const slopeBand = this._sampleSlopeBandCache(u, v, segments);
        const rockExposure = this._sampleRockExposureCache(u, v, segments);

        if (![0, 1, 2].includes(elevationBand) || ![0, 1, 2].includes(slopeBand)) {
            return 0;
        }

        // Surface class range: 0-7, from low/flat terrain to exposed high ridges.
        const isExposed = Number.isFinite(rockExposure) && rockExposure >= 0.65;

        if (elevationBand === 0) {
            return isExposed || slopeBand === 2 ? 1 : 0;
        }
        if (elevationBand === 1) {
            if (isExposed || slopeBand === 2) {
                return 4;
            }

            return slopeBand === 1 ? 3 : 2;
        }

        if (isExposed || slopeBand === 2) {
            return 7;
        }

        return slopeBand === 1 ? 6 : 5;
    }

    _sampleDerivedTerrainCache(u, v, segments = 200) {
        const height = this._sampleHeightmapCache(u, v, segments);
        const normalizedHeight = this._sampleNormalizedHeightmapCache(u, v, segments);
        const elevationBand = this._sampleElevationBandCache(u, v, segments);
        const terrainZone = this._sampleTerrainZoneCache(u, v, segments);
        const slope = this._sampleSlopeMapCache(u, v, segments);
        const normalizedSlope = this._sampleNormalizedSlopeMapCache(u, v, segments);
        const slopeBand = this._sampleSlopeBandCache(u, v, segments);
        const rockExposure = this._sampleRockExposureCache(u, v, segments);
        const surfaceClass = this._sampleSurfaceClassCache(u, v, segments);

        return {
            height: Number.isFinite(height) ? height : 0,
            normalizedHeight: Number.isFinite(normalizedHeight) ? this._clamp(normalizedHeight, 0, 1) : 0,
            elevationBand: [0, 1, 2].includes(elevationBand) ? elevationBand : 0,
            terrainZone: Number.isInteger(terrainZone) && terrainZone >= 0 && terrainZone <= 8 ? terrainZone : 0,
            slope: Number.isFinite(slope) ? Math.max(0, slope) : 0,
            normalizedSlope: Number.isFinite(normalizedSlope) ? this._clamp(normalizedSlope, 0, 1) : 0,
            slopeBand: [0, 1, 2].includes(slopeBand) ? slopeBand : 0,
            rockExposure: Number.isFinite(rockExposure) ? this._clamp(rockExposure, 0, 1) : 0,
            surfaceClass: Number.isInteger(surfaceClass) && surfaceClass >= 0 && surfaceClass <= 7 ? surfaceClass : 0
        };
    }

    _applyThermalErosion(heights, size, options = {}) {
        if (!heights || heights.length !== size * size) {
            throw new Error('Thermal erosion requires a square height array and matching size.');
        }

        const iterations = Math.max(0, Math.floor(options.iterations ?? 1));
        const talus = Math.max(0, options.talus ?? Math.max(0.5, this.amplitude * 0.04));
        const strength = this._clamp(options.strength ?? 0.35, 0, 1);
        const neighbors = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1]
        ];

        for (let iteration = 0; iteration < iterations; iteration++) {
            const delta = new Float32Array(heights.length);

            for (let x = 0; x < size; x++) {
                for (let z = 0; z < size; z++) {
                    const index = x * size + z;
                    const currentHeight = heights[index];
                    let steepestIndex = -1;
                    let steepestDrop = talus;

                    for (const [dx, dz] of neighbors) {
                        const nx = x + dx;
                        const nz = z + dz;

                        if (nx < 0 || nx >= size || nz < 0 || nz >= size) {
                            continue;
                        }

                        const neighborIndex = nx * size + nz;
                        const drop = currentHeight - heights[neighborIndex];

                        if (drop > steepestDrop) {
                            steepestDrop = drop;
                            steepestIndex = neighborIndex;
                        }
                    }

                    if (steepestIndex !== -1) {
                        const transfer = (steepestDrop - talus) * strength;
                        delta[index] -= transfer;
                        delta[steepestIndex] += transfer;
                    }
                }
            }

            for (let i = 0; i < heights.length; i++) {
                heights[i] += delta[i];
            }
        }

        return heights;
    }

    _sampleLayeredHeight(x, z) {
        const roughness = Math.max(this.roughness, 1);

        const continentNoise = this._fbm(x, z, roughness * 4.5, 3, 2, 0.55);
        const continent = this._smoothstep(-0.6, 0.75, continentNoise) * 2 - 1;

        const mountainWarp = this._warp2D(x + 173.5, z - 47.8, roughness * 2.2, roughness * 0.45);
        const mountainSource = this._fbm(mountainWarp.x, mountainWarp.z, roughness * 2.6, 4, 2, 0.5);
        const mountainMask = this._smoothstep(0.05, 0.78, mountainSource + continent * 0.35);

        const ridgeX = mountainWarp.x * 0.72 + mountainWarp.z * 0.18;
        const ridgeZ = mountainWarp.z * 1.28 - mountainWarp.x * 0.08;
        const ridgedMountains = this._ridged(ridgeX, ridgeZ, roughness * 0.9, 5, 2.05, 0.48);

        const valleyWarp = this._warp2D(x - 83.2, z + 29.6, roughness * 1.8, roughness * 0.35);
        const valleySource = this._ridged(
            valleyWarp.x - valleyWarp.z * 0.18,
            valleyWarp.z * 0.82 + valleyWarp.x * 0.1,
            roughness * 1.35,
            3,
            2,
            0.55
        );
        const valleyMask = this._smoothstep(0.62, 0.9, valleySource) * (1 - mountainMask * 0.45);

        const hills = this._fbm(x - 241.3, z + 119.6, roughness * 0.95, 4, 2, 0.5);
        const detail = this._fbm(x + 19.4, z - 301.2, roughness * 0.38, 3, 2.15, 0.42);

        let height = 0;
        height += continent * 0.38;
        height += mountainMask * ridgedMountains * 0.82;
        height -= valleyMask * 0.34;
        height += hills * (0.2 + (1 - mountainMask) * 0.12);
        height += detail * 0.06;

        return height * this.amplitude;
    }

    /**
     * 获取指定 UV 坐标处的高度
     * @param {number} u - 0~1
     * @param {number} v - 0~1
     */
    getHeight(u, v) {
        return this._sampleHeightmapCache(u, v);
    }

    /**
     * 预计算地形统计数据（如最高/最低点），用于颜色归一化
     * @param {number} segments - 采样精度
     */
    calculateStats(segments = 100) {
        let min = Infinity;
        let max = -Infinity;

        for (let i = 0; i <= segments; i++) {
            for (let j = 0; j <= segments; j++) {
                const h = this.getHeight(i / segments, j / segments);
                if (h < min) min = h;
                if (h > max) max = h;
            }
        }
        this.minH = min;
        this.maxH = max;
    }

    updateConfig(options) {
        let shouldInvalidateCache = false;

        if (options.seed !== undefined) {
            if (options.seed !== this.seed) {
                shouldInvalidateCache = true;
            }
            this.seed = options.seed;
            this.simplex = new SimplexNoise(this.seed.toString());
        }
        if (options.roughness !== undefined) {
            if (options.roughness !== this.roughness) {
                shouldInvalidateCache = true;
            }
            this.roughness = options.roughness;
        }
        if (options.amplitude !== undefined) {
            if (options.amplitude !== this.amplitude) {
                shouldInvalidateCache = true;
            }
            this.amplitude = options.amplitude;
        }

        if (shouldInvalidateCache) {
            this._invalidateHeightmapCache();
        }
    }
}
