const scenes = [
  {
    src: 'assets/references/image.png',
    alt: '雪地中带有小型聚落的浅色颗粒地图',
    kicker: '守望之地',
    description: '第一轮守望很安静，雪还没有记住你的名字。',
  },
  {
    src: 'assets/references/image-1.png',
    alt: '被红色花朵覆盖的黑白地图',
    kicker: '蔓延',
    description: '红色花朵从侧面涌来，填满每一块空白。',
  },
  {
    src: 'assets/references/image-2.png',
    alt: '小型聚落与周围田地的颗粒俯视图',
    kicker: '聚落',
    description: '守住炉火，把黑雪挡在村外。',
  },
  {
    src: 'assets/references/image-3.png',
    alt: '带有几处微光的黑暗颗粒深渊',
    kicker: '深渊',
    description: '越过最后一片屋顶，地图将脸转向黑暗。',
  },
];

const frame = document.querySelector('#scene-frame');
const outputCanvas = document.querySelector('#output-canvas');
const pointCanvas = document.querySelector('#point-canvas');
const fxCanvas = document.querySelector('#fx-canvas');
const videoSource = document.querySelector('#video-source');
const demoCanvas = document.querySelector('#demo-canvas');
const sceneIndex = document.querySelector('#scene-index');
const sceneKicker = document.querySelector('#scene-kicker');
const sceneDescription = document.querySelector('#scene-description');
const signalCode = document.querySelector('#signal-code');
const sourceKind = document.querySelector('#source-kind');
const fileInput = document.querySelector('#file-input');
const fileName = document.querySelector('#file-name');
const dropzone = document.querySelector('#dropzone');
const bloomRange = document.querySelector('#bloom-range');
const bloomOutput = document.querySelector('#bloom-output');
const rotNote = document.querySelector('#rot-note');
const toast = document.querySelector('#toast');
const stateButtons = [...document.querySelectorAll('[data-scene]')];
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const sourceTabs = [...document.querySelectorAll('[data-source-kind]')];
const playButton = document.querySelector('[data-action="toggle-play"]');
const playLabel = document.querySelector('[data-play-label]');
const meterBars = document.querySelector('#meter-bars');
const pointDitherRange = document.querySelector('#point-dither-range');
const pointDitherOutput = document.querySelector('#point-dither-output');
const pointNote = document.querySelector('#point-note');
const pointPixelRange = document.querySelector('#point-pixel-range');
const pointPixelOutput = document.querySelector('#point-pixel-output');
const cameraBlurRange = document.querySelector('#camera-blur-range');
const cameraBlurOutput = document.querySelector('#camera-blur-output');
const tiltShiftRange = document.querySelector('#tilt-shift-range');
const tiltShiftOutput = document.querySelector('#tilt-shift-output');
const focusPositionRange = document.querySelector('#focus-position-range');
const focusPositionOutput = document.querySelector('#focus-position-output');
const cameraNote = document.querySelector('#camera-note');
const modelButtons = [...document.querySelectorAll('[data-model-scene]')];
const modelSwitch = document.querySelector('.model-switch');
const cameraReset = document.querySelector('[data-action="reset-camera"]');
const bloomBlock = document.querySelector('.bloom-block');
const modeBlock = document.querySelector('.mode-block');

const filter = window.OEmpireFilter.create({
  canvas: outputCanvas,
  options: {
    mode: 'ward',
    bloom: Number(bloomRange.value) / 100,
    grain: 0.32,
    halftone: 0.58,
    scanlines: 0.24,
    vignette: 0.82,
    contrast: 1.2,
    brightness: 0.9,
    fit: 'cover',
  },
});

let activeScene = 2;
let activeSource = null;
let sourceType = 'reference';
let sourceFileUrl = null;
let bloom = Number(bloomRange.value);
let playing = false;
let playTimer = null;
let toastTimer = null;
let rafId = 0;
let lastFrame = 0;
let needsRender = true;
let dustWidth = 0;
let dustHeight = 0;
let demoFrame = 0;
let pointField = window.OEmpirePointField || null;
let sourceContinuous = false;
let isDemoCanvasSource = false;
let cameraBlur = Number(cameraBlurRange?.value || 0);
let tiltShift = Number(tiltShiftRange?.value || 0);
let focusPosition = Number(focusPositionRange?.value || 50);

function usesDitherPass() {
  return sourceType === '3d' || sourceType === 'file-image' || sourceType === 'video' || sourceType === 'canvas' || sourceType === 'external-image';
}

const random = (min, max) => Math.random() * (max - min) + min;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function updateSceneChrome(index) {
  const scene = scenes[index];
  activeScene = index;
  sceneKicker.textContent = scene.kicker;
  sceneDescription.textContent = scene.description;
  sceneIndex.textContent = String(index + 1).padStart(2, '0');
  signalCode.textContent = `${String(index + 1).padStart(2, '0')} / 04`;
  stateButtons.forEach((button) => {
    const active = Number(button.dataset.scene) === index;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
}

function updateSourceChrome(label) {
  sourceKind.textContent = label;
  sourceTabs.forEach((tab) => {
    const isReference = tab.dataset.sourceKind === 'reference' && sourceType === 'reference';
    const isFile = tab.dataset.sourceKind === 'file' && sourceType.startsWith('file');
    const isCanvas = tab.dataset.sourceKind === 'canvas' && sourceType === 'canvas';
    const is3d = tab.dataset.sourceKind === 'scene3d' && sourceType === '3d';
    tab.classList.toggle('is-active', isReference || isFile || isCanvas || is3d);
  });
}

function showFilteredCanvas() {
  frame.classList.remove('is-3d', 'is-dithered');
  modelSwitch.hidden = true;
  cameraReset.hidden = true;
  bloomBlock.hidden = false;
  modeBlock.hidden = false;
  modelButtons.forEach((button) => { button.disabled = true; });
  pointField?.stop();
  pointField?.setInputSource(null);
  sourceContinuous = false;
  if (sourceType !== 'video') {
    playing = false;
    playButton.setAttribute('aria-pressed', 'false');
    playLabel.textContent = '播放循环';
    playButton.querySelector('.play-glyph').textContent = '▶';
  }
}

function showPointField() {
  frame.classList.add('is-3d', 'is-dithered');
  modelSwitch.hidden = false;
  cameraReset.hidden = false;
  bloomBlock.hidden = true;
  modeBlock.hidden = true;
  modelButtons.forEach((button) => { button.disabled = false; });
  if (!pointField) {
    return;
  }
  pointField.mount().setOptions({
    dither: Number(pointDitherRange.value) / 100,
    pixelSize: Number(pointPixelRange.value),
    cameraBlur: cameraBlur / 100,
    tiltShift: tiltShift / 100,
    focusPosition: focusPosition / 100,
  });
  pointField.setInputSource(null).start();
}

function showDitheredInput(continuous = false) {
  sourceContinuous = continuous;
  frame.classList.remove('is-3d');
  frame.classList.add('is-dithered');
  modelSwitch.hidden = true;
  cameraReset.hidden = true;
  bloomBlock.hidden = true;
  modeBlock.hidden = true;
  modelButtons.forEach((button) => { button.disabled = true; });
  sceneKicker.textContent = sourceType === 'video' ? '视频输入' : sourceType === 'canvas' ? '画布输入' : '图像输入';
  sceneDescription.textContent = '每个来源单元都会映射为黑白灰方形像素，再用有序抖动重建中间灰阶。';
  sceneIndex.textContent = '输入';
  signalCode.textContent = '像素 / 输入';
  pointField?.stop();
  if (!pointField) return;
  pointField.mount().setOptions({
    dither: Number(pointDitherRange.value) / 100,
    pixelSize: Number(pointPixelRange.value),
    cameraBlur: cameraBlur / 100,
    tiltShift: tiltShift / 100,
    focusPosition: focusPosition / 100,
  });
  pointField.setInputSource(activeSource);
  if (continuous) pointField.start();
}

function resizeOverlay() {
  const rect = frame.getBoundingClientRect();
  dustWidth = Math.max(1, Math.floor(rect.width));
  dustHeight = Math.max(1, Math.floor(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  fxCanvas.width = Math.floor(dustWidth * dpr);
  fxCanvas.height = Math.floor(dustHeight * dpr);
  fxCanvas.style.width = `${dustWidth}px`;
  fxCanvas.style.height = `${dustHeight}px`;
  filter.resize();
  needsRender = true;
}

function paintFilmOverlay(time) {
  const ctx = fxCanvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, dustWidth, dustHeight);

  // Only neutral film dust lives in this overlay. Red is reserved for source
  // pixels that the filter identifies as flower color.
  for (let i = 0; i < 80; i += 1) {
    const x = Math.abs((i * 89 + Math.floor(time / 37) * 11) % dustWidth);
    const y = Math.abs((i * 47 + Math.floor(time / 53) * 17) % dustHeight);
    ctx.fillStyle = i % 4 === 0 ? 'rgba(255, 255, 245, 0.12)' : 'rgba(10, 10, 10, 0.09)';
    ctx.fillRect(x, y, (i % 2) + 0.4, (i % 3) + 0.3);
  }
}

function drawDemoCanvas(time) {
  const ctx = demoCanvas.getContext('2d');
  const width = demoCanvas.width;
  const height = demoCanvas.height;
  const frameTime = time * 0.001;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#c8c8bf';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#b0b2aa';
  for (let i = 0; i < 32; i += 1) {
    const x = (i * 87 + 28) % width;
    const y = (i * 53 + 18) % height;
    ctx.fillRect(x, y, 26 + (i % 3) * 14, 9 + (i % 4) * 7);
  }

  // A tiny isometric canvas scene gives Canvas / Three.js users a visible source.
  const houses = [[230, 238], [440, 175], [622, 277], [730, 144]];
  houses.forEach(([x, y], index) => {
    ctx.fillStyle = index % 2 ? '#343735' : '#454744';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 48, y - 22);
    ctx.lineTo(x + 97, y);
    ctx.lineTo(x + 48, y + 23);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#232524';
    ctx.fillRect(x + 26, y + 22, 44, 45);
    ctx.fillStyle = '#dbd8cd';
    ctx.fillRect(x + 42, y + 38, 11, 16);
  });

  for (let i = 0; i < 38; i += 1) {
    const x = 110 + ((i * 149) % 705);
    const y = 120 + ((i * 73) % 290);
    const pulse = 1 + Math.sin(frameTime * 1.2 + i) * 0.14;
    drawCanvasFlower(ctx, x, y, (2.2 + (i % 4)) * pulse);
  }

  demoFrame += 1;
}

function drawCanvasFlower(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#d53a2e';
  for (let i = 0; i < 5; i += 1) {
    ctx.rotate((Math.PI * 2) / 5);
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.7, size * 0.7, size, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#692219';
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function renderLoop(time) {
  const elapsed = time - lastFrame;
  lastFrame = time;
  if (sourceType === 'canvas' && playing && isDemoCanvasSource) drawDemoCanvas(time);
  if (!usesDitherPass() && (sourceType === 'video' || sourceType === 'canvas' || needsRender || elapsed > 1000)) {
    filter.render(time);
    needsRender = false;
  }
  if (!usesDitherPass()) paintFilmOverlay(time);
  rafId = requestAnimationFrame(renderLoop);
}

function updateBloom(value) {
  bloom = Math.max(0, Math.min(100, Number(value)));
  bloomRange.value = String(bloom);
  bloomRange.style.setProperty('--range-fill', `${bloom}%`);
  bloomOutput.textContent = `${String(bloom).padStart(2, '0')}%`;
  meterBars.style.opacity = String(0.42 + bloom / 180);
  filter.setOptions({ bloom: bloom / 100 });
  needsRender = true;

  if (bloom < 20) {
    rotNote.textContent = '防线依然稳固，红花保持沉寂。';
  } else if (bloom < 56) {
    rotNote.textContent = '一线红花正从雪地里绽开。';
  } else if (bloom < 82) {
    rotNote.textContent = '花海正在扩张，花瓣占据每一处空白。';
  } else {
    rotNote.textContent = '花朵已经铺满整片原野，仍需继续守望。';
  }
}

function updatePointDither(value) {
  const dither = Math.max(0, Math.min(100, Number(value)));
  pointDitherRange.value = String(dither);
  pointDitherRange.style.setProperty('--range-fill', `${dither}%`);
  pointDitherOutput.textContent = `${String(dither).padStart(2, '0')}%`;
  pointField?.setOptions({ dither: dither / 100 });
  if (dither < 18) pointNote.textContent = '映射后的方形像素使用稳定灰阶，几乎不进行有序抖动。';
  else if (dither < 58) pointNote.textContent = '有序抖动会用映射后的方形像素重建中间灰阶。';
  else pointNote.textContent = '高对比像素保持稳定，中间灰阶分解为方形拜耳阵列。';
}

function updatePointPixelSize(value) {
  const pixelSize = Math.max(2, Math.min(12, Number(value)));
  pointPixelRange.value = String(pixelSize);
  pointPixelRange.style.setProperty('--range-fill', `${((pixelSize - 2) / 10) * 100}%`);
  pointPixelOutput.textContent = `${String(pixelSize).padStart(2, '0')} PX`;
  pointField?.setOptions({ pixelSize });
}

function updateCameraBlur(value) {
  cameraBlur = Math.max(0, Math.min(100, Number(value)));
  cameraBlurRange.value = String(cameraBlur);
  cameraBlurRange.style.setProperty('--range-fill', `${cameraBlur}%`);
  cameraBlurOutput.textContent = `${String(cameraBlur).padStart(2, '0')}%`;
  pointField?.setOptions({ cameraBlur: cameraBlur / 100 });
  cameraNote.textContent = cameraBlur > 0 && tiltShift > 0
    ? '全局虚化与移轴焦带同时生效，最终仍保持方形像素边缘。'
    : cameraBlur > 0
      ? '虚化作用于最终像素画面，越高越柔和。'
      : tiltShift > 0
        ? '移轴会保留一条水平清晰带，远离焦平面的位置逐渐虚化。'
        : '虚化作用于最终像素画面；移轴保留一条水平清晰带。';
}

function updateTiltShift(value) {
  tiltShift = Math.max(0, Math.min(100, Number(value)));
  tiltShiftRange.value = String(tiltShift);
  tiltShiftRange.style.setProperty('--range-fill', `${tiltShift}%`);
  tiltShiftOutput.textContent = `${String(tiltShift).padStart(2, '0')}%`;
  pointField?.setOptions({ tiltShift: tiltShift / 100 });
  updateCameraBlur(cameraBlur);
}

function updateFocusPosition(value) {
  focusPosition = Math.max(20, Math.min(80, Number(value)));
  focusPositionRange.value = String(focusPosition);
  focusPositionRange.style.setProperty('--range-fill', `${((focusPosition - 20) / 60) * 100}%`);
  focusPositionOutput.textContent = `${String(focusPosition).padStart(2, '0')}%`;
  pointField?.setOptions({ focusPosition: focusPosition / 100 });
}

function updateMode(mode, announce = true) {
  document.body.dataset.mode = mode;
  modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  filter.setOptions({ mode });
  if (mode === 'ward') {
    updateBloom(Math.min(bloom, 40));
    if (announce) showToast('守望通道 / 保留花瓣颜色');
  } else if (mode === 'bloom') {
    updateBloom(Math.max(bloom, 72));
    if (announce) showToast('花潮通道 / 提亮红花');
  } else {
    needsRender = true;
    if (announce) showToast('原始通道 / 保留来源颜色');
  }
}

async function useReference(index, announce = true) {
  const normalized = (index + scenes.length) % scenes.length;
  const image = await loadImage(scenes[normalized].src);
  activeSource = image;
  sourceType = 'reference';
  showFilteredCanvas();
  filter.setSource(image);
  updateSceneChrome(normalized);
  updateSourceChrome(`参考图 / ${String(normalized + 1).padStart(2, '0')}`);
  fileName.textContent = '或选择本地文件';
  needsRender = true;
  if (announce) showToast(`${scenes[normalized].kicker} / 已处理`);
}

function usePointField(announce = true) {
  sourceType = '3d';
  activeSource = null;
  sourceContinuous = true;
  isDemoCanvasSource = false;
  showPointField();
  playing = true;
  playButton.setAttribute('aria-pressed', 'true');
  playLabel.textContent = '暂停循环';
  playButton.querySelector('.play-glyph').textContent = 'Ⅱ';
  updateSourceChrome('3D / 点阵场景');
  sceneIndex.textContent = '3D';
  signalCode.textContent = '实时 / 3D';
  updateModelScene(pointField?.getActiveScene?.() || 'bridge');
  sourceKind.textContent = '3D / 点阵场景';
  if (announce) showToast('3D 模型 / 点阵场景已启动');
}

function updateModelScene(sceneName) {
  pointField?.setScene(sceneName);
  modelButtons.forEach((button) => {
    const active = button.dataset.modelScene === sceneName;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  sceneKicker.textContent = sceneName === 'bridge' ? '大桥' : '村庄';
  sceneDescription.textContent = sceneName === 'bridge'
    ? '连续的石桥以三座拱洞跨越深渊。'
    : '雪地村庄嵌入山脊，木屋、礼拜堂、瞭望塔、小路与深色松林彼此相连。';
}

function attachCanvasSource(canvas, label = '画布 / THREE') {
  if (!canvas || typeof canvas.getContext !== 'function') {
    showToast('没有找到画布来源');
    return;
  }
  activeSource = canvas;
  sourceType = 'canvas';
  isDemoCanvasSource = canvas === demoCanvas;
  showDitheredInput(true);
  updateSourceChrome(label);
  playing = true;
  playButton.setAttribute('aria-pressed', 'true');
  playLabel.textContent = '暂停循环';
  playButton.querySelector('.play-glyph').textContent = 'Ⅱ';
  needsRender = true;
  showToast('画布来源已接入');
}

async function useFile(file) {
  if (!file) return;
  if (sourceType === 'video') videoSource.pause();
  if (sourceFileUrl) URL.revokeObjectURL(sourceFileUrl);
  sourceFileUrl = URL.createObjectURL(file);
  fileName.textContent = file.name;

  if (file.type.startsWith('image/')) {
    const image = await loadImage(sourceFileUrl);
    activeSource = image;
    sourceType = 'file-image';
    isDemoCanvasSource = false;
    playing = false;
    playButton.setAttribute('aria-pressed', 'false');
    playLabel.textContent = '播放循环';
    playButton.querySelector('.play-glyph').textContent = '▶';
    showDitheredInput(false);
    updateSourceChrome('文件 / 图像');
    needsRender = true;
    showToast('图像来源 / 方形像素抖动');
    return;
  }

  if (file.type.startsWith('video/')) {
    videoSource.src = sourceFileUrl;
    videoSource.load();
    activeSource = videoSource;
    sourceType = 'video';
    isDemoCanvasSource = false;
    showDitheredInput(true);
    updateSourceChrome('文件 / 视频');
    playing = true;
    playButton.setAttribute('aria-pressed', 'true');
    playLabel.textContent = '暂停循环';
    playButton.querySelector('.play-glyph').textContent = 'Ⅱ';
    needsRender = true;
    showToast('视频来源 / 实时像素抖动');
    videoSource.play().catch(() => {
      if (activeSource === videoSource) showToast('视频已准备好 / 如需播放请按播放');
    });
    return;
  }

  showToast('请选择图像或视频文件');
}

function togglePlay(force) {
  playing = typeof force === 'boolean' ? force : !playing;
  window.clearInterval(playTimer);
  playTimer = null;

  if (sourceType === 'video') {
    if (playing) videoSource.play().catch(() => {});
    else videoSource.pause();
  }

  if (sourceType === '3d') {
    if (playing) pointField?.start();
    else pointField?.stop();
  }
  if (usesDitherPass() && sourceType !== '3d') {
    if (playing && sourceContinuous) pointField?.start();
    if (!playing) pointField?.stop();
  }

  playButton.setAttribute('aria-pressed', String(playing));
  playLabel.textContent = playing ? '暂停循环' : '播放循环';
  playButton.querySelector('.play-glyph').textContent = playing ? 'Ⅱ' : '▶';

  if (playing && sourceType === 'reference') {
    playTimer = window.setInterval(() => {
      useReference(activeScene + 1, false);
      updateBloom(18 + Math.floor(Math.random() * 70));
    }, 4400);
    showToast('参考图循环 / 4.4 秒');
  } else if (playing) {
    showToast('来源循环已启动');
  } else {
    showToast('循环已暂停');
  }
}

function resetField() {
  togglePlay(false);
  updateMode('ward');
  updateBloom(38);
  useReference(2, false);
  showToast('守望已恢复 / 参考图 03');
}

function randomize() {
  if (sourceType === '3d') {
    pointField?.randomize();
    updatePointDither(14 + Math.floor(Math.random() * 78));
    showToast('3D 场景 / 抖动设置已更新');
    return;
  }
  const next = Math.floor(Math.random() * scenes.length);
  const nextBloom = Math.floor(random(12, 96));
  useReference(next);
  updateBloom(nextBloom);
  if (nextBloom > 68) updateMode('bloom');
  else if (nextBloom < 32) updateMode('ward');
}

function exportPng() {
  const exportCanvas = usesDitherPass() ? pointCanvas : outputCanvas;
  if (!usesDitherPass()) filter.render(performance.now());
  exportCanvas.toBlob((blob) => {
    if (!blob) {
      showToast('导出失败');
      return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const exportName = sourceType === '3d'
      ? `dithered-${pointField?.getActiveScene?.() || 'scene'}`
      : sourceType === 'reference'
        ? `filter-${String(activeScene + 1).padStart(2, '0')}`
        : `dithered-${sourceType.replace(/[^a-z0-9-]/gi, '-')}`;
    link.download = `o-empire-${exportName}.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 500);
    showToast(`${usesDitherPass() ? '方形像素' : '滤镜画面'} PNG 已导出`);
  }, 'image/png');
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2100);
}

stateButtons.forEach((button) => {
  button.addEventListener('click', () => useReference(Number(button.dataset.scene)));
});

modelButtons.forEach((button) => {
  button.addEventListener('click', () => updateModelScene(button.dataset.modelScene));
});

modeButtons.forEach((button) => {
  button.addEventListener('click', () => updateMode(button.dataset.mode));
});

sourceTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    if (tab.dataset.sourceKind === 'reference') useReference(activeScene);
    if (tab.dataset.sourceKind === 'file') fileInput.click();
    if (tab.dataset.sourceKind === 'canvas') attachCanvasSource(demoCanvas, '画布 / THREE');
    if (tab.dataset.sourceKind === 'scene3d') usePointField();
  });
});

bloomRange.addEventListener('input', (event) => updateBloom(event.target.value));
pointDitherRange.addEventListener('input', (event) => updatePointDither(event.target.value));
pointPixelRange.addEventListener('input', (event) => updatePointPixelSize(event.target.value));
cameraBlurRange.addEventListener('input', (event) => updateCameraBlur(event.target.value));
tiltShiftRange.addEventListener('input', (event) => updateTiltShift(event.target.value));
focusPositionRange.addEventListener('input', (event) => updateFocusPosition(event.target.value));
fileInput.addEventListener('change', (event) => useFile(event.target.files?.[0]));

['dragenter', 'dragover'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragging');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragging');
  });
});

dropzone.addEventListener('drop', (event) => useFile(event.dataTransfer?.files?.[0]));
document.querySelector('[data-action="toggle-play"]').addEventListener('click', () => togglePlay());
document.querySelector('[data-action="reset"]').addEventListener('click', resetField);
document.querySelector('[data-action="randomize"]').addEventListener('click', randomize);
document.querySelector('[data-action="export"]').addEventListener('click', exportPng);
cameraReset.addEventListener('click', () => pointField?.resetCamera());
document.querySelector('[data-action="use-demo-canvas"]').addEventListener('click', () => attachCanvasSource(demoCanvas));

document.querySelector('[data-action="fullscreen"]').addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) await frame.requestFullscreen();
    else await document.exitFullscreen();
  } catch (error) {
    showToast('当前无法进入全屏');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.key === 'ArrowRight') useReference(activeScene + 1);
  if (event.key === 'ArrowLeft') useReference(activeScene - 1);
  if (event.key === ' ') {
    event.preventDefault();
    togglePlay();
  }
  if (event.key.toLowerCase() === 'r') resetField();
});

window.addEventListener('resize', resizeOverlay);
window.addEventListener('o-empire-point-field-ready', (event) => {
  pointField = event.detail;
  if (sourceType === '3d') showPointField();
  else if (usesDitherPass()) showDitheredInput(sourceContinuous);
});

// Public bridge for a Three.js renderer or another canvas on the host page.
window.OEmpireFilterPanel = {
  attachCanvas: (canvas, label = '画布 / THREE') => attachCanvasSource(canvas, label),
  attachImage: (image) => {
    activeSource = image;
    sourceType = 'external-image';
    isDemoCanvasSource = false;
    playing = false;
    showDitheredInput(false);
    updateSourceChrome('外部 / 图像');
    needsRender = true;
  },
  getOutputCanvas: () => (usesDitherPass() ? pointCanvas : outputCanvas),
  useDitheredScene: usePointField,
  getDitheredScene: () => pointField,
  // Legacy aliases kept for existing integrations.
  usePointField,
  getPointField: () => pointField,
};

resizeOverlay();
updateBloom(bloom);
updatePointDither(pointDitherRange.value);
updatePointPixelSize(pointPixelRange.value);
updateCameraBlur(cameraBlurRange.value);
updateTiltShift(tiltShiftRange.value);
updateFocusPosition(focusPositionRange.value);
updateMode('ward', false);
usePointField(false);
rafId = requestAnimationFrame(renderLoop);

window.addEventListener('beforeunload', () => {
  window.clearInterval(playTimer);
  window.cancelAnimationFrame(rafId);
  if (sourceFileUrl) URL.revokeObjectURL(sourceFileUrl);
});
