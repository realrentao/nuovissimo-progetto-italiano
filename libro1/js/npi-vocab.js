/* ============================================================
   词汇 · 句型列表页：搜索 / 单元 / 类别 / 首字母 筛选
   ============================================================ */
(function () {
  const { units, items } = NPI_load();
  const state = {
    q: '',
    unit: (new URLSearchParams(location.search).get('unit') || 'all'),
    cat: 'all',
    letter: 'all',
    type: 'all',
    hideZh: false
  };

  const cats = Array.from(new Set(items.map(i => i.cat).filter(Boolean))).sort();
  const letters = Array.from(new Set(items.map(i => NPI_initial(i.it)))).sort();

  const el = (id) => document.getElementById(id);

  function buildChips() {
    // 单元
    const unitRow = el('chip-units');
    unitRow.innerHTML =
      `<span class="lbl">单元</span><span class="chip ${state.unit === 'all' ? 'on' : ''}" data-k="unit" data-v="all">全部</span>` +
      Object.keys(units).sort().map(id => {
        const label = id === '00' ? '导论' : 'U' + (+id);
        return `<span class="chip ${state.unit === id ? 'on' : ''}" data-k="unit" data-v="${id}" title="${NPI_esc(units[id].title)} · ${NPI_esc(units[id].titleZh)}">${label}</span>`;
      }).join('');

    // 类别
    el('chip-cats').innerHTML =
      `<span class="lbl">类别</span><span class="chip ${state.cat === 'all' ? 'on' : ''}" data-k="cat" data-v="all">全部</span>` +
      cats.map(c => `<span class="chip ${state.cat === c ? 'on' : ''}" data-k="cat" data-v="${NPI_esc(c)}">${NPI_esc(c)}</span>`).join('');

    // 首字母
    el('chip-letters').innerHTML =
      `<span class="lbl">首字母</span><span class="chip letter ${state.letter === 'all' ? 'on' : ''}" data-k="letter" data-v="all">全部</span>` +
      letters.map(l => `<span class="chip letter ${state.letter === l ? 'on' : ''}" data-k="letter" data-v="${l}">${l.toUpperCase()}</span>`).join('');

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
      : '<div class="empty">没有匹配的词条，试试换个关键词或清除筛选 🙂</div>';
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

  buildChips();
  render();
})();
