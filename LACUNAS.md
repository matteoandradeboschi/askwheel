# Lacunas para implementar

Próximos passos depois da v1 (auditoria de 2026-11-05). Detalhes e fontes em `docs/audit-1-funcionalidades.md`.

## Prioridade (recomendado)
- [ ] **Exportar a roda e o mapa PAA em SVG/PNG.** `XMLSerializer` + canvas, com o CSS inline. A AnswerThePublic e o AlsoAsked cobram por isso. Esforço P.
- [ ] **YouTube e Bing opcionais no site.** Já estão em `SOURCES` no `app.js`: falta um checkbox por fonte, desligado por padrão (dobra as consultas e aumenta o risco de bloqueio). Esforço P.
- [ ] **"Pesquisas relacionadas" do Google**, lidas pela extensão e pelo bookmarklet na mesma página do PAA. Mexer em `extension/background.js` (`readPaa`) e `public/paa.js` juntos. Esforço M. É mais um ponto que quebra se o Google mudar o DOM.
- [ ] **Histórico de buscas** no `localStorage` (keyword, hl, gl, data), com reabertura. Esforço P.
- [ ] **Copiar tudo e CSV da lista unificada**, respeitando o filtro. Esforço P.

## Depois
- [ ] Modificadores em fr e de (os países já existem). Mudar `modifiers.json` e o `<select id="hl">`.
- [ ] "Expandir" uma pergunta do PAA (nova coleta a partir dela).
- [ ] Snapshot local e diff entre duas datas.
- [ ] Favoritar sugestões e exportar só os favoritos.
- [ ] Modificadores personalizados; palavras negativas no filtro.
- [ ] Botão "abrir no Google Trends" por sugestão.
- [ ] Mais idiomas da interface (`public/i18n.js`).

## Extensão nas lojas gratuitas
O rascunho da ficha e o material estão na branch `feat/extension-store` (`extension/STORE.md`, ícones, `public/privacidade.html`).
- [ ] **Firefox Add-ons (AMO)**, grátis. Com isso a extensão deixa de ser temporária. Testar as permissões de host no Firefox MV3.
- [ ] **Microsoft Edge Add-ons**, grátis.
- [ ] **Opera Add-ons**, grátis.
- [ ] Chrome Web Store fica para depois (taxa única de US$5).
- [ ] Reescrever o `STORE.md` para essas lojas.
- [ ] Atenção: o `index.html` da branch tem os textos da aba Extensão em português fixo. Agora eles vivem em `public/i18n.js`, então traga as mudanças para lá (pt, en, it), em vez de fazer merge direto.

## Fora do alcance (sem dados pagos)
Volume de busca, CPC, dificuldade e alertas automáticos. Alternativa grátis: Google Keyword Planner (faixas de volume, com conta Ads).

## Testes manuais pendentes
- [x] Deploy: Cloudflare Workers (static assets) via Git, `wrangler.jsonc`, URL `askwheel.matteoandradeboschi.workers.dev`.
- [ ] Extensão (semana que vem): testar e implementar o que faltar, regenerar `askwheel-paa.zip`.
- [ ] `robots.txt` e sitemap: adiar até o MVP estar no ar.
- [ ] `og:` tags (título, descrição, imagem) para links compartilhados.
- [ ] **Próximo:** console do site publicado: nenhuma violação de CSP (`public/_headers`).
- [ ] Extensão recarregada (pede a permissão `storage`): duas buscas rápidas seguidas, captcha parado por mais de 30 s.
- [ ] Bookmarklet no google.it.
