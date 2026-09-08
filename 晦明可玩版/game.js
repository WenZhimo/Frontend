(function () {
  "use strict";

  const SUITS = {
    hearts: { label: "红桃", short: "红", asset: "红桃.png", color: "red" },
    spades: { label: "黑桃", short: "黑", asset: "黑桃.png", color: "black" },
    diamonds: { label: "方块", short: "方", asset: "方块.png", color: "red" },
    clubs: { label: "梅花", short: "梅", asset: "梅花.png", color: "black" },
    joker: { label: "Joker", short: "J", asset: "JOKER.png", color: "black" },
  };

  const NORMAL_SUITS = ["hearts", "spades", "diamonds", "clubs"];
  const BOARD_SIZE = 5;
  const CENTER_INDEX = 12;
  const INITIAL_LOG_LIMIT = 80;

  const els = {
    body: document.body,
    themeSelect: document.getElementById("themeSelect"),
    newGameBtn: document.getElementById("newGameBtn"),
    resultNewGameBtn: document.getElementById("resultNewGameBtn"),
    board: document.getElementById("board"),
    playerA: document.getElementById("playerA"),
    playerB: document.getElementById("playerB"),
    phaseLabel: document.getElementById("phaseLabel"),
    turnTitle: document.getElementById("turnTitle"),
    hintText: document.getElementById("hintText"),
    placeBtn: document.getElementById("placeBtn"),
    passBtn: document.getElementById("passBtn"),
    placementPanel: document.getElementById("placementPanel"),
    placementHand: document.getElementById("placementHand"),
    cancelPlaceBtn: document.getElementById("cancelPlaceBtn"),
    refillPanel: document.getElementById("refillPanel"),
    refillHand: document.getElementById("refillHand"),
    refillCount: document.getElementById("refillCount"),
    logList: document.getElementById("logList"),
    clearLogBtn: document.getElementById("clearLogBtn"),
    handoffOverlay: document.getElementById("handoffOverlay"),
    handoffName: document.getElementById("handoffName"),
    startTurnBtn: document.getElementById("startTurnBtn"),
    gameOverOverlay: document.getElementById("gameOverOverlay"),
    resultKicker: document.getElementById("resultKicker"),
    resultTitle: document.getElementById("resultTitle"),
    resultDetail: document.getElementById("resultDetail"),
  };

  let state;

  function makeInitialState() {
    const deck = [];
    NORMAL_SUITS.forEach((suit) => {
      for (let copy = 1; copy <= 6; copy += 1) {
        deck.push(makeCard(suit, copy));
      }
    });
    shuffle(deck);

    const board = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
      if (index === CENTER_INDEX) {
        return makeCard("joker", 1, true);
      }
      return deck.pop();
    });

    return {
      board,
      currentPlayer: 0,
      roundStarter: 0,
      round: 1,
      phase: "take",
      placementMode: false,
      selectedHandIndex: null,
      selectedRefillIndex: null,
      lastAllDownKey: null,
      gameOver: false,
      revealAll: false,
      players: [
        { name: "明方", hand: [], darkTokens: 0, placeUsed: false },
        { name: "晦方", hand: [], darkTokens: 0, placeUsed: false },
      ],
      log: [],
    };
  }

  function makeCard(suit, copy, fixedCenter) {
    return {
      id: `${suit}-${copy}-${Math.random().toString(36).slice(2, 8)}`,
      suit,
      copy,
      faceUp: false,
      fixedCenter: Boolean(fixedCenter),
      public: false,
      takenFaceDown: false,
    };
  }

  function shuffle(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function startGame() {
    state = makeInitialState();
    addLog("开局：25 张牌暗置，中心为 Joker。双方各获得 1 次暗取能力。");
    grantDarkTokensIfNeeded("开局");
    hideHandoff();
    hideGameOver();
    render();
  }

  function cardImage(card) {
    return `./assets/${encodeURIComponent(SUITS[card.suit].asset)}`;
  }

  function currentPlayer() {
    return state.players[state.currentPlayer];
  }

  function otherPlayerIndex() {
    return state.currentPlayer === 0 ? 1 : 0;
  }

  function occupiedCards() {
    return state.board.filter(Boolean);
  }

  function visibleCards() {
    return occupiedCards().filter((card) => card.faceUp);
  }

  function allBoardCardsFaceDown() {
    const cards = occupiedCards();
    return cards.length > 0 && cards.every((card) => !card.faceUp);
  }

  function allDownKey() {
    return state.board.map((card, index) => (card ? `${index}:${card.id}` : `${index}:empty`)).join("|");
  }

  function grantDarkTokensIfNeeded(reason) {
    if (!allBoardCardsFaceDown()) {
      state.lastAllDownKey = null;
      return;
    }
    const key = allDownKey();
    if (state.lastAllDownKey === key) {
      return;
    }
    state.lastAllDownKey = key;
    state.players.forEach((player) => {
      player.darkTokens += 1;
    });
    if (reason !== "开局") {
      addLog(`${reason}：场上全为暗置牌，双方各获得 1 次暗取能力。`);
    }
  }

  function isLegalTake(index) {
    if (state.gameOver || state.phase !== "take") {
      return false;
    }
    const card = state.board[index];
    if (!card) {
      return false;
    }
    if (card.faceUp) {
      return true;
    }
    return currentPlayer().darkTokens > 0 && card.suit !== "joker";
  }

  function takeCard(index) {
    if (!isLegalTake(index)) {
      flashHint("这张牌现在不能取。明置牌可直接取，暗置牌需要暗取能力；Joker 只能明置时取走。");
      return;
    }

    const player = currentPlayer();
    const card = state.board[index];
    const tookFaceDown = !card.faceUp;
    const publicCard = card.faceUp;

    if (tookFaceDown) {
      player.darkTokens -= 1;
      card.takenFaceDown = true;
    }

    card.public = publicCard;
    card.faceUp = true;
    player.hand.push(card);
    state.board[index] = null;
    state.placementMode = false;
    state.selectedHandIndex = null;

    flipNeighbors(index);
    addLog(
      tookFaceDown
        ? `${player.name} 暗取 1 张牌，并翻动四邻。`
        : `${player.name} 取走 ${SUITS[card.suit].label}，并翻动四邻。`
    );

    const winner = getWinningSuit(player);
    if (winner) {
      finishGame(`${player.name} 获胜`, `${player.name} 集齐 ${winner} 六张。`);
      return;
    }

    const remaining = occupiedCards().length;
    if (remaining <= 1) {
      handleStalemateOrRefill();
      return;
    }

    grantDarkTokensIfNeeded("取牌后");
    endTurn();
  }

  function flipNeighbors(index) {
    neighborIndexes(index).forEach((neighbor) => {
      const card = state.board[neighbor];
      if (!card) {
        return;
      }
      card.faceUp = !card.faceUp;
      if (card.faceUp) {
        card.public = true;
      }
    });
  }

  function neighborIndexes(index) {
    const row = Math.floor(index / BOARD_SIZE);
    const col = index % BOARD_SIZE;
    const result = [];
    if (row > 0) result.push(index - BOARD_SIZE);
    if (row < BOARD_SIZE - 1) result.push(index + BOARD_SIZE);
    if (col > 0) result.push(index - 1);
    if (col < BOARD_SIZE - 1) result.push(index + 1);
    return result;
  }

  function endTurn() {
    state.currentPlayer = otherPlayerIndex();
    state.phase = "take";
    state.placementMode = false;
    state.selectedHandIndex = null;
    maybeSkipImpossibleTurn();
    showHandoff();
    render();
  }

  function maybeSkipImpossibleTurn() {
    const legalExists = state.board.some((_, index) => isLegalTakeForPlayer(index, state.currentPlayer));
    if (!legalExists && occupiedCards().length > 1) {
      grantDarkTokensIfNeeded("无明牌可取");
    }
  }

  function isLegalTakeForPlayer(index, playerIndex) {
    const card = state.board[index];
    if (!card) {
      return false;
    }
    if (card.faceUp) {
      return true;
    }
    return state.players[playerIndex].darkTokens > 0 && card.suit !== "joker";
  }

  function handleStalemateOrRefill() {
    if (state.round >= 2) {
      const bestA = bestSuitCount(state.players[0]).count;
      const bestB = bestSuitCount(state.players[1]).count;
      if (bestA > bestB) {
        finishGame("明方获胜", `续局仍未集齐六张，比较最多同花色数量：明方 ${bestA}，晦方 ${bestB}。`);
      } else if (bestB > bestA) {
        finishGame("晦方获胜", `续局仍未集齐六张，比较最多同花色数量：晦方 ${bestB}，明方 ${bestA}。`);
      } else {
        finishGame("平局", `续局仍未集齐六张，双方最多同花色数量均为 ${bestA}。`);
      }
      return;
    }

    const refillStarter = state.roundStarter === 0 ? 1 : 0;
    state.round += 1;
    state.phase = "refill";
    state.currentPlayer = refillStarter;
    state.roundStarter = refillStarter;
    state.placementMode = false;
    state.selectedHandIndex = null;
    state.selectedRefillIndex = null;
    addLog("只剩 1 张牌且无人获胜，进入续局摆牌。上一轮后手方优先放回手牌。");
    render();
  }

  function placeFromHand(boardIndex, handIndex, faceUp, isRefill) {
    const player = currentPlayer();
    const card = player.hand[handIndex];
    if (!card || state.board[boardIndex]) {
      return false;
    }

    state.board[boardIndex] = {
      ...card,
      faceUp,
      public: faceUp || card.public,
      takenFaceDown: false,
    };
    player.hand.splice(handIndex, 1);

    if (isRefill) {
      addLog(`${player.name} 续局放回 1 张牌（${faceUp ? "明置" : "暗置"}）。`);
      advanceRefillTurn();
    } else {
      player.placeUsed = true;
      state.placementMode = false;
      state.selectedHandIndex = null;
      addLog(`${player.name} 放入 1 张手牌（${faceUp ? "明置" : "暗置"}），本回合仍需取牌。`);
      grantDarkTokensIfNeeded("放牌后");
    }

    render();
    return true;
  }

  function advanceRefillTurn() {
    state.selectedRefillIndex = null;
    if (state.players.every((player) => player.hand.length === 0)) {
      state.phase = "take";
      state.currentPlayer = state.roundStarter;
      addLog(`第 ${state.round} 轮开始：${currentPlayer().name} 先手。`);
      grantDarkTokensIfNeeded("续局摆牌后");
      showHandoff();
      return;
    }

    const next = otherPlayerIndex();
    if (state.players[next].hand.length > 0) {
      state.currentPlayer = next;
      showHandoff();
      return;
    }

    showHandoff();
  }

  function getCounts(player) {
    const counts = {
      hearts: 0,
      spades: 0,
      diamonds: 0,
      clubs: 0,
      joker: 0,
    };
    player.hand.forEach((card) => {
      counts[card.suit] += 1;
    });
    return counts;
  }

  function getWinningSuit(player) {
    const counts = getCounts(player);
    const joker = counts.joker;
    const winner = NORMAL_SUITS.find((suit) => counts[suit] + joker >= 6);
    return winner ? SUITS[winner].label : null;
  }

  function bestSuitCount(player) {
    const counts = getCounts(player);
    const joker = counts.joker;
    let best = { suit: "hearts", count: 0 };
    NORMAL_SUITS.forEach((suit) => {
      const count = counts[suit] + joker;
      if (count > best.count) {
        best = { suit, count };
      }
    });
    return best;
  }

  function finishGame(title, detail) {
    state.gameOver = true;
    state.revealAll = true;
    state.phase = "over";
    addLog(`${title}：${detail}`);
    render();
    els.resultTitle.textContent = title;
    els.resultDetail.textContent = detail;
    els.gameOverOverlay.hidden = false;
  }

  function showHandoff() {
    if (state.gameOver) {
      return;
    }
    els.handoffName.textContent = currentPlayer().name;
    els.handoffOverlay.hidden = false;
  }

  function hideHandoff() {
    els.handoffOverlay.hidden = true;
  }

  function hideGameOver() {
    els.gameOverOverlay.hidden = true;
  }

  function addLog(text) {
    state.log.unshift(text);
    if (state.log.length > INITIAL_LOG_LIMIT) {
      state.log.pop();
    }
  }

  function clearLog() {
    state.log = [];
    renderLog();
  }

  function flashHint(text) {
    els.hintText.textContent = text;
    window.setTimeout(renderStatus, 1300);
  }

  function render() {
    renderStatus();
    renderPlayers();
    renderBoard();
    renderPlacementPanel();
    renderRefillPanel();
    renderLog();
    renderControls();
  }

  function renderStatus() {
    if (state.phase === "refill") {
      els.phaseLabel.textContent = `第 ${state.round} 轮 / 续局摆牌`;
      els.turnTitle.textContent = `${currentPlayer().name} 放回手牌`;
      els.hintText.textContent = "选择自己的手牌和空位，决定明置或暗置。";
      return;
    }
    if (state.gameOver) {
      els.phaseLabel.textContent = "对局结束";
      els.turnTitle.textContent = "胜负已定";
      els.hintText.textContent = "已公开全部信息，可开始新局。";
      return;
    }

    const player = currentPlayer();
    els.phaseLabel.textContent = `第 ${state.round} 轮 / 取牌阶段`;
    els.turnTitle.textContent = `${player.name}行动`;

    const hasFaceUp = visibleCards().length > 0;
    if (hasFaceUp && player.darkTokens > 0) {
      els.hintText.textContent = "可取明置牌，也可消耗 1 次暗取能力取暗置非 Joker。";
    } else if (hasFaceUp) {
      els.hintText.textContent = "请选择一张明置牌取走。";
    } else if (player.darkTokens > 0) {
      els.hintText.textContent = "场上无明置牌，请消耗暗取能力取一张暗置非 Joker。";
    } else {
      els.hintText.textContent = "当前没有可取牌，若全场暗置会自动补发暗取能力。";
    }
  }

  function renderPlayers() {
    renderPlayerPanel(0, els.playerA);
    renderPlayerPanel(1, els.playerB);
  }

  function renderPlayerPanel(index, target) {
    const player = state.players[index];
    const counts = getCounts(player);
    const best = bestSuitCount(player);
    const active = state.currentPlayer === index && !state.gameOver;
    target.className = `player-panel${active ? " active" : ""}`;
    target.innerHTML = `
      <div class="player-name">
        <h2>${player.name}</h2>
        ${active ? '<span class="turn-pill">当前</span>' : ""}
      </div>
      <div class="metric-grid">
        <div class="metric"><span>手牌</span><strong>${player.hand.length}</strong></div>
        <div class="metric"><span>暗取</span><strong>${player.darkTokens}</strong></div>
        <div class="metric"><span>放牌</span><strong>${player.placeUsed ? "已用" : "可用"}</strong></div>
        <div class="metric"><span>最佳</span><strong>${best.count}/6</strong></div>
      </div>
      <div class="suit-counts">
        ${NORMAL_SUITS.map((suit) => {
          const shownCount = counts[suit] + counts.joker;
          return `<div class="suit-chip ${SUITS[suit].color}">
            <span>${SUITS[suit].label}</span><strong>${shownCount}</strong>
          </div>`;
        }).join("")}
      </div>
      <div class="hand-title">${active || state.revealAll ? "手牌" : "对方公开手牌"}</div>
      <div class="hand-strip">
        ${player.hand.length ? player.hand.map((card) => renderMiniCard(card, active || state.revealAll)).join("") : '<span class="hint-text">暂无</span>'}
      </div>
    `;
  }

  function renderMiniCard(card, canSeePrivate) {
    const visible = canSeePrivate || card.public;
    if (!visible) {
      return '<span class="mini-card hidden-card" title="暗取牌，信息未公开"></span>';
    }
    return `<span class="mini-card" title="${SUITS[card.suit].label}"><img alt="${SUITS[card.suit].label}" src="${cardImage(card)}"></span>`;
  }

  function renderBoard() {
    els.board.innerHTML = state.board.map((card, index) => {
      if (!card) {
        const canPlace = canPlaceInto(index);
        return `<div class="slot${canPlace ? " can-place" : ""}">
          <button class="card-button taken" type="button" data-board-index="${index}" aria-label="空位 ${index + 1}">
            <span class="empty-slot">空</span>
          </button>
        </div>`;
      }

      const legal = isLegalTake(index);
      const sideClass = card.faceUp ? "face-up" : "face-down";
      return `<div class="slot">
        <button class="card-button ${sideClass}${legal ? " legal" : ""}" type="button" data-board-index="${index}" aria-label="${boardCardLabel(card, index)}">
          <span class="card-face">
            <img alt="${SUITS[card.suit].label}" src="${cardImage(card)}">
            <span class="corner-mark">${SUITS[card.suit].short}</span>
          </span>
          <span class="card-back" aria-hidden="true"></span>
        </button>
      </div>`;
    }).join("");
  }

  function boardCardLabel(card, index) {
    const row = Math.floor(index / BOARD_SIZE) + 1;
    const col = (index % BOARD_SIZE) + 1;
    return `${row}行${col}列，${card.faceUp ? SUITS[card.suit].label : "暗置牌"}`;
  }

  function canPlaceInto(index) {
    if (state.board[index]) {
      return false;
    }
    if (state.phase === "refill") {
      return state.selectedRefillIndex !== null;
    }
    return state.phase === "take" && state.placementMode && state.selectedHandIndex !== null;
  }

  function renderPlacementPanel() {
    const player = currentPlayer();
    const show = state.phase === "take" && state.placementMode && !state.gameOver;
    els.placementPanel.hidden = !show;
    if (!show) {
      return;
    }
    els.placementHand.innerHTML = player.hand.map((card, index) => {
      const selected = state.selectedHandIndex === index ? " selected" : "";
      return `<button class="select-card${selected}" type="button" data-hand-index="${index}" title="${SUITS[card.suit].label}">
        <img alt="${SUITS[card.suit].label}" src="${cardImage(card)}">
      </button>`;
    }).join("");
  }

  function renderRefillPanel() {
    const player = currentPlayer();
    const show = state.phase === "refill" && !state.gameOver;
    els.refillPanel.hidden = !show;
    if (!show) {
      return;
    }
    const emptyCount = state.board.filter((card) => !card).length;
    els.refillCount.textContent = `空位 ${emptyCount} / 手牌 ${player.hand.length}`;
    els.refillHand.innerHTML = player.hand.map((card, index) => {
      const selected = state.selectedRefillIndex === index ? " selected" : "";
      return `<button class="select-card${selected}" type="button" data-refill-hand-index="${index}" title="${SUITS[card.suit].label}">
        <img alt="${SUITS[card.suit].label}" src="${cardImage(card)}">
      </button>`;
    }).join("");
  }

  function renderLog() {
    els.logList.innerHTML = state.log.map((item) => `<li>${item}</li>`).join("");
  }

  function renderControls() {
    const player = currentPlayer();
    const canUsePlace = state.phase === "take" && !state.gameOver && !player.placeUsed && player.hand.length > 0 && state.board.some((card) => !card);
    els.placeBtn.disabled = !canUsePlace;
    els.placeBtn.textContent = state.placementMode ? "正在放牌" : "放牌";
    els.passBtn.hidden = state.gameOver;
    els.passBtn.disabled = false;
  }

  function getSelectedSide(name) {
    const selected = document.querySelector(`input[name="${name}"]:checked`);
    return selected ? selected.value === "up" : false;
  }

  function handleBoardClick(event) {
    const button = event.target.closest("[data-board-index]");
    if (!button) {
      return;
    }
    const index = Number(button.dataset.boardIndex);
    if (state.phase === "refill") {
      if (state.board[index]) {
        flashHint("续局摆牌只能放入空位。");
        return;
      }
      if (state.selectedRefillIndex === null) {
        flashHint("请先选择一张要放回的手牌。");
        return;
      }
      placeFromHand(index, state.selectedRefillIndex, getSelectedSide("refillSide"), true);
      return;
    }

    if (state.placementMode) {
      if (state.board[index]) {
        flashHint("放牌只能放入空位。");
        return;
      }
      if (state.selectedHandIndex === null) {
        flashHint("请先选择一张手牌。");
        return;
      }
      placeFromHand(index, state.selectedHandIndex, getSelectedSide("placeSide"), false);
      return;
    }

    takeCard(index);
  }

  function handlePlacementHandClick(event) {
    const button = event.target.closest("[data-hand-index]");
    if (!button) {
      return;
    }
    state.selectedHandIndex = Number(button.dataset.handIndex);
    renderPlacementPanel();
    renderBoard();
  }

  function handleRefillHandClick(event) {
    const button = event.target.closest("[data-refill-hand-index]");
    if (!button) {
      return;
    }
    state.selectedRefillIndex = Number(button.dataset.refillHandIndex);
    renderRefillPanel();
    renderBoard();
  }

  function togglePlacementMode() {
    if (els.placeBtn.disabled) {
      return;
    }
    state.placementMode = !state.placementMode;
    state.selectedHandIndex = null;
    render();
  }

  function cancelPlacement() {
    state.placementMode = false;
    state.selectedHandIndex = null;
    render();
  }

  function setTheme(theme) {
    els.body.dataset.theme = theme;
    els.themeSelect.value = theme;
    localStorage.setItem("huiming-theme", theme);
  }

  function initTheme() {
    const saved = localStorage.getItem("huiming-theme");
    if (saved && Array.from(els.themeSelect.options).some((option) => option.value === saved)) {
      setTheme(saved);
    }
  }

  function bindEvents() {
    els.board.addEventListener("click", handleBoardClick);
    els.placementHand.addEventListener("click", handlePlacementHandClick);
    els.refillHand.addEventListener("click", handleRefillHandClick);
    els.placeBtn.addEventListener("click", togglePlacementMode);
    els.cancelPlaceBtn.addEventListener("click", cancelPlacement);
    els.newGameBtn.addEventListener("click", startGame);
    els.resultNewGameBtn.addEventListener("click", startGame);
    els.clearLogBtn.addEventListener("click", clearLog);
    els.startTurnBtn.addEventListener("click", hideHandoff);
    els.passBtn.addEventListener("click", showHandoff);
    els.themeSelect.addEventListener("change", (event) => setTheme(event.target.value));
  }

  bindEvents();
  initTheme();
  startGame();
}());
