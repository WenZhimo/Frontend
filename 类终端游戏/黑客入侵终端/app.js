(() => {
  const canvas = document.getElementById("terminal");
  const ctx = canvas.getContext("2d", { alpha: false });
  const form = document.querySelector(".seed-bar");
  const seedInput = document.getElementById("seed-input");
  const seedRandomButton = document.getElementById("seed-random");
  const seedCopyButton = document.getElementById("seed-copy");
  const seedStatus = document.getElementById("seed-status");
  const playModeSelect = document.getElementById("play-mode");
  const difficultySelect = document.getElementById("difficulty");

  const COLS = 136;
  const ROWS = 58;
  const CELL_W = 11;
  const CELL_H = 19;
  const FONT_SIZE = 16;
  const FONT = '"Cascadia Mono", "Courier New", Consolas, monospace';
  const SEED_LENGTH = 100;
  const ASCII_FIRST = 32;
  const ASCII_LAST = 126;
  const RANDOM_SEED_CHARS =
    " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
  const FIELD = { x: 4, y: 5, w: 98, h: 46 };
  const RIGHT = { x: 106, y: 2, w: 29, h: 53 };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const color = {
    ink: "#06080d",
    ink2: "#0a0f16",
    panel: "#080c12",
    line: "#2a3548",
    lineDim: "#172231",
    text: "#dffcff",
    header: "#f0f8ff",
    muted: "#7a8397",
    dim: "#465267",
    cyan: "#6ed5ec",
    cyan2: "#aaf6ff",
    green: "#75f0a8",
    gold: "#ffcc66",
    orange: "#ff9f45",
    red: "#ff4d5f",
    red2: "#ff7b6f",
    purple: "#b58cff",
  };

  const difficultyConfig = {
    normal: { trace: 4.8, scan: 1.15, hack: 1.85, noise: 7, firewall: 1 },
    fast: { trace: 6.3, scan: 0.9, hack: 1.45, noise: 10, firewall: 1.2 },
    chaos: { trace: 8.2, scan: 0.7, hack: 1.1, noise: 15, firewall: 1.45 },
  };

  const nodeTypes = ["ENTRY", "VPN", "MAIL", "API", "DB", "CACHE", "AUTH", "BASTION", "CORE"];
  const portPool = [21, 22, 25, 53, 80, 110, 139, 143, 389, 443, 445, 587, 8080, 8443, 9000];

  const screen = {
    ch: Array(COLS * ROWS),
    fg: Array(COLS * ROWS),
    bg: Array(COLS * ROWS),
  };

  const state = {
    seed: "",
    seedHash: 0,
    rng: null,
    mode: "demo",
    difficulty: "normal",
    speed: 1,
    paused: false,
    selected: 0,
    action: null,
    aiDelay: 0,
    game: null,
    packets: [],
    effects: [],
    logs: [],
    lastFrame: 0,
  };

  function idx(x, y) {
    return y * COLS + x;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function mixColor(a, b, t) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ar = (pa >> 16) & 255;
    const ag = (pa >> 8) & 255;
    const ab = pa & 255;
    const br = (pb >> 16) & 255;
    const bg = (pb >> 8) & 255;
    const bb = pb & 255;
    const rr = Math.round(lerp(ar, br, t)).toString(16).padStart(2, "0");
    const rg = Math.round(lerp(ag, bg, t)).toString(16).padStart(2, "0");
    const rb = Math.round(lerp(ab, bb, t)).toString(16).padStart(2, "0");
    return `#${rr}${rg}${rb}`;
  }

  function sanitizeSeed(value) {
    return Array.from(value || "")
      .map((char) => {
        const code = char.charCodeAt(0);
        return code >= ASCII_FIRST && code <= ASCII_LAST ? char : "?";
      })
      .join("")
      .slice(0, SEED_LENGTH)
      .padEnd(SEED_LENGTH, " ");
  }

  function randomSeed() {
    let seed = "";
    if (window.crypto?.getRandomValues) {
      const bytes = new Uint8Array(SEED_LENGTH);
      window.crypto.getRandomValues(bytes);
      for (const byte of bytes) seed += RANDOM_SEED_CHARS[byte % RANDOM_SEED_CHARS.length];
      return seed;
    }
    for (let i = 0; i < SEED_LENGTH; i += 1) {
      seed += RANDOM_SEED_CHARS[Math.floor(Math.random() * RANDOM_SEED_CHARS.length)];
    }
    return seed;
  }

  function fnv1a(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash01(x, y, salt = 0) {
    let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 1442695041, 2246822519);
    h ^= state.seedHash + salt * 1597334677;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function updateSeedStatus() {
    seedStatus.value = `LEN ${String(seedInput.value.length).padStart(3, "0")}/100`;
  }

  function addLog(message, tone = "info") {
    state.logs.unshift({ message, tone, time: Math.round(state.game?.elapsed || 0) });
    state.logs = state.logs.slice(0, 42);
  }

  function shuffle(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(state.rng() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function makePorts() {
    const ports = shuffle([...portPool]).slice(0, 3 + Math.floor(state.rng() * 3));
    ports.sort((a, b) => a - b);
    return ports;
  }

  function makeNetwork() {
    const names = ["GATE", "VAULT", "MAIL", "AUTH", "ORCH", "BLOB", "REPO", "VPN", "LOG", "API", "DB", "CACHE", "IDS", "CDN", "BILL", "ROOT", "KERN", "CORE"];
    const nodes = names.map((name, i) => {
      const layer = i === 0 ? 0 : i === names.length - 1 ? 5 : 1 + Math.floor((i - 1) / 4);
      const inLayer = i === 0 || i === names.length - 1 ? 0 : (i - 1) % 4;
      const x = Math.round(FIELD.x + 10 + layer * 16 + (state.rng() - 0.5) * 5);
      const y = Math.round(FIELD.y + 7 + inLayer * 9 + (state.rng() - 0.5) * 5);
      const type = i === 0 ? "ENTRY" : i === names.length - 1 ? "CORE" : nodeTypes[1 + Math.floor(state.rng() * (nodeTypes.length - 2))];
      return {
        id: i,
        name,
        type,
        x,
        y,
        level: i === 0 ? 1 : i === names.length - 1 ? 9 : 2 + Math.floor(state.rng() * 7),
        firewall: i === 0 ? 0 : i === names.length - 1 ? 9 : 1 + Math.floor(state.rng() * 8),
        ports: makePorts(),
        scanned: i === 0,
        discovered: i === 0,
        owned: i === 0,
      };
    });
    nodes[nodes.length - 1].x = FIELD.x + FIELD.w - 10;
    nodes[nodes.length - 1].y = FIELD.y + Math.floor(FIELD.h / 2);
    const links = [];
    function addLink(a, b) {
      if (a === b || links.some((link) => (link.a === a && link.b === b) || (link.a === b && link.b === a))) return;
      links.push({ a, b, heat: 0 });
    }
    for (let i = 0; i < nodes.length - 1; i += 1) {
      const next = Math.min(nodes.length - 1, i + 1 + Math.floor(state.rng() * 3));
      addLink(i, next);
      if (i < nodes.length - 4 && state.rng() < 0.7) addLink(i, i + 3 + Math.floor(state.rng() * 2));
    }
    for (let i = 1; i < nodes.length - 2; i += 1) {
      if (state.rng() < 0.45) addLink(i, Math.min(nodes.length - 1, i + 4));
    }
    addLink(0, 1);
    addLink(nodes.length - 3, nodes.length - 1);
    addLink(nodes.length - 2, nodes.length - 1);
    return { nodes, links };
  }

  function initGame(seed = state.seed, { reroll = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash || 1);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    const network = makeNetwork();
    state.game = {
      elapsed: 0,
      access: 1,
      trace: 0,
      stealth: 100,
      status: "LIVE",
      nodes: network.nodes,
      links: network.links,
      exploits: 0,
      scans: 0,
    };
    state.selected = 0;
    state.action = null;
    state.aiDelay = 0.3;
    state.packets = [];
    state.effects = [];
    state.logs = [];
    state.paused = false;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    addLog(reroll ? "NEW TARGET GRAPH" : "TARGET GRAPH READY", "ok");
    addLog(`${state.mode.toUpperCase()} / ${state.difficulty.toUpperCase()}`, "info");
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(COLS * CELL_W * dpr);
    canvas.height = Math.floor(ROWS * CELL_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${FONT_SIZE}px ${FONT}`;
    ctx.textBaseline = "top";
    ctx.imageSmoothingEnabled = false;
  }

  function clearScreen() {
    screen.ch.fill(" ");
    screen.fg.fill(color.text);
    screen.bg.fill(color.ink);
  }

  function setCell(x, y, ch, fg = color.text, bg = null) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= COLS || iy < 0 || iy >= ROWS) return;
    const id = idx(ix, iy);
    screen.ch[id] = ch;
    screen.fg[id] = fg;
    if (bg) screen.bg[id] = bg;
  }

  function writeText(x, y, text, fg = color.text, bg = null) {
    Array.from(text).forEach((ch, i) => setCell(x + i, y, ch, fg, bg));
  }

  function drawBox(x, y, w, h, fg = color.line, bg = null) {
    for (let ix = x + 1; ix < x + w - 1; ix += 1) {
      setCell(ix, y, "─", fg, bg);
      setCell(ix, y + h - 1, "─", fg, bg);
    }
    for (let iy = y + 1; iy < y + h - 1; iy += 1) {
      setCell(x, iy, "│", fg, bg);
      setCell(x + w - 1, iy, "│", fg, bg);
    }
    setCell(x, y, "┌", fg, bg);
    setCell(x + w - 1, y, "┐", fg, bg);
    setCell(x, y + h - 1, "└", fg, bg);
    setCell(x + w - 1, y + h - 1, "┘", fg, bg);
  }

  function drawLine(x1, y1, x2, y2, glyph, fg) {
    const steps = Math.max(Math.abs(Math.round(x2 - x1)), Math.abs(Math.round(y2 - y1)), 1);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      setCell(lerp(x1, x2, t), lerp(y1, y2, t), glyph, fg);
    }
  }

  function drawTerminalBackground() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const grain = hash01(x, y, 71);
        screen.bg[idx(x, y)] = grain > 0.92 ? "#080d14" : grain > 0.78 ? "#070b11" : color.ink;
        if (grain > 0.972) setCell(x, y, grain > 0.989 ? "1" : "0", color.dim);
      }
    }
  }

  function reachable(node) {
    if (node.owned) return true;
    return state.game.links.some((link) => {
      const other = link.a === node.id ? link.b : link.b === node.id ? link.a : -1;
      return other >= 0 && state.game.nodes[other].owned;
    });
  }

  function revealNeighbors(nodeId) {
    for (const link of state.game.links) {
      const other = link.a === nodeId ? link.b : link.b === nodeId ? link.a : -1;
      if (other >= 0) state.game.nodes[other].discovered = true;
    }
  }

  function addBurst(x, y, baseColor, count = 16, power = 1) {
    if (reducedMotion) return;
    const now = performance.now();
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.5;
      const speed = (7 + state.rng() * 20) * power;
      state.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.74,
        start: now,
        duration: 420 + state.rng() * 320,
        color: baseColor,
        glyph: ["⣿", "⣶", "⣤", "⠿", "▓", "▒"][Math.floor(state.rng() * 6)],
      });
    }
  }

  function sendPacket(from, to, baseColor, glyph = "◆", duration = 460) {
    if (reducedMotion || !from || !to) return;
    state.packets.push({
      from: from.id,
      to: to.id,
      start: performance.now(),
      duration,
      color: baseColor,
      glyph,
    });
    state.packets = state.packets.slice(-90);
  }

  function startAction(type, node) {
    const game = state.game;
    const config = difficultyConfig[state.difficulty];
    if (game.status !== "LIVE" || state.action) return false;
    if (!node.discovered || !reachable(node)) {
      addLog("NO ROUTE TO TARGET", "bad");
      return false;
    }
    if (type === "hack" && !node.scanned) {
      addLog("SCAN PORTS FIRST", "bad");
      return false;
    }
    if (node.owned && node.id !== 0) {
      addLog("ALREADY ROOTED", "info");
      return false;
    }
    const source =
      game.nodes.find((candidate) =>
        game.links.some(
          (link) =>
            candidate.owned &&
            ((link.a === candidate.id && link.b === node.id) || (link.b === candidate.id && link.a === node.id)),
        ),
      ) || game.nodes[0];
    const hardness = type === "scan" ? node.firewall * 0.08 : node.level * 0.13 + node.firewall * 0.08;
    const duration = (type === "scan" ? config.scan : config.hack) + hardness;
    state.action = { type, node: node.id, source: source.id, progress: 0, duration };
    sendPacket(source, node, type === "scan" ? color.cyan : color.green, type === "scan" ? "◇" : "◆", duration * 900);
    addLog(`${type.toUpperCase()} ${node.name}`, type === "hack" ? "ok" : "info");
    return true;
  }

  function finishAction() {
    const game = state.game;
    const action = state.action;
    const node = game.nodes[action.node];
    const config = difficultyConfig[state.difficulty];
    if (action.type === "scan") {
      node.scanned = true;
      node.discovered = true;
      game.scans += 1;
      revealNeighbors(node.id);
      addBurst(node.x, node.y, color.cyan, 20, 0.8);
      addLog(`OPEN ${node.ports.join("/")}`, "ok");
      game.trace = clamp(game.trace + node.firewall * 0.55, 0, 100);
    } else {
      const roll = state.rng() * 10 + game.access * 0.75;
      const alarm = Math.max(0, node.firewall - roll);
      node.owned = true;
      node.scanned = true;
      node.discovered = true;
      game.access += 1;
      game.exploits += 1;
      revealNeighbors(node.id);
      addBurst(node.x, node.y, node.type === "CORE" ? color.gold : color.green, node.type === "CORE" ? 54 : 32, 1.2);
      addLog(`${node.name} ROOTED`, "ok");
      game.trace = clamp(game.trace + alarm * 2.7 * config.firewall, 0, 100);
      if (node.type === "CORE") {
        game.status = "CORE OWNED";
        addLog("EXFIL COMPLETE", "ok");
      }
    }
    state.action = null;
  }

  function chooseAITarget() {
    const game = state.game;
    const frontier = game.nodes.filter((node) => node.discovered && reachable(node) && !node.owned);
    if (!frontier.length) return null;
    const core = frontier.find((node) => node.type === "CORE" && node.scanned);
    if (core) return { type: "hack", node: core };
    const unscanned = frontier
      .filter((node) => !node.scanned)
      .sort((a, b) => a.firewall + a.level - (b.firewall + b.level))[0];
    if (unscanned) return { type: "scan", node: unscanned };
    const target = frontier.sort((a, b) => a.level + a.firewall - (b.level + b.firewall))[0];
    return target ? { type: "hack", node: target } : null;
  }

  function updateAI(dt) {
    if (state.mode !== "demo" || state.action || state.game.status !== "LIVE") return;
    state.aiDelay -= dt;
    if (state.aiDelay > 0) return;
    const choice = chooseAITarget();
    if (choice) {
      state.selected = choice.node.id;
      startAction(choice.type, choice.node);
    }
    state.aiDelay = 0.35 + state.rng() * 0.3;
  }

  function updateAction(dt) {
    const game = state.game;
    const config = difficultyConfig[state.difficulty];
    if (!state.action) return;
    const node = game.nodes[state.action.node];
    state.action.progress += dt;
    game.trace = clamp(game.trace + dt * config.trace * (state.action.type === "hack" ? 0.95 : 0.42), 0, 100);
    game.stealth = clamp(100 - game.trace, 0, 100);
    if (state.action.progress >= state.action.duration) finishAction();
    if (state.rng() < dt * config.noise) addBurst(node.x, node.y, state.action.type === "hack" ? color.green : color.cyan, 3, 0.35);
  }

  function updatePackets(now) {
    state.packets = state.packets.filter((packet) => now - packet.start < packet.duration);
  }

  function update(dt) {
    const game = state.game;
    if (!game || state.paused || game.status !== "LIVE") return;
    game.elapsed += dt;
    updateAI(dt);
    updateAction(dt);
    game.trace = clamp(game.trace - dt * (game.access > 5 ? 2.8 : 1.3), 0, 100);
    game.stealth = clamp(100 - game.trace, 0, 100);
    if (game.trace >= 100) {
      game.status = "TRACE LOCK";
      addLog("TRACE LOCKED", "bad");
      addBurst(FIELD.x + FIELD.w / 2, FIELD.y + FIELD.h / 2, color.red, 70, 1.45);
    }
  }

  function drawField() {
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line);
    for (let y = FIELD.y + 1; y < FIELD.y + FIELD.h - 1; y += 1) {
      for (let x = FIELD.x + 1; x < FIELD.x + FIELD.w - 1; x += 1) {
        const pulse = hash01(x, y, 83);
        screen.bg[idx(x, y)] = pulse > 0.9 ? "#07121a" : "#070d14";
        if (pulse > 0.963) setCell(x, y, pulse > 0.986 ? "×" : "·", color.dim);
      }
    }
    writeText(FIELD.x + 2, FIELD.y - 2, "TARGET NETWORK :: PORT SCAN / EXPLOIT / EXFIL", color.header);
  }

  function drawNetwork() {
    const game = state.game;
    for (const link of game.links) {
      const a = game.nodes[link.a];
      const b = game.nodes[link.b];
      if (!a.discovered && !b.discovered) continue;
      const hot = a.owned || b.owned;
      drawLine(a.x, a.y, b.x, b.y, hot ? "·" : "⠂", hot ? color.line : color.lineDim);
    }
    for (const packet of state.packets) {
      const a = game.nodes[packet.from];
      const b = game.nodes[packet.to];
      const t = clamp((performance.now() - packet.start) / packet.duration, 0, 1);
      setCell(lerp(a.x, b.x, t), lerp(a.y, b.y, t), packet.glyph, mixColor(packet.color, color.ink, t * 0.35));
    }
    for (const node of game.nodes) drawNode(node);
  }

  function drawNode(node) {
    if (!node.discovered) return;
    const selected = node.id === state.selected;
    const fg = node.owned ? color.green : node.type === "CORE" ? color.gold : node.scanned ? color.cyan : color.muted;
    const bg = selected ? "#10202a" : node.owned ? "#07170e" : null;
    const x = node.x - 3;
    const y = node.y - 1;
    writeText(x, y, selected ? "▛▀▀▀▜" : "┌───┐", selected ? color.cyan2 : fg, bg);
    writeText(x, y + 1, `${node.owned ? "●" : node.scanned ? "◌" : "?"}${node.name.slice(0, 3)}${node.type === "CORE" ? "!" : " "}`, fg, bg);
    writeText(x, y + 2, selected ? "▙▄▄▄▟" : "└───┘", selected ? color.cyan2 : fg, bg);
  }

  function drawEffects(now) {
    state.effects = state.effects.filter((fx) => now - fx.start < fx.duration);
    for (const fx of state.effects) {
      const t = clamp((now - fx.start) / fx.duration, 0, 1);
      setCell(fx.x + fx.vx * t * 0.04, fx.y + fx.vy * t * 0.04, fx.glyph, mixColor(fx.color, color.ink, t));
    }
  }

  function drawHud() {
    const game = state.game;
    const selected = game.nodes[state.selected];
    drawBox(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line);
    writeText(RIGHT.x + 2, RIGHT.y + 2, "INTRUSION", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 4, `ACCESS ${String(game.access).padStart(2, "0")}/${game.nodes.length}`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 5, `SCAN   ${String(game.scans).padStart(2, "0")}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 6, `ROOT   ${String(game.exploits).padStart(2, "0")}`, color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 8, `MODE   ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 9, `SPD    ${state.speed.toFixed(1)}X`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 12, "TRACE", color.header);
    const trace = Math.round((game.trace / 100) * 20);
    writeText(RIGHT.x + 2, RIGHT.y + 14, `[${"█".repeat(trace)}${" ".repeat(20 - trace)}]`, game.trace > 78 ? color.red : color.orange);
    writeText(RIGHT.x + 2, RIGHT.y + 16, game.status, game.status === "LIVE" ? color.cyan : game.status === "CORE OWNED" ? color.green : color.red);
    writeText(RIGHT.x + 2, RIGHT.y + 19, "TARGET", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 21, `${selected.name} / ${selected.type}`, selected.owned ? color.green : color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 22, `LVL ${selected.level}  FW ${selected.firewall}`, color.muted);
    writeText(RIGHT.x + 2, RIGHT.y + 23, selected.scanned ? `PORT ${selected.ports.join(",")}`.slice(0, 24) : "PORT ???", selected.scanned ? color.gold : color.muted);
    if (state.action) {
      const active = game.nodes[state.action.node];
      const done = Math.round((state.action.progress / state.action.duration) * 20);
      writeText(RIGHT.x + 2, RIGHT.y + 26, `${state.action.type.toUpperCase()} ${active.name}`, color.header);
      writeText(RIGHT.x + 2, RIGHT.y + 28, `[${"█".repeat(done)}${" ".repeat(20 - done)}]`, state.action.type === "hack" ? color.green : color.cyan);
    } else {
      writeText(RIGHT.x + 2, RIGHT.y + 26, "ACTION READY", color.muted);
    }
    writeText(RIGHT.x + 2, RIGHT.y + 31, "LOG", color.header);
    state.logs.slice(0, 16).forEach((entry, i) => {
      const fg = entry.tone === "bad" ? color.red : entry.tone === "ok" ? color.green : color.muted;
      writeText(RIGHT.x + 2, RIGHT.y + 33 + i, `>${entry.message.slice(0, 22)}`, fg);
    });
    writeText(4, 54, "1 0.5X  2 1X  3 2X  4 4X   TAB/ARROWS TARGET   SPACE SCAN   ENTER HACK   P PAUSE   R REROLL   B HOME", color.muted);
  }

  function renderScreen() {
    ctx.fillStyle = color.ink;
    ctx.fillRect(0, 0, COLS * CELL_W, ROWS * CELL_H);
    ctx.font = `${FONT_SIZE}px ${FONT}`;
    ctx.textBaseline = "top";
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const id = idx(x, y);
        ctx.fillStyle = screen.bg[id] || color.ink;
        ctx.fillRect(x * CELL_W, y * CELL_H, CELL_W, CELL_H);
        const ch = screen.ch[id];
        if (ch && ch !== " ") {
          ctx.fillStyle = screen.fg[id] || color.text;
          ctx.fillText(ch, x * CELL_W, y * CELL_H + 1);
        }
      }
    }
  }

  function draw(now) {
    clearScreen();
    drawTerminalBackground();
    drawField();
    drawNetwork();
    drawEffects(now);
    if (state.paused) writeText(FIELD.x + 42, FIELD.y + 23, "PAUSED", color.green);
    if (state.game?.status && state.game.status !== "LIVE") {
      const fg = state.game.status === "CORE OWNED" ? color.green : color.red;
      writeText(FIELD.x + 34, FIELD.y + 23, `${state.game.status} - R RESTART`, fg);
    }
    drawHud();
    renderScreen();
  }

  function frame(now) {
    const dt = clamp((now - (state.lastFrame || now)) / 1000, 0, 0.05) * state.speed;
    state.lastFrame = now;
    update(dt);
    updatePackets(now);
    draw(now);
    requestAnimationFrame(frame);
  }

  function selectRelative(direction) {
    const nodes = state.game.nodes.filter((node) => node.discovered);
    const current = state.game.nodes[state.selected];
    let best = null;
    let bestScore = Infinity;
    for (const node of nodes) {
      if (node.id === current.id) continue;
      const dx = node.x - current.x;
      const dy = node.y - current.y;
      if (direction === "right" && dx <= 0) continue;
      if (direction === "left" && dx >= 0) continue;
      if (direction === "down" && dy <= 0) continue;
      if (direction === "up" && dy >= 0) continue;
      const score = Math.abs(direction === "left" || direction === "right" ? dy * 2 : dx * 2) + Math.hypot(dx, dy);
      if (score < bestScore) {
        best = node;
        bestScore = score;
      }
    }
    if (best) state.selected = best.id;
  }

  function setSpeed(key) {
    const speeds = { "1": 0.5, "2": 1, "3": 2, "4": 4 };
    if (!speeds[key]) return false;
    state.speed = speeds[key];
    addLog(`SPEED ${state.speed}X`, "ok");
    return true;
  }

  function goHome() {
    window.location.href = "../index.html";
  }

  window.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (setSpeed(key)) {
      event.preventDefault();
      return;
    }
    if (key === "b") {
      event.preventDefault();
      goHome();
      return;
    }
    if (key === "p") {
      event.preventDefault();
      state.paused = !state.paused;
      addLog(state.paused ? "PAUSED" : "RESUMED", "info");
      return;
    }
    if (key === "r") {
      event.preventDefault();
      initGame(randomSeed(), { reroll: true });
      return;
    }
    if (key === "tab") {
      event.preventDefault();
      const visible = state.game.nodes.filter((node) => node.discovered);
      const index = visible.findIndex((node) => node.id === state.selected);
      state.selected = visible[(index + 1) % visible.length].id;
      return;
    }
    if (event.key === "ArrowRight") selectRelative("right");
    else if (event.key === "ArrowLeft") selectRelative("left");
    else if (event.key === "ArrowUp") selectRelative("up");
    else if (event.key === "ArrowDown") selectRelative("down");
    else if (key === " ") startAction("scan", state.game.nodes[state.selected]);
    else if (key === "enter") startAction("hack", state.game.nodes[state.selected]);
    if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", " ", "Enter"].includes(event.key)) event.preventDefault();
  });

  seedInput.addEventListener("input", updateSeedStatus);

  seedRandomButton.addEventListener("click", () => {
    seedInput.value = randomSeed().trimEnd();
    updateSeedStatus();
  });

  seedCopyButton.addEventListener("click", async () => {
    const seed = sanitizeSeed(seedInput.value || state.seed);
    seedInput.value = seed.trimEnd();
    updateSeedStatus();
    try {
      await navigator.clipboard.writeText(seed);
      seedStatus.value = "COPIED";
    } catch {
      seedStatus.value = "COPY FAIL";
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    initGame(seedInput.value || randomSeed());
  });

  window.addEventListener("resize", resizeCanvas);

  resizeCanvas();
  initGame(randomSeed());
  draw(performance.now());
  requestAnimationFrame(frame);
})();
