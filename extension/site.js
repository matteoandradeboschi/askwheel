// Roda nas páginas do AskWheel: avisa o site que a extensão existe e leva os pedidos de PAA da página
// para o background (e a resposta de volta). O site fala com este script por window.postMessage.
document.documentElement.dataset.askwheelExt = chrome.runtime.getManifest().version;

window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.type !== 'askwheel:paa') return;
  const { id, q, hl, gl } = e.data;
  chrome.runtime.sendMessage({ type: 'paa', id, q: String(q), hl: String(hl), gl: String(gl) });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'paa-result' || msg?.type === 'paa-progress') window.postMessage({ ...msg, type: `askwheel:${msg.type}` }, location.origin);
});
