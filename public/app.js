// AskWheel: coleta sugestões de autocomplete (Google, YouTube, Shopping, Bing; JSONP, direto do navegador) e mostra como roda + tabela.
// Também renderiza dados pré-carregados (window.__WHEEL_DATA__), usado pelo HTML gerado pela skill.

const ENDPOINT = 'https://suggestqueries.google.com/complete/search';
// Fontes: url(q, hl, gl, cb) monta o JSONP; parse(data) devolve a lista; open é o prefixo p/ abrir a sugestão.
const goog = (ds) => (q, hl, gl, cb) => `${ENDPOINT}?client=chrome&ie=utf-8&oe=utf-8&hl=${hl}&gl=${gl}${ds}&q=${encodeURIComponent(q)}&callback=${cb}`;
const first = (d) => d?.[1];
const SOURCES = {
  google: { label: 'Google', url: goog(''), parse: first, open: 'https://www.google.com/search?q=' },
  youtube: { label: 'YouTube', url: goog('&ds=yt'), parse: first, open: 'https://www.youtube.com/results?search_query=' },
  shopping: { label: 'Google Shopping', url: goog('&ds=sh'), parse: first, open: 'https://www.google.com/search?tbm=shop&q=' },
  bing: {
    label: 'Bing',
    url: (q, hl, gl, cb) => `https://api.bing.com/qsonhs.aspx?type=cb&cb=${cb}&mkt=${hl}-${gl.toUpperCase()}&q=${encodeURIComponent(q)}`,
    // Type 'SC' = correção ortográfica, ruído
    parse: (d) => (d?.AS?.Results || []).flatMap((r) => r.Suggests || []).filter((x) => x.Type !== 'SC').map((x) => x.Txt),
    open: 'https://www.bing.com/search?q=',
  },
};
// Só na skill (CORS bloqueia no navegador): o seletor "Fonte" não lista estas. open pode ser função(data).
const SKILL_SOURCES = {
  amazon: { label: 'Amazon', prep: 'na', open: (d) => `https://www.${d.marketplace || 'amazon.it'}/s?k=` },
  tiktok: { label: 'TikTok', open: 'https://www.tiktok.com/search?q=' },
  trends: { label: 'Google Trends', open: 'https://trends.google.com/trends/explore?q=' },
};
const GROUPS = ['questions', 'prepositions', 'comparisons', 'alphabeticals', 'numbers', 'related'];
const LABELS = {
  questions: 'Perguntas', prepositions: 'Preposições', comparisons: 'Comparações',
  alphabeticals: 'Alfabética', numbers: 'Números', related: 'Relacionadas', extras: 'Extras (Claude)',
};
const WHEEL_LEAVES = 6;
const PALETTE = ['#2f5fd0', '#0f9d8a', '#d9822b', '#c2417a', '#7a52c7', '#3d8f3d', '#c74b3b', '#1f8fbf', '#a6782c', '#5a6b7d'];

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const hasToken = (text, tok) => ` ${norm(text)} `.includes(` ${norm(tok)} `);
const hasKeyword = (text, kw) => norm(kw).split(' ').every((t) => norm(text).includes(t));

let state = { data: null, group: 'questions', view: 'wheel' };

// ---------- coleta ----------

function jsonp(src, q, hl, gl, timeout = 8000) {
  return new Promise((resolve) => {
    const cb = '__aw' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    const done = (list) => { clearTimeout(t); delete window[cb]; s.remove(); resolve(list); };
    const t = setTimeout(() => done(null), timeout);
    window[cb] = (data) => { const l = SOURCES[src].parse(data); done(Array.isArray(l) ? l : []); };
    s.onerror = () => done(null);
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
// (e o modificador, quando é palavra); o resto vai para "related".
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
      if (fits) {
        if (!m.items.some((x) => norm(x) === key)) m.items.push(s);
        assigned.add(key);
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

async function collect(kw, hl, gl, src, onProgress) {
  const all = window.__WHEEL_MODIFIERS__ || (await fetch('modifiers.json').then((r) => r.json()));
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

function drawWheel(el, kw, group) {
  el.replaceChildren();
  const mods = group.modifiers.filter((m) => m.items.length);
  if (!mods.length) { el.innerHTML = '<p class="empty">Nenhuma sugestão neste grupo.</p>'; return; }
  // Como no ATP: a roda mostra só as primeiras sugestões de cada modificador; a tabela mostra todas.
  const tree = { name: kw, children: mods.map((m) => ({ name: m.name ?? kw, children: m.items.slice(0, WHEEL_LEAVES).map((t) => ({ name: t, value: 1 })) })) };

  const size = 760, r = size / 6;
  const color = d3.scaleOrdinal(mods.map((m) => m.name), PALETTE.concat(PALETTE, PALETTE));
  const root = d3.partition().size([2 * Math.PI, 3])(d3.hierarchy(tree).sum((d) => d.value || 0));
  root.each((d) => (d.current = d));

  const arc = d3.arc()
    .startAngle((d) => d.x0).endAngle((d) => d.x1)
    .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.004)).padRadius(r * 1.5)
    .innerRadius((d) => d.y0 * r).outerRadius((d) => Math.max(d.y0 * r, d.y1 * r - 1));
  const arcVisible = (d) => d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
  const labelVisible = (d) => d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
  const labelTransform = (d) => {
    const x = (((d.x0 + d.x1) / 2) * 180) / Math.PI, y = ((d.y0 + d.y1) / 2) * r;
    return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
  };
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  const svg = d3.create('svg').attr('viewBox', [-size / 2, -size / 2, size, size]);
  const g = svg.append('g');
  const path = g.append('g').selectAll('path').data(root.descendants().slice(1)).join('path')
    .attr('fill', (d) => color(d.depth === 1 ? d.data.name : d.parent.data.name))
    .attr('fill-opacity', (d) => (arcVisible(d.current) ? (d.children ? 0.9 : 0.45) : 0))
    .attr('pointer-events', (d) => (arcVisible(d.current) ? 'auto' : 'none'))
    .attr('stroke', 'var(--bg)')
    .attr('d', (d) => arc(d.current))
    .style('cursor', 'pointer')
    .on('click', (e, d) => (d.children ? zoom(d) : window.open(openUrl(d.data.name), '_blank', 'noopener')));
  path.append('title').text((d) => (d.children ? `${d.data.name}: ${d.children.length} sugestões` : d.data.name));

  const label = g.append('g').attr('text-anchor', 'middle').selectAll('text')
    .data(root.descendants().slice(1)).join('text').attr('dy', '0.35em')
    .attr('fill-opacity', (d) => +labelVisible(d.current))
    .attr('transform', (d) => labelTransform(d.current))
    .style('font-weight', (d) => (d.children ? 700 : 400))
    .text((d) => short(d.data.name, d.children ? 14 : 22));

  const center = g.append('circle').attr('r', r).attr('class', 'center').on('click', () => zoom(focus.parent || root));
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
    const t = svg.transition().duration(600);
    path.transition(t)
      .tween('data', (d) => { const i = d3.interpolate(d.current, d.target); return (k) => (d.current = i(k)); })
      .filter(function (d) { return +this.getAttribute('fill-opacity') || arcVisible(d.target); })
      .attr('fill-opacity', (d) => (arcVisible(d.target) ? (d.children ? 0.9 : 0.45) : 0))
      .attr('pointer-events', (d) => (arcVisible(d.target) ? 'auto' : 'none'))
      .attrTween('d', (d) => () => arc(d.current));
    label.filter(function (d) { return +this.getAttribute('fill-opacity') || labelVisible(d.target); })
      .transition(t)
      .attr('fill-opacity', (d) => +labelVisible(d.target))
      .attrTween('transform', (d) => () => labelTransform(d.current));
  }

  el.append(svg.node());
  const hint = document.createElement('p');
  hint.className = 'hint muted';
  hint.textContent = `A roda mostra até ${WHEEL_LEAVES} sugestões por modificador (todas na Tabela). Clique num modificador para dar zoom, no centro para voltar, numa sugestão para abrir ${srcMeta(state.data.src).prep || 'no'} ${srcLabel(state.data.src)}.`;
  el.append(hint);
  center.raise();
  centerLabel.raise();
}

// ---------- tabela / extras ----------

const srcOf = (src) => (SOURCES[src] ? src : 'google');
const srcMeta = (src) => SOURCES[src] || SKILL_SOURCES[src] || SOURCES.google;
const srcLabel = (src) => srcMeta(src).label;
// dados da skill sem fonte real (sugestões geradas pelo Claude): sem src, links caem numa busca no Google
const isGenerated = (data) => data.source === 'claude-generated';
const dataLabel = (data) => (isGenerated(data) ? 'Gerado pelo Claude' : srcLabel(data.src));
const dataSrc = (data) => (isGenerated(data) ? 'claude-generated' : SKILL_SOURCES[data.src] ? data.src : srcOf(data.src));
const openUrl = (q) => {
  const open = srcMeta(state.data.src).open;
  return (typeof open === 'function' ? open(state.data) : open) + encodeURIComponent(q);
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function drawTable(el, group) {
  const mods = group.modifiers.filter((m) => m.items.length);
  el.innerHTML = mods.length
    ? mods.map((m) => `<div class="block"><h3>${esc(m.name ?? 'relacionadas')} <small>${m.items.length}</small></h3><ol>${
        m.items.map((t) => `<li><a href="${openUrl(t)}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join('')
      }</ol></div>`).join('')
    : '<p class="empty">Nenhuma sugestão neste grupo.</p>';
}

function drawExtras(el, extras) {
  el.innerHTML = (extras.sections || []).map((s) => `<div class="block"><h3>${esc(s.title)}</h3>${
    s.intro ? `<p class="note">${esc(s.intro)}</p>` : ''
  }<ol>${(s.items || []).map((it) => `<li>${esc(it.text)}${
    it.note ? ` <span class="note">— ${esc(it.note)}</span>` : ''
  }${it.keywords?.length ? `<div class="note">${it.keywords.map(esc).join(' · ')}</div>` : ''}</li>`).join('')}</ol></div>`).join('');
}

function render() {
  const { data } = state;
  const total = GROUPS.reduce((n, k) => n + (data.groups[k]?.count || 0), 0);
  $('#res-title').textContent = `${total} sugestões para “${data.keyword}” · ${dataLabel(data)}`;
  const keys = GROUPS.filter((k) => data.groups[k]).concat(data.extras ? ['extras'] : []);
  $('#groups').innerHTML = keys.map((k) => `<button data-group="${k}" aria-pressed="${k === state.group}">${
    k === 'extras' ? '' : `<b>${data.groups[k].count}</b>`}${LABELS[k]}</button>`).join('');

  const isExtras = state.group === 'extras';
  $('#extras').hidden = !isExtras;
  $('#wheel').hidden = isExtras || state.view !== 'wheel';
  $('#table').hidden = isExtras || state.view !== 'table';
  document.querySelector('.seg').hidden = isExtras;
  if (isExtras) return drawExtras($('#extras'), data.extras);
  const group = data.groups[state.group];
  if (state.view === 'wheel') drawWheel($('#wheel'), data.keyword, group);
  else drawTable($('#table'), group);
}

function show(data) {
  state.data = data;
  state.group = GROUPS.find((k) => data.groups[k]?.count) || 'questions';
  $('#results').hidden = false;
  $('#share').hidden = !!SKILL_SOURCES[data.src];
  render();
}

// ---------- UI ----------

function setStatus(text, frac) {
  $('#status').hidden = false;
  $('#status span').textContent = text;
  $('#status i').style.width = `${Math.round((frac ?? 0) * 100)}%`;
}

async function search(kw, hl, gl, src) {
  const label = srcLabel(src);
  $('#go').disabled = true;
  setStatus(`Consultando o ${label}…`, 0);
  try {
    const { data, failed, total } = await collect(kw, hl, gl, src, (d, n) => setStatus(`Consultando o ${label}… ${d}/${n}`, d / n));
    if (failed === total) return setStatus(`O ${label} não respondeu. Um bloqueador de anúncios ou a rede pode estar impedindo as consultas.`, 0);
    setStatus(failed ? `Pronto. ${failed} de ${total} consultas falharam.` : 'Pronto.', 1);
    show(data);
    history.replaceState(null, '', `?${new URLSearchParams({ q: kw, hl, gl, src })}`);
  } finally {
    $('#go').disabled = false;
  }
}

function toCsv(data) {
  const rows = [['grupo', 'modificador', 'sugestao', 'fonte']];
  for (const k of GROUPS) for (const m of data.groups[k]?.modifiers || []) for (const t of m.items) rows.push([k, m.name ?? '', t, dataSrc(data)]);
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch { return; }
  const old = btn.textContent;
  btn.textContent = 'Copiado';
  setTimeout(() => (btn.textContent = old), 1200);
}

function selectTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((s) => (s.hidden = s.id !== `tab-${name}`));
}

function installCommand() {
  const origin = /^https?:/.test(location.protocol) ? location.origin + location.pathname.replace(/[^/]*$/, '') : 'https://SEU-SITE.pages.dev/';
  return `d=~/.claude/skills/askwheel; mkdir -p "$d/site" && for f in SKILL.md collect.py render.py; do curl -fsSL ${origin}skill/$f -o "$d/$f"; done && for f in index.html app.js style.css modifiers.json; do curl -fsSL ${origin}$f -o "$d/site/$f"; done && echo "AskWheel skill instalada em $d"`;
}

function defaults() {
  const [lang, region] = (navigator.language || 'it-IT').toLowerCase().split('-');
  const hl = ['pt', 'it', 'en', 'es'].includes(lang) ? lang : 'en';
  const fallback = { pt: 'br', it: 'it', en: 'us', es: 'es' }[hl];
  const gl = [...$('#gl').options].some((o) => o.value === region) ? region : fallback;
  return { hl, gl };
}

function init() {
  const params = new URLSearchParams(location.search);
  const d = defaults();
  $('#hl').value = params.get('hl') || d.hl;
  $('#gl').value = params.get('gl') || d.gl;
  $('#src').value = srcOf(params.get('src'));
  $('#install-cmd').textContent = installCommand();

  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
  $('#form').addEventListener('submit', (e) => {
    e.preventDefault();
    const kw = $('#q').value.trim();
    if (kw) search(kw, $('#hl').value, $('#gl').value, $('#src').value);
  });
  $('#groups').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { state.group = b.dataset.group; render(); }
  });
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    document.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    render();
  }));
  $('#csv').addEventListener('click', () => download(`askwheel-${dataSrc(state.data)}-${state.data.keyword}.csv`, toCsv(state.data), 'text/csv'));
  $('#share').addEventListener('click', (e) => {
    const { keyword: q, hl, gl, src } = state.data;
    copy(`${location.origin}${location.pathname}?${new URLSearchParams({ q, hl, gl, src: srcOf(src) })}`, e.target);
  });
  document.querySelectorAll('.copy').forEach((b) => b.addEventListener('click', () => copy($(`#${b.dataset.copy}`).textContent, b)));

  if (window.__WHEEL_DATA__) {
    const data = window.__WHEEL_DATA__;
    if (!isGenerated(data)) {
      data.src = dataSrc(data);
      if (SOURCES[data.src]) $('#src').value = data.src;
    }
    $('#q').value = data.keyword;
    $('#hl').value = data.hl;
    $('#gl').value = data.gl;
    show(data);
    if (SKILL_SOURCES[data.src]) {
      const de = srcMeta(data.src).prep === 'na' ? 'da' : 'do';
      setStatus(`Dados ${de} ${srcLabel(data.src)} coletados pela skill. Buscar aqui consulta ao vivo a fonte escolhida.`, 1);
    }
  } else if (params.get('q')) {
    $('#q').value = params.get('q');
    search(params.get('q'), $('#hl').value, $('#gl').value, $('#src').value);
  }
}

init();
