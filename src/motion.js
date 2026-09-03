/**
 * motion.js — 纯附加的视觉动效增强层（暗夜版）。
 *
 * 1. 面板 Spotlight：悬停时写入 --mx/--my，驱动 CSS 径向光斑跟随鼠标。
 * 2. 数字滚动：关键指标 0 → 目标值补间，结束后恢复原文本。
 * 3. 封面聚光灯（Lithos 式）：光标经 lerp 平滑跟随，canvas 生成柔和圆形
 *    遮罩，揭示底层第二张图片。
 *
 * 只读 DOM、只写 CSS 自定义属性 / 瞬时动画，不触碰任何业务状态。
 * 所有效果均尊重 prefers-reduced-motion。
 */

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 1. 面板 Spotlight ---------- */
const SPOTLIGHT_SELECTOR = '.panel, .metric-card, .integration-card';

function bindSpotlight() {
  if (reduceMotion || typeof window === 'undefined' || !window.requestAnimationFrame) return;
  let frame = 0;
  document.addEventListener('pointermove', (event) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const target = event.target instanceof Element ? event.target.closest(SPOTLIGHT_SELECTOR) : null;
      if (!(target instanceof HTMLElement)) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty('--mx', `${(event.clientX - rect.left).toFixed(1)}px`);
      target.style.setProperty('--my', `${(event.clientY - rect.top).toFixed(1)}px`);
    });
  }, { passive: true });
}

/* ---------- 2. 数字滚动 ---------- */
const COUNT_SELECTOR = [
  '.metric-card > strong',
  '.stats-kpis strong',
  '.donut-center strong',
  '.service-metrics strong',
  '.health-summary > div:last-child strong',
  '.detail-summary > strong',
].join(',');

function animateNumber(node) {
  const target = node.firstChild;
  if (!target || target.nodeType !== Node.TEXT_NODE) return;
  const text = target.textContent.trim();
  const match = text.match(/^([+-]?\d+(?:\.\d+)?)(.*)$/);
  if (!match) return;
  const value = Number(match[1]);
  const suffix = match[2] || '';
  if (!Number.isFinite(value) || value === 0) return;
  const decimals = (match[1].split('.')[1] || '').length;
  const duration = 750;
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  const tick = (now) => {
    if (!node.isConnected) return;
    const progress = Math.min((now - start) / duration, 1);
    target.textContent = `${(value * ease(progress)).toFixed(decimals)}${suffix}`;
    if (progress < 1) requestAnimationFrame(tick);
    else target.textContent = text; // 恢复原始文本，内容不被改写
  };
  requestAnimationFrame(tick);
}

function hydrate(root) {
  if (reduceMotion) return;
  root.querySelectorAll(COUNT_SELECTOR).forEach(animateNumber);
}

function observeRenders() {
  const app = document.querySelector('#app');
  if (!app || typeof MutationObserver !== 'function') return;
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      hydrate(app);
    });
  }).observe(app, { childList: true, subtree: true });
  hydrate(app);
}

/* ---------- 3. 封面聚光灯（光标揭示第二张图片） ---------- */
const SPOTLIGHT_R = 260; // 聚光灯半径（px）
/** @type {[number, string][]} */
const MASK_STOPS = [
  [0, 'rgba(0,0,0,1)'],
  [0.55, 'rgba(0,0,0,1)'],
  [1, 'rgba(0,0,0,0)'],
];

/**
 * @param {HTMLElement} root 封面根元素（含 .cover-reveal-wrap）
 * @returns {() => void} 清理函数：取消 RAF 并移除全部监听
 */
export function initCover(root) {
  const wrap = root.querySelector('.cover-reveal-wrap');
  if (!(wrap instanceof HTMLElement) || typeof window === 'undefined') return () => {};

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const size = SPOTLIGHT_R * 2;
  canvas.width = size;
  canvas.height = size;

  let current = { x: window.innerWidth * 0.6, y: window.innerHeight * 0.42 };
  let target = { ...current };
  let raf = 0;
  let running = true;

  const onMove = (event) => {
    target = { x: event.clientX, y: event.clientY };
  };

  const tick = () => {
    if (!running) return;
    if (!document.hidden) {
      current = {
        x: current.x + (target.x - current.x) * 0.1, // lerp 平滑跟随
        y: current.y + (target.y - current.y) * 0.1,
      };
      ctx.clearRect(0, 0, size, size);
      const gradient = ctx.createRadialGradient(
        SPOTLIGHT_R, SPOTLIGHT_R, 0,
        SPOTLIGHT_R, SPOTLIGHT_R, SPOTLIGHT_R,
      );
      MASK_STOPS.forEach(([stop, color]) => gradient.addColorStop(stop, color));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      wrap.style.setProperty(
        '--spot-mask',
        `url(${canvas.toDataURL('image/png')})`,
        'important',
      );
      wrap.style.setProperty('-webkit-mask-position', `${current.x - SPOTLIGHT_R}px ${current.y - SPOTLIGHT_R}px`);
      wrap.style.setProperty('mask-position', `${current.x - SPOTLIGHT_R}px ${current.y - SPOTLIGHT_R}px`);
    }
    raf = requestAnimationFrame(tick);
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  raf = requestAnimationFrame(tick);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onMove);
  };
}

/* ---------- 自启动 ---------- */
if (typeof document !== 'undefined') {
  bindSpotlight();
  observeRenders();
}
