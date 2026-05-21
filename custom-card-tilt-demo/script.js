const cards = document.querySelectorAll('[data-tilt-card]');

cards.forEach((card) => {
  const setVars = (vars) => {
    for (const [key, value] of Object.entries(vars)) {
      card.style.setProperty(key, value);
    }
  };

  const onMove = (event) => {
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const ratioX = x / rect.width;
    const ratioY = y / rect.height;
    const percentX = Math.max(0, Math.min(100, ratioX * 100));
    const percentY = Math.max(0, Math.min(100, ratioY * 100));
    const centerX = ratioX - 0.5;
    const centerY = ratioY - 0.5;
    const pointerFromCenter = Math.min(1, Math.sqrt(centerX * centerX + centerY * centerY) / 0.7071);

    setVars({
      '--pointer-x': `${percentX.toFixed(2)}%`,
      '--pointer-y': `${percentY.toFixed(2)}%`,
      '--rotate-x': `${(-centerY * 20.5).toFixed(2)}deg`,
      '--rotate-y': `${(centerX * 30.5).toFixed(2)}deg`,
      '--card-scale': '1.056',
      '--translate-y': '-2px',
      '--pointer-from-center': pointerFromCenter.toFixed(4),
      '--pointer-from-left': ratioX.toFixed(4),
      '--pointer-from-top': ratioY.toFixed(4),
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
