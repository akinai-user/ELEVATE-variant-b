"use strict";

(() => {
  const screen = document.querySelector('#loading-screen');
  if (!screen) return;
  // タブ内の初回TOP訪問だけ再生。SKIP後や再読み込み時も省略する。
  try {
    const storageKey = 'elevate:opening-seen';
    if (window.sessionStorage.getItem(storageKey) === '1') {
      screen.remove();
      return;
    }
    window.sessionStorage.setItem(storageKey, '1');
  } catch {
    // 保存できない環境では再訪時の待ち時間を避けて本文を表示する。
    screen.remove();
    return;
  }
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // 動きを減らす設定では待ち時間なしで本文を表示。
  if (motion.matches || typeof screen.showModal !== 'function') { screen.remove(); return; }
  const canvas = screen.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) { screen.remove(); return; }
  let frame = 0;
  let closed = false;
  let leaving = false;
  let exitTimer;
  let safetyTimer;
  const finish = () => {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(frame);
    clearTimeout(exitTimer);
    clearTimeout(safetyTimer);
    screen.close();
    screen.remove();
    document.body.classList.remove('is-loading');
    window.removeEventListener('resize', onResize);
    motion.removeEventListener('change', onMotionChange);
    document.dispatchEvent(new Event('elevate:opening-complete'));
  };
  const leave = (immediate = false) => {
    if (leaving || closed) return;
    leaving = true;
    cancelAnimationFrame(frame);
    if (immediate) { finish(); return; }
    screen.classList.add('is-leaving');
    exitTimer = setTimeout(finish, 700);
  };
  const onMotionChange = () => { if (motion.matches) finish(); };
  // リサイズ時は歪んだ粒子描画を続けず本文へ移る。
  const onResize = () => finish();
  screen.querySelector('button').addEventListener('click', () => leave());
  screen.addEventListener('cancel', (event) => { event.preventDefault(); leave(); });
  motion.addEventListener('change', onMotionChange);
  window.addEventListener('resize', onResize);
  safetyTimer = setTimeout(finish, 8000);

  try {
    screen.showModal();
    document.body.classList.add('is-loading');
    const width = screen.clientWidth;
    const height = screen.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.scale(dpr, dpr);
    const fontSize = Math.min(58, Math.max(20, width * 0.046));
    const font = `500 ${fontSize}px "Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "Noto Serif JP", serif`;
    const letterSpacing = fontSize * 0.12;
    const first = ['人の力と技術力。', '働く未来を創造する。'];
    const last = ['働くその先へ'];
    const paintText = (context, lines, alpha = 1) => {
      context.globalAlpha = alpha;
      context.font = font;
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillStyle = '#080635';
      // 本文と粒子生成に同じ字間を使い、変化の前後で文字位置を揃える。
      lines.forEach((line, index) => {
        const characters = Array.from(line);
        const widths = characters.map((character) => context.measureText(character).width);
        const lineWidth = widths.reduce((sum, value) => sum + value, 0) + letterSpacing * (characters.length - 1);
        let x = (width - lineWidth) / 2;
        const y = height * 0.48 + (index - (lines.length - 1) / 2) * fontSize * 1.8;
        characters.forEach((character, characterIndex) => {
          context.fillText(character, x, y);
          x += widths[characterIndex] + letterSpacing;
        });
      });
      context.globalAlpha = 1;
    };
    const sample = (lines) => {
      const buffer = document.createElement('canvas');
      buffer.width = width;
      buffer.height = height;
      const context = buffer.getContext('2d', { willReadFrequently: true });
      paintText(context, lines);
      const pixels = context.getImageData(0, 0, width, height).data;
      const points = [];
      const step = width < 600 ? 2 : 3;
      for (let y = Math.max(0, Math.floor(height * 0.48 - fontSize * 2)); y < Math.min(height, height * 0.48 + fontSize * 2); y += step) {
        for (let x = 0; x < width; x += step) {
          if (pixels[(y * width + x) * 4 + 3] > 100) points.push({ x, y });
        }
      }
      // 画面サイズによらず描画負荷を抑える。
      return points.filter((_, index) => index % Math.max(1, Math.ceil(points.length / 2200)) === 0);
    };
    const source = sample(first);
    const target = sample(last);
    if (!source.length || !target.length) { finish(); return; }
    const particles = Array.from({ length: Math.max(source.length, target.length) }, (_, i) => {
      const a = source[i % source.length];
      const b = target[i % target.length];
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.min(width, height) * (0.2 + Math.random() * 0.55);
      return { a, b, x: width / 2 + Math.cos(angle) * distance, y: height * 0.48 + Math.sin(angle) * distance * 0.7, size: 0.65 + Math.random() * 1.1, color: i % 13 === 0 ? '#9fbd20' : i % 3 === 0 ? '#5a20f0' : '#080635' };
    });
    const ease = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
    let start;
    let announced = false;
    const draw = (now) => {
      if (closed || leaving) return;
      try {
        start ??= now;
        const time = (now - start) / 1000;
        ctx.clearRect(0, 0, width, height);
        screen.style.setProperty('--loading-progress', String(Math.min(time / 5.2, 1)));
        if (time < 1.5) {
          ctx.save();
          ctx.translate(0, 12 * (1 - ease(time / 0.8)));
          paintText(ctx, first, ease(time / 0.8));
          ctx.restore();
        } else if (time < 4.15) {
          const scatter = ease((time - 1.5) / 1.05);
          const gather = ease((time - 2.6) / 1.35);
          const solid = Math.max(0, Math.min(1, (time - 3.8) / 0.35));
          particles.forEach((p) => {
            const x = p.a.x + (p.x - p.a.x) * scatter;
            const y = p.a.y + (p.y - p.a.y) * scatter;
            ctx.globalAlpha = (1 - solid) * (0.85 + 0.15 * gather);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(x + (p.b.x - x) * gather, y + (p.b.y - y) * gather, p.size, 0, Math.PI * 2);
            ctx.fill();
          });
          ctx.globalAlpha = 1;
          if (solid) paintText(ctx, last, solid);
        } else {
          paintText(ctx, last);
          if (!announced) {
            screen.querySelector('[aria-live]').textContent = '働くその先へ';
            announced = true;
          }
        }
        if (time >= 5.2) leave();
        else frame = requestAnimationFrame(draw);
      } catch { finish(); }
    };
    frame = requestAnimationFrame(draw);
  } catch { finish(); }
})();
