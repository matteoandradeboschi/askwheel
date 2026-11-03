/* AskWheel PAA: bookmarklet que roda numa busca do Google, abre as perguntas do "People Also Ask"
   (cada clique revela novas) e leva o resultado para o AskWheel via #paa= na URL.
   O site troca o valor de SITE pelo próprio endereço e monta o link javascript:. Sem comentários de linha:
   o código vira uma URL. */
(async () => {
  const SITE = '__SITE__';
  const MAX_CLICKS = 20;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const url = new URL(location.href);
  const kw = url.searchParams.get('q');
  if (!/(^|\.)google\.[a-z.]+$/.test(location.hostname) || url.pathname !== '/search' || !kw) {
    alert('AskWheel: abra uma busca no Google e clique no favorito de novo.');
    return;
  }
  const pairs = () => [...document.querySelectorAll('.related-question-pair[data-q]')];
  const roots = pairs().map((p) => p.dataset.q);
  if (!roots.length) {
    alert('AskWheel: esta busca não tem a caixa "As pessoas também perguntam".');
    return;
  }

  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:2147483647;top:16px;right:16px;padding:10px 14px;border-radius:8px;background:#2f5fd0;color:#fff;font:14px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)';
  document.body.append(box);

  const rootOf = new Map(roots.map((q) => [q, q]));
  const children = new Map(roots.map((q) => [q, []]));
  const queue = [...roots];
  let clicks = 0;
  while (queue.length && clicks < MAX_CLICKS) {
    const q = queue.shift();
    box.textContent = `AskWheel: lendo perguntas… ${rootOf.size}`;
    const btn = pairs().find((p) => p.dataset.q === q)?.querySelector('[role="button"][aria-expanded]');
    if (!btn || btn.getAttribute('aria-expanded') === 'true') continue;
    const before = pairs().length;
    btn.click();
    clicks++;
    for (let t = 0; t < 15 && pairs().length === before; t++) await sleep(200);
    for (const p of pairs()) {
      const nq = p.dataset.q;
      if (rootOf.has(nq)) continue;
      const root = rootOf.get(q);
      rootOf.set(nq, root);
      children.get(root).push(nq);
      queue.push(nq);
    }
    await sleep(300);
  }

  const modifiers = roots.map((r) => ({ name: r, items: children.get(r) }));
  const data = {
    keyword: kw,
    hl: url.searchParams.get('hl') || document.documentElement.lang.slice(0, 2),
    gl: url.searchParams.get('gl') || '',
    src: 'paa',
    source: 'google-paa',
    collected_at: new Date().toISOString(),
    groups: { paa: { tree: true, modifiers, count: rootOf.size } },
  };
  box.textContent = `AskWheel: ${rootOf.size} perguntas. Abrindo…`;
  location.href = SITE + '#paa=' + encodeURIComponent(JSON.stringify(data));
})();
