// Pedido do site → abre a busca no Google numa aba em segundo plano → injeta readPaa → readPaa devolve as
// perguntas por mensagem → resposta vai para a aba do site e a do Google fecha. O job (aba do site + id) fica
// em chrome.storage.session, pela aba do Google, e os listeners ficam no topo: o background dorme (~30 s) e
// perderia listeners criados dentro de start (ex.: captcha demorado). Um job por vez: um pedido novo fecha a aba
// do anterior, a menos que ela já tenha sido mostrada ao usuário (captcha/cookies): aí só larga o job.
const jobOf = async (tabId) => (await chrome.storage.session.get(String(tabId)))[tabId];
const show = async (tabId) => {
  chrome.tabs.update(tabId, { active: true });
  const job = await jobOf(tabId);
  if (job) await chrome.storage.session.set({ [tabId]: { ...job, shown: true } });
};

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'paa' && sender.tab) start(msg, sender.tab.id);
  else if (msg?.type === 'paa-done' && sender.tab) finish(msg, sender.tab.id);
  else if (msg?.type === 'paa-progress' && sender.tab) jobOf(sender.tab.id).then((job) => job && send(job, { type: 'paa-progress', done: msg.done, total: msg.total, found: msg.found }));
});

// Injeta readPaa a cada carregamento da aba, não só no primeiro: o Google às vezes abre uma página de checagem
// que recarrega ou redireciona (captcha em /sorry, cookies em consent.google.com). Depois que o usuário resolve,
// a aba volta para /search e a coleta segue sozinha. O job vale até a aba fechar.
chrome.tabs.onUpdated.addListener(async (tabId, info, t) => {
  // tab.url só vem para hosts com permissão; o about:blank inicial também chega como "complete" no Firefox.
  if (info.status !== 'complete' || t.url === 'about:blank') return;
  const job = await jobOf(tabId);
  if (!job) return;
  chrome.scripting.executeScript({ target: { tabId }, func: readPaa }).catch(() => {
    // Fora de www.google.com (ex.: consent.google.com): mostra a aba para o usuário resolver.
    show(tabId);
    reply(job, { error: 'blocked' });
  });
});
chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(String(tabId)));

// Pedidos em fila: dois start intercalados criariam duas abas.
let pending = Promise.resolve();
const start = (msg, siteTab) => (pending = pending.then(() => run(msg, siteTab)).catch(() => {}));

async function run({ id, q, hl, gl }, siteTab) {
  const old = Object.entries(await chrome.storage.session.get(null));
  await chrome.storage.session.clear();
  const close = old.filter(([, j]) => !j.shown).map(([t]) => Number(t));
  if (close.length) chrome.tabs.remove(close).catch(() => {});
  // Aba em branco primeiro, job gravado, depois a navegação: o "complete" do Google não chega antes do job.
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
  await chrome.storage.session.set({ [tab.id]: { id, siteTab } });
  await chrome.tabs.update(tab.id, { url: `https://www.google.com/search?${new URLSearchParams({ q, hl, gl })}` });
}

async function finish({ error, data }, googleTab) {
  const job = await jobOf(googleTab);
  if (!job) return;
  // Captcha: deixa a aba aberta e visível para o usuário resolver; senão fecha.
  if (error === 'captcha') show(googleTab);
  else chrome.tabs.remove(googleTab);
  reply(job, { error, data });
}

const send = (job, msg) => chrome.tabs.sendMessage(job.siteTab, { ...msg, id: job.id }).catch(() => {});
const reply = (job, res) => send(job, { type: 'paa-result', ...res });

// Roda na página do Google (precisa ser autocontida). Mesma lógica do bookmarklet public/paa.js: cada clique
// numa pergunta revela novas no fim da lista, que viram filhas dela. Espera por MutationObserver, não por
// polling: abas em segundo plano têm timers limitados a ~1/s.
function readPaa() {
  if (window.askwheelRunning) return;
  window.askwheelRunning = true;
  const MAX_CLICKS = 20;
  const DEADLINE = Date.now() + 45000;
  const done = (res) => chrome.runtime.sendMessage({ type: 'paa-done', ...res });
  // total fixo (MAX_CLICKS) p/ a barra não voltar; ao terminar manda done = total (100%).
  const progress = (n, found, total = MAX_CLICKS) => chrome.runtime.sendMessage({ type: 'paa-progress', done: n, total, found });
  const url = new URL(location.href);
  if (url.pathname.startsWith('/sorry')) return done({ error: 'captcha' });
  const pairs = () => [...document.querySelectorAll('.related-question-pair[data-q]')];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const grow = (n, ms) => new Promise((ok) => {
    if (pairs().length > n) return ok();
    const obs = new MutationObserver(() => { if (pairs().length > n) { obs.disconnect(); ok(); } });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); ok(); }, ms);
  });

  (async () => {
    await grow(0, 5000);
    const roots = pairs().map((p) => p.dataset.q);
    if (!roots.length) return done({ error: 'empty' });
    const children = new Map(roots.map((q) => [q, []]));
    const queue = [...roots];
    let clicks = 0;
    progress(0, children.size);
    // Prazo total: aba em segundo plano pode ficar lenta; devolve o que já leu em vez de sumir.
    while (queue.length && clicks < MAX_CLICKS && Date.now() < DEADLINE) {
      const q = queue.shift();
      const btn = pairs().find((p) => p.dataset.q === q)?.querySelector('[role="button"][aria-expanded]');
      if (!btn || btn.getAttribute('aria-expanded') === 'true') continue;
      const before = pairs().length;
      btn.click();
      clicks++;
      await grow(before, 3000);
      for (const p of pairs()) {
        const nq = p.dataset.q;
        if (children.has(nq)) continue;
        children.set(nq, []);
        children.get(q).push(nq);
        queue.push(nq);
      }
      progress(clicks, children.size);
      await sleep(300);
    }
    progress(1, children.size, 1);
    const kw = url.searchParams.get('q');
    const node = (q) => ({ name: q, children: children.get(q).map(node) });
    done({ data: { keyword: kw, hl: url.searchParams.get('hl') || '', gl: url.searchParams.get('gl') || '', tree: { name: kw, children: roots.map(node) } } });
  })().catch(() => done({ error: 'empty' }));
}
