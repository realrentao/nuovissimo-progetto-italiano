/* ============================================================
   NPI · 核心脚本：数据聚合 / 发音 / 通用工具
   数据在 data/unit-XX.js 中以 window.NPI.units 提供

   加载策略（性能）：
   - 音频清单 data/audio-manifest[-XX].js 体积较大（~110KB / ~9KB），
     改为「首屏之后空闲时异步加载」+「点击发音时按需加载」，
     不进入关键渲染路径；播放请求会自动等待清单就绪。
   - 需要音频路径的元素可用 data-audio 直接给出路径，完全绕开清单。
   ============================================================ */

/* ---------- 工具 ---------- */
const NPI_norm = (s) =>
  (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // 去重音，搜索更宽容
    .replace(/[’']/g, "'");

const NPI_initial = (s) => {
  const m = (s || '').match(/[a-zA-ZÀ-ÿ]/);
  return m ? NPI_norm(m[0]) : '#';
};

const NPI_esc = (s) =>
  (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- 数据聚合 ---------- */
function NPI_load() {
  const units = (window.NPI && window.NPI.units) || {};
  const items = [];
  Object.keys(units).sort().forEach((uid) => {
    const u = units[uid];
    (u.words || []).forEach((w) => items.push(Object.assign({}, w, { kind: 'word', unit: u.id, unitTitle: u.title, unitZh: u.titleZh })));
    (u.phrases || []).forEach((p) => items.push(Object.assign({}, p, { kind: 'phrase', unit: u.id, unitTitle: u.title, unitZh: u.titleZh })));
  });
  return { units, items };
}

/* ---------- 音频清单：按需异步加载 ---------- */
let NPI_manifestPromise = null;

function NPI_manifestUrl() {
  /* 单元页只需本单元切片，其余页面用全量清单 */
  const m = /\/(?:unit-)(\d\d)\.html$/.exec(location.pathname);
  return m ? 'data/audio-manifest-' + m[1] + '.js' : 'data/audio-manifest.js';
}

function NPI_ensureAudio() {
  if (window.NPI_AUDIO) return Promise.resolve();
  if (!NPI_manifestPromise) {
    NPI_manifestPromise = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = NPI_manifestUrl();
      s.onload = resolve;
      s.onerror = resolve;                 // 失败也不阻塞后续逻辑
      document.head.appendChild(s);
    });
  }
  return NPI_manifestPromise;
}

function NPI_resolveSrc(text) {
  const map = window.NPI_AUDIO || {};
  let src = map[text];
  if (!src) {
    // 兜底：忽略大小写再找一次
    const k = Object.keys(map).find((x) => x.toLowerCase() === String(text).toLowerCase());
    if (k) src = map[k];
  }
  return src || '';
}

/* ---------- 播放 ---------- */
/* 复用同一个 Audio 实例，避免每次点击都新建元素；已下载过的 mp3 命中 HTTP 缓存 / SW 缓存 */
let NPI_currentAudio = null;
let NPI_currentEl = null;          // 当前正在发音的元素（高亮 + 再次点击停止）

function NPI_clearPlayingClass() {
  if (NPI_currentEl) { NPI_currentEl.classList.remove('npi-playing'); NPI_currentEl = null; }
}

/* 打断机制：停止当前正在播放的音频并清掉高亮 */
function NPI_stopAudio() {
  if (NPI_currentAudio) {
    try { NPI_currentAudio.pause(); } catch (e) {}
    try { NPI_currentAudio.currentTime = 0; } catch (e) {}
  }
  NPI_clearPlayingClass();
}

function NPI_playSrc(src, fallbackText, el) {
  if (!src) { NPI_flashMissing(fallbackText); return; }
  /* 打断：新音频打开，在播音频自动停止 */
  if (NPI_currentAudio && !NPI_currentAudio.paused) NPI_stopAudio();
  if (!NPI_currentAudio) NPI_currentAudio = new Audio();
  const a = NPI_currentAudio;
  NPI_clearPlayingClass();
  if (el) { el.classList.add('npi-playing'); NPI_currentEl = el; }
  a.onended = () => NPI_clearPlayingClass();
  a.src = src;
  a.play().catch(() => NPI_flashMissing(fallbackText));
}

/* 点击带 data-spk 的元素：优先用 data-audio 直给路径（对话角色音色），否则查清单 */
function speak(text, el) {
  if (!text) return;
  const src = NPI_resolveSrc(text);
  if (src) { NPI_playSrc(src, text, el); return; }
  if (!window.NPI_AUDIO) {
    NPI_ensureAudio().then(() => {
      const s2 = NPI_resolveSrc(text);
      if (s2) NPI_playSrc(s2, text, el); else NPI_flashMissing(text);
    });
    return;
  }
  NPI_flashMissing(text);
}

function NPI_speakNode(el) {
  const direct = el.getAttribute('data-audio');
  /* 再次点击正在播放的同一元素 → 停止（打断 / 切换） */
  if (el === NPI_currentEl && NPI_currentAudio) {
    NPI_stopAudio();
    return;
  }
  if (direct) { NPI_playSrc(direct, el.getAttribute('data-spk') || '', el); return; }
  speak(el.getAttribute('data-spk'), el);
}

function NPI_flashMissing(text) {
  let t = document.getElementById('npi-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'npi-toast';
    t.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#922B21;color:#fff;padding:10px 18px;border-radius:999px;font-size:.86rem;z-index:2000;box-shadow:0 6px 18px rgba(0,0,0,.2)';
    document.body.appendChild(t);
  }
  t.textContent = '音频缺失：' + text;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.style.display = 'none'), 1800);
}

/* ---------- 发音预取：鼠标停留 / 触摸时提前拉取，点击即响 ---------- */
const NPI_prefetched = new Set();
function NPI_prefetch(el) {
  const direct = el.getAttribute('data-audio');
  const t = el.getAttribute('data-spk');
  const key = direct || t;
  if (!key || NPI_prefetched.has(key)) return;
  NPI_prefetched.add(key);
  let src = direct || '';
  if (!src) {
    if (!window.NPI_AUDIO) { NPI_ensureAudio(); return; }   // 先触发清单加载
    src = NPI_resolveSrc(t);
  }
  if (!src) return;
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.as = 'audio';
  link.href = src;
  document.head.appendChild(link);
}
(() => {
  let timer = null;
  let last = null;
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('[data-spk],[data-audio]');
    if (!el || el === last) return;
    last = el;
    clearTimeout(timer);
    timer = setTimeout(() => NPI_prefetch(el), 90);   // 停留 90ms 才预取，快速划过不触发
  }, { passive: true });
  document.addEventListener('touchstart', (e) => {
    const el = e.target.closest && e.target.closest('[data-spk],[data-audio]');
    if (el) NPI_prefetch(el);
  }, { passive: true });
})();

/* ---------- 进度条 / 导航高亮 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const bar = document.querySelector('.scroll-progress');
  const nav = document.querySelector('.top-nav');
  const upd = () => {
    const h = document.documentElement;
    const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
    if (bar) bar.style.width = (isNaN(pct) ? 0 : pct) + '%';
    if (nav) nav.classList.toggle('scrolled', h.scrollTop > 10);
  };
  window.addEventListener('scroll', upd, { passive: true });
  upd();
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href === here || (here === '' && href === 'index.html')) a.classList.add('active');
  });

  /* ---------- 音频清单与首屏音频：空闲时后台预热，完全不占用首屏时间 ---------- */
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1400));
  idle(() => {
    NPI_ensureAudio();
    const els = Array.from(document.querySelectorAll('[data-audio],[data-spk]')).slice(0, 8);
    els.forEach((el) => NPI_prefetch(el));
  }, { timeout: 2600 });

  /* ---------- 音频离线缓存：Service Worker 接管 *.mp3 与壳资源 ---------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* 不支持或被禁用则静默降级 */ });
    });
  }
});
