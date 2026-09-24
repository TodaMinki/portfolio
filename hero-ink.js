(() => {
  'use strict';

  const container = document.querySelector('.hero-ink');
  const image = container?.querySelector('.hero-ink-image');
  const canvas = container?.querySelector('.hero-ink-canvas');
  if (!container || !image || !canvas) return;

  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const narrowScreen = window.matchMedia('(max-width: 780px)');
  const frameInterval = 1000 / 30;
  const referenceWidth = 604;
  const referenceHeight = 597;

  // These anchors follow the actual torn silhouette in the supplied artwork.
  // Only the fine threads outside it stretch; the stepped opening stays fixed.
  const silhouette = [
    [0, 284, 315], [90, 277, 321], [137, 272, 331],
    [146, 204, 329], [190, 211, 340], [194, 235, 346],
    [235, 224, 346], [246, 195, 376], [292, 207, 375],
    [299, 157, 335], [351, 153, 335], [359, 218, 389],
    [405, 211, 388], [412, 128, 352], [465, 127, 356],
    [472, 215, 417], [520, 223, 414], [528, 269, 335],
    [575, 282, 322], [604, 283, 317],
  ];

  let loaded = false;
  let visible = !('IntersectionObserver' in window);
  let frameId = 0;
  let previousTick = null;
  let previousPaint = null;
  let elapsed = 0;
  const strips = [];

  function anchorsAt(x) {
    let index = 0;
    while (index < silhouette.length - 2 && x >= silhouette[index + 1][0]) index++;
    const left = silhouette[index];
    const right = silhouette[index + 1];
    const fraction = (x - left[0]) / (right[0] - left[0]);
    return [
      left[1] + (right[1] - left[1]) * fraction,
      left[2] + (right[2] - left[2]) * fraction,
    ];
  }

  function threadStretch(time, position, lower) {
    const phase = position * 18.4 + (lower ? 2.7 : 0);
    const speed = 1.22 + 0.24 * Math.sin(position * 10.6 + (lower ? 2 : 0));
    const wave = 0.68 * Math.sin(time * speed + phase)
      + 0.23 * Math.sin(time * speed * 1.83 - phase * 0.63)
      + 0.09 * Math.sin(time * 3.1 + phase * 1.7);
    const envelope = 0.4 + 0.6 * Math.sin(position * Math.PI);
    const strength = (narrowScreen.matches ? 29 : 36) * canvas.height / referenceHeight;
    return wave * envelope * strength * (lower ? 1.12 : 1);
  }

  function draw(time) {
    const height = canvas.height;
    context.clearRect(0, 0, canvas.width, height);
    context.drawImage(image, 0, 0);

    // Separate phases and speeds give the strands a slow pull and quicker
    // release. Every strip ends at its original anchor without shifting it.
    for (const strip of strips) {
      const upperStretch = threadStretch(time, strip.position, false);
      const lowerStretch = threadStretch(time, strip.position, true);
      context.clearRect(strip.x, 0, strip.width, strip.top);
      context.clearRect(strip.x, strip.bottom, strip.width, height - strip.bottom);
      context.drawImage(
        image, strip.x, 0, strip.width, strip.top,
        strip.x, -upperStretch, strip.width, strip.top + upperStretch,
      );
      context.drawImage(
        image, strip.x, strip.bottom, strip.width, height - strip.bottom,
        strip.x, strip.bottom, strip.width, height - strip.bottom + lowerStretch,
      );
    }

    // Short, infrequent echoes travel along a handful of original ink lines.
    // They sample the artwork itself, preserving its broken pencil texture.
    context.globalCompositeOperation = 'lighter';
    const tracks = [137, 190, 247, 301, 356, 414, 469, 520];
    const scale = canvas.width / referenceWidth;
    for (let index = 0; index < tracks.length; index++) {
      const cycle = (time / (5.6 + index * 0.23) + index * 0.173) % 1;
      if (cycle > 0.37) continue;
      const progress = cycle / 0.37;
      const lower = index % 2 === 1;
      const x = Math.round(tracks[index] * scale / 2) * 2;
      const strip = strips[Math.min(strips.length - 1, Math.floor(x / 2))];
      const stretch = threadStretch(time, strip.position, lower);
      const sourceLength = lower ? height - strip.bottom : strip.top;
      const ratio = (sourceLength + stretch) / sourceLength;
      const segmentHeight = Math.min(27 * scale, sourceLength * 0.2);
      const offset = (sourceLength - segmentHeight) * progress;
      const sourceY = lower ? strip.bottom + offset : strip.top - offset - segmentHeight;
      const destinationY = lower
        ? strip.bottom + offset * ratio
        : strip.top - (offset + segmentHeight) * ratio;
      context.globalAlpha = Math.sin(progress * Math.PI) * 0.32;
      context.drawImage(
        image, x - 1, sourceY, 3 * scale, segmentHeight,
        x - 1 + (lower ? 0.7 : -0.7) * scale, destinationY,
        3 * scale, segmentHeight * ratio,
      );
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
  }

  function stop() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    previousTick = null;
    previousPaint = null;
  }

  function tick(timestamp) {
    frameId = 0;
    if (!loaded || !visible || document.hidden || reducedMotion.matches) return;
    if (previousTick !== null) elapsed += Math.min(timestamp - previousTick, 100);
    previousTick = timestamp;

    if (previousPaint === null || timestamp - previousPaint >= frameInterval) {
      draw(elapsed / 1000);
      previousPaint = timestamp - (previousPaint === null ? 0 : (timestamp - previousPaint) % frameInterval);
    }
    frameId = requestAnimationFrame(tick);
  }

  function syncPlayback() {
    stop();
    if (!loaded) return;
    if (reducedMotion.matches) {
      container.classList.remove('is-ready');
      return;
    }
    draw(elapsed / 1000);
    container.classList.add('is-ready');
    if (visible && !document.hidden) frameId = requestAnimationFrame(tick);
  }

  function initialize() {
    if (loaded || !image.naturalWidth || !image.naturalHeight) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    context.imageSmoothingEnabled = true;
    const yScale = canvas.height / referenceHeight;
    for (let x = 0; x < canvas.width; x += 2) {
      const [top, bottom] = anchorsAt((x + 1) / canvas.width * referenceWidth);
      strips.push({
        x,
        width: Math.min(2, canvas.width - x),
        position: x / canvas.width,
        top: Math.round(top * yScale),
        bottom: Math.round(bottom * yScale),
      });
    }
    loaded = true;
    syncPlayback();
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncPlayback();
    });
    observer.observe(container);
  }

  document.addEventListener('visibilitychange', syncPlayback);
  reducedMotion.addEventListener('change', syncPlayback);
  narrowScreen.addEventListener('change', syncPlayback);
  image.addEventListener('load', initialize, { once: true });
  if (image.complete) initialize();
})();
