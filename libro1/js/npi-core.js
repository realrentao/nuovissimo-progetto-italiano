/* ============================================================
   NPI 1 · 核心脚本：数据聚合 / 发音 / 通用工具
   数据在 data/unit-XX.js 中以 window.NPI.units 提供
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

/* ---------- 发音：优先播放 edge-tts 生成的 mp3 ---------- */
let NPI_currentAudio = null;
function speak(text) {
  if (!text) return;
  if (NPI_currentAudio) { NPI_currentAudio.pause(); NPI_currentAudio = null; }
  const map = window.NPI_AUDIO || {};
  let src = map[text];
  if (!src) {
    // 兜底：忽略大小写再找一次
    const k = Object.keys(map).find((x) => x.toLowerCase() === text.toLowerCase());
    if (k) src = map[k];
  }
  if (!src) { NPI_flashMissing(text); return; }
  const a = new Audio(src);
  NPI_currentAudio = a;
  a.play().catch(() => NPI_flashMissing(text));
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
});
