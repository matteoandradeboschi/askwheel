// AskWheel: uma busca mostra tudo: roda do Google, roda do Google Shopping (autocomplete via JSONP, direto do navegador)
// e o mapa do People Also Ask (coletado no Google pela extensão AskWheel PAA, em extension/, ou pelo bookmarklet paa.js).
// Também renderiza dados pré-carregados (window.__WHEEL_DATA__), usado pelo HTML gerado pela skill.

const ENDPOINT = 'https://suggestqueries.google.com/complete/search';
// Fontes: url(q, hl, gl, cb) monta o JSONP; parse(data) devolve a lista; open é o prefixo p/ abrir a sugestão.
const goog = (ds) => (q, hl, gl, cb) => `${ENDPOINT}?client=chrome&ie=utf-8&oe=utf-8&hl=${hl}&gl=${gl}${ds}&q=${encodeURIComponent(q)}&callback=${cb}`;
const first = (d) => d?.[1];
const SOURCES = {
  google: { label: 'Google', url: goog(''), parse: first, open: 'https://www.google.com/search?q=' },
  youtube: { label: 'YouTube', url: goog('&ds=yt'), parse: first, open: 'https://www.youtube.com/results?search_query=' },
  shopping: { label: 'Google Shopping', url: goog('&ds=sh'), parse: first, open: 'https://www.google.com/search?udm=28&q=' },
  bing: {
    label: 'Bing',
    url: (q, hl, gl, cb) => `https://api.bing.com/qsonhs.aspx?type=cb&cb=${cb}&mkt=${hl}-${gl.toUpperCase()}&q=${encodeURIComponent(q)}`,
    // Type 'SC' = correção ortográfica, ruído
    parse: (d) => (d?.AS?.Results || []).flatMap((r) => r.Suggests || []).filter((x) => x.Type !== 'SC').map((x) => x.Txt),
    open: 'https://www.bing.com/search?q=',
  },
};
// O que uma busca no site consulta. YouTube e Bing ficam em SOURCES p/ dados da skill.
const SITE_SOURCES = ['google', 'shopping'];
// Só na skill (CORS bloqueia no navegador). open pode ser função(data).
const SKILL_SOURCES = {
  amazon: { label: 'Amazon', open: (d) => `https://www.${encodeURIComponent(d.marketplace || 'amazon.it')}/s?k=` },
  tiktok: { label: 'TikTok', open: 'https://www.tiktok.com/search?q=' },
  trends: { label: 'Google Trends', open: 'https://trends.google.com/trends/explore?q=' },
};
const GROUPS = ['questions', 'prepositions', 'comparisons', 'alphabeticals', 'numbers', 'related'];
// ---------- idioma da interface (textos em i18n.js) ----------
const UI_LANGS = ['pt', 'en', 'it'];
let uiLang = 'pt';
// t('chave', { var }): troca {var}; chave sem tradução cai no pt.
const t = (k, v = {}) => (I18N[uiLang][k] ?? I18N.pt[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const groupLabel = (k) => t(`g.${k}`);

function applyI18n() {
  document.documentElement.lang = uiLang;
  document.querySelectorAll('[data-i18n]').forEach((el) => (el.innerHTML = t(el.dataset.i18n)));
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
  document.querySelectorAll('[data-i18n-label]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nLabel)));
  document.querySelectorAll('[data-i18n-content]').forEach((el) => el.setAttribute('content', t(el.dataset.i18nContent)));
}
const WHEEL_LEAVES = 6;
const OVERVIEW_LEAVES = 15;
// Tons pastel: o anel interno usa a cor, o externo uma versão clara dela (texto sempre escuro).
const PALETTE = ['#f6a58a', '#f9d76b', '#8fbdf7', '#c3b2f9', '#8ddba5', '#f5a3cf', '#fbb877', '#8fdfe8', '#cde58d', '#c3ccd8'];

const $ = (s) => document.querySelector(s);
const narrow = () => matchMedia('(max-width: 640px)').matches;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const hasToken = (text, tok) => ` ${norm(text)} `.includes(` ${norm(tok)} `);
const hasKeyword = (text, kw) => norm(kw).split(' ').every((t) => norm(text).includes(t));

// panels: uma roda por fonte ({ data, group, view, el }); paa: árvore do People Also Ask.
// paaWait: id do pedido em curso à extensão; paaProg: andamento dele; paaError: motivo da última falha.
let state = { keyword: '', hl: '', gl: '', panels: [], paa: null, paaWait: null, paaProg: null, paaError: null, listGroup: null };

// ---------- coleta ----------

function jsonp(src, q, hl, gl, timeout = 8000) {
  return new Promise((resolve) => {
    const cb = '__aw' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    const done = (list) => { clearTimeout(t); s.remove(); resolve(list); };
    // Resposta que chega depois do timeout: cai num no-op (sem ReferenceError) e só então limpa.
    const t = setTimeout(() => { window[cb] = () => delete window[cb]; done(null); }, timeout);
    window[cb] = (data) => { delete window[cb]; const l = SOURCES[src].parse(data); done(Array.isArray(l) ? l : []); };
    s.onerror = () => { delete window[cb]; done(null); };
    s.src = SOURCES[src].url(q, hl, gl, cb);
    document.head.append(s);
  });
}

function buildPlan(kw, m) {
  const plan = [];
  for (const mod of m.questions) plan.push({ group: 'questions', mod, q: `${mod} ${kw}` }, { group: 'questions', mod, q: `${kw} ${mod}` });
  for (const mod of m.prepositions) plan.push({ group: 'prepositions', mod, q: `${kw} ${mod}` });
  for (const mod of m.comparisons) plan.push({ group: 'comparisons', mod, q: `${kw} ${mod}` });
  for (const c of 'abcdefghijklmnopqrstuvwxyz') plan.push({ group: 'alphabeticals', mod: c, q: `${kw} ${c}` });
  for (const n of '0123456789') plan.push({ group: 'numbers', mod: n, q: `${kw} ${n}` });
  plan.push({ group: 'related', mod: null, q: kw }, { group: 'related', mod: null, q: `${kw} ` });
  return plan;
}

// Mesma regra do collect.py: a sugestão fica no modificador se contém a keyword
// (e o modificador, quando é palavra); o resto vai para "related". Cada sugestão aparece uma vez só.
function assemble(kw, plan, results, meta) {
  const groups = {};
  const assigned = new Set();
  const leftovers = [];
  plan.forEach((step, i) => {
    const g = (groups[step.group] ??= { modifiers: [] });
    let m = g.modifiers.find((x) => x.name === step.mod);
    if (!m) g.modifiers.push((m = { name: step.mod, items: [] }));
    for (const s of results[i] || []) {
      const key = norm(s);
      if (key === norm(step.q)) continue;
      const byWord = step.group === 'alphabeticals' || step.group === 'numbers' || hasToken(s, step.mod ?? '');
      const fits = step.group !== 'related' && hasKeyword(s, kw) && byWord;
      // Cada sugestão fica só no primeiro modificador (na ordem do plano) em que se encaixa.
      if (fits) {
        if (!assigned.has(key)) { m.items.push(s); assigned.add(key); }
      } else leftovers.push(s);
    }
  });
  const rel = groups.related.modifiers[0];
  const seen = new Set([norm(kw)]);
  for (const s of leftovers) {
    const k = norm(s);
    if (!assigned.has(k) && !seen.has(k)) { seen.add(k); rel.items.push(s); }
  }
  for (const g of Object.values(groups)) g.count = g.modifiers.reduce((n, m) => n + m.items.length, 0);
  return { keyword: kw, ...meta, collected_at: new Date().toISOString(), source: `${meta.src}-autocomplete`, groups };
}

// modifiers.json é buscado uma vez só (as fontes e as buscas seguintes reusam a mesma promessa).
let modifiers;
const loadModifiers = () => (modifiers ??= fetch('modifiers.json').then((r) => r.json()).catch((e) => { modifiers = null; throw e; }));

async function collect(kw, hl, gl, src, onProgress) {
  const all = window.__WHEEL_MODIFIERS__ || (await loadModifiers());
  const plan = buildPlan(kw, all[hl] || all.en);
  const results = new Array(plan.length);
  let next = 0, done = 0, failed = 0;
  const worker = async () => {
    while (next < plan.length) {
      const i = next++;
      const r = await jsonp(src, plan[i].q, hl, gl);
      if (r === null) failed++;
      results[i] = r || [];
      onProgress(++done, plan.length);
      await sleep(120);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return { data: assemble(kw, plan, results, { hl, gl, src }), failed, total: plan.length };
}

// ---------- roda (sunburst com zoom) ----------

// Roda de um grupo: anel interno = modificador, externo = primeiras sugestões (todas nos Cards).
function drawGroupWheel(el, data, group) {
  const kw = data.keyword;
  const mods = group.modifiers.filter((m) => m.items.length);
  if (!mods.length) { el.innerHTML = `<p class="empty">${t('empty.group')}</p>`; return; }
  const tree = { name: kw, children: mods.map((m) => ({ name: m.name ?? kw, children: m.items.slice(0, WHEEL_LEAVES).map((t) => ({ name: t, value: 1 })) })) };
  drawWheel(el, tree, {
    open: (d) => openUrl(data, d.data.name),
    tip: (d) => (d.children
      ? tipHtml(d.data.name, [[t('tip.sugs'), group.modifiers.find((m) => (m.name ?? kw) === d.data.name)?.items.length]], t('tip.zoom'))
      : tipHtml(d.data.name, [[t('tip.src'), dataLabel(data)], [t('tip.mod'), d.parent.data.name]], t('tip.open', { src: srcLabel(data.src) }))),
    hint: t('hint.group', { n: WHEEL_LEAVES }),
  });
}

// Roda geral: anel interno = fonte, externo = principais sugestões dela (uma de cada modificador, em rodízio).
function topSuggestions(data, n) {
  const lists = GROUPS.flatMap((k) => (data.groups[k]?.modifiers || []).map((m) => m.items));
  const out = new Set();
  for (let i = 0; out.size < n && lists.some((l) => l[i]); i++) for (const l of lists) if (l[i] && out.size < n) out.add(l[i]);
  return [...out];
}

function renderOverview() {
  const el = $('#overview .wheel');
  $('#overview').hidden = state.panels.length < 2;
  if (state.panels.length < 2) return;
  const tree = { name: state.keyword, children: state.panels.map(({ data }) => ({ name: dataLabel(data), data, children: topSuggestions(data, OVERVIEW_LEAVES).map((t) => ({ name: t, value: 1 })) })) };
  const total = (data) => GROUPS.reduce((n, k) => n + (data.groups[k]?.count || 0), 0);
  drawWheel(el, tree, {
    open: (d) => openUrl(d.parent.data.data, d.data.name),
    tip: (d) => (d.children
      ? tipHtml(d.data.name, [[t('tip.sugs'), total(d.data.data)]], t('tip.zoom'))
      : tipHtml(d.data.name, [[t('tip.src'), d.parent.data.name]], t('tip.openSearch'))),
    hint: t('hint.overview'),
  });
}

// Tooltip escuro (como no ATP): título, linhas rótulo/valor e uma dica de clique.
const tipHtml = (title, rows, foot) => `<b>${esc(title)}</b>${
  rows.map(([k, v]) => `<div class="row"><span>${esc(k)}</span>${esc(v ?? '')}</div>`).join('')}<small>${esc(foot)}</small>`;
const tipEl = () => $('#tip') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'tip', role: 'tooltip', hidden: true }));

// Sunburst com zoom. tree: { name, children: [{ name, children: [{ name, value }] }] }.
function drawWheel(el, tree, { open, tip, hint }) {
  el.replaceChildren();
  const kw = tree.name;
  const size = 760, R = size / 2;
  // raio de cada anel (y da partição: 0–1 miolo, 1–2 modificador, 2–3 sugestões): a faixa de fora é a mais larga
  const R0 = R * 0.24, R1 = R0 + (R - R0) * 0.3;
  const rad = (y) => (y <= 1 ? y * R0 : y <= 2 ? R0 + (y - 1) * (R1 - R0) : R1 + (y - 2) * (R - R1));
  const color = d3.scaleOrdinal(tree.children.map((c) => c.name), PALETTE.concat(PALETTE, PALETTE));
  const fill = (d) => { const c = color(d.depth === 1 ? d.data.name : d.parent.data.name); return d.children ? c : d3.interpolateRgb(c, '#fff')(0.6); };
  const root = d3.partition().size([2 * Math.PI, 3])(d3.hierarchy(tree).sum((d) => d.value || 0));
  root.each((d) => (d.current = d));

  const arc = d3.arc()
    .startAngle((d) => d.x0).endAngle((d) => d.x1)
    .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.004)).padRadius(R0 * 2)
    .innerRadius((d) => rad(d.y0)).outerRadius((d) => Math.max(rad(d.y0), rad(d.y1) - 1));
  const arcVisible = (d) => d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
  // rótulo só se a fatia tem altura para a letra (largura do arco no meio do anel)
  const labelVisible = (d) => d.y1 <= 3 && d.y0 >= 1 && ((d.x1 - d.x0) * (rad(d.y0) + rad(d.y1))) / 2 > 12;
  const labelTransform = (d) => {
    const x = (((d.x0 + d.x1) / 2) * 180) / Math.PI, y = (rad(d.y0) + rad(d.y1)) / 2;
    return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
  };
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  // corta o texto pela largura medida da faixa (não por nº de letras), para não vazar da fatia
  const fit = (node, d, p) => {
    const s = d.data.name, max = rad(p.y1) - rad(p.y0) - 12;
    node.textContent = s;
    if (!node.getComputedTextLength()) return (node.textContent = short(s, 22)); // roda escondida: sem medida
    for (let n = s.length; n > 1 && node.getComputedTextLength() > max; n--) node.textContent = s.slice(0, n - 1).trimEnd() + '…';
  };

  const svg = d3.create('svg').attr('viewBox', [-size / 2, -size / 2, size, size]);
  el.append(svg.node());
  const g = svg.append('g');
  const path = g.append('g').selectAll('path').data(root.descendants().slice(1)).join('path')
    .attr('fill', fill)
    .attr('fill-opacity', (d) => +arcVisible(d.current))
    .attr('pointer-events', (d) => (arcVisible(d.current) ? 'auto' : 'none'))
    .attr('stroke', '#fff')
    .attr('d', (d) => arc(d.current))
    .style('cursor', 'pointer')
    .on('click', (e, d) => {
      if (d.children) return zoom(d);
      // toque: o 1º toque mostra a sugestão inteira, o 2º abre (no mouse o tooltip já aparece ao passar)
      if (e.pointerType === 'touch' && armed !== d) { armed = d; return showTip(e, d); }
      window.open(open(d), '_blank', 'noopener');
    })
    .on('mousemove', showTip)
    .on('mouseleave', () => (tipEl().hidden = true));

  const label = g.append('g').attr('text-anchor', 'middle').selectAll('text')
    .data(root.descendants().slice(1)).join('text').attr('dy', '0.35em')
    .attr('fill-opacity', (d) => +labelVisible(d.current))
    .attr('transform', (d) => labelTransform(d.current))
    .style('font-weight', (d) => (d.children ? 700 : 400))
    .each(function (d) { fit(this, d, d); });

  let armed = null;
  function showTip(e, d) {
    const t = tipEl();
    t.innerHTML = tip(d);
    t.hidden = false;
    // não deixa o tooltip sair da tela pela direita/embaixo
    t.style.left = `${Math.min(e.clientX + 14, innerWidth - t.offsetWidth - 8)}px`;
    t.style.top = `${Math.min(e.clientY + 14, innerHeight - t.offsetHeight - 8)}px`;
  }

  const center = g.append('circle').attr('r', R0).attr('class', 'center').on('click', () => zoom(focus.parent || root));
  const centerLabel = g.append('text').attr('class', 'center-label').attr('text-anchor', 'middle').attr('dy', '0.35em').text(short(kw, 18));
  let focus = root;

  function zoom(p) {
    focus = p;
    centerLabel.text(short(p.data.name, 18));
    root.each((d) => (d.target = {
      x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
      x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
      y0: Math.max(0, d.y0 - p.depth),
      y1: Math.max(0, d.y1 - p.depth),
    }));
    armed = null;
    tipEl().hidden = true;
    // no zoom as sugestões mudam de anel (e de largura): recorta o texto para o anel de destino
    label.each(function (d) { if (labelVisible(d.target)) fit(this, d, d.target); });
    const t = svg.transition().duration(reducedMotion() ? 0 : 600);
    path.transition(t)
      .tween('data', (d) => { const i = d3.interpolate(d.current, d.target); return (k) => (d.current = i(k)); })
      .filter(function (d) { return +this.getAttribute('fill-opacity') || arcVisible(d.target); })
      .attr('fill-opacity', (d) => +arcVisible(d.target))
      .attr('pointer-events', (d) => (arcVisible(d.target) ? 'auto' : 'none'))
      .attrTween('d', (d) => () => arc(d.current));
    label.filter(function (d) { return +this.getAttribute('fill-opacity') || labelVisible(d.target); })
      .transition(t)
      .attr('fill-opacity', (d) => +labelVisible(d.target))
      .attrTween('transform', (d) => () => labelTransform(d.current));
  }

  const note = document.createElement('p');
  note.className = 'hint muted';
  note.textContent = hint;
  el.append(note);
  center.raise();
  centerLabel.raise();
}

// ---------- mapa do People Also Ask (árvore horizontal, como a skill paa-mapa) ----------

function drawMap(el, tree) {
  const ROW = 26, GAP = 26, PAD = 32, COLGAP = 72, PLUS = 18;
  const NS = 'http://www.w3.org/2000/svg';
  el.replaceChildren();
  const svg = document.createElementNS(NS, 'svg');
  el.append(svg);
  const add = (tag, attrs, parent = svg) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e);
    return e;
  };

  // y: folhas em sequência, pais centralizados nos filhos, espaço entre grupos
  let cursor = PAD;
  (function place(n, depth) {
    n.depth = depth;
    const kids = n.children || [];
    if (!kids.length) { n.y = cursor; cursor += ROW; return; }
    kids.forEach((c) => place(c, depth + 1));
    n.y = (kids[0].y + kids[kids.length - 1].y) / 2;
    if (depth >= 1) cursor += GAP;
  })(tree, 0);

  // x: cada filho começa após o fim do texto do pai. Clicar numa pergunta abre a busca no Google.
  const links = add('g', {});
  const searchLabel = t('map.search'); // dentro de draw, t é o elemento de texto
  let maxX = 0;
  (function draw(n, x) {
    const leaf = !(n.children || []).length;
    let tx = x;
    if (leaf && n.depth > 0) {
      const g = add('g', { class: 'plus' });
      add('circle', { cx: x + 7, cy: n.y, r: 7 }, g);
      add('text', { x: x + 7, y: n.y + 1 }, g).textContent = '+';
      tx = x + PLUS;
    }
    const t = add('text', { x: tx, y: n.y, class: n.depth === 0 ? 'root' : 'q' });
    t.textContent = n.name;
    if (n.depth > 0) {
      const go = () => window.open(SOURCES.google.open + encodeURIComponent(n.name), '_blank', 'noopener');
      t.addEventListener('click', go);
      // teclado: Tab chega na pergunta, Enter abre a busca
      t.setAttribute('tabindex', '0');
      t.setAttribute('role', 'link');
      t.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      add('title', {}, t).textContent = searchLabel;
    }
    const end = tx + t.getComputedTextLength();
    maxX = Math.max(maxX, end);
    (n.children || []).forEach((c) => {
      const cx = end + COLGAP, sx = end + 6, mx = (sx + cx) / 2;
      add('path', { d: `M${sx},${n.y} C${mx},${n.y} ${mx},${c.y} ${cx - 4},${c.y}` }, links);
      draw(c, cx);
    });
  })(tree, PAD);

  svg.setAttribute('width', maxX + PAD);
  svg.setAttribute('height', cursor + PAD);
}

const countTree = (n) => (n.children || []).reduce((s, c) => s + 1 + countTree(c), 0);

// ---------- tabela / extras ----------

const srcMeta = (src) => SOURCES[src] || SKILL_SOURCES[src] || SOURCES.google;
const srcLabel = (src) => srcMeta(src).label;
// dados da skill sem fonte real (sugestões geradas pelo Claude): sem src, links caem numa busca no Google
const isGenerated = (data) => data.source === 'claude-generated';
const dataLabel = (data) => (isGenerated(data) ? t('generated') : srcLabel(data.src));
const dataSrc = (data) => (isGenerated(data) ? 'claude-generated' : SOURCES[data.src] || SKILL_SOURCES[data.src] ? data.src : 'google');
const openUrl = (data, q) => {
  const open = srcMeta(data.src).open;
  return (typeof open === 'function' ? open(data) : open) + encodeURIComponent(q);
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function drawTable(el, data, group) {
  const mods = group.modifiers.filter((m) => m.items.length);
  el.innerHTML = mods.length
    ? mods.map((m) => `<div class="block"><h3>${esc(m.name ?? 'relacionadas')} <small>${m.items.length}</small></h3><ul class="rows">${
        m.items.map((t) => `<li>${plusBtn(t)}${linkTo(data, t)}</li>`).join('')
      }</ul></div>`).join('')
    : `<p class="empty">${t('empty.group')}</p>`;
}

const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
const ICON_DONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';
const plusBtn = (s) => `<button class="plus" data-text="${esc(s)}" title="${t('copy')}" aria-label="${esc(t('copy.item', { t: s }))}">${ICON_COPY}</button>`;
const linkTo = (data, t) => `<a href="${esc(openUrl(data, t))}" target="_blank" rel="noopener">${esc(t)}</a>`;

// Lista única com todas as fontes, etiqueta "grupo / modificador" e filtros (como a lista de palavras-chave do ATP).
function renderList() {
  $('#list').hidden = !state.panels.length;
  const f = norm($('#list-q').value);
  const g = state.listGroup;
  const rows = state.panels.flatMap(({ data }) => GROUPS.flatMap((k) =>
    (data.groups[k]?.modifiers || []).flatMap((m) => m.items.map((t) => ({ t, k, m: m.name, data })))));
  const shown = rows.filter((r) => (!g || r.k === g) && (!f || norm(r.t).includes(f)));
  $('#list-groups').innerHTML = [null, ...GROUPS].map((k) =>
    `<button data-lgroup="${k ?? ''}" aria-pressed="${k === g}">${k ? groupLabel(k) : t('list.all')}</button>`).join('');
  $('#list-count').textContent = t('list.count', { a: shown.length, n: rows.length });
  $('#list tbody').innerHTML = shown.map((r) => `<tr><td><span class="kw">${plusBtn(r.t)}${linkTo(r.data, r.t)}</span></td><td>${
    esc(dataLabel(r.data))}</td><td><span class="tag ${r.k}">${esc(groupLabel(r.k).toLowerCase())}${r.m ? ` / ${esc(r.m)}` : ''}</span></td></tr>`).join('')
    || `<tr><td colspan="3" class="empty">${t('list.none')}</td></tr>`;
}

function drawExtras(el, extras) {
  el.innerHTML = (extras.sections || []).map((s) => `<div class="block"><h3>${esc(s.title)}</h3>${
    s.intro ? `<p class="note">${esc(s.intro)}</p>` : ''
  }<ol>${(s.items || []).map((it) => `<li>${esc(it.text)}${
    it.note ? ` <span class="note">— ${esc(it.note)}</span>` : ''
  }${it.keywords?.length ? `<div class="note">${it.keywords.map(esc).join(' · ')}</div>` : ''}</li>`).join('')}</ol></div>`).join('');
}

// ---------- painéis ----------

// el: o espaço reservado da fonte durante a busca (sem ele, cria o painel no fim).
function addPanel(data, el = $('#panels').appendChild(document.createElement('section'))) {
  // tela estreita: Cards por padrão (a roda fica pequena demais para ler)
  const view = narrow() ? 'table' : 'wheel';
  el.className = 'panel';
  el.innerHTML = `<div class="res-head"><h2></h2><div class="actions">
      <div class="seg" role="group" aria-label="${t('view.label')}">
        <button data-view="wheel" aria-pressed="${view === 'wheel'}">${t('view.wheel')}</button><button data-view="table" aria-pressed="${view === 'table'}">${t('view.cards')}</button>
      </div>
      <button class="ghost csv">${t('csv')}</button></div></div>
    <div class="mtabs" role="group" aria-label="${t('g.label')}"></div><div class="wheel"></div><div class="table" hidden></div><div class="extras" hidden></div>`;
  // Abre no primeiro grupo com roda legível (≥3 modificadores com sugestões); senão, no primeiro com alguma.
  const filled = (k) => data.groups[k]?.modifiers.filter((m) => m.items.length).length || 0;
  const p = { data, el, view, group: GROUPS.find((k) => filled(k) >= 3) || GROUPS.find((k) => data.groups[k]?.count) || 'questions' };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.group) p.group = b.dataset.group;
    else if (b.dataset.view) {
      p.view = b.dataset.view;
      el.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    } else if (b.classList.contains('csv')) return download(`askwheel-${dataSrc(data)}-${data.keyword}.csv`, toCsv(data), 'text/csv');
    else return;
    renderPanel(p);
  });
  state.panels.push(p);
  renderPanel(p);
  renderOverview();
  renderList();
}

function renderPanel(p) {
  const { data, el } = p;
  const q = (s) => el.querySelector(s);
  const total = GROUPS.reduce((n, k) => n + (data.groups[k]?.count || 0), 0);
  q('h2').innerHTML = `${esc(dataLabel(data))} <small>${t('panel.count', { n: Number(total) })}</small>`;
  const keys = GROUPS.filter((k) => data.groups[k]).concat(data.extras ? ['extras'] : []);
  q('.mtabs').innerHTML = keys.map((k) => `<button data-group="${k}" aria-pressed="${k === p.group}">${
    k === 'extras' ? '' : `<b>${Number(data.groups[k].count)}</b>`}${groupLabel(k)}</button>`).join('');
  // grupo vazio: aba esmaecida e desativada
  q('.mtabs').querySelectorAll('button').forEach((b) => (b.disabled = b.dataset.group !== 'extras' && !data.groups[b.dataset.group].count));

  const isExtras = p.group === 'extras';
  q('.extras').hidden = !isExtras;
  q('.wheel').hidden = isExtras || p.view !== 'wheel';
  q('.table').hidden = isExtras || p.view !== 'table';
  q('.seg').hidden = isExtras;
  if (isExtras) return drawExtras(q('.extras'), data.extras);
  const group = data.groups[p.group];
  if (p.view === 'wheel') drawGroupWheel(q('.wheel'), data, group);
  else drawTable(q('.table'), data, group);
}

function renderPaa() {
  const { paa } = state;
  $('#paa-help').hidden = !!paa;
  $('#paa-head').hidden = !paa;
  // nada coletando nem coletado: só a linha de instalação (que some em telas de toque, ver style.css)
  $('#paa').classList.toggle('idle', !paa && !state.paaWait && !state.paaError);
  const ext = hasExt();
  const pr = state.paaProg;
  $('#paa-prog').hidden = !state.paaWait || !!state.paaError;
  $('#paa-prog span').textContent = pr ? t('paa.reading', { n: pr.found }) : t('paa.opening');
  $('#paa-prog i').style.width = `${pr ? Math.round((pr.done / pr.total) * 100) : 0}%`;
  $('#paa-msg').textContent = PAA_ERRORS.includes(state.paaError) ? t(`paa.e.${state.paaError}`) : '';
  $('#paa-msg').hidden = !$('#paa-msg').textContent;
  $('#paa-install').hidden = ext;
  $('#paa-map').hidden = !paa;
  $('#paa-csv').hidden = !paa;
  $('#paa-count').textContent = paa ? t('paa.count', { n: countTree(paa) }) : '';
  // drawMap mede o texto: com #paa escondido as larguras saem 0. showPaa redesenha ao mostrar.
  if (paa && !$('#paa').hidden) drawMap($('#paa-map'), paa);
  if (state.keyword) {
    $('#paa-open').href = `https://www.google.com/search?${new URLSearchParams({ q: state.keyword, hl: state.hl, gl: state.gl })}`;
    $('#paa-open').textContent = t('paa.openKw', { kw: state.keyword });
  }
}

function showPaa() {
  if (!$('#paa').hidden) return;
  $('#paa').hidden = false;
  if (state.paa) drawMap($('#paa-map'), state.paa);
}

function startResults(kw, hl, gl) {
  Object.assign(state, { keyword: kw, hl, gl, panels: [], listGroup: null });
  $('#panels').replaceChildren();
  $('#overview').hidden = $('#list').hidden = true;
  $('#list-q').value = '';
  $('#res-title').textContent = t('res.title', { kw });
  document.body.classList.add('has-results');
  $('#results').hidden = false;
  // PAA e "Copiar link" só depois do primeiro resultado: durante a espera, só o progresso das fontes
  $('#paa').hidden = $('#share').hidden = true;
}

// ---------- UI ----------

// setStatus('chave', fração, { vars }): guarda a chave para retraduzir quando o idioma muda.
function setStatus(key, frac, vars) {
  state.status = [key, frac, vars];
  $('#status').hidden = false;
  $('#status span').textContent = t(key, vars);
  $('#status i').style.width = `${Math.round((frac ?? 0) * 100)}%`;
}

// ---------- People Also Ask pela extensão ----------
// A extensão (extension/site.js) marca o <html> com data-askwheel-ext e atende pedidos por postMessage.
const hasExt = () => !!document.documentElement.dataset.askwheelExt;
// Erros em que a aba do Google fica aberta para o usuário resolver: o pedido continua valendo.
const PAA_PENDING = ['captcha', 'blocked', 'timeout'];
const PAA_ERRORS = ['empty', 'captcha', 'blocked', 'timeout']; // textos em i18n.js: paa.e.<erro>
// Sem notícia da extensão por esse tempo, avisa (mas continua aceitando a resposta, se ela chegar).
const PAA_SILENCE = 30000;
let paaTimer;
function armPaaTimer(id) {
  clearTimeout(paaTimer);
  paaTimer = setTimeout(() => {
    if (state.paaWait !== id || state.paaError) return;
    state.paaError = 'timeout';
    renderPaa();
  }, PAA_SILENCE);
}

function requestPaa(kw, hl, gl) {
  const id = Math.random().toString(36).slice(2);
  Object.assign(state, { paaWait: id, paaProg: null, paaError: null });
  window.postMessage({ type: 'askwheel:paa', id, q: kw, hl, gl }, location.origin);
  armPaaTimer(id);
}

window.addEventListener('message', (e) => {
  const m = e.data;
  if (e.source !== window || m?.id !== state.paaWait) return;
  armPaaTimer(m.id);
  if (m.type === 'askwheel:paa-progress') {
    if (state.paaError === 'timeout') state.paaError = null;
    state.paaProg = { done: Number(m.done) || 0, total: Number(m.total) || 1, found: Number(m.found) || 0 };
    return renderPaa();
  }
  if (m.type !== 'askwheel:paa-result') return;
  const paa = m.data && cleanPaa(m.data);
  if (paa) Object.assign(state, { paa: paa.tree, paaError: null });
  else state.paaError = m.error || 'empty';
  if (!PAA_PENDING.includes(state.paaError)) state.paaWait = null;
  renderPaa();
});

// Consulta Google e Google Shopping ao mesmo tempo; o PAA vem da extensão ou do bookmarklet (paa mantém o que já foi coletado).
async function search(kw, hl, gl, paa = null) {
  $('#go').disabled = true;
  // aria-busy: o leitor de tela anuncia só o resultado final, não cada n/140.
  $('#status').setAttribute('aria-busy', 'true');
  startResults(kw, hl, gl);
  Object.assign(state, { paa, paaWait: null, paaError: null });
  if (!paa && hasExt()) requestPaa(kw, hl, gl);
  if (paa) showPaa(); // PAA já coletado (bookmarklet): mostra mesmo se o autocomplete falhar
  renderPaa();
  const prog = {};
  const tick = () => {
    const d = Object.values(prog).reduce((s, x) => s + x[0], 0), n = Object.values(prog).reduce((s, x) => s + x[1], 0);
    setStatus('st.querying', n ? d / n : 0, { d, n });
  };
  tick();
  // Um espaço por fonte, na ordem de SITE_SOURCES: cada uma mostra o próprio progresso e vira painel ao terminar.
  const slots = Object.fromEntries(SITE_SOURCES.map((src) => {
    const el = $('#panels').appendChild(document.createElement('section'));
    el.className = 'panel pending';
    el.innerHTML = `<div class="res-head"><h2>${esc(srcLabel(src))} <small>${t('slot.querying')}</small></h2></div>`;
    return [src, el];
  }));
  const slotNote = (src, text) => (slots[src].querySelector('small').textContent = text);
  try {
    const runs = await Promise.all(SITE_SOURCES.map((src) => collect(kw, hl, gl, src, (d, n) => {
      prog[src] = [d, n];
      slotNote(src, t('slot.prog', { d, n }));
      tick();
    }).then((r) => {
      if (r.failed === r.total) slotNote(src, t('slot.fail'));
      else {
        addPanel(r.data, slots[src]);
        showPaa();
        $('#share').hidden = false;
      }
      return r;
    })));
    const failed = runs.reduce((s, r) => s + r.failed, 0), total = runs.reduce((s, r) => s + r.total, 0);
    // painéis chegam na ordem em que terminam: volta para a ordem de SITE_SOURCES (cores e lista estáveis)
    state.panels.sort((a, b) => SITE_SOURCES.indexOf(a.data.src) - SITE_SOURCES.indexOf(b.data.src));
    renderOverview();
    renderList();
    if (failed === total) {
      $('#panels').replaceChildren();
      if (state.paa || state.paaWait) showPaa();
      return setStatus('st.fail', 0);
    }
    setStatus(failed ? 'st.partial' : 'st.done', 1, { f: failed, n: total });
    history.replaceState(null, '', `?${new URLSearchParams({ q: kw, hl, gl })}`);
  } catch {
    document.querySelectorAll('#panels .pending').forEach((el) => el.remove());
    setStatus('st.error', 0);
  } finally {
    $('#go').disabled = false;
    $('#status').setAttribute('aria-busy', 'false');
  }
}

// Célula que começa com = + - @ (ou tab/CR) vira fórmula no Excel/Sheets: prefixa ' para ficar texto.
const csvCell = (c) => `"${String(c).replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
const csvRows = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n');

function toCsv(data) {
  const rows = [['grupo', 'modificador', 'sugestao', 'fonte']];
  for (const k of GROUPS) for (const m of data.groups[k]?.modifiers || []) for (const t of m.items) rows.push([k, m.name ?? '', t, dataSrc(data)]);
  return csvRows(rows);
}

function paaCsv(tree) {
  const rows = [['pergunta', 'pergunta_pai', 'nivel']];
  (function walk(n, parent, depth) {
    if (depth) rows.push([n.name, parent, depth]);
    (n.children || []).forEach((c) => walk(c, depth ? n.name : '', depth + 1));
  })(tree, '', 0);
  return csvRows(rows);
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function copy(text, btn, done = 'Copiado') {
  try { await navigator.clipboard.writeText(text); } catch { return; }
  const old = btn.innerHTML;
  btn.innerHTML = done;
  setTimeout(() => (btn.innerHTML = old), 1200);
}

function selectTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => (b.dataset.tab === name ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  document.querySelectorAll('.tab').forEach((s) => (s.hidden = s.id !== `tab-${name}`));
  // drawMap mede o texto: desenhado com a aba escondida, as larguras saem 0. Redesenha ao voltar.
  if (name === 'search' && state.paa) drawMap($('#paa-map'), state.paa);
}

// O pathname vem da URL e vai para o comando shell e para o bookmarklet: só passa se for um caminho simples.
const siteUrl = () => {
  if (!/^https?:/.test(location.protocol)) return 'https://SEU-SITE.pages.dev/';
  const dir = location.pathname.replace(/[^/]*$/, '');
  return location.origin + (/^[\w/.~-]*$/.test(dir) ? dir : '/');
};

function installCommand() {
  const origin = siteUrl();
  // Um curl só, com --fail-early: qualquer arquivo que falhe impede o "instalada".
  const files = [...['SKILL.md', 'collect.py', 'render.py'].map((f) => [`skill/${f}`, f]), ...['index.html', 'i18n.js', 'app.js', 'style.css', 'modifiers.json'].map((f) => [f, `site/${f}`])];
  return `d=~/.claude/skills/askwheel; mkdir -p "$d/site" && curl -fsSL --fail-early ${files.map(([url, out]) => `-o "$d/${out}" ${origin}${url}`).join(' ')} && echo "${t('install.done')} $d"`;
}

// O código do bookmarklet fica legível em paa.js; aqui vira um link javascript: com o endereço do site.
async function setupBookmarklet() {
  try {
    const code = (await fetch('paa.js').then((r) => r.text())).replace('__SITE__', () => siteUrl());
    $('#paa-bm').href = 'javascript:' + encodeURIComponent(code);
  } catch { $('#paa-bm').replaceWith(t('bm.offline')); }
  $('#paa-bm')?.addEventListener('click', (e) => { e.preventDefault(); $('#bm-msg').textContent = t('bm.drag'); });
}

// Dados que o bookmarklet traz do Google em #paa=. Vêm de fora: só passam se tiverem a forma esperada.
function readPaaHash() {
  if (!location.hash.startsWith('#paa=')) return null;
  const raw = location.hash.slice(5);
  history.replaceState(null, '', location.pathname);
  try { return cleanPaa(JSON.parse(decodeURIComponent(raw))); } catch { return null; }
}

// PAA vindo do bookmarklet ou da extensão: { keyword, hl, gl, tree }.
function cleanPaa(d) {
  if (typeof d?.keyword !== 'string' || !Array.isArray(d.tree?.children)) return null;
  const clean = (n, depth) => ({
    name: String(n.name).slice(0, 300),
    children: depth < 6 && Array.isArray(n.children) ? n.children.filter((c) => typeof c?.name === 'string').slice(0, 50).map((c) => clean(c, depth + 1)) : [],
  });
  // keyword limitada: um link #paa= de qualquer lugar dispara a busca completa com ela.
  const kw = d.keyword.slice(0, 200);
  return { keyword: kw, hl: String(d.hl || ''), gl: String(d.gl || ''), tree: clean({ name: kw, children: d.tree.children }, 0) };
}

function defaults() {
  const [lang, region] = (navigator.language || 'it-IT').toLowerCase().split('-');
  const hl = ['pt', 'it', 'en', 'es'].includes(lang) ? lang : 'en';
  const fallback = { pt: 'br', it: 'it', en: 'us', es: 'es' }[hl];
  const gl = [...$('#gl').options].some((o) => o.value === region) ? region : fallback;
  return { hl, gl };
}

// Idioma da interface: o salvo, senão o do navegador (se for pt/en/it), senão inglês.
function pickLang() {
  let saved;
  try { saved = localStorage.getItem('askwheel-lang'); } catch {}
  const nav = (navigator.language || '').slice(0, 2).toLowerCase();
  return [saved, nav].find((l) => UI_LANGS.includes(l)) || 'en';
}

function setLang(l) {
  uiLang = UI_LANGS.includes(l) ? l : 'en';
  try { localStorage.setItem('askwheel-lang', uiLang); } catch {}
  $('#ui-lang').value = uiLang;
  applyI18n();
  $('#install-cmd').textContent = installCommand();
  $('#bm-msg').textContent = '';
  if (state.status) setStatus(...state.status);
  if (state.keyword) $('#res-title').textContent = t('res.title', { kw: state.keyword });
  // Painéis: recria com os textos novos. Um elemento novo (cloneNode sem filhos) descarta o listener antigo.
  const old = state.panels.map((p) => [p.data, p.el]);
  state.panels = [];
  old.forEach(([data, el]) => {
    const fresh = el.cloneNode(false);
    el.replaceWith(fresh);
    addPanel(data, fresh);
  });
  if (state.keyword) renderPaa();
}

const setSelect = (id, v) => { if ([...$(`#${id}`).options].some((o) => o.value === v)) $(`#${id}`).value = v; };

function init() {
  setLang(pickLang());
  $('#ui-lang').addEventListener('change', (e) => setLang(e.target.value));
  const params = new URLSearchParams(location.search);
  const d = defaults();
  $('#hl').value = d.hl;
  $('#gl').value = d.gl;
  setSelect('hl', params.get('hl'));
  setSelect('gl', params.get('gl'));
  $('#install-cmd').textContent = installCommand();
  setupBookmarklet();

  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
  document.querySelectorAll('[data-goto]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); selectTab(a.dataset.goto); scrollTo(0, 0); }));
  $('#form').addEventListener('submit', (e) => {
    e.preventDefault();
    const kw = $('#q').value.trim();
    if (!kw) return;
    selectTab('search');
    search(kw, $('#hl').value, $('#gl').value);
  });
  $('#paa-csv').addEventListener('click', () => download(`askwheel-paa-${state.keyword}.csv`, paaCsv(state.paa), 'text/csv'));
  $('#share').addEventListener('click', (e) => {
    const { keyword: q, hl, gl } = state;
    copy(`${location.origin}${location.pathname}?${new URLSearchParams({ q, hl, gl })}`, e.target);
  });
  document.addEventListener('click', (e) => { const b = e.target.closest('button.plus'); if (b) copy(b.dataset.text, b, ICON_DONE); });
  $('#list-groups').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { state.listGroup = b.dataset.lgroup || null; renderList(); }
  });
  $('#list-q').addEventListener('input', renderList);
  // tooltip da roda aberto por toque: some ao rolar a página
  addEventListener('scroll', () => { const t = $('#tip'); if (t) t.hidden = true; }, { passive: true });
  document.querySelectorAll('.copy').forEach((b) => b.addEventListener('click', () => copy($(`#${b.dataset.copy}`).textContent, b)));

  const paa = readPaaHash();
  if (paa) {
    // Voltou do Google com o PAA: refaz a busca para mostrar tudo junto.
    $('#q').value = paa.keyword;
    setSelect('hl', paa.hl);
    setSelect('gl', paa.gl);
    search(paa.keyword, $('#hl').value, $('#gl').value, paa.tree);
  } else if (window.__WHEEL_DATA__) {
    const data = window.__WHEEL_DATA__;
    if (!isGenerated(data)) data.src = dataSrc(data);
    $('#q').value = data.keyword;
    setSelect('hl', data.hl);
    setSelect('gl', data.gl);
    startResults(data.keyword, data.hl, data.gl);
    $('#share').hidden = true;
    $('#paa').hidden = true;
    addPanel(data);
    if (SKILL_SOURCES[data.src]) {
      setStatus('st.skill', 1, { src: srcLabel(data.src) });
    }
  } else if (params.get('q')) {
    $('#q').value = params.get('q');
    search(params.get('q'), $('#hl').value, $('#gl').value);
  }
}

init();
