// ContourVisualizer.js
class ContourVisualizer {
    constructor(containerId, terrainGenerator, options = {}) {
        this.container = document.getElementById(containerId);
        this.terrain = terrainGenerator;

        // 配置项
        this.density = options.density || 4.0;
        this.thickness = options.thickness || 0.15;
        this.colorArray = options.colors || ['#ffffff']; // 默认为白色

        // Three.js 核心对象
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.mesh = null;
        this.uniforms = null;

        this.initThreeJS();
        this.createTerrainMesh();
        this.animate();

        // 监听窗口调整
        window.addEventListener('resize', () => this.onResize(), false);
    }

    initThreeJS() {
        // 场景
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);

        // 相机
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
        this.camera.position.set(0, 100, 150);

        // 渲染器
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // 鼠标控制 (OrbitControls)
        if (THREE.OrbitControls) {
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
        }
    }

    /**
     * 内部工具：生成渐变纹理
     */
    _createGradientTexture(colors) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');

        if (colors.length === 1) {
            ctx.fillStyle = colors[0];
            ctx.fillRect(0, 0, 256, 1);
        } else {
            const gradient = ctx.createLinearGradient(0, 0, 256, 0);
            colors.forEach((c, i) => {
                gradient.addColorStop(i / (colors.length - 1), c);
            });
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 256, 1);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        return texture;
    }

    _clamp01(value) {
        return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    }

    _sampleCachedTerrainValue(methodName, u, v, segments) {
        if (!this.terrain || typeof this.terrain[methodName] !== 'function') {
            return null;
        }

        return this._clamp01(this.terrain[methodName](u, v, segments));
    }

    _sampleSlopeStrength(u, v, step, segments = 200) {
        const cachedSlope = this._sampleCachedTerrainValue('_sampleNormalizedSlopeMapCache', u, v, segments);
        if (cachedSlope !== null) {
            return cachedSlope;
        }

        const left = Math.max(0, u - step);
        const right = Math.min(1, u + step);
        const down = Math.max(0, v - step);
        const up = Math.min(1, v + step);
        const widthSpan = Math.max((right - left) * this.terrain.width, 0.0001);
        const depthSpan = Math.max((up - down) * this.terrain.depth, 0.0001);
        const dhdx = (this.terrain.getHeight(right, v) - this.terrain.getHeight(left, v)) / widthSpan;
        const dhdz = (this.terrain.getHeight(u, up) - this.terrain.getHeight(u, down)) / depthSpan;
        const slope = Math.sqrt(dhdx * dhdx + dhdz * dhdz);

        return this._clamp01(slope / (slope + 0.45));
    }

    _sampleHydrologyFlowStrength(u, v, segments = 200) {
        const cachedFlow = this._sampleCachedTerrainValue('_sampleFlowMapCache', u, v, segments);

        return cachedFlow === null ? 0 : cachedFlow;
    }

    _sampleDrainageChannelStrength(u, v, segments = 200) {
        const cachedChannel = this._sampleCachedTerrainValue('_sampleChannelMapCache', u, v, segments);

        return cachedChannel === null ? this._sampleHydrologyFlowStrength(u, v, segments) : cachedChannel;
    }

    _sampleMoistureStrength(u, v, segments = 200) {
        const cachedMoisture = this._sampleCachedTerrainValue('_sampleMoistureMapCache', u, v, segments);

        if (cachedMoisture !== null) {
            return cachedMoisture;
        }

        return this._sampleHydrologyFlowStrength(u, v, segments);
    }

    _sampleTemperatureStrength(u, v, segments = 200) {
        const cachedTemperature = this._sampleCachedTerrainValue('_sampleTemperatureMapCache', u, v, segments);

        return cachedTemperature === null ? 0.5 : cachedTemperature;
    }

    _sampleEcoZoneStrength(u, v, segments = 200) {
        const cachedEcoZone = this._sampleCachedTerrainValue('_sampleEcoZoneMapCache', u, v, segments);

        return cachedEcoZone === null ? 0.5 : cachedEcoZone;
    }

    _sampleSurfaceClassStrength(u, v, segments = 200) {
        if (this.terrain && typeof this.terrain._sampleDominantSurfaceClassCache === 'function') {
            const surfaceClass = this.terrain._sampleDominantSurfaceClassCache(u, v, 1, segments);

            return this._clamp01(surfaceClass / 7);
        }

        if (this.terrain && typeof this.terrain._sampleSurfaceClassCache === 'function') {
            const surfaceClass = this.terrain._sampleSurfaceClassCache(u, v, segments);

            return this._clamp01(surfaceClass / 7);
        }

        return 0;
    }

    _sampleValleyDepositStrength(u, v, step, centerHeight, segments = 200) {
        const cachedDeposit = this._sampleCachedTerrainValue('_sampleDepositMapCache', u, v, segments);
        if (cachedDeposit !== null) {
            const cachedFlow = this._sampleHydrologyFlowStrength(u, v, segments);

            return this._clamp01(cachedDeposit * 0.82 + cachedFlow * 0.18);
        }

        const left = Math.max(0, u - step);
        const right = Math.min(1, u + step);
        const down = Math.max(0, v - step);
        const up = Math.min(1, v + step);
        const heightRange = Math.max(this.terrain.maxH - this.terrain.minH, 0.0001);
        const neighborMean = (
            this.terrain.getHeight(left, v) +
            this.terrain.getHeight(right, v) +
            this.terrain.getHeight(u, down) +
            this.terrain.getHeight(u, up)
        ) * 0.25;
        const normalizedHeight = this._clamp01((centerHeight - this.terrain.minH) / heightRange);
        const lowland = 1 - normalizedHeight;
        const depression = this._clamp01((neighborMean - centerHeight) / heightRange * 8);

        return this._clamp01(depression * 0.75 + lowland * 0.25);
    }

    createTerrainMesh() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }

        // 1. 预计算地形极值
        const segments = 200;
        this.terrain.calculateStats(segments);

        // 2. 创建几何体
        const geometry = new THREE.PlaneGeometry(this.terrain.width, this.terrain.depth, segments, segments);
        const positionAttribute = geometry.attributes.position;
        const uvs = geometry.attributes.uv;
        const slopeValues = new Float32Array(positionAttribute.count);
        const depositValues = new Float32Array(positionAttribute.count);
        const flowValues = new Float32Array(positionAttribute.count);
        const channelValues = new Float32Array(positionAttribute.count);
        const moistureValues = new Float32Array(positionAttribute.count);
        const temperatureValues = new Float32Array(positionAttribute.count);
        const surfaceClassValues = new Float32Array(positionAttribute.count);
        const ecoZoneValues = new Float32Array(positionAttribute.count);
        const sampleStep = 1 / segments;

        for (let i = 0; i < positionAttribute.count; i++) {
            const u = uvs.getX(i);
            const v = uvs.getY(i);
            const h = this.terrain.getHeight(u, v);
            positionAttribute.setZ(i, h);
            slopeValues[i] = this._sampleSlopeStrength(u, v, sampleStep, segments);
            flowValues[i] = this._sampleHydrologyFlowStrength(u, v, segments);
            channelValues[i] = this._sampleDrainageChannelStrength(u, v, segments);
            moistureValues[i] = this._sampleMoistureStrength(u, v, segments);
            temperatureValues[i] = this._sampleTemperatureStrength(u, v, segments);
            depositValues[i] = this._sampleValleyDepositStrength(u, v, sampleStep, h, segments);
            surfaceClassValues[i] = this._sampleSurfaceClassStrength(u, v, segments);
            ecoZoneValues[i] = this._sampleEcoZoneStrength(u, v, segments);
        }
        geometry.setAttribute('terrainSlope', new THREE.BufferAttribute(slopeValues, 1));
        geometry.setAttribute('terrainDeposit', new THREE.BufferAttribute(depositValues, 1));
        geometry.setAttribute('terrainFlow', new THREE.BufferAttribute(flowValues, 1));
        geometry.setAttribute('terrainChannel', new THREE.BufferAttribute(channelValues, 1));
        geometry.setAttribute('terrainMoisture', new THREE.BufferAttribute(moistureValues, 1));
        geometry.setAttribute('terrainTemperature', new THREE.BufferAttribute(temperatureValues, 1));
        geometry.setAttribute('terrainSurfaceClass', new THREE.BufferAttribute(surfaceClassValues, 1));
        geometry.setAttribute('terrainEcoZone', new THREE.BufferAttribute(ecoZoneValues, 1));
        geometry.computeVertexNormals();

        // 3. 生成纹理
        const gradTexture = this._createGradientTexture(this.colorArray);

        // 4. Shader 材质
        this.uniforms = {
            uGradientTexture: { value: gradTexture },
            uLines: { value: 10.0 / this.density },
            uThickness: { value: this.thickness },
            uMinHeight: { value: this.terrain.minH },
            uMaxHeight: { value: this.terrain.maxH }
        };

        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            transparent: true,
            side: THREE.DoubleSide,
            vertexShader: `
                attribute float terrainSlope;
                attribute float terrainDeposit;
                attribute float terrainFlow;
                attribute float terrainChannel;
                attribute float terrainMoisture;
                attribute float terrainTemperature;
                attribute float terrainSurfaceClass;
                attribute float terrainEcoZone;
                varying float vHeight;
                varying float vSlope;
                varying float vDeposit;
                varying float vFlow;
                varying float vChannel;
                varying float vMoisture;
                varying float vTemperature;
                varying float vSurfaceClass;
                varying float vEcoZone;
                varying vec3 vNormal;
                void main() {
                    vHeight = position.z;
                    vSlope = terrainSlope;
                    vDeposit = terrainDeposit;
                    vFlow = terrainFlow;
                    vChannel = terrainChannel;
                    vMoisture = terrainMoisture;
                    vTemperature = terrainTemperature;
                    vSurfaceClass = terrainSurfaceClass;
                    vEcoZone = terrainEcoZone;
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uGradientTexture;
                uniform float uLines;
                uniform float uThickness;
                uniform float uMinHeight;
                uniform float uMaxHeight;
                varying float vHeight;
                varying float vSlope;
                varying float vDeposit;
                varying float vFlow;
                varying float vChannel;
                varying float vMoisture;
                varying float vTemperature;
                varying float vSurfaceClass;
                varying float vEcoZone;
                varying vec3 vNormal;

                void main() {
                    // 等高线裁切
                    float linePhase = fract(vHeight / uLines);
                    float halfThick = uThickness * 0.5;
                    if (linePhase > halfThick && linePhase < (1.0 - halfThick)) {
                        discard; 
                    }

                    // 颜色采样
                    float normalizedH = (vHeight - uMinHeight) / (uMaxHeight - uMinHeight);
                    normalizedH = clamp(normalizedH, 0.0, 1.0);
                    vec4 baseColor = texture2D(uGradientTexture, vec2(normalizedH, 0.5));
                    float slope = clamp(vSlope, 0.0, 1.0);
                    float deposit = clamp(vDeposit, 0.0, 1.0);
                    float flow = clamp(vFlow, 0.0, 1.0);
                    float channel = clamp(vChannel, 0.0, 1.0);
                    float moisture = clamp(vMoisture, 0.0, 1.0);
                    float temperature = clamp(vTemperature, 0.0, 1.0);
                    float surfaceClass = clamp(vSurfaceClass, 0.0, 1.0) * 7.0;
                    float ecoZone = clamp(vEcoZone, 0.0, 1.0) * 5.0;
                    float coolWetZone = 1.0 - smoothstep(0.25, 0.75, abs(ecoZone - 0.0));
                    float aridZone = 1.0 - smoothstep(0.25, 0.75, abs(ecoZone - 1.0));
                    float alluvialZone = 1.0 - smoothstep(0.25, 0.75, abs(ecoZone - 2.0));
                    float uplandZone = 1.0 - smoothstep(0.25, 0.75, abs(ecoZone - 3.0));
                    float alpineZone = 1.0 - smoothstep(0.25, 0.75, abs(ecoZone - 4.0));
                    float snowZone = 1.0 - smoothstep(0.25, 0.75, abs(ecoZone - 5.0));
                    float lowFlat = 1.0 - smoothstep(0.25, 0.75, abs(surfaceClass - 0.0));
                    float lowExposed = 1.0 - smoothstep(0.25, 0.75, abs(surfaceClass - 1.0));
                    float midFlat = 1.0 - smoothstep(0.25, 0.75, abs(surfaceClass - 2.0));
                    float midSlope = 1.0 - smoothstep(0.25, 0.75, abs(surfaceClass - 3.0));
                    float midExposed = 1.0 - smoothstep(0.25, 0.75, abs(surfaceClass - 4.0));
                    float highFlat = 1.0 - smoothstep(0.25, 0.75, abs(surfaceClass - 5.0));
                    float highSlope = 1.0 - smoothstep(0.25, 0.75, abs(surfaceClass - 6.0));
                    float highExposed = 1.0 - smoothstep(0.25, 0.75, abs(surfaceClass - 7.0));
                    float shade = mix(1.08, 0.68, slope);
                    float drainageSignal = max(channel, flow * 0.42);
                    vec3 rockTint = mix(baseColor.rgb, vec3(0.82, 0.84, 0.78), slope * 0.28);
                    vec3 valleyTint = mix(rockTint, vec3(0.54, 0.62, 0.50), deposit * 0.24);
                    vec3 drainageTint = mix(valleyTint, vec3(0.42, 0.55, 0.58), drainageSignal * 0.1);
                    vec3 dryTint = mix(drainageTint, vec3(0.64, 0.58, 0.44), (1.0 - moisture) * 0.1 * (1.0 - deposit * 0.45));
                    vec3 wetTint = mix(dryTint, vec3(0.42, 0.57, 0.38), moisture * 0.14 * (1.0 - slope * 0.35));
                    vec3 surfaceTint = wetTint;
                    surfaceTint = mix(surfaceTint, vec3(0.45, 0.58, 0.36), lowFlat * 0.1);
                    surfaceTint = mix(surfaceTint, vec3(0.62, 0.56, 0.43), lowExposed * 0.12);
                    surfaceTint = mix(surfaceTint, vec3(0.50, 0.60, 0.37), midFlat * 0.12);
                    surfaceTint = mix(surfaceTint, vec3(0.55, 0.52, 0.39), midSlope * 0.12);
                    surfaceTint = mix(surfaceTint, vec3(0.68, 0.67, 0.60), midExposed * 0.16);
                    surfaceTint = mix(surfaceTint, vec3(0.58, 0.64, 0.54), highFlat * 0.12);
                    surfaceTint = mix(surfaceTint, vec3(0.60, 0.61, 0.55), highSlope * 0.14);
                    surfaceTint = mix(surfaceTint, vec3(0.86, 0.87, 0.82), highExposed * 0.18);
                    surfaceTint = mix(surfaceTint, vec3(0.34, 0.50, 0.34), coolWetZone * 0.10);
                    surfaceTint = mix(surfaceTint, vec3(0.67, 0.57, 0.38), aridZone * 0.11 * (1.0 - drainageSignal * 0.3));
                    surfaceTint = mix(surfaceTint, vec3(0.42, 0.57, 0.39), alluvialZone * 0.12);
                    surfaceTint = mix(surfaceTint, vec3(0.53, 0.57, 0.43), uplandZone * 0.08);
                    surfaceTint = mix(surfaceTint, vec3(0.62, 0.65, 0.59), alpineZone * 0.12);
                    surfaceTint = mix(surfaceTint, vec3(0.91, 0.92, 0.88), snowZone * 0.16);
                    float coldness = 1.0 - temperature;
                    float snowLine = smoothstep(0.58, 0.9, coldness)
                        * (highFlat * 0.34 + highSlope * 0.48 + highExposed * 0.72 + slope * 0.18 + snowZone * 0.32)
                        * (0.62 + moisture * 0.28);
                    float warmLowland = smoothstep(0.58, 0.88, temperature)
                        * (lowFlat * 0.28 + lowExposed * 0.18 + midFlat * 0.12 + aridZone * 0.18)
                        * (1.0 - drainageSignal * 0.35);
                    surfaceTint = mix(surfaceTint, vec3(0.90, 0.91, 0.86), clamp(snowLine, 0.0, 1.0) * 0.2);
                    surfaceTint = mix(surfaceTint, vec3(0.62, 0.55, 0.38), clamp(warmLowland, 0.0, 1.0) * 0.08);
                    float drainageChannel = smoothstep(0.58, 0.92, drainageSignal) * (1.0 - slope * 0.42);
                    float alluvialBank = smoothstep(0.24, 0.72, deposit) * (1.0 - drainageChannel * 0.5);
                    surfaceTint = mix(surfaceTint, vec3(0.30, 0.43, 0.44), drainageChannel * 0.16);
                    surfaceTint = mix(surfaceTint, vec3(0.60, 0.58, 0.43), alluvialBank * 0.08);
                    float depositShade = mix(shade, shade * 0.92, deposit);
                    float flowShade = mix(depositShade, depositShade * 0.94, flow * (1.0 - slope * 0.55));
                    float exposedShade = max(max(lowExposed, midExposed), highExposed);
                    float channelShade = mix(flowShade, flowShade * 0.9, drainageChannel);
                    vec3 terrainNormal = normalize(vNormal);
                    vec3 lightDirection = normalize(vec3(-0.42, 0.58, 0.70));
                    float directionalLight = clamp(dot(terrainNormal, lightDirection) * 0.5 + 0.5, 0.0, 1.0);
                    float slopeRelief = smoothstep(0.18, 0.78, slope);
                    float aspectShade = mix(0.9, 1.08, directionalLight);
                    vec3 warmHighlight = mix(surfaceTint, vec3(0.86, 0.82, 0.68), (1.0 - coldness) * directionalLight * slopeRelief * 0.045);
                    vec3 coolShadow = mix(warmHighlight, vec3(0.34, 0.43, 0.50), (1.0 - directionalLight) * slopeRelief * 0.055);
                    surfaceTint = coolShadow;
                    float surfaceShade = channelShade
                        * mix(1.03, 0.92, exposedShade * 0.65 + highSlope * 0.25)
                        * aspectShade;
                    gl_FragColor = vec4(surfaceTint * surfaceShade, baseColor.a);
                }
            `
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.scene.add(this.mesh);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.controls) this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }
}
