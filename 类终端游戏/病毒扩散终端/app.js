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
    normal: { grow: 2.7, spread: 6.5, cure: 7.2, response: 22, outbreaks: 8 },
    fast: { grow: 3.8, spread: 5.0, cure: 6.4, response: 25, outbreaks: 7 },
    chaos: { grow: 5.1, spread: 3.8, cure: 5.5, response: 29, outbreaks: 6 },
  };

  const cityNames = [
    "ALBA",
    "BRNO",
    "CAIR",
    "DELTA",
    "EDEN",
    "FARO",
    "GENE",
    "HELIX",
    "ION",
    "JUNO",
    "KYOTO",
    "LIMA",
    "MESA",
    "NOVA",
    "OSLO",
    "PAX",
    "QUITO",
    "RIO",
    "SEOUL",
    "TYCHO",
  ];

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
    aiDelay: 0,
    game: null,
    flows: [],
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

  function makeMap() {
    const nodes = cityNames.map((name, i) => {
      const col = i % 5;
      const row = Math.floor(i / 5);
      return {
        id: i,
        name,
        x: Math.round(FIELD.x + 10 + col * 18 + (state.rng() - 0.5) * 5),
        y: Math.round(FIELD.y + 7 + row * 10 + (state.rng() - 0.5) * 4),
        infection: 0,
        resistance: 45 + Math.floor(state.rng() * 40),
        quarantine: 0,
        treatment: 0,
      };
    });
    const links = [];
    function addLink(a, b) {
      if (a === b || links.some((link) => (link.a === a && link.b === b) || (link.a === b && link.b === a))) return;
      links.push({ a, b });
    }
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const id = row * 5 + col;
        if (col < 4) addLink(id, id + 1);
        if (row < 3) addLink(id, id + 5);
        if (col < 4 && row < 3 && state.rng() < 0.42) addLink(id, id + 6);
        if (col > 0 && row < 3 && state.rng() < 0.32) addLink(id, id + 4);
      }
    }
    for (const node of nodes.slice().sort(() => state.rng() - 0.5).slice(0, 4)) {
      node.infection = 30 + Math.floor(state.rng() * 45);
    }
    return { nodes, links };
  }

  function initGame(seed = state.seed, { reroll = false } = {}) {
    state.seed = sanitizeSeed(seed || randomSeed());
    state.seedHash = fnv1a(state.seed);
    state.rng = mulberry32(state.seedHash || 1);
    state.mode = playModeSelect.value || "demo";
    state.difficulty = difficultySelect.value || "normal";
    const map = makeMap();
    state.game = {
      elapsed: 0,
      status: "LIVE",
      cure: 0,
      outbreaks: 0,
      supplies: 8,
      spreadTimer: difficultyConfig[state.difficulty].spread,
      nodes: map.nodes,
      links: map.links,
      agents: [
        { id: 0, x: map.nodes[0].x, y: map.nodes[0].y, target: 0, task: "IDLE" },
        { id: 1, x: map.nodes[9].x, y: map.nodes[9].y, target: 9, task: "IDLE" },
        { id: 2, x: map.nodes[15].x, y: map.nodes[15].y, target: 15, task: "IDLE" },
      ],
    };
    state.selected = 0;
    state.aiDelay = 0.4;
    state.flows = [];
    state.effects = [];
    state.logs = [];
    state.paused = false;
    seedInput.value = state.seed.trimEnd();
    updateSeedStatus();
    addLog(reroll ? "NEW OUTBREAK SEED" : "PANDEMIC BOARD READY", "ok");
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
        const grain = hash01(x, y, 117);
        screen.bg[idx(x, y)] = grain > 0.91 ? "#080d14" : grain > 0.78 ? "#070b11" : color.ink;
        if (grain > 0.972) setCell(x, y, grain > 0.988 ? "+" : "·", color.dim);
      }
    }
  }

  function addBurst(x, y, baseColor, count = 16, power = 1) {
    if (reducedMotion) return;
    const now = performance.now();
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + state.rng() * 0.46;
      const speed = (6 + state.rng() * 19) * power;
      state.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.75,
        start: now,
        duration: 430 + state.rng() * 320,
        color: baseColor,
        glyph: ["⣿", "⣶", "⣤", "⠿", "▓", "▒"][Math.floor(state.rng() * 6)],
      });
    }
  }

  function addFlow(from, to, baseColor, glyph = "◆", duration = 620) {
    if (reducedMotion) return;
    state.flows.push({
      from: from.id,
      to: to.id,
      start: performance.now(),
      duration,
      color: baseColor,
      glyph,
    });
    state.flows = state.flows.slice(-120);
  }

  function nodeLinks(nodeId) {
    return state.game.links
      .map((link) => (link.a === nodeId ? link.b : link.b === nodeId ? link.a : -1))
      .filter((id) => id >= 0);
  }

  function dispatchAgent(nodeId) {
    const game = state.game;
    if (game.status !== "LIVE" || game.supplies <= 0) {
      addLog("NO DISPATCH AVAILABLE", "bad");
      return false;
    }
    const target = game.nodes[nodeId];
    const agent = game.agents
      .slice()
      .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0];
    agent.target = nodeId;
    agent.task = "RESPONSE";
    game.supplies -= 1;
    addLog(`TEAM ${agent.id + 1} -> ${target.name}`, "ok");
    addFlow(game.nodes[Math.round(agent.target)] || target, target, color.cyan, "◇", 420);
    return true;
  }

  function quarantineNode(nodeId) {
    const game = state.game;
    const node = game.nodes[nodeId];
    if (game.status !== "LIVE" || game.supplies < 2) {
      addLog("QUARANTINE DENIED", "bad");
      return false;
    }
    node.quarantine = 10;
    game.supplies -= 2;
    addLog(`${node.name} QUARANTINED`, "ok");
    addBurst(node.x, node.y, color.purple, 26, 0.95);
    return true;
  }

  function chooseAITask() {
    const game = state.game;
    const dangerous = game.nodes
      .slice()
      .sort((a, b) => b.infection + b.resistance * 0.12 + (b.quarantine ? -35 : 0) - (a.infection + a.resistance * 0.12 + (a.quarantine ? -35 : 0)))[0];
    if (!dangerous) return;
    if (dangerous.infection > 78 && !dangerous.quarantine && game.supplies >= 2) quarantineNode(dangerous.id);
    else if (dangerous.infection > 8 && game.supplies >= 1) dispatchAgent(dangerous.id);
  }

  function updateAI(dt) {
    if (state.mode !== "demo" || state.game.status !== "LIVE") return;
    state.aiDelay -= dt;
    if (state.aiDelay > 0) return;
    chooseAITask();
    state.aiDelay = 0.7 + state.rng() * 0.55;
  }

  function updateAgents(dt) {
    const game = state.game;
    const config = difficultyConfig[state.difficulty];
    for (const agent of game.agents) {
      const target = game.nodes[agent.target];
      const dx = target.x - agent.x;
      const dy = target.y - agent.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.3) {
        const step = Math.min(dist, config.response * dt);
        agent.x += (dx / dist) * step;
        agent.y += (dy / dist) * step;
        if (state.rng() < dt * 8) addFlow({ id: agent.target, x: agent.x, y: agent.y }, target, color.cyan, "·", 180);
      } else {
        agent.task = target.infection > 1 ? "TREAT" : "RESEARCH";
        if (target.infection > 0) {
          target.infection = clamp(target.infection - dt * (18 + game.cure * 0.08), 0, 100);
          target.treatment = 0.25;
          if (state.rng() < dt * 10) addBurst(target.x, target.y, color.cyan, 4, 0.35);
        } else {
          game.cure = clamp(game.cure + dt * config.cure, 0, 100);
          game.supplies = clamp(game.supplies + dt * 0.38, 0, 12);
        }
      }
    }
  }

  function spreadInfection() {
    const game = state.game;
    const infected = game.nodes.filter((node) => node.infection > 12);
    if (!infected.length) return;
    const source = infected[Math.floor(state.rng() * infected.length)];
    const neighbors = nodeLinks(source.id).map((id) => game.nodes[id]);
    const candidates = neighbors.filter((node) => node.quarantine <= 0);
    if (!candidates.length) return;
    const target = candidates[Math.floor(state.rng() * candidates.length)];
    const amount = 8 + state.rng() * 16 + source.infection * 0.08;
    target.infection = clamp(target.infection + amount * (1 - game.cure / 160), 0, 112);
    addFlow(source, target, color.red, "◆", 720);
    addLog(`${source.name} -> ${target.name}`, "hit");
  }

  function updateInfection(dt) {
    const game = state.game;
    const config = difficultyConfig[state.difficulty];
    for (const node of game.nodes) {
      if (node.infection > 0) {
        const quarantineFactor = node.quarantine > 0 ? 0.18 : 1;
        node.infection = clamp(node.infection + dt * config.grow * quarantineFactor * (1 - node.resistance / 150) * (1 - game.cure / 150), 0, 120);
      }
      node.quarantine = Math.max(0, node.quarantine - dt);
      node.treatment = Math.max(0, node.treatment - dt);
      if (node.infection >= 100) {
        node.infection = 74;
        game.outbreaks += 1;
        addLog(`${node.name} OUTBREAK`, "bad");
        addBurst(node.x, node.y, color.red, 48, 1.25);
        for (const id of nodeLinks(node.id)) {
          const neighbor = game.nodes[id];
          if (neighbor.quarantine <= 0) {
            neighbor.infection = clamp(neighbor.infection + 18, 0, 112);
            addFlow(node, neighbor, color.red2, "✦", 700);
          }
        }
      }
    }
    game.spreadTimer -= dt;
    if (game.spreadTimer <= 0) {
      spreadInfection();
      game.spreadTimer = config.spread * (0.72 + state.rng() * 0.5);
    }
    if (game.outbreaks >= config.outbreaks) {
      game.status = "SYSTEMIC COLLAPSE";
      addLog("SYSTEMIC COLLAPSE", "bad");
    }
    const active = game.nodes.reduce((sum, node) => sum + node.infection, 0);
    if (game.cure >= 100 && active < 35) {
      game.status = "CURE DEPLOYED";
      addLog("CURE DEPLOYED", "ok");
      addBurst(FIELD.x + FIELD.w / 2, FIELD.y + FIELD.h / 2, color.green, 70, 1.35);
    }
  }

  function update(dt) {
    const game = state.game;
    if (!game || state.paused || game.status !== "LIVE") return;
    game.elapsed += dt;
    updateAI(dt);
    updateAgents(dt);
    updateInfection(dt);
  }

  function drawField() {
    drawBox(FIELD.x, FIELD.y, FIELD.w, FIELD.h, color.line);
    for (let y = FIELD.y + 1; y < FIELD.y + FIELD.h - 1; y += 1) {
      for (let x = FIELD.x + 1; x < FIELD.x + FIELD.w - 1; x += 1) {
        const grain = hash01(x, y, 129);
        screen.bg[idx(x, y)] = grain > 0.9 ? "#07120f" : "#070d14";
        if (grain > 0.965) setCell(x, y, grain > 0.986 ? "÷" : "·", color.dim);
      }
    }
    writeText(FIELD.x + 2, FIELD.y - 2, "PANDEMIC BOARD :: INFECTION / DISPATCH / CURE", color.header);
  }

  function drawFlows(now) {
    state.flows = state.flows.filter((flow) => now - flow.start < flow.duration);
    for (const flow of state.flows) {
      const from = state.game.nodes[flow.from] || { x: FIELD.x, y: FIELD.y };
      const to = state.game.nodes[flow.to] || from;
      const t = clamp((now - flow.start) / flow.duration, 0, 1);
      setCell(lerp(from.x, to.x, t), lerp(from.y, to.y, t), flow.glyph, mixColor(flow.color, color.ink, t * 0.35));
    }
  }

  function drawMap(now) {
    const game = state.game;
    for (const link of game.links) {
      const a = game.nodes[link.a];
      const b = game.nodes[link.b];
      const hot = a.infection > 40 || b.infection > 40;
      drawLine(a.x, a.y, b.x, b.y, hot ? "·" : "⠂", hot ? color.orange : color.lineDim);
    }
    drawFlows(now);
    for (const node of game.nodes) drawCity(node);
    for (const agent of game.agents) drawAgent(agent);
  }

  function drawCity(node) {
    const selected = node.id === state.selected;
    const infected = node.infection;
    const fg = node.quarantine > 0 ? color.purple : infected > 75 ? color.red : infected > 40 ? color.orange : infected > 5 ? color.gold : color.green;
    const bg = selected ? "#10202a" : node.quarantine > 0 ? "#120d1b" : infected > 60 ? "#180b0c" : null;
    const x = node.x - 3;
    const y = node.y - 1;
    writeText(x, y, selected ? "▛▀▀▀▜" : "┌───┐", selected ? color.cyan2 : fg, bg);
    writeText(x, y + 1, `${node.quarantine > 0 ? "Q" : infected > 5 ? "!" : "●"}${node.name.slice(0, 3)} `, fg, bg);
    writeText(x, y + 2, selected ? "▙▄▄▄▟" : "└───┘", selected ? color.cyan2 : fg, bg);
    if (infected > 1) writeText(x, y + 3, String(Math.round(infected)).padStart(3, "0"), fg);
  }

  function drawAgent(agent) {
    const glyph = agent.task === "TREAT" ? "⚕" : agent.task === "RESEARCH" ? "⌬" : "◆";
    setCell(agent.x, agent.y, glyph, color.cyan2, "#06121a");
    setCell(agent.x - 1, agent.y, "⟨", color.cyan);
    setCell(agent.x + 1, agent.y, "⟩", color.cyan);
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
    const activeLoad = game.nodes.reduce((sum, node) => sum + node.infection, 0);
    drawBox(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, color.line);
    writeText(RIGHT.x + 2, RIGHT.y + 2, "PANDEMIC", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 4, `CURE   ${String(Math.round(game.cure)).padStart(3, "0")}%`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 5, `LOAD   ${String(Math.round(activeLoad)).padStart(4, "0")}`, activeLoad > 700 ? color.red : color.orange);
    writeText(RIGHT.x + 2, RIGHT.y + 6, `OUTBRK ${String(game.outbreaks).padStart(2, "0")}`, game.outbreaks > 4 ? color.red : color.gold);
    writeText(RIGHT.x + 2, RIGHT.y + 7, `SUPPLY ${game.supplies.toFixed(1).padStart(4, " ")}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 9, `MODE   ${state.mode.toUpperCase()}`, color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 10, `SPD    ${state.speed.toFixed(1)}X`, color.green);
    writeText(RIGHT.x + 2, RIGHT.y + 13, "GLOBAL", color.header);
    const cure = Math.round((game.cure / 100) * 20);
    writeText(RIGHT.x + 2, RIGHT.y + 15, `[${"█".repeat(cure)}${" ".repeat(20 - cure)}]`, color.green);
    const spread = Math.round((game.spreadTimer / difficultyConfig[state.difficulty].spread) * 20);
    writeText(RIGHT.x + 2, RIGHT.y + 17, `[${"█".repeat(clamp(spread, 0, 20))}${" ".repeat(20 - clamp(spread, 0, 20))}]`, color.red);
    writeText(RIGHT.x + 2, RIGHT.y + 19, game.status, game.status === "LIVE" ? color.cyan : game.status === "CURE DEPLOYED" ? color.green : color.red);
    writeText(RIGHT.x + 2, RIGHT.y + 22, "SELECTED", color.header);
    writeText(RIGHT.x + 2, RIGHT.y + 24, selected.name, selected.infection > 50 ? color.red : color.cyan);
    writeText(RIGHT.x + 2, RIGHT.y + 25, `INF ${Math.round(selected.infection).toString().padStart(3, "0")}  RES ${selected.resistance}`, color.muted);
    writeText(RIGHT.x + 2, RIGHT.y + 26, `QUAR ${selected.quarantine > 0 ? selected.quarantine.toFixed(1) + "s" : "OFF"}`, selected.quarantine > 0 ? color.purple : color.muted);
    writeText(RIGHT.x + 2, RIGHT.y + 29, "TEAMS", color.header);
    game.agents.forEach((agent, i) => {
      writeText(RIGHT.x + 2, RIGHT.y + 31 + i, `T${i + 1} ${game.nodes[agent.target].name.slice(0, 5)} ${agent.task}`, color.cyan);
    });
    writeText(RIGHT.x + 2, RIGHT.y + 36, "LOG", color.header);
    state.logs.slice(0, 13).forEach((entry, i) => {
      const fg = entry.tone === "bad" ? color.red : entry.tone === "ok" ? color.green : entry.tone === "hit" ? color.orange : color.muted;
      writeText(RIGHT.x + 2, RIGHT.y + 38 + i, `>${entry.message.slice(0, 22)}`, fg);
    });
    writeText(4, 54, "1 0.5X  2 1X  3 2X  4 4X   TAB/ARROWS CITY   SPACE DISPATCH   Q QUARANTINE   P PAUSE   R REROLL   V HOME", color.muted);
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
    drawMap(now);
    drawEffects(now);
    if (state.paused) writeText(FIELD.x + 42, FIELD.y + 23, "PAUSED", color.green);
    if (state.game?.status && state.game.status !== "LIVE") {
      const fg = state.game.status === "CURE DEPLOYED" ? color.green : color.red;
      writeText(FIELD.x + 32, FIELD.y + 23, `${state.game.status} - R RESTART`, fg);
    }
    drawHud();
    renderScreen();
  }

  function frame(now) {
    const dt = clamp((now - (state.lastFrame || now)) / 1000, 0, 0.05) * state.speed;
    state.lastFrame = now;
    update(dt);
    draw(now);
    requestAnimationFrame(frame);
  }

  function selectRelative(direction) {
    const current = state.game.nodes[state.selected];
    let best = null;
    let bestScore = Infinity;
    for (const node of state.game.nodes) {
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
    if (key === "v") {
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
      state.selected = (state.selected + 1) % state.game.nodes.length;
      return;
    }
    if (event.key === "ArrowRight") selectRelative("right");
    else if (event.key === "ArrowLeft") selectRelative("left");
    else if (event.key === "ArrowUp") selectRelative("up");
    else if (event.key === "ArrowDown") selectRelative("down");
    else if (key === " ") dispatchAgent(state.selected);
    else if (key === "q") quarantineNode(state.selected);
    if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", " ", "q"].includes(event.key)) event.preventDefault();
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
