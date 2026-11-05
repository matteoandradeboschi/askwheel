/* AskWheel PAA: bookmarklet que roda numa busca do Google, abre as perguntas do "People Also Ask"
   (cada clique revela novas) e leva o resultado para o AskWheel via #paa= na URL.
   O site troca o valor de SITE pelo próprio endereço e monta o link javascript:. Sem comentários de linha:
   o código vira uma URL. O void é obrigatório: se o javascript: devolve um valor (aqui, a Promise),
   o Firefox troca a página do Google por esse valor e o script para no meio. */
void (async () => {
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

  /* Cada clique numa pergunta revela novas no fim da lista: elas viram filhas da pergunta clicada. */
  const children = new Map(roots.map((q) => [q, []]));
  const queue = [...roots];
  let clicks = 0;
  while (queue.length && clicks < MAX_CLICKS) {
    const q = queue.shift();
    box.textContent = `AskWheel: lendo perguntas… ${children.size}`;
    const btn = pairs().find((p) => p.dataset.q === q)?.querySelector('[role="button"][aria-expanded]');
    if (!btn || btn.getAttribute('aria-expanded') === 'true') continue;
    const before = pairs().length;
    btn.click();
    clicks++;
    for (let t = 0; t < 15 && pairs().length === before; t++) await sleep(200);
    for (const p of pairs()) {
      const nq = p.dataset.q;
      if (children.has(nq)) continue;
      children.set(nq, []);
      children.get(q).push(nq);
      queue.push(nq);
    }
    await sleep(300);
  }

  const node = (q) => ({ name: q, children: children.get(q).map(node) });
  const data = {
    keyword: kw,
    hl: url.searchParams.get('hl') || document.documentElement.lang.slice(0, 2),
    gl: url.searchParams.get('gl') || '',
    collected_at: new Date().toISOString(),
    tree: { name: kw, children: roots.map(node) },
  };
  box.textContent = `AskWheel: ${children.size} perguntas. Abrindo…`;
  location.href = SITE + '#paa=' + encodeURIComponent(JSON.stringify(data));
})();
