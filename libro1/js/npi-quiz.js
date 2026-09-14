/* ============================================================
   练习页：题库自动生成（选择 / 填空 / 互译）+ 即时判定 + 统计
   统计保存在 localStorage: npi_quiz_stats
   ============================================================ */
(function () {
  const { units, items } = NPI_load();
  const KEY = 'npi_quiz_stats_v1';

  const el = (id) => document.getElementById(id);
  const stats = loadStats();
  const state = { pool: [], idx: 0, q: null, answered: false, mode: 'mix', unit: 'all', total: 10, wrongOnly: false };

  function loadStats() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === 'object') { s.per = s.per || {}; return s; }
    } catch (e) { }
    return { asked: 0, correct: 0, streak: 0, best: 0, per: {} };
  }
  function saveStats() { localStorage.setItem(KEY, JSON.stringify(stats)); }

  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; };
  const keyOf = (i) => i.kind + ':' + i.it;
  const pick = (arr, n) => shuffle(arr).slice(0, n);

  /* ---------- 题型生成 ---------- */
  function makeQuestion(item) {
    const types = [];
    if (item.kind === 'word') types.push('mc_it_zh', 'mc_zh_it', 'fill_word', 'fill_ex');
    else types.push('mc_it_zh', 'mc_zh_it');
    let t = state.mode !== 'mix' ? state.mode : types[Math.floor(Math.random() * types.length)];
    if (!types.includes(t)) t = 'mc_it_zh';

    if (t === 'mc_it_zh' || t === 'mc_zh_it') {
      const sameCat = items.filter(i => i.cat === item.cat && keyOf(i) !== keyOf(item));
      const others = pick(sameCat.length >= 3 ? sameCat : items.filter(i => keyOf(i) !== keyOf(item)), 3);
      const opts = shuffle([item].concat(others)).map(i => (t === 'mc_it_zh' ? i.zh : i.it));
      return {
        type: t, item,
        label: t === 'mc_it_zh' ? '意 → 中 · 选择' : '中 → 意 · 选择',
        prompt: t === 'mc_it_zh' ? item.it : item.zh,
        promptSpeak: t === 'mc_it_zh' ? item.it : null,
        hint: t === 'mc_it_zh' ? '选出这个词的中文释义' : '选出对应的意大利语表达',
        options: opts,
        answer: t === 'mc_it_zh' ? item.zh : item.it
      };
    }

    if (t === 'fill_word') {
      const w = item.it;
      const masked = w.replace(/[a-zA-ZÀ-ÿ]/g, (c, i) => (i === 0 ? c : '_')).replace(/_/g, '_ ');
      return {
        type: t, item, label: '拼写 · 填空',
        prompt: item.zh + '（' + (item.pos || '') + '）',
        hint: '根据中文与首字母写出意大利语：' + masked.trim() + '　共 ' + w.replace(/[^a-zA-ZÀ-ÿ]/g, '').length + ' 个字母，音节 ' + (item.syll || '—'),
        answer: w, options: null
      };
    }

    if (t === 'fill_ex') {
      const ex = item.ex || '';
      const re = new RegExp('\\b' + item.it.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const blanked = ex.replace(re, '________');
      if (blanked === ex || !ex) return null;   // 例句中不含该词则换题型
      return {
        type: t, item, label: '例句 · 填空',
        prompt: item.zh + '：' + blanked,
        hint: NPI_esc(ex) ? '补全句子中空缺的词（' + (item.syll || '—') + '）' : '补全句子',
        answer: item.it, options: null, speakText: ex
      };
    }
    return null;
  }

  function buildPool() {
    let pool = items.filter(i => state.unit === 'all' || i.unit === state.unit);
    if (state.wrongOnly) {
      const w = pool.filter(i => (stats.per[keyOf(i)] && stats.per[keyOf(i)].wrong > 0));
      pool = w.length ? w : pool;
    }
    // 优先没答过的
    const fresh = pool.filter(i => !stats.per[keyOf(i)]);
    const rest = pool.filter(i => stats.per[keyOf(i)]);
    pool = shuffle(fresh).concat(shuffle(rest));
    state.total = Math.min(state.total, pool.length);
    state.pool = pool.slice(0, state.total);
    state.idx = 0;
  }

  /* ---------- 渲染 ---------- */
  function renderStats() {
    const acc = stats.asked ? Math.round((stats.correct / stats.asked) * 100) : 0;
    el('n-asked').textContent = stats.asked;
    el('n-correct').textContent = stats.correct;
    el('n-acc').textContent = acc + '%';
    el('n-streak').textContent = stats.streak;
    const pct = state.pool.length ? (state.idx / state.pool.length) * 100 : 0;
    el('progress-fill').style.width = pct + '%';
    el('progress-txt').textContent = '本轮进度 ' + state.idx + ' / ' + state.pool.length;
  }

  function nextQuestion() {
    if (state.idx >= state.pool.length) { finish(); return; }
    let q = null, guard = 0;
    while (!q && guard++ < 12) q = makeQuestion(state.pool[state.idx]);
    if (!q) { state.idx++; renderStats(); nextQuestion(); return; }
    state.q = q; state.answered = false;

    el('q-type').textContent = q.label;
    el('q-prompt').innerHTML = NPI_esc(q.prompt) + (q.promptSpeak ? ' <button class="btn ghost" style="padding:2px 10px;font-size:.8rem" onclick="speak(' + JSON.stringify(q.promptSpeak).replace(/"/g, '&quot;') + ')">🔊</button>' : '');
    el('q-hint').textContent = q.hint || '';
    el('feedback').className = 'feedback';
    el('feedback').innerHTML = '';
    el('btn-next').style.display = 'none';

    const box = el('q-body');
    if (q.options) {
      box.innerHTML = '<div class="opts">' + q.options.map((o, i) =>
        `<button class="opt" data-i="${i}">${String.fromCharCode(65 + i)}. ${NPI_esc(o)}</button>`).join('') + '</div>';
      box.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => answer(b.textContent.replace(/^[A-D]\.\s*/, ''), b)));
    } else {
      box.innerHTML = '<input class="q-input" id="q-in" placeholder="输入意大利语（不区分大小写与重音）" autocomplete="off">' +
        '<div style="margin-top:10px"><button class="btn" id="q-submit">提交答案</button></div>';
      const inp = el('q-in');
      inp.focus();
      el('q-submit').addEventListener('click', () => answer(inp.value, inp));
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') answer(inp.value, inp); });
    }
    renderStats();
  }

  function judge(input) {
    const a = NPI_norm(String(input || '').trim().replace(/^(il|lo|la|l'|i|gli|le|un|uno|una)\s+/i, ''));
    return a === NPI_norm(String(state.q.answer).trim());
  }

  function answer(val, node) {
    if (state.answered) return;
    state.answered = true;
    const q = state.q;
    const ok = q.options ? (val === q.answer) : judge(val);
    const k = keyOf(q.item);

    stats.asked++;
    stats.per[k] = stats.per[k] || { right: 0, wrong: 0 };
    if (ok) { stats.correct++; stats.streak++; stats.per[k].right++; } else { stats.streak = 0; stats.per[k].wrong++; }
    stats.best = Math.max(stats.best, stats.streak);
    saveStats();

    if (q.options) {
      node.classList.add(ok ? 'correct' : 'wrong');
      if (!ok) node.parentNode.querySelectorAll('.opt').forEach(b => {
        if (b.textContent.replace(/^[A-D]\.\s*/, '') === q.answer) b.classList.add('correct');
      });
      node.parentNode.querySelectorAll('.opt').forEach(b => (b.disabled = true));
    } else {
      node.disabled = true;
      node.classList.add(ok ? 'correct' : 'wrong');
    }

    const exHtml = q.item.ex ? `<div style="margin-top:8px">例句：<b onclick="speak('${q.item.ex.replace(/'/g, "\\'")}')" style="color:#1A5276;cursor:pointer">🔊 ${NPI_esc(q.item.ex)}</b><br><span style="color:#5D6D7E">${NPI_esc(q.item.exZh || '')}</span></div>` : '';
    el('feedback').className = 'feedback ' + (ok ? 'ok' : 'no');
    el('feedback').innerHTML =
      (ok ? '✅ 正确！' : '❌ 不正确。正确答案：<span class="ans">' + NPI_esc(q.answer) + '</span>') +
      `<div style="margin-top:6px;font-size:.9rem">${NPI_esc(q.item.it)} · ${NPI_esc(q.item.pos || '')} ${NPI_esc(q.item.syll || '')} — ${NPI_esc(q.item.zh)}</div>` +
      exHtml +
      (q.item.note ? `<div style="margin-top:6px;font-size:.86rem;color:#935116">📌 ${NPI_esc(q.item.note)}</div>` : '');

    el('btn-next').style.display = 'inline-block';
    if (ok) speak(q.item.it);
    renderStats();
  }

  function finish() {
    el('q-type').textContent = '本轮完成 🎉';
    el('q-prompt').textContent = '已答完 ' + state.pool.length + ' 题';
    const acc = stats.asked ? Math.round((stats.correct / stats.asked) * 100) : 0;
    el('q-hint').innerHTML = '累计正确率 <b>' + acc + '%</b>（' + stats.correct + '/' + stats.asked + '）· 最长连对 ' + stats.best;
    el('q-body').innerHTML = '<div style="text-align:center;padding:10px 0"><button class="btn" id="again">再来一轮</button></div>';
    el('feedback').className = 'feedback';
    el('btn-next').style.display = 'none';
    el('again').addEventListener('click', () => { start(); });
    el('progress-fill').style.width = '100%';
  }

  function start() {
    const selUnit = el('sel-unit'), selMode = el('sel-mode'), selNum = el('sel-num');
    state.unit = selUnit.value;
    state.mode = selMode.value;
    state.total = selNum.value === 'all' ? 9999 : parseInt(selNum.value, 10);
    state.wrongOnly = el('chk-wrong').checked;
    buildPool();
    el('progress-txt').textContent = '本轮进度 0 / ' + state.pool.length;
    nextQuestion();
  }

  /* ---------- 初始化 ---------- */
  el('sel-unit').innerHTML = '<option value="all">全部单元</option>' +
    Object.keys(units).sort().map(id => {
      const label = id === '00' ? '导论 · ' : 'Unità ' + (+id) + ' · ';
      return `<option value="${id}">${label}${NPI_esc(units[id].title)}</option>`;
    }).join('');
  const _uParam = new URLSearchParams(location.search).get('u');
  if (_uParam && units[_uParam]) el('sel-unit').value = _uParam;
  el('sel-mode').innerHTML = [
    ['mix', '混合题型'], ['mc_it_zh', '选择题：意 → 中'], ['mc_zh_it', '选择题：中 → 意'],
    ['fill_word', '填空：看中文写意语'], ['fill_ex', '填空：例句补全']
  ].map(([v, t]) => `<option value="${v}">${t}</option>`).join('');

  el('btn-start').addEventListener('click', start);
  el('btn-next').addEventListener('click', () => { state.idx++; nextQuestion(); });
  el('btn-skip').addEventListener('click', () => { if (!state.answered) { stats.asked++; saveStats(); } state.idx++; nextQuestion(); });
  el('btn-reset').addEventListener('click', () => {
    if (!confirm('确定清空所有答题记录与正确率统计？')) return;
    stats.asked = 0; stats.correct = 0; stats.streak = 0; stats.best = 0; stats.per = {};
    saveStats(); renderStats();
  });

  renderStats();
  start();
})();
