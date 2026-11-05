// Pedido do site → abre a busca no Google numa aba em segundo plano → injeta readPaa → readPaa devolve as
// perguntas por mensagem → resposta vai para a aba do site e a do Google fecha. Sem estado guardado aqui:
// o job (aba do site + id) viaja com o script injetado, então tanto faz se o background dormir no meio.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'paa' && sender.tab) start(msg, sender.tab.id);
  else if (msg?.type === 'paa-done' && sender.tab) finish(msg, sender.tab.id);
  else if (msg?.type === 'paa-progress') send(msg.job, { type: 'paa-progress', done: msg.done, total: msg.total, found: msg.found });
});

// Injeta readPaa a cada carregamento da aba, não só no primeiro: o Google às vezes abre uma página de checagem
// que recarrega ou redireciona (captcha em /sorry, cookies em consent.google.com). Depois que o usuário resolve,
// a aba volta para /search e a coleta segue sozinha. O listener vive até a aba fechar.
async function start({ id, q, hl, gl }, siteTab) {
  const job = { id, siteTab };
  const tab = await chrome.tabs.create({ url: `https://www.google.com/search?${new URLSearchParams({ q, hl, gl })}`, active: false });
  // tab.url só vem para hosts com permissão; o about:blank inicial também chega como "complete" no Firefox.
  const onUpdated = (tabId, info, t) => {
    if (tabId !== tab.id || info.status !== 'complete' || t.url === 'about:blank') return;
    chrome.scripting.executeScript({ target: { tabId }, func: readPaa, args: [job] }).catch(() => {
      // Fora de www.google.com (ex.: consent.google.com): mostra a aba para o usuário resolver.
      chrome.tabs.update(tabId, { active: true });
      reply(job, { error: 'blocked' });
    });
  };
  const onRemoved = (tabId) => {
    if (tabId !== tab.id) return;
    chrome.tabs.onUpdated.removeListener(onUpdated);
    chrome.tabs.onRemoved.removeListener(onRemoved);
  };
  chrome.tabs.onUpdated.addListener(onUpdated);
  chrome.tabs.onRemoved.addListener(onRemoved);
}

function finish({ job, error, data }, googleTab) {
  // Captcha: deixa a aba aberta e visível para o usuário resolver; senão fecha.
  if (error === 'captcha') chrome.tabs.update(googleTab, { active: true });
  else chrome.tabs.remove(googleTab);
  reply(job, { error, data });
}

const send = (job, msg) => chrome.tabs.sendMessage(job.siteTab, { ...msg, id: job.id }).catch(() => {});
const reply = (job, res) => send(job, { type: 'paa-result', ...res });

// Roda na página do Google (precisa ser autocontida). Mesma lógica do bookmarklet public/paa.js: cada clique
// numa pergunta revela novas no fim da lista, que viram filhas dela. Espera por MutationObserver, não por
// polling: abas em segundo plano têm timers limitados a ~1/s.
function readPaa(job) {
  if (window.askwheelRunning) return;
  window.askwheelRunning = true;
  const MAX_CLICKS = 20;
  const DEADLINE = Date.now() + 45000;
  const done = (res) => chrome.runtime.sendMessage({ type: 'paa-done', job, ...res });
  const progress = (n, found) => chrome.runtime.sendMessage({ type: 'paa-progress', job, done: n, total: MAX_CLICKS, found });
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
    const kw = url.searchParams.get('q');
    const node = (q) => ({ name: q, children: children.get(q).map(node) });
    done({ data: { keyword: kw, hl: url.searchParams.get('hl') || '', gl: url.searchParams.get('gl') || '', tree: { name: kw, children: roots.map(node) } } });
  })().catch(() => done({ error: 'empty' }));
}
