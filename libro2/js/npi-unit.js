/* ============================================================
   NPI 2 · 单元页渲染：按原书 sections 分节结构渲染
   消费 window.NPI.units[NPI_UNIT] 的 sections 数组
   ============================================================ */
(function () {
  const UNIT = window.NPI_UNIT;
  const esc = (s) =>
    (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* 发音：点击带 data-spk 的元素即朗读其文本 */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-spk]');
    if (t) { e.preventDefault(); speak(t.dataset.spk); }
  });

  function spk(text, extra) {
    return `<span class="spk" data-spk="${esc(text)}"${extra ? ' ' + extra : ''}>${esc(text)}<span class="spk-ico">🔊</span></span>`;
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
        const head = (b.head || []).map((h) => `<th>${esc(h)}</th>`).join('');
        const rows = (b.rows || []).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
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
      const lines = (sec.lines || []).map((l) => `
        <div class="dlg-line">
          <div class="dlg-who">${esc(l.who || '')}</div>
          <div class="dlg-bubble">
            <span class="dlg-it" data-spk="${esc(l.it)}">${esc(l.it)}<span class="spk-ico">🔊</span></span>
            ${l.zh ? `<span class="dlg-zh">${esc(l.zh)}</span>` : ''}
          </div>
        </div>`).join('');
      inner = `<div class="dlg">${lines}</div>` + renderBlocks(sec.blocks);
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
         <a href="vocabolario.html">🔤 词汇</a>
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
