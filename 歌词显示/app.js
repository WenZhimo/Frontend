const SONG_BASE = "../asset/song/";

const builtinTracks = [
  {
    id: "chaosmyth",
    title: "C.h.a.o.s.m.y.t.h.",
    artist: "ONE OK ROCK",
    album: "残響リファレンス",
    file: "C.h.a.o.s.m.y.t.h. - ONE OK ROCK (ワンオクロック).mp3",
    lyric: "C.h.a.o.s.m.y.t.h. - ONE OK ROCK (ワンオクロック).lrc",
    color: ["#6ee7c8", "#9ca3ff"],
  },
  {
    id: "crychic-haruhikage",
    title: "春日影 (ver. THE FIRST TAKE)",
    artist: "CRYCHIC",
    album: "THE FIRST TAKE",
    file: "CRYCHIC - 春日影(ver. THE FIRST TAKE) .wav",
    lyric: null,
    color: ["#ffbf69", "#ff6878"],
  },
  {
    id: "incarnation",
    title: "Incarnation",
    artist: "张靓颖",
    album: "我的梦",
    file: "Incarnation - 张靓颖.flac",
    lyric: "Incarnation - 张靓颖.lrc",
    color: ["#9ca3ff", "#6ee7c8"],
  },
  {
    id: "lemon-tree",
    title: "Lemon Tree",
    artist: "Fool's Garden",
    album: "Dish Of The Day",
    file: "Lemon Tree - Fool's Garden.flac",
    lyric: "Lemon Tree - Fool's Garden.lrc",
    color: ["#f8e16c", "#6ee7c8"],
  },
  {
    id: "mygo-haruhikage",
    title: "春日影 (MyGO!!!!! ver.)",
    artist: "MyGO!!!!!",
    album: "BanG Dream!",
    file: "MyGO!!!!! - 春日影 (MyGO!!!!! ver.).flac",
    lyric: null,
    color: ["#5cc8ff", "#9ca3ff"],
  },
  {
    id: "never-be-alone",
    title: "Never Be Alone",
    artist: "Shawn Mendes",
    album: "Handwritten",
    file: "Never Be Alone - Shawn Mendes.flac",
    lyric: "Never Be Alone - Shawn Mendes.lrc",
    color: ["#ffbf69", "#6ee7c8"],
  },
  {
    id: "dalabengba",
    title: "达拉崩吧",
    artist: "洛天依 / 言和",
    album: "Vocaloid",
    file: "达拉崩吧 - 洛天依 _ 言和.mp3",
    lyric: "达拉崩吧 - 洛天依 _ 言和.lrc",
    color: ["#55d6ff", "#ff8bd1"],
  },
  {
    id: "snowman",
    title: "雪人",
    artist: "周梓琦",
    album: "Local Collection",
    file: "雪人 - 周梓琦.flac",
    lyric: "雪人 - 周梓琦.lrc",
    color: ["#e9f5ff", "#8ec5ff"],
  },
  {
    id: "penny-diary",
    title: "佩妮的日记_EM",
    artist: "杨秉音",
    album: "Local Collection",
    file: "杨秉音 - 佩妮的日记_EM.flac",
    lyric: null,
    color: ["#ff9f7a", "#9ca3ff"],
  },
  {
    id: "nocturne",
    title: "夜曲2X18_EG",
    artist: "杨秉音",
    album: "Local Collection",
    file: "杨秉音 - 夜曲2X18_EG.flac",
    lyric: null,
    color: ["#4d5bff", "#6ee7c8"],
  },
];

let tracks = [...builtinTracks];

const state = {
  currentIndex: 0,
  queue: tracks.map((_, index) => index),
  lyrics: [],
  lyricIndex: -1,
  mode: localStorage.getItem("lyra-mode") || "list",
  isSeeking: false,
  favorites: new Set(JSON.parse(localStorage.getItem("lyra-favorites") || "[]")),
  audioContext: null,
  analyser: null,
  source: null,
  animationFrame: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const els = {
  audio: $("#audioPlayer"),
  trackList: $("#trackList"),
  queueList: $("#queueList"),
  lyricsView: $("#lyricsView"),
  search: $("#searchInput"),
  formatFilter: $("#formatFilter"),
  currentTitle: $("#currentTitle"),
  currentArtist: $("#currentArtist"),
  currentFormat: $("#currentFormat"),
  currentTime: $("#currentTime"),
  durationTime: $("#durationTime"),
  progress: $("#progressSlider"),
  volume: $("#volumeSlider"),
  playPause: $("#playPauseButton"),
  prev: $("#prevButton"),
  next: $("#nextButton"),
  mode: $("#modeButton"),
  mute: $("#muteButton"),
  lyricBadge: $("#lyricBadge"),
  sourceBadge: $("#sourceBadge"),
  heroLyric: $("#heroLyric"),
  miniTitle: $("#miniTitle"),
  miniArtist: $("#miniArtist"),
  miniCover: $("#miniCover"),
  disc: $("#albumDisc"),
  discInitial: $("#discInitial"),
  playStatus: $("#playStatus"),
  favorite: $("#favoriteButton"),
  canvas: $("#visualizer"),
  toast: $("#toast"),
};

const canvasContext = els.canvas.getContext("2d");

function encodePath(file) {
  return SONG_BASE + file.split("/").map(encodeURIComponent).join("/");
}

function getCurrentTrack() {
  return tracks[state.currentIndex];
}

function getExtension(file) {
  return file.split(".").pop().toUpperCase();
}

function getBaseName(fileName) {
  return fileName.replace(/\.[^/.]+$/, "").trim().toLowerCase();
}

function splitName(track) {
  return `${track.title} ${track.artist} ${track.album} ${getExtension(track.file)}`.toLowerCase();
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 1800);
}

function renderLibrary() {
  const query = els.search.value.trim().toLowerCase();
  const format = els.formatFilter.value;
  const filtered = tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => {
      const matchesFormat = format === "all" || getExtension(track.file).toLowerCase() === format;
      return matchesFormat && splitName(track).includes(query);
    });

  els.trackList.innerHTML = filtered.length
    ? filtered.map(({ track, index }) => renderTrackButton(track, index)).join("")
    : `<div class="empty-state">没有找到匹配的歌曲。试试换一个关键词或格式筛选。</div>`;
}

function renderTrackButton(track, index) {
  const isActive = index === state.currentIndex;
  const hasLyrics = Boolean(track.lyric);
  return `
    <button class="track-item ${isActive ? "active" : ""}" type="button" data-index="${index}">
      <span class="track-cover" style="--cover-a:${track.color[0]};--cover-b:${track.color[1]}">${track.title.charAt(0)}</span>
      <span class="track-meta">
        <strong>${track.title}</strong>
        <span>${track.artist} · ${track.album}</span>
      </span>
      <span class="track-extra">${getExtension(track.file)} · ${hasLyrics ? "LRC" : "纯音乐/无歌词"}</span>
    </button>
  `;
}

function renderQueue() {
  els.queueList.innerHTML = state.queue
    .map((trackIndex, queueIndex) => {
      const track = tracks[trackIndex];
      const active = trackIndex === state.currentIndex;
      return `
        <button class="queue-item ${active ? "active" : ""}" type="button" data-index="${trackIndex}">
          <span class="queue-index">${queueIndex + 1}</span>
          <span class="queue-meta">
            <strong>${track.title}</strong>
            <span>${track.artist}</span>
          </span>
          <span class="track-extra">${getExtension(track.file)}</span>
        </button>
      `;
    })
    .join("");
}

function updateNowPlaying() {
  const track = getCurrentTrack();
  const [firstColor, secondColor] = track.color;
  document.documentElement.style.setProperty("--accent", firstColor);
  document.documentElement.style.setProperty("--accent-2", secondColor);
  els.currentTitle.textContent = track.title;
  els.currentArtist.textContent = `${track.artist} · ${track.album}`;
  els.currentFormat.textContent = getExtension(track.file);
  els.sourceBadge.textContent = track.local ? "本地导入" : "内置曲库";
  els.miniTitle.textContent = track.title;
  els.miniArtist.textContent = track.artist;
  els.discInitial.textContent = track.title.charAt(0).toUpperCase();
  els.miniCover.textContent = track.title.charAt(0).toUpperCase();
  els.miniCover.style.background = `linear-gradient(135deg, ${firstColor}, ${secondColor})`;
  els.lyricBadge.textContent = track.lyric ? "正在读取歌词" : "无歌词文件";
  els.favorite.classList.toggle("favorite-active", state.favorites.has(track.id));
  renderLibrary();
  renderQueue();
}

async function loadTrack(index, autoplay = false) {
  state.currentIndex = index;
  state.lyricIndex = -1;
  const track = getCurrentTrack();
  els.audio.src = track.url || encodePath(track.file);
  els.audio.load();
  updateNowPlaying();
  await loadLyrics(track);
  updateProgress();
  if (autoplay) {
    await playAudio();
  }
}

async function loadLyrics(track) {
  state.lyrics = [];
  els.lyricsView.innerHTML = `<div class="empty-state">正在读取歌词...</div>`;
  els.heroLyric.textContent = "歌词载入中...";

  if (!track.lyric && !track.lyricFile) {
    els.lyricBadge.textContent = "没有匹配的 LRC 歌词";
    els.lyricsView.innerHTML = `<div class="empty-state">这首歌没有同名歌词文件，播放器会保留可视化和基础播放控制。</div>`;
    els.heroLyric.textContent = "暂无歌词，享受这一段旋律。";
    return;
  }

  try {
    let buffer;
    if (track.lyricFile) {
      buffer = await track.lyricFile.arrayBuffer();
    } else {
      const response = await fetch(encodePath(track.lyric), { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      buffer = await response.arrayBuffer();
    }
    const text = decodeLyricBuffer(buffer);
    state.lyrics = parseLrc(text);
    if (!state.lyrics.length) {
      throw new Error("歌词文件里没有可同步的时间轴");
    }
    els.lyricBadge.textContent = `${state.lyrics.length} 行同步歌词`;
    renderLyrics();
    updateLyric(0, true);
  } catch (error) {
    els.lyricBadge.textContent = "歌词读取失败";
    els.lyricsView.innerHTML = `<div class="empty-state">歌词读取失败。内置曲库请通过本地服务器打开；本地导入模式请确认同名 .lrc 已被一起选择。<br>${error.message}</div>`;
    els.heroLyric.textContent = "歌词读取失败，但歌曲仍可播放。";
  }
}

function importLocalFiles(fileList) {
  const files = [...fileList];
  const audioPattern = /\.(mp3|flac|wav|ogg|m4a)$/i;
  const audioFiles = files.filter((file) => audioPattern.test(file.name));
  const lyricFiles = new Map(
    files
      .filter((file) => /\.lrc$/i.test(file.name))
      .map((file) => [getBaseName(file.name), file]),
  );

  if (!audioFiles.length) {
    showToast("没有在所选文件夹中找到音频文件。");
    return;
  }

  tracks.forEach((track) => {
    if (track.local && track.url) URL.revokeObjectURL(track.url);
  });

  tracks = audioFiles
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
    .map((file, index) => {
      const baseName = getBaseName(file.name);
      const [titlePart, artistPart] = file.name.replace(/\.[^/.]+$/, "").split(" - ");
      const palette = [
        ["#6ee7c8", "#9ca3ff"],
        ["#ffbf69", "#ff6878"],
        ["#55d6ff", "#ff8bd1"],
        ["#f8e16c", "#6ee7c8"],
      ][index % 4];
      return {
        id: `local-${index}-${file.name}`,
        title: titlePart?.trim() || file.name.replace(/\.[^/.]+$/, ""),
        artist: artistPart?.trim() || "本地音乐",
        album: file.webkitRelativePath ? file.webkitRelativePath.split("/").slice(0, -1).join("/") || "本地文件夹" : "本地文件夹",
        file: file.name,
        url: URL.createObjectURL(file),
        lyric: lyricFiles.has(baseName) ? lyricFiles.get(baseName).name : null,
        lyricFile: lyricFiles.get(baseName) || null,
        local: true,
        color: palette,
      };
    });

  state.queue = tracks.map((_, index) => index);
  state.currentIndex = 0;
  state.lyricIndex = -1;
  $("#statSongs").textContent = tracks.length;
  $("#statLyrics").textContent = tracks.filter((track) => track.lyricFile || track.lyric).length;
  renderLibrary();
  renderQueue();
  loadTrack(0, false);
  showToast(`已导入 ${tracks.length} 首本地歌曲`);
}

function decodeLyricBuffer(buffer) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
  if (replacementCount <= 2) return utf8;
  try {
    return new TextDecoder("gb18030", { fatal: false }).decode(buffer);
  } catch {
    return utf8;
  }
}

function parseLrc(text) {
  const metadataPattern = /^\[(ti|ar|al|by|offset):/i;
  return text
    .split(/\r?\n/)
    .flatMap((line) => {
      if (!line.trim() || metadataPattern.test(line)) return [];
      const matches = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
      const lyricText = line.replace(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g, "").trim();
      if (!matches.length) return [];
      return matches.map((match) => {
        const [, minutes, seconds, fraction = "0"] = match;
        const ms = Number(fraction.padEnd(3, "0").slice(0, 3));
        return {
          time: Number(minutes) * 60 + Number(seconds) + ms / 1000,
          text: lyricText || "♪",
        };
      });
    })
    .sort((a, b) => a.time - b.time);
}

function renderLyrics() {
  els.lyricsView.innerHTML = state.lyrics
    .map((line, index) => `<div class="lyric-line" data-lyric-index="${index}">${line.text}</div>`)
    .join("");
}

function updateLyric(currentTime, force = false) {
  if (!state.lyrics.length) return;
  let nextIndex = state.lyrics.findIndex((line, index) => {
    const next = state.lyrics[index + 1];
    return currentTime >= line.time && (!next || currentTime < next.time);
  });
  if (nextIndex < 0 && currentTime < state.lyrics[0].time) nextIndex = 0;
  if (nextIndex === state.lyricIndex && !force) return;

  state.lyricIndex = nextIndex;
  const lines = $$(".lyric-line");
  lines.forEach((line, index) => {
    line.classList.toggle("active", index === nextIndex);
    line.classList.toggle("past", index < nextIndex);
  });

  const activeLine = lines[nextIndex];
  if (activeLine) {
    els.heroLyric.textContent = state.lyrics[nextIndex].text;
    const viewBox = els.lyricsView.getBoundingClientRect();
    const lineBox = activeLine.getBoundingClientRect();
    if (force || lineBox.top < viewBox.top + 40 || lineBox.bottom > viewBox.bottom - 40) {
      activeLine.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }
}

async function playAudio() {
  try {
    await prepareVisualizer();
    await els.audio.play();
  } catch (error) {
    showToast("浏览器阻止了自动播放，请手动点击播放。");
  }
}

function togglePlay() {
  if (!els.audio.src) {
    loadTrack(state.currentIndex, true);
    return;
  }
  if (els.audio.paused) {
    playAudio();
  } else {
    els.audio.pause();
  }
}

function getCurrentQueuePosition() {
  return state.queue.indexOf(state.currentIndex);
}

function playNext() {
  if (state.mode === "one") {
    els.audio.currentTime = 0;
    playAudio();
    return;
  }

  const position = getCurrentQueuePosition();
  const nextPosition = position >= 0 ? (position + 1) % state.queue.length : 0;
  loadTrack(state.queue[nextPosition], true);
}

function playPrev() {
  if (els.audio.currentTime > 4) {
    els.audio.currentTime = 0;
    return;
  }
  const position = getCurrentQueuePosition();
  const prevPosition = position > 0 ? position - 1 : state.queue.length - 1;
  loadTrack(state.queue[prevPosition], true);
}

function shuffleQueue() {
  const current = state.currentIndex;
  const rest = tracks.map((_, index) => index).filter((index) => index !== current);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  state.queue = [current, ...rest];
  renderQueue();
  showToast("队列已随机重排");
}

function cycleMode() {
  const modes = ["list", "shuffle", "one"];
  const next = modes[(modes.indexOf(state.mode) + 1) % modes.length];
  state.mode = next;
  localStorage.setItem("lyra-mode", next);
  if (next === "shuffle") shuffleQueue();
  updateModeButton(true);
}

function updateModeButton(notify = false) {
  const labels = {
    list: "列表循环",
    shuffle: "随机播放",
    one: "单曲循环",
  };
  els.mode.classList.toggle("active", state.mode !== "list");
  els.mode.setAttribute("aria-label", labels[state.mode]);
  els.mode.title = labels[state.mode];
  if (notify) showToast(labels[state.mode]);
}

function updateProgress() {
  if (!state.isSeeking) {
    const duration = els.audio.duration || 0;
    const current = els.audio.currentTime || 0;
    els.progress.value = duration ? Math.round((current / duration) * 1000) : 0;
  }
  els.currentTime.textContent = formatTime(els.audio.currentTime);
  els.durationTime.textContent = formatTime(els.audio.duration);
}

async function prepareVisualizer() {
  if (state.audioContext) {
    if (state.audioContext.state === "suspended") await state.audioContext.resume();
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  state.audioContext = new AudioContextClass();
  state.analyser = state.audioContext.createAnalyser();
  state.analyser.fftSize = 128;
  state.source = state.audioContext.createMediaElementSource(els.audio);
  state.source.connect(state.analyser);
  state.analyser.connect(state.audioContext.destination);
  drawVisualizer();
}

function drawVisualizer() {
  const width = els.canvas.width;
  const height = els.canvas.height;
  const bars = state.analyser ? new Uint8Array(state.analyser.frequencyBinCount) : null;
  if (state.analyser) state.analyser.getByteFrequencyData(bars);

  canvasContext.clearRect(0, 0, width, height);
  const count = bars ? bars.length : 42;
  const gap = 4;
  const barWidth = width / count - gap;
  for (let i = 0; i < count; i += 1) {
    const idle = 0.35 + Math.sin(Date.now() / 400 + i * 0.45) * 0.16;
    const value = bars ? bars[i] / 255 : idle;
    const barHeight = Math.max(8, value * height * 0.82);
    const x = i * (barWidth + gap);
    const y = height - barHeight;
    const gradient = canvasContext.createLinearGradient(0, y, 0, height);
    gradient.addColorStop(0, getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
    gradient.addColorStop(1, getComputedStyle(document.documentElement).getPropertyValue("--accent-2").trim());
    canvasContext.fillStyle = gradient;
    roundedRect(canvasContext, x, y, barWidth, barHeight, 8);
  }
  state.animationFrame = requestAnimationFrame(drawVisualizer);
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.fill();
}

function switchView(view) {
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  const panel = document.querySelector(`[data-panel="${view}"]`);
  if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toggleFavorite() {
  const track = getCurrentTrack();
  if (state.favorites.has(track.id)) {
    state.favorites.delete(track.id);
    showToast("已取消收藏");
  } else {
    state.favorites.add(track.id);
    showToast("已加入喜欢");
  }
  localStorage.setItem("lyra-favorites", JSON.stringify([...state.favorites]));
  els.favorite.classList.toggle("favorite-active", state.favorites.has(track.id));
}

function bindEvents() {
  els.trackList.addEventListener("click", (event) => {
    const item = event.target.closest("[data-index]");
    if (item) loadTrack(Number(item.dataset.index), true);
  });
  els.queueList.addEventListener("click", (event) => {
    const item = event.target.closest("[data-index]");
    if (item) loadTrack(Number(item.dataset.index), true);
  });
  els.search.addEventListener("input", renderLibrary);
  els.formatFilter.addEventListener("change", renderLibrary);
  $("#playAllButton").addEventListener("click", () => loadTrack(0, true));
  $("#localImportButton").addEventListener("click", () => $("#localFolderInput").click());
  $("#localFolderInput").addEventListener("change", (event) => importLocalFiles(event.target.files));
  $("#shuffleButton").addEventListener("click", shuffleQueue);
  $("#scrollLyricButton").addEventListener("click", () => updateLyric(els.audio.currentTime, true));
  $("#themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("light");
    localStorage.setItem("lyra-theme", document.body.classList.contains("light") ? "light" : "dark");
  });
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));

  els.playPause.addEventListener("click", togglePlay);
  els.prev.addEventListener("click", playPrev);
  els.next.addEventListener("click", playNext);
  els.mode.addEventListener("click", cycleMode);
  els.favorite.addEventListener("click", toggleFavorite);
  els.mute.addEventListener("click", () => {
    els.audio.muted = !els.audio.muted;
    els.mute.classList.toggle("active", els.audio.muted);
  });
  $("#lyricsToggle").addEventListener("click", () => switchView("lyrics"));

  els.volume.addEventListener("input", () => {
    els.audio.volume = Number(els.volume.value);
    els.audio.muted = els.audio.volume === 0;
    els.mute.classList.toggle("active", els.audio.muted);
  });

  els.progress.addEventListener("input", () => {
    state.isSeeking = true;
    const duration = els.audio.duration || 0;
    els.currentTime.textContent = formatTime((Number(els.progress.value) / 1000) * duration);
  });
  els.progress.addEventListener("change", () => {
    const duration = els.audio.duration || 0;
    els.audio.currentTime = (Number(els.progress.value) / 1000) * duration;
    state.isSeeking = false;
    updateProgress();
  });

  els.audio.addEventListener("play", () => {
    els.playPause.classList.add("is-playing");
    els.disc.classList.add("playing");
    els.playStatus.textContent = "正在播放";
  });
  els.audio.addEventListener("pause", () => {
    els.playPause.classList.remove("is-playing");
    els.disc.classList.remove("playing");
    els.playStatus.textContent = "已暂停";
  });
  els.audio.addEventListener("loadedmetadata", updateProgress);
  els.audio.addEventListener("timeupdate", () => {
    updateProgress();
    updateLyric(els.audio.currentTime);
  });
  els.audio.addEventListener("ended", playNext);
  els.audio.addEventListener("error", () => showToast("音频加载失败，请检查文件路径或浏览器格式支持。"));

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
    if (isTyping) return;
    if (event.code === "Space") {
      event.preventDefault();
      togglePlay();
    }
    if (event.key === "ArrowRight") els.audio.currentTime = Math.min((els.audio.duration || 0), els.audio.currentTime + 5);
    if (event.key === "ArrowLeft") els.audio.currentTime = Math.max(0, els.audio.currentTime - 5);
    if (event.key.toLowerCase() === "l") switchView("lyrics");
  });
}

function initialize() {
  if (localStorage.getItem("lyra-theme") === "light") {
    document.body.classList.add("light");
  }
  $("#statSongs").textContent = tracks.length;
  $("#statLyrics").textContent = tracks.filter((track) => track.lyric).length;
  els.audio.volume = Number(els.volume.value);
  bindEvents();
  renderLibrary();
  renderQueue();
  updateModeButton();
  loadTrack(0, false);
  drawVisualizer();
}

initialize();
