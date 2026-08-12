// TerrainDataGenerator.js
class TerrainDataGenerator {
    constructor(width, depth, options = {}) {
        this.width = width;
        this.depth = depth;
        // 默认参数
        this.seed = options.seed || Math.random();
        this.roughness = options.roughness || 60; // 崎岖�?
        this.amplitude = options.amplitude || 30; // 高度振幅

        // 初始化噪声库 (需确保外部已加�?SimplexNoise)
        if (typeof SimplexNoise === 'undefined') {
            console.error('SimplexNoise library is required!');
        } else {
            this.simplex = new SimplexNoise(this.seed.toString());
        }

        this.minH = 0;
        this.maxH = 0;
        this._heightmapCache = null;
        this._heightmapCacheKey = null;
        this._seedHashCache = null;
        this._seedHashCacheKey = null;
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

    _getSeedHash() {
        const seedKey = this.seed.toString();
        if (this._seedHashCacheKey === seedKey && this._seedHashCache !== null) {
            return this._seedHashCache;
        }

        let hash = 2166136261;
        for (let i = 0; i < seedKey.length; i++) {
            hash ^= seedKey.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }

        this._seedHashCacheKey = seedKey;
        this._seedHashCache = hash >>> 0;

        return this._seedHashCache;
    }

    _random01FromIndex(index, salt = 0) {
        const seedHash = this._getSeedHash();
        const value = Math.sin((index + 1) * 12.9898 + (salt + 1) * 78.233 + seedHash * 0.00013) * 43758.5453123;

        return value - Math.floor(value);
    }

    _sampleMacroTerrainControls(x, z, roughness, continent) {
        const basinWarp = this._warp2D(
            x - 512.8,
            z + 266.1,
            roughness * 6.8,
            roughness * 0.62
        );
        const basinSource = this._fbm(basinWarp.x, basinWarp.z, roughness * 7.2, 3, 1.85, 0.58);
        const basinFloor = this._clamp(
            1 - this._smoothstep(-0.48, 0.42, basinSource + continent * 0.18),
            0,
            1
        );
        const watershedSource = this._ridged(
            basinWarp.x * 0.58 + basinWarp.z * 0.16,
            basinWarp.z * 0.72 - basinWarp.x * 0.11,
            roughness * 4.8,
            3,
            1.85,
            0.56
        );
        const watershedDivide = this._smoothstep(0.5, 0.86, watershedSource) * (1 - basinFloor * 0.45);

        return {
            basinFloor,
            watershedDivide: this._clamp(watershedDivide, 0, 1)
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
        const raindropTraceMap = this._applyRaindropErosion(heights, size, {
            drops: Math.min(2600, Math.max(450, Math.floor(size * size * 0.055))),
            maxSteps: 12,
            erodeStrength: Math.max(Math.abs(this.amplitude) * 0.0015, 0.016),
            depositStrength: Math.max(Math.abs(this.amplitude) * 0.0038, 0.032)
        });

        const preliminaryHydroMap = this._buildFlowDepositMap(heights, size, raindropTraceMap);
        this._applyFlowErosion(heights, size, preliminaryHydroMap, {
            carveStrength: Math.max(Math.abs(this.amplitude) * 0.011, 0.05),
            depositStrength: Math.max(Math.abs(this.amplitude) * 0.018, 0.065)
        });
        this._relaxNarrowGullies(heights, size, preliminaryHydroMap, {
            iterations: 3,
            strength: 0.38,
            concavity: Math.max(Math.abs(this.amplitude) * 0.025, 0.32),
            cliffThreshold: Math.max(Math.abs(this.amplitude) * 0.48, 8)
        });

        min = Infinity;
        max = -Infinity;
        for (let i = 0; i < heights.length; i++) {
            const h = heights[i];
            if (h < min) min = h;
            if (h > max) max = h;
        }

        const slopeMap = this._buildSlopeMap(heights, size);
        const hydroMap = this._buildFlowDepositMap(heights, size, raindropTraceMap);
        const moistureMap = this._buildMoistureMap(
            heights,
            slopeMap.values,
            hydroMap,
            size,
            min,
            max,
            slopeMap.min,
            slopeMap.max
        );
        const temperatureMap = this._buildTemperatureMap(
            heights,
            slopeMap.values,
            moistureMap.values,
            size,
            min,
            max,
            slopeMap.min,
            slopeMap.max
        );
        const surfaceClassMap = this._buildSurfaceClassMap(
            heights,
            slopeMap.values,
            hydroMap,
            moistureMap.values,
            size,
            min,
            max,
            slopeMap.min,
            slopeMap.max
        );
        const ecoZoneMap = this._buildEcoZoneMap(
            heights,
            slopeMap.values,
            hydroMap,
            moistureMap.values,
            temperatureMap.values,
            surfaceClassMap,
            size,
            min,
            max,
            slopeMap.min,
            slopeMap.max
        );
        const surfaceClassCounts = this._buildSurfaceClassCounts(surfaceClassMap);

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
            flowMap: hydroMap.flow,
            depositMap: hydroMap.deposit,
            channelMap: hydroMap.channel,
            rainWearMap: raindropTraceMap.wear,
            rainDepositMap: raindropTraceMap.deposit,
            moistureMap: moistureMap.values,
            temperatureMap: temperatureMap.values,
            surfaceClassMap,
            ecoZoneMap: ecoZoneMap.values,
            surfaceClassCounts,
            ecoZoneCounts: ecoZoneMap.counts,
            slopeMin: slopeMap.min,
            slopeMax: slopeMap.max,
            flowMin: hydroMap.flowMin,
            flowMax: hydroMap.flowMax,
            depositMin: hydroMap.depositMin,
            depositMax: hydroMap.depositMax,
            channelMin: hydroMap.channelMin,
            channelMax: hydroMap.channelMax,
            rainWearMin: raindropTraceMap.wearMin,
            rainWearMax: raindropTraceMap.wearMax,
            rainDepositMin: raindropTraceMap.depositMin,
            rainDepositMax: raindropTraceMap.depositMax,
            moistureMin: moistureMap.min,
            moistureMax: moistureMap.max,
            temperatureMin: temperatureMap.min,
            temperatureMax: temperatureMap.max,
            ecoZoneMin: ecoZoneMap.min,
            ecoZoneMax: ecoZoneMap.max,
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

    _classifySurface(elevationBand, slopeBand, rockExposure, alluvialInfluence = 0) {
        if (![0, 1, 2].includes(elevationBand) || ![0, 1, 2].includes(slopeBand)) {
            return 0;
        }

        // Surface class range: 0-7, from low/flat terrain to exposed high ridges.
        const isExposed = Number.isFinite(rockExposure) && rockExposure >= 0.65;
        const isAlluvial = Number.isFinite(alluvialInfluence) && alluvialInfluence >= 0.58;

        if (elevationBand === 0) {
            if (isAlluvial) {
                return 0;
            }

            return isExposed || slopeBand === 2 ? 1 : 0;
        }
        if (elevationBand === 1) {
            if (isAlluvial && !isExposed) {
                return 2;
            }

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

    _buildSurfaceClassMap(heights, slopes, hydroMap, moisture, size, minHeight, maxHeight, minSlope, maxSlope) {
        if (!heights || heights.length !== size * size || !slopes || slopes.length !== heights.length) {
            throw new Error('Surface class map requires matching square height and slope arrays.');
        }

        const classes = new Uint8Array(heights.length);
        const heightRange = maxHeight - minHeight;
        const slopeRange = maxSlope - minSlope;
        const hasHydrology = hydroMap
            && hydroMap.flow
            && hydroMap.deposit
            && hydroMap.flow.length === heights.length
            && hydroMap.deposit.length === heights.length;
        const hasChannel = hasHydrology
            && hydroMap.channel
            && hydroMap.channel.length === heights.length;
        const hasMoisture = moisture && moisture.length === heights.length;

        for (let i = 0; i < heights.length; i++) {
            const normalizedHeight = heightRange > 0
                ? this._clamp((heights[i] - minHeight) / heightRange, 0, 1)
                : 0;
            const normalizedSlope = slopeRange > 0
                ? this._clamp((slopes[i] - minSlope) / slopeRange, 0, 1)
                : 0;
            const flow = hasHydrology ? this._clamp(hydroMap.flow[i], 0, 1) : 0;
            const deposit = hasHydrology ? this._clamp(hydroMap.deposit[i], 0, 1) : 0;
            const channel = hasChannel ? this._clamp(hydroMap.channel[i], 0, 1) : flow;
            const moistureValue = hasMoisture ? this._clamp(moisture[i], 0, 1) : 0;
            const lowMidTerrain = 1 - this._smoothstep(0.58, 0.86, normalizedHeight);
            const alluvialInfluence = this._clamp(
                (deposit * 0.42 + flow * 0.22 + channel * 0.22 + moistureValue * 0.14) * lowMidTerrain,
                0,
                1
            );
            const effectiveHeight = this._clamp(normalizedHeight - alluvialInfluence * 0.08, 0, 1);
            const effectiveSlope = this._clamp(normalizedSlope * (1 - alluvialInfluence * 0.48), 0, 1);
            const elevationBand = effectiveHeight < 0.33 ? 0 : effectiveHeight < 0.66 ? 1 : 2;
            const slopeBand = effectiveSlope < 0.33 ? 0 : effectiveSlope < 0.66 ? 1 : 2;
            const rockExposure = this._clamp(
                effectiveSlope * 0.7 + effectiveHeight * 0.3 - alluvialInfluence * 0.32 + (1 - moistureValue) * 0.05,
                0,
                1
            );

            classes[i] = this._classifySurface(elevationBand, slopeBand, rockExposure, alluvialInfluence);
        }

        return classes;
    }

    _buildSurfaceClassCounts(classes) {
        if (!classes || typeof classes.length !== 'number') {
            throw new Error('Surface class counts require a class array.');
        }

        const counts = new Uint32Array(8);

        for (let i = 0; i < classes.length; i++) {
            const surfaceClass = classes[i];
            if (Number.isInteger(surfaceClass) && surfaceClass >= 0 && surfaceClass < counts.length) {
                counts[surfaceClass]++;
            }
        }

        return counts;
    }

    _classifyEcoZone(normalizedHeight, normalizedSlope, flow, deposit, channel, moisture, temperature, surfaceClass) {
        const coldness = 1 - temperature;
        const drainage = Math.max(channel, flow * 0.62);
        const alluvial = this._clamp(deposit * 0.5 + drainage * 0.28 + moisture * 0.22, 0, 1);
        const exposedHigh = surfaceClass >= 6 || normalizedHeight > 0.72 || normalizedSlope > 0.78;

        // Eco-zone range: 0 cool/wet lowland, 1 arid lowland, 2 riparian/alluvial,
        // 3 temperate upland, 4 alpine scrub, 5 snow/ice cap.
        if ((coldness > 0.72 && normalizedHeight > 0.58) || (surfaceClass === 7 && coldness > 0.6)) {
            return 5;
        }
        if (alluvial > 0.58 && normalizedHeight < 0.62) {
            return 2;
        }
        if (exposedHigh || coldness > 0.56 && normalizedHeight > 0.48) {
            return 4;
        }
        if (temperature > 0.62 && moisture < 0.36 && drainage < 0.36) {
            return 1;
        }
        if (moisture > 0.58 && temperature < 0.62 && normalizedHeight < 0.58) {
            return 0;
        }

        return 3;
    }

    _buildEcoZoneMap(heights, slopes, hydroMap, moisture, temperature, surfaceClasses, size, minHeight, maxHeight, minSlope, maxSlope) {
        if (
            !heights ||
            heights.length !== size * size ||
            !slopes ||
            slopes.length !== heights.length ||
            !hydroMap ||
            !hydroMap.flow ||
            !hydroMap.deposit ||
            !hydroMap.channel ||
            !moisture ||
            moisture.length !== heights.length ||
            !temperature ||
            temperature.length !== heights.length ||
            !surfaceClasses ||
            surfaceClasses.length !== heights.length
        ) {
            throw new Error('Eco-zone map requires matching terrain, hydrology, climate, and surface arrays.');
        }

        const zones = new Float32Array(heights.length);
        const counts = new Uint32Array(6);
        const heightRange = maxHeight - minHeight;
        const slopeRange = maxSlope - minSlope;
        let min = Infinity;
        let max = -Infinity;

        for (let i = 0; i < heights.length; i++) {
            const normalizedHeight = heightRange > 0
                ? this._clamp((heights[i] - minHeight) / heightRange, 0, 1)
                : 0;
            const normalizedSlope = slopeRange > 0
                ? this._clamp((slopes[i] - minSlope) / slopeRange, 0, 1)
                : 0;
            const zoneClass = this._classifyEcoZone(
                normalizedHeight,
                normalizedSlope,
                this._clamp(hydroMap.flow[i], 0, 1),
                this._clamp(hydroMap.deposit[i], 0, 1),
                this._clamp(hydroMap.channel[i], 0, 1),
                this._clamp(moisture[i], 0, 1),
                this._clamp(temperature[i], 0, 1),
                surfaceClasses[i]
            );
            const value = this._clamp(zoneClass / 5, 0, 1);

            zones[i] = value;
            counts[zoneClass]++;
            if (value < min) min = value;
            if (value > max) max = value;
        }

        return {
            values: zones,
            counts,
            min: Number.isFinite(min) ? min : 0,
            max: Number.isFinite(max) ? max : 0
        };
    }

    _normalizePositiveTraceMap(values) {
        if (!values || typeof values.length !== 'number') {
            throw new Error('Trace map normalization requires an array-like value.');
        }

        const normalized = new Float32Array(values.length);
        let max = 0;
        let nonZero = 0;

        for (let i = 0; i < values.length; i++) {
            const value = Number.isFinite(values[i]) ? Math.max(0, values[i]) : 0;
            if (value > 0) {
                nonZero++;
            }
            if (value > max) {
                max = value;
            }
        }

        if (max > 0) {
            for (let i = 0; i < values.length; i++) {
                const value = Number.isFinite(values[i]) ? Math.max(0, values[i]) : 0;
                normalized[i] = this._clamp(value / max, 0, 1);
            }
        }

        return {
            values: normalized,
            min: 0,
            max: max > 0 ? 1 : 0,
            rawMax: max,
            nonZero
        };
    }

    _createEmptyRaindropTraceMap(length) {
        return {
            wear: new Float32Array(length),
            deposit: new Float32Array(length),
            wearMin: 0,
            wearMax: 0,
            wearRawMax: 0,
            wearNonZero: 0,
            depositMin: 0,
            depositMax: 0,
            depositRawMax: 0,
            depositNonZero: 0
        };
    }

    _finalizeRaindropTraceMap(wearMap, depositMap) {
        const wear = this._normalizePositiveTraceMap(wearMap);
        const deposit = this._normalizePositiveTraceMap(depositMap);

        return {
            wear: wear.values,
            deposit: deposit.values,
            wearMin: wear.min,
            wearMax: wear.max,
            wearRawMax: wear.rawMax,
            wearNonZero: wear.nonZero,
            depositMin: deposit.min,
            depositMax: deposit.max,
            depositRawMax: deposit.rawMax,
            depositNonZero: deposit.nonZero
        };
    }

    _buildFlowDepositMap(heights, size, raindropTraceMap = null) {
        if (!heights || heights.length !== size * size) {
            throw new Error('Flow/deposit maps require a square height array and matching size.');
        }

        const flow = new Float32Array(heights.length);
        const deposit = new Float32Array(heights.length);
        const downstream = new Int32Array(heights.length);
        const descent = new Float32Array(heights.length);
        const indices = Array.from({ length: heights.length }, (_, index) => index);
        const cellWidth = this.width / Math.max(size - 1, 1);
        const cellDepth = this.depth / Math.max(size - 1, 1);
        const heightScale = Math.max(Math.abs(this.amplitude) * 0.18, 0.0001);
        const neighbors = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1]
        ];

        flow.fill(1);
        downstream.fill(-1);
        indices.sort((a, b) => heights[b] - heights[a]);

        let maxDescent = 0;
        for (const index of indices) {
            const x = Math.floor(index / size);
            const z = index - x * size;
            const currentHeight = heights[index];
            let steepestIndex = -1;
            let steepestSlope = 0;

            for (const [dx, dz] of neighbors) {
                const nx = x + dx;
                const nz = z + dz;

                if (nx < 0 || nx >= size || nz < 0 || nz >= size) {
                    continue;
                }

                const neighborIndex = nx * size + nz;
                const drop = currentHeight - heights[neighborIndex];

                if (drop <= 0) {
                    continue;
                }

                const distance = Math.max(
                    Math.sqrt((dx * cellWidth) ** 2 + (dz * cellDepth) ** 2),
                    0.0001
                );
                const slope = drop / distance;

                if (slope > steepestSlope) {
                    steepestSlope = slope;
                    steepestIndex = neighborIndex;
                }
            }

            downstream[index] = steepestIndex;
            descent[index] = steepestSlope;
            if (steepestSlope > maxDescent) {
                maxDescent = steepestSlope;
            }

            if (steepestIndex !== -1) {
                flow[steepestIndex] += flow[index];
            }
        }

        let logFlowMin = Infinity;
        let logFlowMax = -Infinity;
        for (let i = 0; i < flow.length; i++) {
            const logFlow = Math.log1p(flow[i]);
            if (logFlow < logFlowMin) logFlowMin = logFlow;
            if (logFlow > logFlowMax) logFlowMax = logFlow;
        }

        const logFlowRange = logFlowMax - logFlowMin;
        let flowMin = Infinity;
        let flowMax = -Infinity;
        let depositMin = Infinity;
        let depositMax = -Infinity;
        const hasRainTrace = raindropTraceMap
            && raindropTraceMap.wear
            && raindropTraceMap.deposit
            && raindropTraceMap.wear.length === heights.length
            && raindropTraceMap.deposit.length === heights.length;

        for (let index = 0; index < heights.length; index++) {
            const x = Math.floor(index / size);
            const z = index - x * size;
            let higherNeighbors = 0;
            let neighborCount = 0;
            let neighborHeightTotal = 0;

            for (const [dx, dz] of neighbors) {
                const nx = x + dx;
                const nz = z + dz;

                if (nx < 0 || nx >= size || nz < 0 || nz >= size) {
                    continue;
                }

                const neighborHeight = heights[nx * size + nz];
                neighborHeightTotal += neighborHeight;
                neighborCount++;

                if (neighborHeight > heights[index]) {
                    higherNeighbors++;
                }
            }

            const normalizedFlow = logFlowRange > 0
                ? this._clamp((Math.log1p(flow[index]) - logFlowMin) / logFlowRange, 0, 1)
                : 0;
            const normalizedDescent = maxDescent > 0
                ? this._clamp(descent[index] / maxDescent, 0, 1)
                : 0;
            const meanNeighborHeight = neighborCount > 0
                ? neighborHeightTotal / neighborCount
                : heights[index];
            const concavity = this._clamp((meanNeighborHeight - heights[index]) / heightScale, 0, 1);
            const enclosedness = neighborCount > 0
                ? this._clamp((higherNeighbors / neighborCount - 0.35) / 0.65, 0, 1)
                : 0;
            const catchment = this._smoothstep(0.08, 0.78, normalizedFlow);
            const lowGradient = 1 - this._smoothstep(0.08, 0.48, normalizedDescent);
            const depositStrength = this._clamp(
                catchment * (lowGradient * 0.55 + concavity * 0.3 + enclosedness * 0.15),
                0,
                1
            );
            const rainWear = hasRainTrace ? this._clamp(raindropTraceMap.wear[index], 0, 1) : 0;
            const rainDeposit = hasRainTrace ? this._clamp(raindropTraceMap.deposit[index], 0, 1) : 0;
            const rainAlluvial = this._smoothstep(0.06, 0.82, rainDeposit)
                * (1 - normalizedDescent * 0.35);
            const rainIncision = this._smoothstep(0.08, 0.88, rainWear)
                * this._smoothstep(0.04, 0.58, normalizedDescent);
            const combinedDeposit = this._clamp(
                depositStrength * (1 - rainAlluvial * 0.18)
                    + rainAlluvial * (0.22 + lowGradient * 0.18)
                    - rainIncision * 0.08,
                0,
                1
            );

            flow[index] = normalizedFlow;
            deposit[index] = combinedDeposit;
            if (normalizedFlow < flowMin) flowMin = normalizedFlow;
            if (normalizedFlow > flowMax) flowMax = normalizedFlow;
            if (combinedDeposit < depositMin) depositMin = combinedDeposit;
            if (combinedDeposit > depositMax) depositMax = combinedDeposit;
        }

        const channelMap = this._buildChannelNetworkMap(
            flow,
            deposit,
            downstream,
            descent,
            maxDescent,
            indices,
            raindropTraceMap
        );

        return {
            flow,
            deposit,
            channel: channelMap.values,
            flowMin: Number.isFinite(flowMin) ? flowMin : 0,
            flowMax: Number.isFinite(flowMax) ? flowMax : 0,
            depositMin: Number.isFinite(depositMin) ? depositMin : 0,
            depositMax: Number.isFinite(depositMax) ? depositMax : 0,
            channelMin: channelMap.min,
            channelMax: channelMap.max
        };
    }

    _buildChannelNetworkMap(flow, deposit, downstream, descent, maxDescent, orderedIndices, raindropTraceMap = null) {
        if (
            !flow ||
            !deposit ||
            !downstream ||
            !descent ||
            flow.length !== deposit.length ||
            flow.length !== downstream.length ||
            flow.length !== descent.length
        ) {
            throw new Error('Channel network map requires matching hydrology arrays.');
        }

        const channel = new Float32Array(flow.length);
        const indices = Array.isArray(orderedIndices)
            ? orderedIndices
            : Array.from({ length: flow.length }, (_, index) => index);
        const hasRainTrace = raindropTraceMap
            && raindropTraceMap.wear
            && raindropTraceMap.wear.length === flow.length;

        for (let i = 0; i < flow.length; i++) {
            const normalizedFlow = this._clamp(flow[i], 0, 1);
            const normalizedDeposit = this._clamp(deposit[i], 0, 1);
            const normalizedDescent = maxDescent > 0
                ? this._clamp(descent[i] / maxDescent, 0, 1)
                : 0;
            const flowCore = this._smoothstep(0.7, 0.97, normalizedFlow);
            const routeGradient = 0.28 + this._smoothstep(0.06, 0.46, normalizedDescent) * 0.72;
            const sedimentBreak = 1 - this._smoothstep(0.46, 0.86, normalizedDeposit) * 0.42;
            const rainWear = hasRainTrace ? this._clamp(raindropTraceMap.wear[i], 0, 1) : 0;
            const rainChannel = this._smoothstep(0.4, 0.96, rainWear)
                * (0.24 + routeGradient * 0.46 + normalizedFlow * 0.18)
                * (1 - normalizedDeposit * 0.32);
            const flowChannel = flowCore * routeGradient * sedimentBreak;

            channel[i] = this._clamp(Math.max(flowChannel, rainChannel), 0, 1);
        }

        for (const index of indices) {
            const downstreamIndex = downstream[index];
            if (downstreamIndex < 0 || downstreamIndex >= channel.length) {
                continue;
            }

            const carriedChannel = channel[index] * 0.52;
            if (carriedChannel > channel[downstreamIndex]) {
                channel[downstreamIndex] = carriedChannel;
            }
        }

        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < channel.length; i++) {
            const value = Number.isFinite(channel[i]) ? this._clamp(channel[i], 0, 1) : 0;
            channel[i] = value;
            if (value < min) min = value;
            if (value > max) max = value;
        }

        return {
            values: channel,
            min: Number.isFinite(min) ? min : 0,
            max: Number.isFinite(max) ? max : 0
        };
    }

    _buildMoistureMap(heights, slopes, hydroMap, size, minHeight, maxHeight, minSlope, maxSlope) {
        if (!heights || heights.length !== size * size || !slopes || slopes.length !== heights.length) {
            throw new Error('Moisture map requires matching square height and slope arrays.');
        }
        if (!hydroMap || !hydroMap.flow || !hydroMap.deposit) {
            throw new Error('Moisture map requires flow and deposit maps.');
        }

        const moisture = new Float32Array(heights.length);
        const heightRange = maxHeight - minHeight;
        const slopeRange = maxSlope - minSlope;
        const roughness = Math.max(this.roughness, 1);
        let min = Infinity;
        let max = -Infinity;

        for (let x = 0; x < size; x++) {
            for (let z = 0; z < size; z++) {
                const index = x * size + z;
                const worldX = (x / Math.max(size - 1, 1)) * this.width;
                const worldZ = (z / Math.max(size - 1, 1)) * this.depth;
                const climateWarp = this._warp2D(
                    worldX + 401.2,
                    worldZ - 197.6,
                    roughness * 5.4,
                    roughness * 0.32
                );
                const baseMoisture = this._clamp(
                    (this._fbm(climateWarp.x, climateWarp.z, roughness * 3.6, 4, 2, 0.52) + 1) * 0.5,
                    0,
                    1
                );
                const broadRainBand = this._clamp(
                    (this._fbm(worldX - 911.4, worldZ + 315.7, roughness * 8.5, 3, 1.9, 0.58) + 1) * 0.5,
                    0,
                    1
                );
                const normalizedHeight = heightRange > 0
                    ? this._clamp((heights[index] - minHeight) / heightRange, 0, 1)
                    : 0;
                const normalizedSlope = slopeRange > 0
                    ? this._clamp((slopes[index] - minSlope) / slopeRange, 0, 1)
                    : 0;
                const valleyMoisture = this._clamp(hydroMap.flow[index], 0, 1) * 0.2
                    + this._clamp(hydroMap.deposit[index], 0, 1) * 0.34;
                const exposureDryness = normalizedHeight * 0.16 + normalizedSlope * 0.18;
                const value = this._clamp(
                    baseMoisture * 0.5 + broadRainBand * 0.22 + valleyMoisture - exposureDryness + 0.06,
                    0,
                    1
                );

                moisture[index] = value;
                if (value < min) min = value;
                if (value > max) max = value;
            }
        }

        return {
            values: moisture,
            min: Number.isFinite(min) ? min : 0,
            max: Number.isFinite(max) ? max : 0
        };
    }

    _buildTemperatureMap(heights, slopes, moisture, size, minHeight, maxHeight, minSlope, maxSlope) {
        if (!heights || heights.length !== size * size || !slopes || slopes.length !== heights.length) {
            throw new Error('Temperature map requires matching square height and slope arrays.');
        }
        if (!moisture || moisture.length !== heights.length) {
            throw new Error('Temperature map requires a matching moisture array.');
        }

        const temperature = new Float32Array(heights.length);
        const heightRange = maxHeight - minHeight;
        const slopeRange = maxSlope - minSlope;
        const roughness = Math.max(this.roughness, 1);
        let min = Infinity;
        let max = -Infinity;

        for (let x = 0; x < size; x++) {
            for (let z = 0; z < size; z++) {
                const index = x * size + z;
                const worldX = (x / Math.max(size - 1, 1)) * this.width;
                const worldZ = (z / Math.max(size - 1, 1)) * this.depth;
                const climateWarp = this._warp2D(
                    worldX - 628.4,
                    worldZ + 512.9,
                    roughness * 7.6,
                    roughness * 0.42
                );
                const broadHeatBand = this._clamp(
                    (this._fbm(climateWarp.x, climateWarp.z, roughness * 6.4, 3, 1.9, 0.56) + 1) * 0.5,
                    0,
                    1
                );
                const localHeatPatch = this._clamp(
                    (this._fbm(worldX + 217.3, worldZ - 761.5, roughness * 2.8, 3, 2, 0.48) + 1) * 0.5,
                    0,
                    1
                );
                const latitudeWarmth = 1 - Math.abs((z / Math.max(size - 1, 1)) * 2 - 1);
                const normalizedHeight = heightRange > 0
                    ? this._clamp((heights[index] - minHeight) / heightRange, 0, 1)
                    : 0;
                const normalizedSlope = slopeRange > 0
                    ? this._clamp((slopes[index] - minSlope) / slopeRange, 0, 1)
                    : 0;
                const moistureCooling = this._clamp(moisture[index], 0, 1) * 0.08;
                const elevationCooling = normalizedHeight * 0.34 + normalizedSlope * 0.06;
                const value = this._clamp(
                    broadHeatBand * 0.42
                        + latitudeWarmth * 0.26
                        + localHeatPatch * 0.16
                        + 0.18
                        - elevationCooling
                        - moistureCooling,
                    0,
                    1
                );

                temperature[index] = value;
                if (value < min) min = value;
                if (value > max) max = value;
            }
        }

        return {
            values: temperature,
            min: Number.isFinite(min) ? min : 0,
            max: Number.isFinite(max) ? max : 0
        };
    }

    _applyRaindropErosion(heights, size, options = {}) {
        if (!heights || heights.length !== size * size) {
            throw new Error('Raindrop erosion requires a square height array and matching size.');
        }

        const drops = Math.max(0, Math.floor(options.drops ?? Math.min(6000, size * size * 0.12)));
        const maxSteps = Math.max(0, Math.floor(options.maxSteps ?? 16));
        const erodeStrength = Math.max(0, options.erodeStrength ?? Math.abs(this.amplitude) * 0.003);
        const depositStrength = Math.max(0, options.depositStrength ?? Math.abs(this.amplitude) * 0.002);
        const heightScale = Math.max(Math.abs(this.amplitude) * 0.14, 0.0001);
        const edgeFadeDistance = Math.max(size * 0.055, 1);
        const wearMap = new Float32Array(heights.length);
        const depositMap = new Float32Array(heights.length);
        const neighbors = [
            [1, 0, 1],
            [-1, 0, 1],
            [0, 1, 1],
            [0, -1, 1],
            [1, 1, Math.SQRT2],
            [1, -1, Math.SQRT2],
            [-1, 1, Math.SQRT2],
            [-1, -1, Math.SQRT2]
        ];

        if (size < 3 || drops === 0 || maxSteps === 0 || (erodeStrength === 0 && depositStrength === 0)) {
            return this._createEmptyRaindropTraceMap(heights.length);
        }

        for (let drop = 0; drop < drops; drop++) {
            let x = 1 + Math.floor(this._random01FromIndex(drop, 17) * (size - 2));
            let z = 1 + Math.floor(this._random01FromIndex(drop, 43) * (size - 2));
            let sediment = 0;
            let water = 1;

            for (let step = 0; step < maxSteps; step++) {
                const index = x * size + z;
                const currentHeight = heights[index];
                let nextX = x;
                let nextZ = z;
                let steepestDrop = 0;

                for (const [dx, dz, distance] of neighbors) {
                    const nx = x + dx;
                    const nz = z + dz;

                    if (nx <= 0 || nx >= size - 1 || nz <= 0 || nz >= size - 1) {
                        continue;
                    }

                    const neighborIndex = nx * size + nz;
                    const downhill = (currentHeight - heights[neighborIndex]) / distance;
                    if (downhill > steepestDrop) {
                        steepestDrop = downhill;
                        nextX = nx;
                        nextZ = nz;
                    }
                }

                const edgeDistance = Math.min(x, z, size - 1 - x, size - 1 - z);
                const edgeFade = this._clamp(edgeDistance / edgeFadeDistance, 0, 1);

                if (steepestDrop <= 0 || nextX === x && nextZ === z) {
                    const settling = Math.min(sediment, depositStrength * water * edgeFade);
                    if (Number.isFinite(settling) && settling > 0) {
                        heights[index] += settling;
                        depositMap[index] += settling;
                    }
                    break;
                }

                const normalizedDrop = this._clamp(steepestDrop / heightScale, 0, 1);
                const capacity = Math.max(0, normalizedDrop * water * Math.abs(this.amplitude) * 0.018);

                if (sediment < capacity) {
                    const erosion = Math.min(
                        erodeStrength * (0.32 + water * 0.68) * normalizedDrop * edgeFade,
                        capacity - sediment
                    );
                    if (Number.isFinite(erosion) && erosion > 0) {
                        heights[index] -= erosion;
                        wearMap[index] += erosion;
                        sediment += erosion * 0.82;
                    }
                } else {
                    const settling = Math.min(
                        sediment - capacity,
                        depositStrength * (1 - normalizedDrop * 0.45) * water * edgeFade
                    );
                    if (Number.isFinite(settling) && settling > 0) {
                        heights[index] += settling;
                        depositMap[index] += settling;
                        sediment -= settling;
                    }
                }

                x = nextX;
                z = nextZ;
                water *= 0.91;
                if (water < 0.12) {
                    break;
                }
            }
        }

        return this._finalizeRaindropTraceMap(wearMap, depositMap);
    }

    _applyFlowErosion(heights, size, hydroMap, options = {}) {
        if (!heights || heights.length !== size * size) {
            throw new Error('Flow erosion requires a square height array and matching size.');
        }
        if (
            !hydroMap ||
            !hydroMap.flow ||
            !hydroMap.deposit ||
            hydroMap.flow.length !== heights.length ||
            hydroMap.deposit.length !== heights.length
        ) {
            throw new Error('Flow erosion requires matching flow and deposit maps.');
        }

        const carveStrength = Math.max(0, options.carveStrength ?? Math.abs(this.amplitude) * 0.03);
        const depositStrength = Math.max(0, options.depositStrength ?? Math.abs(this.amplitude) * 0.01);
        const edgeFadeDistance = Math.max(size * 0.06, 1);

        for (let x = 0; x < size; x++) {
            for (let z = 0; z < size; z++) {
                const index = x * size + z;
                const flow = this._clamp(hydroMap.flow[index], 0, 1);
                const deposit = this._clamp(hydroMap.deposit[index], 0, 1);
                const channel = this._clamp(hydroMap.channel ? hydroMap.channel[index] : flow, 0, 1);
                const edgeDistance = Math.min(x, z, size - 1 - x, size - 1 - z);
                const edgeFade = this._clamp(edgeDistance / edgeFadeDistance, 0, 1);
                const drainageCut = Math.max(flow * 0.58, channel);
                const channelCut = this._smoothstep(0.48, 0.9, drainageCut) * (1 - deposit * 0.72);
                const sedimentFill = this._smoothstep(0.14, 0.68, deposit) * (1 - flow * 0.24);
                const heightDelta = (sedimentFill * depositStrength - channelCut * carveStrength) * edgeFade;

                if (Number.isFinite(heightDelta)) {
                    heights[index] += heightDelta;
                }
            }
        }

        return heights;
    }

    _relaxNarrowGullies(heights, size, hydroMap, options = {}) {
        if (!heights || heights.length !== size * size) {
            throw new Error('Gully relaxation requires a square height array and matching size.');
        }
        if (
            !hydroMap ||
            !hydroMap.flow ||
            hydroMap.flow.length !== heights.length
        ) {
            throw new Error('Gully relaxation requires a matching flow map.');
        }

        const iterations = Math.max(0, Math.floor(options.iterations ?? 1));
        const strength = this._clamp(options.strength ?? 0.22, 0, 1);
        const concavity = Math.max(0, options.concavity ?? Math.abs(this.amplitude) * 0.035);
        const cliffThreshold = Math.max(concavity, options.cliffThreshold ?? Math.abs(this.amplitude) * 0.48);
        const neighbors = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1]
        ];

        for (let iteration = 0; iteration < iterations; iteration++) {
            const delta = new Float32Array(heights.length);

            for (let x = 1; x < size - 1; x++) {
                for (let z = 1; z < size - 1; z++) {
                    const index = x * size + z;
                    const currentHeight = heights[index];
                    let neighborTotal = 0;
                    let maxDrop = 0;

                    for (const [dx, dz] of neighbors) {
                        const neighborHeight = heights[(x + dx) * size + z + dz];
                        neighborTotal += neighborHeight;
                        maxDrop = Math.max(maxDrop, Math.abs(currentHeight - neighborHeight));
                    }

                    const neighborMean = neighborTotal / neighbors.length;
                    const belowMean = neighborMean - currentHeight;
                    if (belowMean <= concavity) {
                        continue;
                    }

                    const flow = this._clamp(hydroMap.flow[index], 0, 1);
                    const channel = this._clamp(hydroMap.channel ? hydroMap.channel[index] : flow, 0, 1);
                    const drainage = Math.max(channel, flow * 0.58);
                    const drainageMask = this._smoothstep(0.34, 0.78, drainage);
                    const narrowFloorMask = this._smoothstep(concavity, concavity * 3.4, belowMean);
                    const cliffGuard = 1 - this._smoothstep(cliffThreshold * 0.72, cliffThreshold, maxDrop);
                    const fill = belowMean * strength * drainageMask * narrowFloorMask * cliffGuard;

                    if (Number.isFinite(fill) && fill > 0) {
                        delta[index] += fill;
                    }
                }
            }

            for (let i = 0; i < heights.length; i++) {
                heights[i] += delta[i];
            }
        }

        return heights;
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

    _sampleScalarMapCache(map, cache, u, v) {
        if (!map || !cache || map.length !== cache.size * cache.size) {
            return 0;
        }

        const gridU = this._clamp(u, 0, 1) * cache.segments;
        const gridV = this._clamp(v, 0, 1) * cache.segments;

        const u0 = Math.floor(gridU);
        const v0 = Math.floor(gridV);
        const u1 = Math.min(u0 + 1, cache.segments);
        const v1 = Math.min(v0 + 1, cache.segments);
        const uT = gridU - u0;
        const vT = gridV - v0;

        const m00 = map[u0 * cache.size + v0];
        const m10 = map[u1 * cache.size + v0];
        const m01 = map[u0 * cache.size + v1];
        const m11 = map[u1 * cache.size + v1];
        const m0 = m00 + (m10 - m00) * uT;
        const m1 = m01 + (m11 - m01) * uT;
        const value = m0 + (m1 - m0) * vT;

        return Number.isFinite(value) ? this._clamp(value, 0, 1) : 0;
    }

    _sampleFlowMapCache(u, v, segments = 200) {
        const cache = this._buildHeightmapCache(segments);

        return this._sampleScalarMapCache(cache.flowMap, cache, u, v);
    }

    _sampleDepositMapCache(u, v, segments = 200) {
        const cache = this._buildHeightmapCache(segments);

        return this._sampleScalarMapCache(cache.depositMap, cache, u, v);
    }

    _sampleChannelMapCache(u, v, segments = 200) {
        const cache = this._buildHeightmapCache(segments);

        return this._sampleScalarMapCache(cache.channelMap, cache, u, v);
    }

    _sampleMoistureMapCache(u, v, segments = 200) {
        const cache = this._buildHeightmapCache(segments);

        return this._sampleScalarMapCache(cache.moistureMap, cache, u, v);
    }

    _sampleTemperatureMapCache(u, v, segments = 200) {
        const cache = this._buildHeightmapCache(segments);

        return this._sampleScalarMapCache(cache.temperatureMap, cache, u, v);
    }

    _sampleEcoZoneMapCache(u, v, segments = 200) {
        const cache = this._buildHeightmapCache(segments);

        return this._sampleScalarMapCache(cache.ecoZoneMap, cache, u, v);
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
        const cache = this._buildHeightmapCache(segments);
        const gridU = Math.round(this._clamp(u, 0, 1) * cache.segments);
        const gridV = Math.round(this._clamp(v, 0, 1) * cache.segments);
        const surfaceClass = cache.surfaceClassMap[gridU * cache.size + gridV];

        return Number.isInteger(surfaceClass) && surfaceClass >= 0 && surfaceClass <= 7 ? surfaceClass : 0;
    }

    _sampleSurfaceClassWeightsCache(u, v, radius = 1, segments = 200) {
        const cache = this._buildHeightmapCache(segments);
        const centerU = Math.round(this._clamp(u, 0, 1) * cache.segments);
        const centerV = Math.round(this._clamp(v, 0, 1) * cache.segments);
        const sampleRadius = Math.max(0, Math.floor(radius));
        const counts = new Uint32Array(8);
        let total = 0;

        for (let du = -sampleRadius; du <= sampleRadius; du++) {
            const gridU = centerU + du;
            if (gridU < 0 || gridU > cache.segments) {
                continue;
            }

            for (let dv = -sampleRadius; dv <= sampleRadius; dv++) {
                const gridV = centerV + dv;
                if (gridV < 0 || gridV > cache.segments) {
                    continue;
                }

                const surfaceClass = cache.surfaceClassMap[gridU * cache.size + gridV];
                if (Number.isInteger(surfaceClass) && surfaceClass >= 0 && surfaceClass < counts.length) {
                    counts[surfaceClass]++;
                    total++;
                }
            }
        }

        if (total === 0) {
            return Array.from(counts);
        }

        return Array.from(counts, count => count / total);
    }

    _sampleDominantSurfaceClassCache(u, v, radius = 1, segments = 200) {
        const weights = this._sampleSurfaceClassWeightsCache(u, v, radius, segments);
        const fallbackClass = this._sampleSurfaceClassCache(u, v, segments);
        let dominantClass = Number.isInteger(fallbackClass) ? fallbackClass : 0;
        let dominantWeight = Number.isFinite(weights[dominantClass]) ? weights[dominantClass] : -1;

        for (let surfaceClass = 0; surfaceClass < weights.length; surfaceClass++) {
            const weight = weights[surfaceClass];
            if (Number.isFinite(weight) && weight > dominantWeight) {
                dominantClass = surfaceClass;
                dominantWeight = weight;
            }
        }

        return dominantClass >= 0 && dominantClass <= 7 ? dominantClass : 0;
    }

    _sampleDominantSurfaceClassConfidenceCache(u, v, radius = 1, segments = 200) {
        const weights = this._sampleSurfaceClassWeightsCache(u, v, radius, segments);
        const dominantClass = this._sampleDominantSurfaceClassCache(u, v, radius, segments);
        const confidence = weights[dominantClass];

        return Number.isFinite(confidence) ? this._clamp(confidence, 0, 1) : 0;
    }

    _sampleSurfaceClassTransitionCache(u, v, radius = 1, segments = 200) {
        const confidence = this._sampleDominantSurfaceClassConfidenceCache(u, v, radius, segments);
        const transition = 1 - confidence;

        return Number.isFinite(transition) ? this._clamp(transition, 0, 1) : 0;
    }

    _sampleSurfaceClassEntropyCache(u, v, radius = 1, segments = 200) {
        const weights = this._sampleSurfaceClassWeightsCache(u, v, radius, segments);
        const maxEntropy = Math.log(weights.length);
        let entropy = 0;

        for (const weight of weights) {
            if (Number.isFinite(weight) && weight > 0) {
                entropy -= weight * Math.log(weight);
            }
        }

        if (!Number.isFinite(entropy) || !Number.isFinite(maxEntropy) || maxEntropy <= 0) {
            return 0;
        }

        return this._clamp(entropy / maxEntropy, 0, 1);
    }

    _sampleLocalReliefCache(u, v, radius = 1, segments = 200) {
        const cache = this._buildHeightmapCache(segments);
        const centerU = Math.round(this._clamp(u, 0, 1) * cache.segments);
        const centerV = Math.round(this._clamp(v, 0, 1) * cache.segments);
        const sampleRadius = Math.max(0, Math.floor(radius));
        const heightRange = cache.max - cache.min;
        let localMin = Infinity;
        let localMax = -Infinity;

        for (let du = -sampleRadius; du <= sampleRadius; du++) {
            const gridU = centerU + du;
            if (gridU < 0 || gridU > cache.segments) {
                continue;
            }

            for (let dv = -sampleRadius; dv <= sampleRadius; dv++) {
                const gridV = centerV + dv;
                if (gridV < 0 || gridV > cache.segments) {
                    continue;
                }

                const height = cache.heights[gridU * cache.size + gridV];
                if (height < localMin) localMin = height;
                if (height > localMax) localMax = height;
            }
        }

        if (!Number.isFinite(localMin) || !Number.isFinite(localMax) || !Number.isFinite(heightRange) || heightRange <= 0) {
            return 0;
        }

        return this._clamp((localMax - localMin) / heightRange, 0, 1);
    }

    _sampleLocalSlopeVarianceCache(u, v, radius = 1, segments = 200) {
        const cache = this._buildHeightmapCache(segments);
        const centerU = Math.round(this._clamp(u, 0, 1) * cache.segments);
        const centerV = Math.round(this._clamp(v, 0, 1) * cache.segments);
        const sampleRadius = Math.max(0, Math.floor(radius));
        const slopeRange = cache.slopeMax - cache.slopeMin;
        const samples = [];

        if (!Number.isFinite(slopeRange) || slopeRange <= 0) {
            return 0;
        }

        for (let du = -sampleRadius; du <= sampleRadius; du++) {
            const gridU = centerU + du;
            if (gridU < 0 || gridU > cache.segments) {
                continue;
            }

            for (let dv = -sampleRadius; dv <= sampleRadius; dv++) {
                const gridV = centerV + dv;
                if (gridV < 0 || gridV > cache.segments) {
                    continue;
                }

                const slope = cache.slopeMap[gridU * cache.size + gridV];
                const normalizedSlope = (slope - cache.slopeMin) / slopeRange;
                if (Number.isFinite(normalizedSlope)) {
                    samples.push(this._clamp(normalizedSlope, 0, 1));
                }
            }
        }

        if (samples.length <= 1) {
            return 0;
        }

        const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
        const variance = samples.reduce((sum, value) => {
            const delta = value - mean;
            return sum + delta * delta;
        }, 0) / samples.length;

        return Number.isFinite(variance) ? this._clamp(variance / 0.25, 0, 1) : 0;
    }

    _sampleLocalHeightStatsCache(u, v, radius = 1, segments = 200) {
        const cache = this._buildHeightmapCache(segments);
        const centerU = Math.round(this._clamp(u, 0, 1) * cache.segments);
        const centerV = Math.round(this._clamp(v, 0, 1) * cache.segments);
        const sampleRadius = Math.max(0, Math.floor(radius));
        const heightRange = cache.max - cache.min;

        if (!Number.isFinite(heightRange) || heightRange <= 0) {
            return {
                center: 0,
                min: 0,
                max: 0,
                mean: 0,
                variance: 0,
                count: 0
            };
        }

        let localMin = Infinity;
        let localMax = -Infinity;
        let total = 0;
        let count = 0;
        const samples = [];

        for (let du = -sampleRadius; du <= sampleRadius; du++) {
            const gridU = centerU + du;
            if (gridU < 0 || gridU > cache.segments) {
                continue;
            }

            for (let dv = -sampleRadius; dv <= sampleRadius; dv++) {
                const gridV = centerV + dv;
                if (gridV < 0 || gridV > cache.segments) {
                    continue;
                }

                const height = cache.heights[gridU * cache.size + gridV];
                const normalizedHeight = this._clamp((height - cache.min) / heightRange, 0, 1);
                samples.push(normalizedHeight);
                total += normalizedHeight;
                count++;
                if (normalizedHeight < localMin) localMin = normalizedHeight;
                if (normalizedHeight > localMax) localMax = normalizedHeight;
            }
        }

        if (count === 0) {
            return {
                center: 0,
                min: 0,
                max: 0,
                mean: 0,
                variance: 0,
                count: 0
            };
        }

        const centerHeight = cache.heights[centerU * cache.size + centerV];
        const center = this._clamp((centerHeight - cache.min) / heightRange, 0, 1);
        const mean = total / count;
        const variance = samples.reduce((sum, value) => {
            const delta = value - mean;
            return sum + delta * delta;
        }, 0) / count;

        return {
            center,
            min: Number.isFinite(localMin) ? this._clamp(localMin, 0, 1) : 0,
            max: Number.isFinite(localMax) ? this._clamp(localMax, 0, 1) : 0,
            mean: Number.isFinite(mean) ? this._clamp(mean, 0, 1) : 0,
            variance: Number.isFinite(variance) ? this._clamp(variance / 0.25, 0, 1) : 0,
            count
        };
    }

    _sampleLocalMeanHeightCache(u, v, radius = 1, segments = 200) {
        return this._sampleLocalHeightStatsCache(u, v, radius, segments).mean;
    }

    _sampleLocalHeightVarianceCache(u, v, radius = 1, segments = 200) {
        return this._sampleLocalHeightStatsCache(u, v, radius, segments).variance;
    }

    _sampleLocalCurvatureCache(u, v, radius = 1, segments = 200) {
        const stats = this._sampleLocalHeightStatsCache(u, v, radius, segments);
        const curvature = Math.abs(stats.center - stats.mean) * 2;

        return Number.isFinite(curvature) ? this._clamp(curvature, 0, 1) : 0;
    }

    _sampleLocalConvexityCache(u, v, radius = 1, segments = 200) {
        const stats = this._sampleLocalHeightStatsCache(u, v, radius, segments);
        const convexity = (stats.center - stats.mean) * 2;

        return Number.isFinite(convexity) ? this._clamp(convexity, 0, 1) : 0;
    }

    _sampleLocalConcavityCache(u, v, radius = 1, segments = 200) {
        const stats = this._sampleLocalHeightStatsCache(u, v, radius, segments);
        const concavity = (stats.mean - stats.center) * 2;

        return Number.isFinite(concavity) ? this._clamp(concavity, 0, 1) : 0;
    }

    _sampleTerrainPositionIndexCache(u, v, radius = 1, segments = 200) {
        const stats = this._sampleLocalHeightStatsCache(u, v, radius, segments);
        const localRange = stats.max - stats.min;

        if (!Number.isFinite(localRange) || localRange <= 0) {
            return 0.5;
        }

        const position = (stats.center - stats.min) / localRange;

        return Number.isFinite(position) ? this._clamp(position, 0, 1) : 0.5;
    }

    _sampleRidgeStrengthCache(u, v, radius = 1, segments = 200) {
        const convexity = this._sampleLocalConvexityCache(u, v, radius, segments);
        const terrainPosition = this._sampleTerrainPositionIndexCache(u, v, radius, segments);
        const normalizedSlope = this._sampleNormalizedSlopeMapCache(u, v, segments);
        const localRelief = this._sampleLocalReliefCache(u, v, radius, segments);
        const ridgeStrength = convexity * 0.45 + terrainPosition * 0.25 + normalizedSlope * 0.2 + localRelief * 0.1;

        return Number.isFinite(ridgeStrength) ? this._clamp(ridgeStrength, 0, 1) : 0;
    }

    _sampleValleyStrengthCache(u, v, radius = 1, segments = 200) {
        const concavity = this._sampleLocalConcavityCache(u, v, radius, segments);
        const terrainPosition = this._sampleTerrainPositionIndexCache(u, v, radius, segments);
        const normalizedHeight = this._sampleNormalizedHeightmapCache(u, v, segments);
        const localRelief = this._sampleLocalReliefCache(u, v, radius, segments);
        const valleyStrength = concavity * 0.45 + (1 - terrainPosition) * 0.25 + (1 - normalizedHeight) * 0.15 + localRelief * 0.15;

        return Number.isFinite(valleyStrength) ? this._clamp(valleyStrength, 0, 1) : 0;
    }

    _sampleEscarpmentStrengthCache(u, v, radius = 1, segments = 200) {
        const normalizedSlope = this._sampleNormalizedSlopeMapCache(u, v, segments);
        const localRelief = this._sampleLocalReliefCache(u, v, radius, segments);
        const localSlopeVariance = this._sampleLocalSlopeVarianceCache(u, v, radius, segments);
        const escarpmentStrength = normalizedSlope * 0.55 + localRelief * 0.25 + localSlopeVariance * 0.2;

        return Number.isFinite(escarpmentStrength) ? this._clamp(escarpmentStrength, 0, 1) : 0;
    }

    _sampleSurfaceRuggednessCache(u, v, radius = 1, segments = 200) {
        const localRelief = this._sampleLocalReliefCache(u, v, radius, segments);
        const localSlopeVariance = this._sampleLocalSlopeVarianceCache(u, v, radius, segments);
        const localHeightVariance = this._sampleLocalHeightVarianceCache(u, v, radius, segments);
        const ruggedness = localRelief * 0.4 + localSlopeVariance * 0.35 + localHeightVariance * 0.25;

        return Number.isFinite(ruggedness) ? this._clamp(ruggedness, 0, 1) : 0;
    }

    _sampleSurfaceStabilityCache(u, v, radius = 1, segments = 200) {
        const normalizedSlope = this._sampleNormalizedSlopeMapCache(u, v, segments);
        const localRelief = this._sampleLocalReliefCache(u, v, radius, segments);
        const localSlopeVariance = this._sampleLocalSlopeVarianceCache(u, v, radius, segments);
        const localCurvature = this._sampleLocalCurvatureCache(u, v, radius, segments);
        const instability = normalizedSlope * 0.45 + localRelief * 0.25 + localSlopeVariance * 0.2 + localCurvature * 0.1;

        return Number.isFinite(instability) ? this._clamp(1 - instability, 0, 1) : 0;
    }

    _sampleLocalReliefBandCache(u, v, radius = 1, segments = 200) {
        const localRelief = this._sampleLocalReliefCache(u, v, radius, segments);

        if (!Number.isFinite(localRelief)) {
            return 0;
        }
        if (localRelief < 0.2) {
            return 0;
        }
        if (localRelief < 0.5) {
            return 1;
        }

        return 2;
    }

    _sampleSurfaceComplexityCache(u, v, radius = 1, segments = 200) {
        const surfaceClassEntropy = this._sampleSurfaceClassEntropyCache(u, v, radius, segments);
        const surfaceClassTransition = this._sampleSurfaceClassTransitionCache(u, v, radius, segments);
        const ruggedness = this._sampleSurfaceRuggednessCache(u, v, radius, segments);
        const complexity = surfaceClassEntropy * 0.4 + surfaceClassTransition * 0.25 + ruggedness * 0.35;

        return Number.isFinite(complexity) ? this._clamp(complexity, 0, 1) : 0;
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
        const macroControls = this._sampleMacroTerrainControls(x, z, roughness, continent);

        const mountainWarp = this._warp2D(x + 173.5, z - 47.8, roughness * 2.2, roughness * 0.45);
        const mountainSource = this._fbm(mountainWarp.x, mountainWarp.z, roughness * 2.6, 4, 2, 0.5);
        let mountainMask = this._smoothstep(0.05, 0.78, mountainSource + continent * 0.35);
        mountainMask = this._clamp(
            mountainMask * (0.78 + macroControls.watershedDivide * 0.32) * (1 - macroControls.basinFloor * 0.22),
            0,
            1
        );

        const ridgeX = mountainWarp.x * 0.72 + mountainWarp.z * 0.18;
        const ridgeZ = mountainWarp.z * 1.28 - mountainWarp.x * 0.08;
        const ridgedMountains = this._ridged(ridgeX, ridgeZ, roughness * 0.9, 5, 2.05, 0.48);

        const valleyWarp = this._warp2D(x - 83.2, z + 29.6, roughness * 2.7, roughness * 0.22);
        const valleySource = this._ridged(
            valleyWarp.x - valleyWarp.z * 0.12,
            valleyWarp.z * 0.9 + valleyWarp.x * 0.06,
            roughness * 2.45,
            2,
            1.85,
            0.48
        );
        const valleyMask = this._clamp(
            this._smoothstep(0.72, 0.96, valleySource)
                * (1 - mountainMask * 0.45)
                * (0.82 + macroControls.basinFloor * 0.24)
                * (1 - macroControls.watershedDivide * 0.15),
            0,
            1
        );

        const hills = this._fbm(x - 241.3, z + 119.6, roughness * 0.95, 4, 2, 0.5);
        const detail = this._fbm(x + 19.4, z - 301.2, roughness * 0.38, 3, 2.15, 0.42);

        let height = 0;
        height += continent * 0.38;
        height -= macroControls.basinFloor * 0.22 * (1 - mountainMask * 0.25);
        height += macroControls.watershedDivide * 0.18 * (0.7 + Math.max(continent, 0) * 0.3);
        height += mountainMask * ridgedMountains * 0.82;
        height -= valleyMask * 0.22;
        height += hills * (0.18 + (1 - mountainMask) * 0.11) * (1 - macroControls.basinFloor * 0.18);
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
     * 预计算地形统计数据（如最�?最低点），用于颜色归一�?
     * @param {number} segments - 采样精度
     */
    calculateStats(segments = 100) {
        const cache = this._buildHeightmapCache(segments);

        this.minH = cache.min;
        this.maxH = cache.max;
    }

    updateConfig(options) {
        let shouldInvalidateCache = false;

        if (options.seed !== undefined) {
            if (options.seed !== this.seed) {
                shouldInvalidateCache = true;
            }
            this.seed = options.seed;
            this.simplex = new SimplexNoise(this.seed.toString());
            this._seedHashCache = null;
            this._seedHashCacheKey = null;
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
