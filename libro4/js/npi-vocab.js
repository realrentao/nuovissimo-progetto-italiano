/* ============================================================
   词汇 · 句型列表页：搜索 / 单元 / 类别 / 首字母 筛选

   加载策略（性能）：
   1) 先只取 ~2KB 的 data/lexicon-index.js，立刻把筛选条与单元列表画出来；
   2) 再按单元分批加载 data/lexicon-XX.js 词条切片，每批到达就地重渲染；
   3) 带 ?unit=XX 进入时只加载该单元（从单元页跳进来最常用的路径）。
   首屏不再等整份 lexicon.js（181~266KB）。
   ============================================================ */
(function () {
  const el = (id) => document.getElementById(id);
  const state = {
    q: '',
    unit: (new URLSearchParams(location.search).get('unit') || 'all'),
    cat: 'all',
    letter: 'all',
    type: 'all',
    hideZh: false
  };

  let units = {};        /* 索引 + 已到位的切片 */
  let items = [];
  let loading = true;    /* 仍在拉词条 */

  function refreshData() {
    const r = NPI_load();
    units = r.units;
    items = r.items;
  }
  const catList = () => Array.from(new Set(items.map((i) => i.cat).filter(Boolean))).sort();
  const letterList = () => Array.from(new Set(items.map((i) => NPI_initial(i.it)))).sort();
  const unitIds = () => Object.keys(units).sort();

  /* 在标题的计数旁挂一个加载进度提示（避免改动 HTML 结构） */
  function setProgress(txt) {
    let s = el('lprog');
    if (!s) {
      s = document.createElement('span');
      s.id = 'lprog';
      s.style.cssText = 'font-size:.8rem;font-weight:400;color:#935116;margin-left:8px';
      el('count').parentNode.appendChild(s);
    }
    s.textContent = txt || '';
  }

  function buildChips() {
    // 单元（索引已含全部单元，所以一开始就是完整的）
    const unitRow = el('chip-units');
    unitRow.innerHTML =
      `<span class="lbl">单元</span><span class="chip ${state.unit === 'all' ? 'on' : ''}" data-k="unit" data-v="all">全部</span>` +
      unitIds().map(id => {
        const label = id === '00' ? '导论' : 'U' + (+id);
        const u = units[id] || {};
        return `<span class="chip ${state.unit === id ? 'on' : ''}" data-k="unit" data-v="${id}" title="${NPI_esc(u.title)} · ${NPI_esc(u.titleZh)}">${label}</span>`;
      }).join('');

    // 类别（随切片到位逐步变全）
    el('chip-cats').innerHTML =
      `<span class="lbl">类别</span><span class="chip ${state.cat === 'all' ? 'on' : ''}" data-k="cat" data-v="all">全部</span>` +
      catList().map(c => `<span class="chip ${state.cat === c ? 'on' : ''}" data-k="cat" data-v="${NPI_esc(c)}">${NPI_esc(c)}</span>`).join('');

    // 首字母
    el('chip-letters').innerHTML =
      `<span class="lbl">首字母</span><span class="chip letter ${state.letter === 'all' ? 'on' : ''}" data-k="letter" data-v="all">全部</span>` +
      letterList().map(l => `<span class="chip letter ${state.letter === l ? 'on' : ''}" data-k="letter" data-v="${l}">${l.toUpperCase()}</span>`).join('');

    // 类型
    el('chip-types').innerHTML =
      `<span class="lbl">类型</span>` +
      [['all', '全部'], ['word', '单词'], ['phrase', '句型']]
        .map(([v, t]) => `<span class="chip ${state.type === v ? 'on' : ''}" data-k="type" data-v="${v}">${t}</span>`).join('');

    document.querySelectorAll('.chip').forEach(c => {
      c.addEventListener('click', () => {
        state[c.dataset.k] = c.dataset.v;
        buildChips();
        render();
      });
    });
  }

  function filtered() {
    const q = NPI_norm(state.q.trim());
    return items.filter(i => {
      if (state.unit !== 'all' && i.unit !== state.unit) return false;
      if (state.cat !== 'all' && i.cat !== state.cat) return false;
      if (state.letter !== 'all' && NPI_initial(i.it) !== state.letter) return false;
      if (state.type !== 'all' && i.kind !== state.type) return false;
      if (!q) return true;
      return (
        NPI_norm(i.it).includes(q) ||
        (i.zh || '').includes(state.q.trim()) ||
        NPI_norm(i.ex || '').includes(q) ||
        (i.exZh || '').includes(state.q.trim())
      );
    });
  }

  function entryHtml(i) {
    const warn = [i.zh, i.syll, i.note].some((s) => (s || '').includes('⚠️'));
    const unitLabel = i.unit === '00' ? '导论' : 'U' + (+i.unit);
    return `<div class="entry ${i.kind === 'phrase' ? 'is-phrase' : ''}">
      <div class="entry-head">
        <span class="it" onclick="speak(${JSON.stringify(i.it).replace(/"/g, '&quot;')})">${NPI_esc(i.it)}</span>
        ${i.pos ? `<span class="pos">${NPI_esc(i.pos)}</span>` : ''}
        ${i.syll ? `<span class="syll">${NPI_esc(i.syll)}</span>` : ''}
      </div>
      <div class="zh">${NPI_esc(i.zh || '')}</div>
      ${i.ex ? `<div class="ex">
          <span class="it-s" onclick="speak(${JSON.stringify(i.ex).replace(/"/g, '&quot;')})">🔊 ${NPI_esc(i.ex)}</span><br>
          <span class="zh-s">${NPI_esc(i.exZh || '')}</span>
        </div>` : ''}
      <div class="tags">
        <span class="tag">${unitLabel} · ${NPI_esc(i.unitTitle)}</span>
        <span class="tag">${NPI_esc(i.cat || 'Altro')}</span>
        <span class="tag">${i.kind === 'word' ? '单词' : '句型'}</span>
        ${warn ? '<span class="tag warn">⚠️ 待确认</span>' : ''}
      </div>
      ${i.note ? `<div class="note">📌 ${NPI_esc(i.note)}</div>` : ''}
    </div>`;
  }

  function render() {
    const list = filtered();
    el('count').textContent = list.length;
    el('list').innerHTML = list.length
      ? list.map(entryHtml).join('')
      : '<div class="empty">' + (loading ? '正在加载词库…' : '没有匹配的词条，试试换个关键词或清除筛选 🙂') + '</div>';
    el('list').classList.toggle('zh-hidden', state.hideZh);
  }

  el('q').addEventListener('input', (e) => { state.q = e.target.value; render(); });
  el('btn-clear').addEventListener('click', () => {
    state.q = ''; el('q').value = ''; state.unit = 'all'; state.cat = 'all'; state.letter = 'all'; state.type = 'all';
    buildChips(); render();
  });
  el('btn-hide').addEventListener('click', () => {
    state.hideZh = !state.hideZh;
    el('btn-hide').textContent = state.hideZh ? '🙈 显示中文' : '🙉 隐藏中文';
    render();
  });

  /* ---------- 启动 ---------- */
  (async function init() {
    await NPI_lexIndex();
    refreshData();
    buildChips();
    render();

    const single = state.unit !== 'all' && units[state.unit] ? [state.unit] : null;
    const want = single || unitIds();
    const total = want.length;

    await NPI_lexLoad(want, () => {
      refreshData();
      loading = items.length === 0;
      buildChips();
      render();
      const done = want.filter((id) => NPI_lexLoaded[id]).length;
      setProgress(done < total ? `词库加载中 ${done}/${total} 单元…` : '');
    }, single ? 1 : 3);

    loading = false;
    refreshData();
    buildChips();
    render();
    setProgress('');
  })();
})();
