const cards = document.querySelectorAll('[data-tilt-card]');

cards.forEach((card) => {
  const setVars = (vars) => {
    for (const [key, value] of Object.entries(vars)) {
      card.style.setProperty(key, value);
    }
  };

  const onMove = (event) => {
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    const percentX = Math.max(0, Math.min(100, x * 100));
    const percentY = Math.max(0, Math.min(100, y * 100));
    const centerX = x - 0.5;
    const centerY = y - 0.5;
    const pointerFromCenter = Math.min(1, Math.sqrt(centerX * centerX + centerY * centerY) / 0.7071);

    setVars({
      '--pointer-x': `${percentX.toFixed(2)}%`,
      '--pointer-y': `${percentY.toFixed(2)}%`,
      '--rotate-x': `${(-centerY * 9).toFixed(2)}deg`,
      '--rotate-y': `${(centerX * 12).toFixed(2)}deg`,
      '--card-scale': '1.015',
      '--translate-y': '-2px',
      '--bg-shift-x': `${(50 + centerX * -8).toFixed(2)}%`,
      '--bg-shift-y': `${(50 + centerY * -8).toFixed(2)}%`,
      '--pointer-from-center': pointerFromCenter.toFixed(4),
      '--pointer-from-left': x.toFixed(4),
      '--pointer-from-top': y.toFixed(4),
      '--glare-opacity': '0.42',
      '--shine-opacity': '0.58'
    });
  };

  const reset = () => {
    setVars({
      '--pointer-x': '50%',
      '--pointer-y': '50%',
      '--rotate-x': '0deg',
      '--rotate-y': '0deg',
      '--card-scale': '1',
      '--translate-y': '0px',
      '--bg-shift-x': '50%',
      '--bg-shift-y': '50%',
      '--pointer-from-center': '0',
      '--pointer-from-left': '0.5',
      '--pointer-from-top': '0.5',
      '--glare-opacity': '0',
      '--shine-opacity': '0'
    });
  };

  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerleave', reset);
  card.addEventListener('pointercancel', reset);

  reset();
});
