// AskWheel: uma busca consulta o autocomplete do Google e do Google Shopping (JSONP, direto do navegador) e junta tudo
// por assunto, com o People Also Ask (coletado no Google pela extensão AskWheel PAA, em extension/, ou pelo bookmarklet paa.js).
// Visões: por assunto, roda, perguntas do Google, tabela. Também renderiza dados pré-carregados (window.__WHEEL_DATA__) da skill.

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
// Assuntos da tela: os grupos de assemble, com a-z e números juntos, mais as perguntas do Google (PAA).
const BANDS = ['questions', 'prepositions', 'comparisons', 'az', 'related', 'paa'];
const bandOf = (k) => (k === 'alphabeticals' || k === 'numbers' ? 'az' : k);
// Termos mostrados por modificador antes do "mostrar mais".
const CUT = 3;
// a–z e números são o grosso do ruído: 1 termo por letra/número.
const CAP = { az: 1 };
// Modo foco: tira variações de ordem ("bici elettrica bosch" = "bosch bici elettrica") e extensões
// ("… bambino" cobre "… bambino 10 anni"). Fica o primeiro (melhor posição no Google); o resto sai em "mostrar mais" e na tabela.
function lean(list, b) {
  const kw = norm(state.keyword), k0 = kw.split(' ')[0];
  // Fora do modo foco: letra solta no fim ("arancino x"), variante da própria keyword ("arancino arancina"),
  // e, em "relacionadas", o que nem contém a keyword. Se sobrar nada, vale a lista inteira.
  const junk = (it) => {
    const w = norm(it.t).split(' '), rest = w.filter((x) => !kw.split(' ').includes(x));
    return (b === 'az' && w.length > 1 && /^[a-z]$/.test(w.at(-1))) || (k0 === kw && k0.length >= 5 && rest.length === 1 && w.length > 1 && rest[0] !== k0 && Math.abs(rest[0].length - k0.length) <= 1 && rest[0].slice(0, 5) === k0.slice(0, 5))
      || (b === 'related' && !hasKeyword(it.t, state.keyword));
  };
  const pool = list.filter((it) => !junk(it)), src = pool.length ? pool : list;
  const ns = src.map((it) => norm(it.t)), seen = new Set();
  return src.filter((it, i) => {
    const key = ns[i].split(' ').sort().join(' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return !ns.some((n, j) => j !== i && n !== ns[i] && ns[i].startsWith(`${n} `));
  });
}
// ---------- idioma da interface (textos em i18n.js) ----------
const UI_LANGS = ['pt', 'en', 'it'];
let uiLang = 'pt';
// t('chave', { var }): troca {var}; chave sem tradução cai no pt.
const t = (k, v = {}) => (I18N[uiLang][k] ?? I18N.pt[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');

function applyI18n() {
  document.documentElement.lang = uiLang;
  document.querySelectorAll('[data-i18n]').forEach((el) => (el.innerHTML = t(el.dataset.i18n)));
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
  document.querySelectorAll('[data-i18n-label]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nLabel)));
  document.querySelectorAll('[data-i18n-content]').forEach((el) => el.setAttribute('content', t(el.dataset.i18nContent)));
}

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const hasToken = (text, tok) => ` ${norm(text)} `.includes(` ${norm(tok)} `);
const hasKeyword = (text, kw) => norm(kw).split(' ').every((t) => norm(text).includes(t));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// runs: uma entrada por fonte consultada ({ d, n } = andamento, data = resultado, fail = não respondeu).
// paa: árvore do People Also Ask. paaWait: id do pedido em curso à extensão; paaProg: andamento dele; paaError: motivo da última falha.
let state = { keyword: '', hl: '', gl: '', runs: {}, when: null, paa: null, paaWait: null, paaProg: null, paaError: null, status: null };
// Estado da tela: visão, modificadores abertos, fatia escolhida na roda, filtros e ordem da tabela.
const ui = { tbl: false, open: new Set(), zoom: null, q: '', fb: '', sort: { k: 'id', d: 1 }, all: false };
// Cesta: termos guardados, continua de uma busca para a outra.
const basket = new Set();
try { JSON.parse(localStorage.getItem('askwheel-basket') || '[]').forEach((x) => typeof x === 'string' && basket.add(x)); } catch {}

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

// ---------- fontes ----------

const srcMeta = (src) => SOURCES[src] || SKILL_SOURCES[src] || SOURCES.google;
const srcLabel = (src) => srcMeta(src).label;
// dados da skill sem fonte real (sugestões geradas pelo Claude)
const isGenerated = (data) => data.source === 'claude-generated';
const dataSrc = (data) => (isGenerated(data) ? 'claude-generated' : SOURCES[data.src] || SKILL_SOURCES[data.src] ? data.src : 'google');
const labelOf = (s) => (s === 'paa' ? t('v.qa') : s === 'claude-generated' ? t('generated') : srcLabel(s));
const optText = (id, v) => [...$(`#${id}`).options].find((o) => o.value === v)?.text ?? v;

// ---------- termos: as fontes juntas, cada termo uma vez, com as fontes em que apareceu ----------

// item: { id, t, b (assunto), m (modificador), srcs, pos (ordem no Google), parent/root/depth (só PAA) }
let items = [];
function buildItems() {
  const out = [], seen = new Map();
  for (const [s, run] of Object.entries(state.runs)) {
    if (!run.data) continue;
    for (const k of GROUPS) for (const m of run.data.groups[k]?.modifiers || []) m.items.forEach((x, i) => {
      const hit = seen.get(norm(x));
      if (hit) { if (!hit.srcs.includes(s)) hit.srcs.push(s); return; }
      const it = { id: out.length, t: x, b: bandOf(k), m: m.name ?? '', srcs: [s], pos: i + 1 };
      seen.set(norm(x), it);
      out.push(it);
    });
  }
  if (state.paa) (function walk(n, parent, root, depth) {
    n.children.forEach((c, i) => {
      const it = { id: out.length, t: c.name, b: 'paa', m: '', srcs: ['paa'], pos: i + 1, parent, root: root ?? out.length, depth };
      out.push(it);
      walk(c, it.id, it.root, depth + 1);
    });
  })(state.paa, null, null, 0);
  items = out;
}
const live = () => Object.values(state.runs).filter((r) => r.data).length;
// Etiqueta de fonte só quando a busca juntou mais de uma e o termo não veio do Google.
const tagOf = (it) => (it.b !== 'paa' && live() > 1 && !it.srcs.includes('google') ? (it.srcs[0] === 'shopping' ? 'Shopping' : labelOf(it.srcs[0])) : '');
const modText = (it) => (it.b === 'paa' ? t(it.parent === null ? 'mod.paaRoot' : 'mod.paaKid') : it.m);
const srcText = (it) => it.srcs.map(labelOf).join(', ');
// mods de um assunto, na ordem em que apareceram: [[nome, [itens]]]
function modsOf(b) {
  const map = new Map();
  for (const it of items) if (it.b === b) {
    const k = b === 'paa' ? it.root : it.m;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  }
  const mods = [...map.values()].map((list) => [list[0].b === 'paa' ? list[0].t : list[0].m, list]);
  // Modificadores com mais sugestões primeiro (mais demanda no Google); o resto mantém a ordem.
  return b === 'paa' ? mods : mods.sort((x, y) => y[1].length - x[1].length);
}

// A palavra buscada fica apagada; o que as pessoas acrescentam fica forte.
function term(it) {
  const kw = state.keyword.toLowerCase(), i = it.b === 'paa' || !kw ? -1 : it.t.toLowerCase().indexOf(kw);
  const body = i < 0 ? esc(it.t)
    : [it.t.slice(0, i), it.t.slice(i, i + kw.length), it.t.slice(i + kw.length)].map((x, j) => (!x ? '' : j === 1 ? `<i>${esc(x)}</i>` : `<strong>${esc(x)}</strong>`)).join('');
  const tag = tagOf(it);
  return `<button type="button" class="t" data-t="${esc(it.t)}" aria-pressed="${basket.has(it.t)}"><span>${body}</span>${tag ? `<small>${esc(tag)}</small>` : ''}</button>`;
}
const pending = () => Object.values(state.runs).some((r) => !r.data && !r.fail);
const emptyMsg = () => `<p class="empty">${t(pending() ? 'empty.wait' : 'empty.none')}</p>`;

// ---------- visões ----------

function viewGroups() {
  const html = BANDS.map((b) => {
    const mods = modsOf(b);
    if (!mods.length) return '';
    const n = mods.reduce((s, [, l]) => s + l.length, 0);
    const body = mods.map(([name, list]) => {
      if (b === 'paa') return `<div class="mod">${term(list[0])}${list.length > 1 ? `<div class="kids">${list.slice(1).map(term).join('')}</div>` : ''}</div>`;
      const key = `${b}|${name}`, cut = ui.all || ui.open.has(key) ? list : lean(list, b).slice(0, CAP[b] ?? CUT), rest = list.length - cut.length;
      return `<div class="mod">${name ? `<h4>${esc(name)}</h4>` : ''}${cut.map(term).join('')}${rest ? `<button type="button" class="more" data-more="${key}">${t('more', { n: rest })}</button>` : ''}</div>`;
    }).join('');
    return `<section class="group hue h-${b}"><header><h3>${t(`g.${b}`)}<span>${n}</span></h3><p>${t(`d.${b}`)}</p></header><div class="mods">${body}</div></section>`;
  }).join('');
  return html || emptyMsg();
}

// Roda: anel de dentro = assuntos, de fora = modificadores (tamanho = nº de termos).
const pt = (r, a) => `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
function arcPath(r0, r1, a0, a1) {
  if (a1 - a0 > 2 * Math.PI - 1e-4) a1 = a0 + 2 * Math.PI - 1e-4; // círculo inteiro: o arco SVG precisa de pontas diferentes
  const big = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(r0, a0)}A${r0} ${r0} 0 ${big} 1 ${pt(r0, a1)}L${pt(r1, a1)}A${r1} ${r1} 0 ${big} 0 ${pt(r1, a0)}Z`;
}
const WHEEL_LEAVES = 12, WHEEL_ZOOM = 36;
// Sugestões de um assunto, uma de cada modificador em rodízio (a–z não engole o resto).
function topOf(b, n) {
  const lists = modsOf(b).map(([, l]) => (b === 'paa' ? l : lean(l, b))), out = [];
  for (let i = 0; out.length < n && lists.some((l) => l[i]); i++) for (const l of lists) if (l[i] && out.length < n) out.push(l[i]);
  return out;
}
// Roda: anel de dentro = assuntos, de fora = as sugestões inteiras. Clique num assunto = zoom; no centro = volta.
function viewWheel() {
  if (!items.length) return emptyMsg();
  const bands = BANDS.filter((b) => items.some((i) => i.b === b));
  const zb = bands.includes(ui.zoom) ? ui.zoom : null;
  const shown = (zb ? [zb] : bands).map((b) => ({ b, leaves: topOf(b, zb ? WHEEL_ZOOM : WHEEL_LEAVES) }));
  const nLeaves = shown.reduce((n, x) => n + x.leaves.length, 0);
  const R0 = 70, R1 = 150, R2 = 158, R3 = 304;
  let a = 0, svg = '';
  const lab = (a0, a1, r, cls, txt) => {
    const deg = ((a0 + a1) / 2) * 180 / Math.PI, flip = deg > 180;
    return `<text class="${cls}" transform="rotate(${(deg - 90).toFixed(2)}) translate(${r} 0)${flip ? ' rotate(180)' : ''}" text-anchor="middle" dy=".35em">${esc(txt)}</text>`;
  };
  for (const { b, leaves } of shown) {
    const a0 = a, a1 = a + (leaves.length / nLeaves) * 2 * Math.PI, n = items.filter((i) => i.b === b).length;
    let out = '';
    leaves.forEach((it, i) => {
      const l0 = a0 + (i / leaves.length) * (a1 - a0), l1 = a0 + ((i + 1) / leaves.length) * (a1 - a0);
      out += `<path class="lf" data-t="${esc(it.t)}" aria-pressed="${basket.has(it.t)}" d="${arcPath(R2, R3, l0, l1)}"><title>${esc(it.t)}</title></path>${lab(l0, l1, (R2 + R3) / 2, 'ol', it.t)}`;
    });
    const big = !zb && a1 - a0 > 0.3;
    svg += `<g class="hue h-${b}"><path class="bd" data-zoom="${zb ? '' : b}" d="${arcPath(R0, R1, a0, a1)}"><title>${esc(t(`g.${b}`))}: ${n}</title></path>${big ? lab(a0, a1, (R0 + R1) / 2, 'bl', t(`g.${b}`)) : ''}${out}</g>`;
    a = a1;
  }
  const name = zb ? t(`g.${zb}`) : state.keyword, words = name.split(' '), half = Math.ceil(words.length / 2);
  const lines = words.length > 1 ? [words.slice(0, half).join(' '), words.slice(half).join(' ')] : [name];
  const sub = zb ? `← ${state.keyword}` : t('wheel.total', { n: items.length });
  svg += `<circle class="hub" r="${R0 - 6}" data-zoom=""/>` + lines.map((l, i) => `<text class="kw" y="${(i - (lines.length - 1) / 2) * 20 - 6}" dy=".35em">${esc(l)}</text>`).join('')
    + `<text class="kn" y="${lines.length * 10 + 10}">${esc(sub)}</text>`;
  return `<div class="wheelwrap"><div><svg class="wheel" viewBox="-310 -310 620 620" role="img" aria-label="${esc(t('wheel.aria', { kw: state.keyword }))}">${svg}</svg>
    <p class="hint muted">${esc(t('wheel.hint'))}</p>
    <div class="wheel-exp"><button type="button" class="btn" data-exp="svg">SVG</button><button type="button" class="btn" data-exp="png">PNG</button></div></div></div>`;
}
// Rótulos da roda: cortados pela largura medida (não por nº de letras), para não vazar da fatia nem da roda.
function fitText(node, max) {
  const s = node.textContent;
  if (!node.getComputedTextLength() || node.getComputedTextLength() <= max) return;
  for (let n = s.length; n > 1 && node.getComputedTextLength() > max; n--) node.textContent = s.slice(0, n - 1).trimEnd() + '…';
}
function fitWheel() {
  document.querySelectorAll('.wheel text.ol').forEach((n) => fitText(n, 136));
  document.querySelectorAll('.wheel text.bl').forEach((n) => fitText(n, 72));
  document.querySelectorAll('.wheel text.kw').forEach((n) => fitText(n, 110));
}

function viewQa() {
  const roots = items.filter((i) => i.b === 'paa' && i.parent === null);
  if (!roots.length) {
    const e = PAA_ERRORS.includes(state.paaError) ? state.paaError : null;
    const msg = state.paaWait && !e ? t('qa.wait')
      : e ? esc(t(`paa.e.${e}`))
      : hasExt() ? t('qa.none')
      : `<span class="paa-ins">${t('paa.install')} <a href="#" data-goto="ext">${t('paa.installBtn')}</a></span><span class="paa-touch">${t('qa.touch')}</span>`;
    return `<p class="empty">${msg}</p>`;
  }
  const kids = (id) => items.filter((i) => i.parent === id);
  const tree = (it) => { const k = kids(it.id); return k.length ? `<ul>${k.map((c) => `<li>${term(c)}${tree(c)}</li>`).join('')}</ul>` : ''; };
  return `<ol class="qa hue h-paa">${roots.map((r) => `<li>${term(r)}${tree(r)}</li>`).join('')}</ol>`;
}

const COLS = [['t', 'th.term'], ['b', 'th.band'], ['m', 'th.mod'], ['s', 'th.src'], ['pos', 'th.pos']];
function rows() {
  const { k, d } = ui.sort, q = norm(ui.q);
  const val = (i) => (k === 'b' ? t(`g.${i.b}`) : k === 'm' ? modText(i) : k === 's' ? srcText(i) : i[k]);
  return items.filter((i) => (!q || norm(i.t).includes(q)) && (!ui.fb || i.b === ui.fb))
    .sort((x, y) => { const a = val(x), b = val(y); return (typeof a === 'number' ? a - b : String(a).localeCompare(String(b), uiLang)) * d; });
}
function tbody() {
  return rows().map((i) => `<tr class="hue h-${i.b}"><td>${term(i)}</td><td><span class="dot"></span>${t(`g.${i.b}`)}</td><td>${esc(modText(i))}</td><td>${esc(srcText(i))}</td><td class="n">${i.pos}</td></tr>`).join('')
    || `<tr><td colspan="5" class="none">${t('tbl.none')}</td></tr>`;
}
function viewTable() {
  if (!items.length) return emptyMsg();
  const head = COLS.map(([k, l]) => `<th><button type="button" data-k="${k}"${ui.sort.k === k ? ` data-d="${ui.sort.d}"` : ''}>${t(l)}</button></th>`).join('');
  const bands = BANDS.filter((b) => items.some((i) => i.b === b));
  return `<div class="tools"><input id="flt" type="search" placeholder="${esc(t('flt.ph'))}" aria-label="${esc(t('flt.ph'))}" value="${esc(ui.q)}">
    <select id="fb" aria-label="${esc(t('th.band'))}"><option value="">${t('fb.all')}</option>${bands.map((b) => `<option value="${b}"${ui.fb === b ? ' selected' : ''}>${t(`g.${b}`)}</option>`).join('')}</select></div>
    <div class="scroll"><table><thead><tr>${head}</tr></thead><tbody id="tb">${tbody()}</tbody></table></div>`;
}

function renderMeta() {
  if (!state.keyword) return;
  const count = (s) => items.filter((i) => i.srcs.includes(s)).length;
  const parts = Object.entries(state.runs).map(([s, r]) => {
    const cls = `src ${s === 'shopping' ? 's' : 'g'}`, L = esc(labelOf(s));
    if (r.data) return `<span class="${cls}">${L} <b>${count(s)}</b></span>`;
    if (r.fail) return `<span class="${cls} x">${t('meta.fail', { src: L })}</span>`;
    return `<span class="${cls} wait">${t('meta.reading', { src: L, d: r.d, n: r.n || '…' })}</span>`;
  });
  if (state.paa) parts.push(`<span class="src p">${esc(labelOf('paa'))} <b>${count('paa')}</b></span>`);
  else if (state.paaWait && !state.paaError) parts.push(`<span class="src p wait">${esc(state.paaProg ? t('paa.reading', { n: state.paaProg.found }) : t('paa.opening'))}</span>`);
  if (state.hl && state.gl) parts.push(`<span>${esc(t('meta.search', { hl: optText('hl', state.hl), gl: optText('gl', state.gl) }))}</span>`);
  if (state.when) parts.push(`<span>${esc(t('meta.when', { d: state.when.toLocaleString(uiLang, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }))}</span>`);
  $('#meta').innerHTML = parts.join('');
}

// Página única: roda (herói) → assuntos (mosaico) → PAA → tabela recolhível.
function renderStage() {
  const sec = (v, body) => `<section class="blk blk-${v}" id="s-${v}"><h2 class="blk-h">${t(`v.${v}`)}</h2>${body}</section>`;
  $('#stage').innerHTML = sec('wheel', viewWheel()) + sec('groups', `<div class="groups">${viewGroups()}</div>`) + sec('qa', viewQa())
    + `<details class="blk blk-table" id="s-table"${ui.tbl || ui.all ? ' open' : ''}><summary class="blk-h">${t('v.table')} <span>${items.length}</span></summary>${viewTable()}</details>`;
  fitWheel();
}

function render() {
  if (!state.keyword) return;
  buildItems();
  renderMeta();
  renderStage();
  renderBasket();
}

function renderPaa() {
  const e = PAA_ERRORS.includes(state.paaError) ? state.paaError : null;
  $('#paa-msg').textContent = e ? t(`paa.e.${e}`) : '';
  $('#paa-msg').hidden = !e;
  $('#paa-install').hidden = hasExt() || !!state.paa;
  $('#paa-line').hidden = $('#paa-msg').hidden && $('#paa-install').hidden;
  if (state.keyword) {
    $('#paa-open').href = `https://www.google.com/search?${new URLSearchParams({ q: state.keyword, hl: state.hl, gl: state.gl })}`;
    $('#paa-open').textContent = t('paa.openKw', { kw: state.keyword });
  }
  renderMeta();
  if (state.keyword) renderStage();
}

function drawExtras(el, extras) {
  el.innerHTML = `<h3>${t('g.extras')}</h3>` + (extras.sections || []).map((s) => `<div class="block"><h3>${esc(s.title)}</h3>${
    s.intro ? `<p class="note">${esc(s.intro)}</p>` : ''
  }<ol>${(s.items || []).map((it) => `<li>${esc(it.text)}${
    it.note ? ` <span class="muted">— ${esc(it.note)}</span>` : ''
  }${it.keywords?.length ? `<div class="muted">${it.keywords.map(esc).join(' · ')}</div>` : ''}</li>`).join('')}</ol></div>`).join('');
}

// ---------- cesta ----------

function renderBasket() {
  const list = [...basket];
  $('#b-list').innerHTML = list.map((x) => `<li><span>${esc(x)}</span><button type="button" data-rm="${esc(x)}" aria-label="${esc(t('b.rm', { t: x }))}">×</button></li>`).join('');
  $('#b-empty').hidden = list.length > 0;
  $('#cart-n').textContent = list.length;
  try { localStorage.setItem('askwheel-basket', JSON.stringify(list)); } catch {}
}
function toggleTerm(x) {
  const has = basket.has(x);
  has ? basket.delete(x) : basket.add(x);
  document.querySelectorAll('.t, .lf').forEach((b) => { if (b.dataset.t === x) b.setAttribute('aria-pressed', !has); });
  renderBasket();
}
const syncPressed = () => document.querySelectorAll('.t, .lf').forEach((b) => b.setAttribute('aria-pressed', basket.has(b.dataset.t)));
function drawer(open) {
  $('#basket').classList.toggle('open', open);
  $('#cart').setAttribute('aria-expanded', open);
  (open ? $('#b-close') : $('#cart')).focus();
}

function startResults(kw, hl, gl, srcs = SITE_SOURCES) {
  Object.assign(state, { keyword: kw, hl, gl, runs: Object.fromEntries(srcs.map((s) => [s, { d: 0, n: 0 }])), when: new Date(), status: null });
  Object.assign(ui, { open: new Set(), zoom: null, q: '', fb: '' });
  document.body.classList.remove('home');
  selectTab('search');
  $('#results').hidden = false;
  $('#cap-kw').textContent = kw;
  $('#status').hidden = true;
  $('#extras').hidden = true;
  $('#share').hidden = false;
  scrollTo(0, 0);
}

// ---------- UI ----------

// setStatus('chave', { vars }): só avisos (falha, parcial, skill); o andamento fica na linha das fontes.
function setStatus(key, vars) {
  state.status = key ? [key, vars] : null;
  $('#status').hidden = !key;
  if (key) $('#status').textContent = t(key, vars);
}

let tm;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(tm);
  tm = setTimeout(() => el.classList.remove('show'), 1800);
}
async function copyText(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast(t('toast.blocked')); }
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
// As visões se refazem a cada fonte que termina; o andamento de cada uma aparece na linha das fontes.
async function search(kw, hl, gl, paa = null) {
  $('#go').disabled = true;
  document.body.classList.add('busy');
  startResults(kw, hl, gl);
  Object.assign(state, { paa, paaWait: null, paaProg: null, paaError: null });
  if (!paa && hasExt()) requestPaa(kw, hl, gl);
  const mine = state.runs; // outra busca (ou o logo) troca state.runs: as respostas desta deixam de valer
  render();
  renderPaa();
  try {
    const runs = await Promise.all(SITE_SOURCES.map((src) => collect(kw, hl, gl, src, (d, n) => {
      Object.assign(mine[src], { d, n });
      if (state.runs === mine) renderMeta();
    }).then((r) => {
      if (r.failed === r.total) mine[src].fail = true;
      else mine[src].data = r.data;
      if (state.runs === mine) render();
      return r;
    })));
    if (state.runs !== mine) return;
    const failed = runs.reduce((s, r) => s + r.failed, 0), total = runs.reduce((s, r) => s + r.total, 0);
    if (failed === total) return setStatus('st.fail');
    setStatus(failed ? 'st.partial' : null, { f: failed, n: total });
    history.replaceState(null, '', `?${new URLSearchParams({ q: kw, hl, gl })}`);
  } catch {
    if (state.runs === mine) setStatus('st.error');
  } finally {
    $('#go').disabled = false;
    document.body.classList.remove('busy');
  }
}

// Célula que começa com = + - @ (ou tab/CR) vira fórmula no Excel/Sheets: prefixa ' para ficar texto.
const csvCell = (c) => `"${String(c).replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
const csvRows = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n');

function toCsv(list) {
  const when = state.when ? state.when.toISOString() : '';
  return csvRows([['csv.term', 'csv.band', 'csv.mod', 'csv.src', 'csv.pos', 'csv.hl', 'csv.gl', 'csv.when'].map((k) => t(k)),
    ...list.map((i) => [i.t, t(`g.${i.b}`), modText(i), srcText(i), i.pos, state.hl, state.gl, when])]);
}
const fileName = (s) => `askwheel-${s.trim().replace(/[\s/\\:*?"<>|]+/g, '-')}`;
// BOM: o Excel abre o CSV em UTF-8 (acentos certos)
const downloadCsv = (name, text) => download(`${name}.csv`, '﻿' + text, 'text/csv;charset=utf-8');

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Exporta um <svg> da tela como SVG ou PNG: copia o estilo calculado para dentro do clone (o CSS da página não vai junto).
const SVG_PROPS = ['fill', 'fill-opacity', 'opacity', 'stroke', 'stroke-width', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline'];
function exportSvg(svg, name, fmt, bg) {
  const clone = svg.cloneNode(true);
  const src = [svg, ...svg.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')];
  src.forEach((e, i) => {
    const cs = getComputedStyle(e);
    dst[i].setAttribute('style', SVG_PROPS.map((k) => `${k}:${cs.getPropertyValue(k)}`).join(';'));
    dst[i].removeAttribute('tabindex');
  });
  clone.querySelectorAll('title').forEach((e) => e.remove());
  const vb = svg.viewBox.baseVal;
  const w = vb && vb.width ? vb.width : Number(svg.getAttribute('width')), h = vb && vb.width ? vb.height : Number(svg.getAttribute('height'));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  const [x0, y0] = vb && vb.width ? [vb.x, vb.y] : [0, 0];
  for (const [k, v] of Object.entries({ x: x0, y: y0, width: w, height: h, fill: bg, style: '' })) rect.setAttribute(k, v);
  clone.insertBefore(rect, clone.firstChild);
  const xml = new XMLSerializer().serializeToString(clone);
  if (fmt === 'svg') return download(`${name}.svg`, xml, 'image/svg+xml');
  // PNG: 2x para ficar nítido; data: URL porque a CSP não libera blob: em img-src
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = w * 2; c.height = h * 2;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${name}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
}

function selectTab(name) {
  document.querySelectorAll('.nav [data-tab]').forEach((a) => (a.dataset.tab === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  document.querySelectorAll('.tab').forEach((s) => (s.hidden = s.id !== `tab-${name}`));
  // página inicial = aba de busca sem resultado: a pergunta grande no lugar da barra
  document.body.classList.toggle('home', name === 'search' && !state.keyword);
  document.body.classList.toggle('on-about', name === 'about');
}

function goHome() {
  Object.assign(state, { keyword: '', runs: {}, paa: null, paaWait: null, paaError: null, status: null });
  $('#results').hidden = true;
  document.body.classList.remove('busy');
  $('#go').disabled = false;
  history.replaceState(null, '', location.pathname);
  selectTab('search');
  scrollTo(0, 0);
  $('#q').focus();
}

// O pathname vem da URL e vai para o comando shell e para o bookmarklet: só passa se for um caminho simples.
const siteUrl = () => {
  if (!/^https?:/.test(location.protocol)) return 'https://SEU-SITE.pages.dev/';
  const dir = location.pathname.replace(/[^/]*$/, '');
  return location.origin + (/^[\w/.~-]*$/.test(dir) ? dir : '/');
};

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

// save: só quando o usuário escolhe (o idioma detectado do navegador não fica gravado).
function setLang(l, save = false) {
  uiLang = UI_LANGS.includes(l) ? l : 'en';
  if (save) try { localStorage.setItem('askwheel-lang', uiLang); } catch {}
  $('#ui-lang').value = uiLang;
  applyI18n();
  $('#bm-msg').textContent = '';
  if (state.status) setStatus(...state.status);
  if (state.keyword) { render(); renderPaa(); }
  else renderBasket();
  if (window.__WHEEL_DATA__?.extras && !$('#extras').hidden) drawExtras($('#extras'), window.__WHEEL_DATA__.extras);
}

const setSelect = (id, v) => { if ([...$(`#${id}`).options].some((o) => o.value === v)) $(`#${id}`).value = v; };

// Como funciona: os passos ficam fixos e mudam com a rolagem (só no computador, sem reduzir movimento)
function setupLanding() {
  const pin = $('#lp-steps'), steps = [...pin.querySelectorAll('.lp-steps > li')];
  const wide = matchMedia('(min-width: 1024px) and (prefers-reduced-motion: no-preference)');
  const on = (i) => steps.forEach((li, k) => li.classList.toggle('is-on', k === i));
  const tick = () => {
    if (!pin.classList.contains('live') || pin.offsetParent === null) return;
    const r = pin.getBoundingClientRect(), run = r.height - (innerHeight - $('#top').offsetHeight);
    const p = Math.min(.999, Math.max(0, ($('#top').offsetHeight - r.top) / run));
    on(Math.floor(p * steps.length));
  };
  const mode = () => { pin.classList.toggle('live', wide.matches); if (!wide.matches) on(-1); else tick(); };
  wide.addEventListener('change', mode);
  addEventListener('scroll', tick, { passive: true });
  mode();
  const svg = $('.lp-dg__svg'), btn = $('#lp-pause');
  btn.addEventListener('click', () => {
    const paused = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', paused);
    paused ? svg.pauseAnimations() : svg.unpauseAnimations();
  });
}

function init() {
  setLang(pickLang());
  $('#ui-lang').addEventListener('change', (e) => setLang(e.target.value, true));
  const params = new URLSearchParams(location.search);
  const d = defaults();
  $('#hl').value = d.hl;
  $('#gl').value = d.gl;
  setSelect('hl', params.get('hl'));
  setSelect('gl', params.get('gl'));
  setupBookmarklet();
  setupLanding();

  // altura da barra do topo: os cabeçalhos dos assuntos grudam logo abaixo dela
  new ResizeObserver(() => document.documentElement.style.setProperty('--toph', `${$('#top').offsetHeight}px`)).observe($('#top'));
  document.querySelectorAll('.nav [data-tab]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); selectTab(a.dataset.tab); scrollTo(0, 0); }));
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-goto]');
    if (a) { e.preventDefault(); selectTab(a.dataset.goto); scrollTo(0, 0); if (a.dataset.goto === 'search') $('#q').focus(); }
  });
  $('#brand').addEventListener('click', (e) => { e.preventDefault(); goHome(); });
  $('#form').addEventListener('submit', (e) => {
    e.preventDefault();
    const kw = $('#q').value.trim();
    if (!kw) return;
    search(kw, $('#hl').value, $('#gl').value);
  });

  $('#views').addEventListener('click', (e) => {
    const a = e.target.closest('[data-v]');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.v === 'table') { ui.tbl = true; $('#s-table').open = true; }
    $(`#s-${a.dataset.v}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#stage').addEventListener('toggle', (e) => { if (e.target.id === 's-table') ui.tbl = e.target.open; }, true);
  // marca na barra a seção visível
  const spy = new IntersectionObserver((es) => es.forEach((x) => {
    if (x.isIntersecting) document.querySelectorAll('#views a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.v === x.target.id.slice(2)));
  }), { rootMargin: '-40% 0px -55% 0px' });
  new MutationObserver(() => document.querySelectorAll('#stage .blk').forEach((s) => spy.observe(s))).observe($('#stage'), { childList: true });
  $('#stage').addEventListener('click', (e) => {
    const x = (s) => e.target.closest(s);
    const tb = x('.t, .lf'), zm = x('[data-zoom]'), more = x('[data-more]'), k = x('th button'), exp = x('[data-exp]');
    if (tb) toggleTerm(tb.dataset.t);
    else if (more) { ui.open.add(more.dataset.more); renderStage(); }
    else if (k) { ui.sort = { k: k.dataset.k, d: ui.sort.k === k.dataset.k ? -ui.sort.d : 1 }; renderStage(); }
    else if (exp) exportSvg($('.wheel'), `${fileName(state.keyword)}-roda`, exp.dataset.exp, getComputedStyle(document.body).backgroundColor);
    else if (zm) { ui.zoom = zm.dataset.zoom || null; renderStage(); }
  });
  $('#stage').addEventListener('input', (e) => {
    if (e.target.id === 'flt') ui.q = e.target.value;
    else if (e.target.id === 'fb') ui.fb = e.target.value;
    else return;
    $('#tb').innerHTML = tbody();
  });

  const shown = () => (ui.tbl && (ui.q || ui.fb) ? rows() : items);
  $('#copy-all').addEventListener('click', () => { const l = shown(); copyText(l.map((i) => i.t).join('\n'), t('toast.copied', { n: l.length })); });
  $('#csv').addEventListener('click', () => downloadCsv(fileName(state.keyword), toCsv(shown())));
  $('#share').addEventListener('click', () => {
    const { keyword: q, hl, gl } = state;
    copyText(`${location.origin}${location.pathname}?${new URLSearchParams({ q, hl, gl })}`, t('toast.link'));
  });
  $('#print').addEventListener('click', () => print());
  // impresso: todos os termos, sem "mostrar mais"
  addEventListener('beforeprint', () => { if (state.keyword) { ui.all = true; renderStage(); } });
  addEventListener('afterprint', () => { if (state.keyword) { ui.all = false; renderStage(); } });

  $('#cart').addEventListener('click', () => drawer(!$('#basket').classList.contains('open')));
  $('#b-close').addEventListener('click', () => drawer(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#basket').classList.contains('open')) drawer(false); });
  $('#b-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]');
    if (b) { basket.delete(b.dataset.rm); renderBasket(); syncPressed(); }
  });
  $('#b-copy').addEventListener('click', () => copyText([...basket].join('\n'), t('toast.copied', { n: basket.size })));
  $('#b-csv').addEventListener('click', () => downloadCsv('askwheel-cesta', csvRows([[t('csv.term')], ...[...basket].map((x) => [x])])));
  $('#b-clear').addEventListener('click', () => { basket.clear(); renderBasket(); syncPressed(); });
  // a fonte pode chegar depois da medida dos rótulos da roda
  document.fonts?.ready.then(() => { if (state.keyword) renderStage(); });

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
    const s = dataSrc(data);
    $('#q').value = data.keyword;
    setSelect('hl', data.hl);
    setSelect('gl', data.gl);
    startResults(data.keyword, data.hl, data.gl, [s]);
    state.runs[s].data = data;
    state.when = data.collected_at ? new Date(data.collected_at) : null;
    $('#share').hidden = true;
    if (data.extras) { $('#extras').hidden = false; drawExtras($('#extras'), data.extras); }
    render();
    renderPaa();
    if (SKILL_SOURCES[data.src]) setStatus('st.skill', { src: srcLabel(data.src) });
  } else if (params.get('q')) {
    $('#q').value = params.get('q');
    search(params.get('q'), $('#hl').value, $('#gl').value);
  }
}

init();
