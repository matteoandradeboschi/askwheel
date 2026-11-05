// Roda nas páginas do AskWheel: avisa o site que a extensão existe e leva os pedidos de PAA da página
// para o background (e a resposta de volta). O site fala com este script por window.postMessage.
document.documentElement.dataset.askwheelExt = chrome.runtime.getManifest().version;

// No máximo um pedido a cada 2 s (cada um abre uma aba do Google; o background mantém um job por vez).
// Pedidos mais rápidos não se perdem: vale o último, enviado quando o intervalo acaba.
let last = 0, timer;
window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.type !== 'askwheel:paa') return;
  const { id, q, hl, gl } = e.data;
  if (typeof id !== 'string' || !/^[a-z0-9]{1,20}$/.test(id)) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    last = Date.now();
    chrome.runtime.sendMessage({ type: 'paa', id, q: String(q).slice(0, 200), hl: String(hl).slice(0, 10), gl: String(gl).slice(0, 10) });
  }, Math.max(0, last + 2000 - Date.now()));
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'paa-result' || msg?.type === 'paa-progress') window.postMessage({ ...msg, type: `askwheel:${msg.type}` }, location.origin);
});
