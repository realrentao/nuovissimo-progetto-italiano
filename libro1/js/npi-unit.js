/* ============================================================
   NPI · 单元页渲染：按原书 sections 分节结构渲染
   消费 window.NPI.units[NPI_UNIT] 的 sections 数组

   对话部分：data/dlg-XX.js 给出「每行对话 → 专属音色音频 + 说话人性别」，
   不同角色使用不同音色（男/女声池），气泡按性别着色并给出人物图例。
   ============================================================ */
(function () {
  const UNIT = window.NPI_UNIT;
  const esc = (s) =>
    (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* 发音：点击带 data-spk 的元素即朗读其文本（有 data-audio 时用角色专属音色） */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-spk],[data-audio]');
    if (t && !t.closest('.dlg-legend')) { e.preventDefault(); NPI_speakNode(t); }
  });

  function spk(text, extra) {
    return `<span class="spk" data-spk="${esc(text)}"${extra ? ' ' + extra : ''}>${esc(text)}<span class="spk-ico">🔊</span></span>`;
  }

  /* ---------- 对话：角色音色 ---------- */
  const G_ICON = { M: '♂', F: '♀', N: '❖' };
  const G_NAME = { M: '男声', F: '女声', N: '旁白' };

  function dlgEntry(secId, i) {
    const m = window.NPI_DLG || {};
    return m[UNIT + '#' + secId + '#' + i] || null;
  }

  function renderDialogue(sec) {
    const seen = new Map();                       // 说话人 -> 性别，用于图例
    const lines = (sec.lines || []).map((l, i) => {
      const d = dlgEntry(sec.id, i);
      const g = d && d.v ? d.v.charAt(0) : 'N';
      const who = l.who || '';
      if (who && !seen.has(who)) seen.set(who, g);
      const audioAttr = d && d.p ? ` data-audio="${esc(d.p)}"` : '';
      const badge = who ? `<span class="g-badge" title="本角色使用${G_NAME[g]}">${G_ICON[g]}</span>` : '';
      return `<div class="dlg-line g-${g.toLowerCase()}">
        <div class="dlg-who">${esc(who)}${badge}</div>
        <div class="dlg-bubble">
          <span class="dlg-it" data-spk="${esc(l.it)}"${audioAttr}>${esc(l.it)}<span class="spk-ico">🔊</span></span>
          ${l.zh ? `<span class="dlg-zh">${esc(l.zh)}</span>` : ''}
        </div>
      </div>`;
    }).join('');
    let legend = '';
    if (seen.size > 1) {
      legend = `<div class="dlg-legend">${Array.from(seen.entries()).map(([w, g]) =>
        `<span class="lg g-${g.toLowerCase()}">${G_ICON[g]} ${esc(w)}</span>`).join('')}</div>`;
    }
    return legend + '<div class="dlg">' + lines + '</div>';
  }

  function renderUnitHeader(u) {
    return `<header class="unit-header">
      <div class="unit-kicker">Unità ${esc(u.id)}</div>
      <h1>${esc(u.title)}</h1>
      ${u.titleZh ? `<p class="unit-zh">${esc(u.titleZh)}</p>` : ''}
      ${u.tema ? `<p class="unit-tema">${esc(u.tema)}</p>` : ''}
    </header>`;
  }

  function renderBlocks(blocks) {
    if (!blocks || !blocks.length) return '';
    return blocks.map((b) => {
      if (b.kind === 'quote') {
        const lines = (b.lines || []).map((l) => `<li>${spk(l)}</li>`).join('');
        return `<div class="gram-block"><div class="gram-title">${esc(b.title || 'Osservate')}</div><ul class="quote-list">${lines}</ul></div>`;
      }
      if (b.kind === 'table') {
        /* audioCols：指定哪些列（0-based）的意大利语内容可点击朗读；缺省不发音 */
        const audioCols = Array.isArray(b.audioCols) ? b.audioCols : null;
        const head = (b.head || []).map((h) => `<th>${esc(h)}</th>`).join('');
        const rows = (b.rows || []).map((r) => `<tr>${r.map((c, ci) => {
          const cell = esc(c);
          return (audioCols && audioCols.includes(ci)) ? `<td>${spk(c)}</td>` : `<td>${cell}</td>`;
        }).join('')}</tr>`).join('');
        return `<div class="gram-block"><div class="gram-title">${esc(b.title || '')}</div><table class="npi-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
      }
      if (b.kind === 'text') {
        return `<div class="gram-block"><div class="gram-title">${esc(b.title || '')}</div><p class="gram-text">${esc(b.text || '')}</p></div>`;
      }
      return '';
    }).join('');
  }

  function cardWord(w) {
    const warn = (w.zh || '').includes('⚠️') || (w.syll || '').includes('⚠️');
    return `<div class="vcard ${warn ? 'warn' : ''}">
      <div class="v-it">${spk(w.it)}</div>
      <div class="v-meta">${w.pos ? `<span class="v-pos">${esc(w.pos)}</span>` : ''}${w.syll ? `<span class="v-syll">${esc(w.syll)}</span>` : ''}</div>
      <div class="v-zh">${esc(w.zh || '')}</div>
      ${w.ex ? `<div class="v-ex">${spk(w.ex)}<span class="v-exzh">${esc(w.exZh || '')}</span></div>` : ''}
    </div>`;
  }

  function renderSection(sec, unit, vocabDone) {
    let inner = '';
    if (sec.type === 'intro') {
      const goals = (sec.goals || []).map((g) => `<li>${esc(g)}</li>`).join('');
      const prev = (sec.preview || []).map((p) => `<span class="chip">${spk(p.it)} <i>${esc(p.zh)}</i></span>`).join('');
      inner = `<ul class="goal-list">${goals}</ul>${prev ? `<div class="preview-row">${prev}</div>` : ''}`;
    } else if (sec.type === 'dialogue') {
      inner = renderDialogue(sec) + renderBlocks(sec.blocks);
    } else if (sec.type === 'grammar') {
      inner = renderBlocks(sec.blocks);
    } else if (sec.type === 'vocab') {
      const ws = vocabDone ? '' : (unit.words || []).map(cardWord).join('');
      inner = `<div class="vocab-grid">${ws}</div>` + renderBlocks(sec.blocks);
    } else if (sec.type === 'culture') {
      const body = sec.body ? `<p class="cult-body">${esc(sec.body)}</p>` : '';
      const tables = (sec.table || []).map((t) =>
        `<table class="npi-table"><thead><tr>${(t.head || []).map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${(t.rows || []).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      ).join('');
      inner = body + tables;
    } else if (sec.type === 'exercise') {
      const items = (sec.items || []).map((it) => `<li>${esc(it)}</li>`).join('');
      inner = `<ul class="ex-list">${items}</ul><a class="btn-go" href="esercizi.html?u=${esc(unit.id)}">去做本单元练习 →</a>`;
    }
    const audioTag = sec.audio ? `<span class="sec-audio">🔊 ${esc(sec.audio)}</span>` : '';
    const badge = sec.id && sec.id !== 'intro' ? `<span class="sec-badge">${esc(sec.id)}</span>` : '';
    return `<section class="sec sec-${sec.type}" id="sec-${esc(sec.id)}">
      <h2 class="sec-title">${badge}${esc(sec.title)} ${audioTag}</h2>
      ${sec.note ? `<p class="sec-note">${esc(sec.note)}</p>` : ''}
      <div class="sec-body">${inner}</div>
    </section>`;
  }

  function renderNav(u) {
    /* 单元顺序取自轻量目录（单元页只加载本单元正文，不能依赖 window.NPI.units 的全量键） */
    const ids = (window.NPI_CATALOG && window.NPI_CATALOG.order) || Object.keys(window.NPI.units || {}).sort();
    const i = ids.indexOf(UNIT);
    const prev = ids[i - 1], next = ids[i + 1];
    const nav = document.getElementById('unit-nav');
    if (nav) {
      nav.innerHTML =
        `${prev ? `<a href="unit-${prev}.html">← Unità ${prev}</a>` : '<span></span>'}
         <a href="index.html">🏠 单元总览</a>
         <a href="vocabolario.html?unit=${esc(u.id)}">🔤 词汇</a>
         <a href="esercizi.html?u=${esc(u.id)}">✏️ 练习</a>
         ${next ? `<a href="unit-${next}.html">Unità ${next} →</a>` : '<span></span>'}`;
    }
    const here = 'unit-' + UNIT + '.html';
    document.querySelectorAll('.nav-links a').forEach((a) => {
      if (a.getAttribute('href') === here) a.classList.add('active');
    });
  }

  function render() {
    const u = window.NPI && window.NPI.units && window.NPI.units[UNIT];
    const root = document.getElementById('unit-content');
    if (!u) { root.innerHTML = '<p class="empty">单元数据未加载</p>'; return; }
    let vocabDone = false;
    const secs = (u.sections || []).map((s) => { const h = renderSection(s, u, vocabDone); if (s.type === 'vocab') vocabDone = true; return h; }).join('');
    root.innerHTML = renderUnitHeader(u) + secs;
    renderNav(u);
  }

  if (document.readyState !== 'loading') render();
  else document.addEventListener('DOMContentLoaded', render);
})();
