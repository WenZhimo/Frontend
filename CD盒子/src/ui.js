import { DISC_CATALOG } from './config.js';

function fallbackThumb(label, hue) {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 160;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 160, 160);
  grd.addColorStop(0, `hsl(${hue}, 70%, 22%)`);
  grd.addColorStop(0.5, `hsl(${(hue + 70) % 360}, 85%, 55%)`);
  grd.addColorStop(1, `hsl(${(hue + 160) % 360}, 70%, 24%)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 160, 160);
  g.fillStyle = '#fff';
  g.font = '700 16px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(label.toUpperCase(), 80, 86);
  return c.toDataURL('image/png');
}

export function createUI(getScene) {
  const body = document.body;
  const rail = document.getElementById('rail');
  const spinButton = document.getElementById('spin-button');
  const openButton = document.getElementById('open-button');
  const flipButton = document.getElementById('flip-button');
  const pauseButton = document.getElementById('pause-button');
  const aboutButton = document.getElementById('about-button');
  const aboutPanel = document.getElementById('about-panel');
  const aboutClose = document.getElementById('about-close');
  const scrim = document.getElementById('scrim');
  const loader = document.getElementById('loader');
  const errorBox = document.getElementById('error');
  const errorDetail = document.getElementById('error-detail');
  const hint = document.querySelector('.hint');

  const live = document.createElement('p');
  live.setAttribute('aria-live', 'polite');
  live.className = 'sr-only';
  document.body.appendChild(live);

  const buttons = DISC_CATALOG.map((disc, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'thumb';
    button.style.setProperty('--tilt', `${disc.uiTilt}deg`);
    button.setAttribute('aria-label', `${disc.title} — ${disc.note}`);
    button.dataset.index = String(index);
    const img = document.createElement('img');
    img.src = disc.thumb;
    img.alt = '';
    img.draggable = false;
    img.loading = 'eager';
    img.onerror = () => { img.src = fallbackThumb(disc.title, 210 + index * 62); };
    button.appendChild(img);
    button.addEventListener('click', () => {
      const scene = getScene();
      scene?.setAuto(false);
      scene?.switchTo?.(index);
      sync();
    });
    rail.appendChild(button);
    return button;
  });

  let lastIndex = -1;
  let lastOpen = null;
  let lastSpin = null;
  let lastPaused = null;
  let lastFlip = null;

  function setActive(index, disc) {
    buttons.forEach((button, i) => {
      if (i === index) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    if (disc) {
      live.textContent = `${disc.title}, ${disc.note}${lastOpen ? ', case open' : ''}`;
      hint.style.opacity = '0';
    }
    lastIndex = index;
  }

  function setOpenVisual(isOpen) {
    openButton.setAttribute('aria-pressed', isOpen ? 'true' : 'false');
    openButton.setAttribute('aria-label', isOpen ? 'Close the case' : 'Open the case');
    body.classList.toggle('is-open', isOpen);
    hint.innerHTML = isOpen
      ? 'drag to turn <span>·</span> click the case to close'
      : 'drag to turn <span>·</span> click the case to open';
    if (lastOpen !== isOpen) {
      lastOpen = isOpen;
      if (lastIndex >= 0) {
        const disc = DISC_CATALOG[lastIndex];
        live.textContent = `${disc.title}, ${disc.note}${isOpen ? ', case open' : ''}`;
      }
    }
  }

  function sync() {
    const scene = getScene();
    if (!scene) return;
    setOpenVisual(scene.targetOpen > 0.5);
    if (lastSpin !== scene.spinOn) {
      lastSpin = scene.spinOn;
      spinButton.setAttribute('aria-pressed', scene.spinOn ? 'true' : 'false');
    }
    if (lastFlip !== scene.targetFlip) {
      lastFlip = scene.targetFlip;
      const flipped = scene.targetFlip > 0.5;
      flipButton.setAttribute('aria-pressed', flipped ? 'true' : 'false');
      flipButton.setAttribute('aria-label', flipped ? 'Show the label side' : 'Show the data side');
    }
    if (lastPaused !== scene.paused) {
      lastPaused = scene.paused;
      pauseButton.setAttribute('aria-pressed', scene.paused ? 'true' : 'false');
      pauseButton.setAttribute('aria-label', scene.paused ? 'Resume animation' : 'Pause animation');
      pauseButton.innerHTML = scene.paused
        ? '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>'
        : '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" fill="currentColor"/></svg>';
    }
    requestAnimationFrame(sync);
  }

  spinButton.addEventListener('click', () => {
    const scene = getScene();
    if (!scene) return;
    scene.setSpin(!scene.spinOn);
    sync();
  });

  openButton.addEventListener('click', () => {
    const scene = getScene();
    if (!scene) return;
    scene.toggleOpen();
    sync();
  });

  flipButton.addEventListener('click', () => {
    const scene = getScene();
    if (!scene) return;
    scene.toggleFlip();
    sync();
  });

  pauseButton.addEventListener('click', () => {
    const scene = getScene();
    if (!scene) return;
    scene.setPaused(!scene.paused);
    sync();
  });

  function openAbout() {
    aboutPanel.hidden = false;
    scrim.hidden = false;
    aboutClose.focus();
  }
  function closeAbout() {
    aboutPanel.hidden = true;
    scrim.hidden = true;
    aboutButton.focus();
  }
  aboutButton.addEventListener('click', openAbout);
  aboutClose.addEventListener('click', closeAbout);
  scrim.addEventListener('click', closeAbout);

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tagged = event.target.closest?.('a, button, input, textarea, select');
    if (tagged && event.key !== 'Escape') return;
    const scene = getScene();
    if (!scene) return;

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      scene.setAuto(false);
      scene.next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      scene.setAuto(false);
      scene.prev();
    } else if (event.key === 'o' || event.key === 'O') {
      event.preventDefault();
      scene.toggleOpen();
    } else if (event.key === 's' || event.key === 'S') {
      event.preventDefault();
      scene.setSpin(!scene.spinOn);
    } else if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      scene.toggleFlip();
    } else if (event.key === ' ') {
      event.preventDefault();
      scene.setPaused(!scene.paused);
    } else if (event.key === 'Escape' && !aboutPanel.hidden) {
      closeAbout();
    }
  });

  return {
    setActive,
    sync,
    ready() {
      body.classList.add('is-ready');
      body.classList.remove('is-error');
      loader.setAttribute('aria-hidden', 'true');
      hint.style.opacity = '1';
      sync();
    },
    fail(err) {
      body.classList.add('is-error');
      body.classList.remove('is-ready');
      loader.hidden = true;
      errorBox.hidden = false;
      errorDetail.textContent = err?.message || 'Your browser could not start a WebGL2 context.';
      hint.style.display = 'none';
    },
  };
}
