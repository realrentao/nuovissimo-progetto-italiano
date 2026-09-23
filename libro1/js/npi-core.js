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

/* ---------- 词库（词汇页 / 练习页）：轻量索引 + 按单元切片，按需加载 ---------- */
/* 先用 ~2KB 的 data/lexicon-index.js 把界面（筛选条 / 下拉框）画出来，
   再按单元渐进加载 data/lexicon-XX.js 词条切片并就地重渲染。
   这样首屏不必再等整份 lexicon.js（181~266KB / gzip 58~85KB）。 */
const NPI_lexLoaded = {};              /* 已载入完整词条的单元 id */
let NPI_lexIndexPromise = null;

function NPI_lexIndex() {
  if (NPI_lexIndexPromise) return NPI_lexIndexPromise;
  NPI_lexIndexPromise = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'data/lexicon-index.js';
    s.onload = resolve;
    s.onerror = resolve;               /* 失败也不阻塞页面 */
    document.head.appendChild(s);
  });
  return NPI_lexIndexPromise;
}

function NPI_lexSlice(id) {
  if (NPI_lexLoaded[id]) return Promise.resolve();
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'data/lexicon-' + id + '.js';
    s.onload = () => { NPI_lexLoaded[id] = true; resolve(); };
    s.onerror = resolve;
    document.head.appendChild(s);
  });
}

/* 渐进加载：第一批先跑完保证首屏尽快可用，其余并行补齐（每约 1/3 回调一次，避免频繁重渲染） */
async function NPI_lexLoad(ids, onProgress, batch) {
  const todo = (ids || []).filter((id) => !NPI_lexLoaded[id]);
  if (!todo.length) { if (onProgress) onProgress(); return 0; }
  const step = batch || 3;
  await Promise.all(todo.slice(0, step).map(NPI_lexSlice));
  if (onProgress) onProgress();
  const rest = todo.slice(step);
  if (rest.length) {
    let done = 0;
    const stride = Math.max(1, Math.ceil(rest.length / 3));
    await Promise.all(rest.map((id) => NPI_lexSlice(id).then(() => {
      done++;
      if (done % stride === 0 || done === rest.length) { if (onProgress) onProgress(); }
    })));
  }
  return todo.length;
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
    const url = NPI_manifestUrl();
    /* 非单元页拿到的是全量清单，标记一下，之后不必再叠单元切片 */
    if (url.indexOf('audio-manifest-') === 0) window.NPI_fullAudio = true;
    NPI_manifestPromise = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = resolve;                 // 失败也不阻塞后续逻辑
      document.head.appendChild(s);
    });
  }
  return NPI_manifestPromise;
}

/* ---------- 单元级音频清单：与词库切片成对按需加载 ---------- */
/* 词汇页 / 练习页只需要当前单元的发音表，加载 ~3KB 的切片即可，
   不必为了一句发音拉整份 audio-manifest.js（原始 110KB / gzip ~58KB）。 */
const NPI_audioSlices = new Set();
function NPI_audioSlice(id) {
  if (window.NPI_fullAudio || NPI_audioSlices.has(id)) return Promise.resolve();
  NPI_audioSlices.add(id);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'data/audio-manifest-' + id + '.js';
    s.onload = resolve;
    s.onerror = resolve;
    document.head.appendChild(s);
  });
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
  if (!src) return;                       // 无路径：静默，不提示「音频缺失」
  /* 打断：新音频打开，在播音频自动停止 */
  if (NPI_currentAudio && !NPI_currentAudio.paused) NPI_stopAudio();
  if (!NPI_currentAudio) NPI_currentAudio = new Audio();
  const a = NPI_currentAudio;
  NPI_clearPlayingClass();
  if (el) { el.classList.add('npi-playing'); NPI_currentEl = el; }
  a.onended = () => NPI_clearPlayingClass();
  a.src = src;
  a.play().catch(() => { /* 文件未就绪/加载失败：静默，不弹「音频缺失」 */ });
}

/* 点击带 data-spk 的元素：优先用 data-audio 直给路径（对话角色音色），否则查清单 */
function speak(text, el) {
  if (!text) return;
  /* 音频清单（缓存）还没就绪：本次不播放、不提示「音频缺失」，
     后台继续加载，下次点击即可用 —— 即「缓存没好不播放」。 */
  if (!window.NPI_AUDIO) { NPI_ensureAudio(); return; }
  const src = NPI_resolveSrc(text);
  if (src) { NPI_playSrc(src, text, el); return; }
  /* 清单已就绪但查无此文本：静默，不显示「音频缺失」 */
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

/* 2026-09-22：按需求「不要显示音频丢失」—— 取消「音频缺失」浮条。
   改为静默：缓存（清单）未就绪时不播放、不提示；清单就绪但查无文本也不提示。
   保留函数以满足潜在调用点，但不再有任何可见 UI。 */
function NPI_flashMissing(text) {
  /* 静默：如需调试可放开下一行 */
  // console.debug('[audio] 无可用音频:', text);
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
    const els = Array.from(document.querySelectorAll('[data-audio],[data-spk]'));
    /* 本页没有可发音节点（词汇/练习页用的是 onclick="speak()"）→ 不做任何音频预热，
       避免白白拉整份音频清单；真正点击时再按需加载单元切片或全量清单。 */
    if (!els.length) return;
    NPI_ensureAudio();
    els.slice(0, 8).forEach((el) => NPI_prefetch(el));
  }, { timeout: 2600 });

  /* ---------- 音频离线缓存：Service Worker 接管 *.mp3 与壳资源 ---------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      /* 版本化 URL + updateViaCache:'none'：每次部署换 URL、绕过 HTTP 缓存，
         强制浏览器拉取最新 sw.js，杜绝「旧 SW 一直服务陈旧 HTML/白屏」的死锁。 */
      navigator.serviceWorker.register('sw.js?v=20260923e', { updateViaCache: 'none' }).catch(() => { /* 不支持或被禁用则静默降级 */ });
    });
  }
});
