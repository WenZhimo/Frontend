const cells = document.querySelectorAll('.cell');
const statusText = document.getElementById('status');
const boardElement = document.getElementById('board');
const explosionContainer = document.getElementById('cartoon-explosion');
const gameWrapper = document.getElementById('game-wrapper');
const root = document.documentElement; 

let currentPlayer = 'X';
let isGameActive = true;
let boardState = Array(9).fill(null);
let moves = { 'X': [], 'O': [] };

// --- Audio Context Setup ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

const sounds = {
    place: (type) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type === 'X' ? 'square' : 'triangle';
        osc.frequency.setValueAtTime(type === 'X' ? 440 : 523, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    },
    remove: () => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(50, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
    },
    overwrite: () => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
    },
    win: () => {
        [261.63, 329.63, 392.00, 523.25, 783.99].forEach((freq, i) => {
            setTimeout(() => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'triangle';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.0);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + 1.0);
            }, i * 60);
        });
        const oscBass = audioCtx.createOscillator();
        const gainBass = audioCtx.createGain();
        oscBass.type = 'sine';
        oscBass.frequency.setValueAtTime(100, audioCtx.currentTime);
        oscBass.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.5);
        gainBass.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gainBass.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
        oscBass.connect(gainBass);
        gainBass.connect(audioCtx.destination);
        oscBass.start();
        oscBass.stop(audioCtx.currentTime + 0.5);
    },
    error: () => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(80, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    }
};

const winningConditions = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

function handleCellClick(e) {
    // 浏览器可能会暂停音频上下文，需要用户交互来恢复
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const cell = e.target;
    const index = parseInt(cell.getAttribute('data-index'));

    if (!isGameActive) return;

    const playerMoves = moves[currentPlayer];
    const isFull = playerMoves.length === 3;
    const oldestIndex = isFull ? playerMoves[0] : -1;
    const isTargetOwnOldest = (index === oldestIndex);
    
    // 如果位置被占用，且不是自己的旧棋子，则报错
    if (boardState[index] !== null && !isTargetOwnOldest) {
        sounds.error();
        boardElement.classList.remove('shake');
        void boardElement.offsetWidth; 
        boardElement.classList.add('shake');
        return;
    }

    let isOverwriting = false;

    // 1. 移除阶段
    if (isFull) {
        const indexToRemove = moves[currentPlayer].shift();
        boardState[indexToRemove] = null;
        const cellToRemove = document.querySelector(`.cell[data-index='${indexToRemove}']`);
        cellToRemove.textContent = '';
        cellToRemove.className = 'cell'; 
        if (index === indexToRemove) isOverwriting = true;
        else sounds.remove(); 
    }

    // 2. 放置阶段
    boardState[index] = currentPlayer;
    moves[currentPlayer].push(index);
    
    cell.textContent = currentPlayer;
    cell.className = `cell taken ${currentPlayer.toLowerCase()} pop-in`;
    
    if (isOverwriting) sounds.overwrite();
    else sounds.place(currentPlayer);

    // 3. 胜利判定
    if (checkWin()) {
        endGame();
        return;
    }

    // 4. 切换回合
    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    statusText.innerHTML = `TURN: <span class="highlight ${currentPlayer}">${currentPlayer}</span>`;
    updateFadingEffects();
}

function checkWin() {
    for (let condition of winningConditions) {
        const [a, b, c] = condition;
        if (boardState[a] && boardState[a] === boardState[b] && boardState[a] === boardState[c]) {
            [a, b, c].forEach(idx => {
                const cell = document.querySelector(`.cell[data-index='${idx}']`);
                cell.classList.add('winner');
                cell.style.color = currentPlayer === 'X' ? 'var(--x-color)' : 'var(--o-color)';
            });
            return true;
        }
    }
    return false;
}

function endGame() {
    statusText.innerHTML = `WINNER: <span class="highlight ${currentPlayer}">${currentPlayer}</span>`;
    isGameActive = false;
    cells.forEach(c => c.classList.remove('fading'));
    
    sounds.win();
    
    const winColor = currentPlayer === 'X' ? '#ff2e63' : '#08d9d6';
    root.style.setProperty('--win-color', winColor);
    
    explosionContainer.classList.remove('active');
    void explosionContainer.offsetWidth; // 触发重绘以重启动画
    explosionContainer.classList.add('active');

    gameWrapper.classList.add('screen-shake');
    setTimeout(() => {
        gameWrapper.classList.remove('screen-shake');
    }, 500);

    fireConfetti();
}

function updateFadingEffects() {
    cells.forEach(cell => cell.classList.remove('fading'));
    if (moves[currentPlayer].length === 3) {
        const indexToFade = moves[currentPlayer][0];
        const cell = document.querySelector(`.cell[data-index='${indexToFade}']`);
        if (cell) cell.classList.add('fading');
    }
}

// 暴露给全局，因为HTML按钮onclick需要用到
window.restartGame = function() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    currentPlayer = 'X';
    isGameActive = true;
    boardState = Array(9).fill(null);
    moves['X'] = [];
    moves['O'] = [];
    statusText.innerHTML = `TURN: <span class="highlight X">X</span>`;
    
    cells.forEach(cell => {
        cell.textContent = '';
        cell.className = 'cell';
        cell.style.backgroundColor = '';
        cell.style.color = '';
    });
    sounds.place('X'); 
    
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    gameWrapper.classList.remove('screen-shake');
    explosionContainer.classList.remove('active');
}

function fireConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = gameWrapper.clientWidth;
    canvas.height = gameWrapper.clientHeight;

    const particles = [];
    const winColorHex = currentPlayer === 'X' ? '#ff2e63' : '#08d9d6';
    const colors = [winColorHex, '#ffffff', '#ffce00'];

    for (let i = 0; i < 400; i++) {
        particles.push({
            x: canvas.width / 2,
            y: canvas.height / 2,
            w: Math.random() * 10 + 5,
            h: Math.random() * 10 + 5,
            vx: (Math.random() - 0.5) * 40,
            vy: (Math.random() - 0.5) * 40,
            color: colors[Math.floor(Math.random() * colors.length)],
            life: 150,
            decay: Math.random() * 0.02 + 0.01
        });
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let active = false;
        particles.forEach(p => {
            if (p.life > 0) {
                active = true;
                p.x += p.vx;
                p.y += p.vy;
                p.vx *= 0.94;
                p.vy *= 0.94;
                p.vy += 0.5;
                p.life -= 1;
                
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.life / 150;
                ctx.fillRect(p.x, p.y, p.w, p.h);
            }
        });
        if (active) requestAnimationFrame(draw);
        else ctx.clearRect(0,0,canvas.width, canvas.height);
    }
    draw();
}

// 事件监听
cells.forEach(cell => cell.addEventListener('click', handleCellClick));

// 窗口大小调整时重置Canvas尺寸
window.addEventListener('resize', () => {
    const canvas = document.getElementById('confetti-canvas');
    canvas.width = gameWrapper.clientWidth;
    canvas.height = gameWrapper.clientHeight;
});