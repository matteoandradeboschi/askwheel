# Briefing: etapa 3 da auditoria (design UI/UX)

Contexto para retomar a etapa 3 numa sessão nova do Claude Code. Para usar: abra a sessão em `/home/matteo/Projetos/askwheel` e diga "leia `docs/audit-3-briefing.md` e comece a etapa 3".

## Objetivo
Melhorar o design e a UX do AskWheel para que ele fique amigável e fácil de ler, sobretudo para quem nunca o usou. É uma etapa em diálogo: primeiro a auditoria e as propostas, e você aprova antes de qualquer implementação.

## O que é o projeto
Alternativa grátis e open source à AnswerThePublic. Site estático (Cloudflare Pages), sem backend, sem build e sem npm. Uma busca traz:
- o autocomplete do Google e do Google Shopping, com uma roda sunburst D3 e Cards/tabela por fonte
- uma roda geral que junta as fontes
- uma lista unificada com filtros
- um mapa People Also Ask (árvore horizontal), que vem da extensão ou do bookmarklet

Leia o `CLAUDE.md` (regras: sem build, D3 7.9.0, UI em português com sentence case, paridade `app.js`↔`collect.py`). Os arquivos de UI são `public/index.html`, `public/style.css` e `public/app.js` (renderização: `drawWheel`, `drawGroupWheel`, `renderOverview`, `renderPanel`, `renderList`, `renderPaa`, `drawMap`).

## O que já foi feito
- **Etapa 1 (funcionalidades):** `docs/audit-1-funcionalidades.md`. As lacunas de features ficam para depois: não implemente nesta etapa.
- **Etapa 2 (código e segurança):** `docs/audit-2-codigo.md`. Todas as correções estão na branch `fix/audit-code-security`, inclusive a acessibilidade mínima (`aria-label`, ARIA das tabs, `aria-live`, teclado no mapa). Confirme se essa branch já entrou na `main` antes de criar uma branch de design.

## Pendências de UX já conhecidas
- **Tema escuro:** `style.css` tem seletores `data-theme` sem nenhum botão. Decidir: botão de tema, só `prefers-color-scheme`, ou remover os seletores.
- **Palavras com poucos resultados no Shopping** (por exemplo "arancino", comida e não produto): o painel quase vazio parece bug. Hoje ele abre no primeiro grupo com 3 ou mais modificadores preenchidos (`app.js`, em `renderPanel`). Pensar num estado "poucos resultados nesta fonte" e em esmaecer os grupos vazios.
- **`aria-live` no "Consultando… n/140":** pode falar demais no leitor de tela. Avaliar um anúncio só no início e no fim.
- **Primeira visita:** dizer o que é a ferramenta, oferecer exemplos clicáveis, desenhar o estado vazio.
- **Sunburst com muitos rótulos:** legibilidade, sobretudo no mobile (Cards como padrão em telas estreitas?).
- **Fluxo PAA:** extensão vs bookmarklet vs passos de instalação (abas **Extensão PAA** e **Skill p/ Claude Code**). Hoje pode confundir.
- **Estados:** loading e progresso por fonte, erro (Google bloqueado ou com captcha), resultado vazio.
- **Acessibilidade:** contraste, foco visível, cor como único sinal de significado.

## Como avaliar
- **Servidor local:** `python3 -m http.server 8080 --directory public`, com http://localhost:8080/?q=gioco%20da%20biliardo&hl=it&gl=it. Confira se a porta 8080 já está em uso.
- **Screenshots:** desktop (1440) e mobile (390), com Firefox headless ou as ferramentas do navegador disponíveis.
- **Skill `/impeccable`:** critique e audit.
- **Lighthouse:** Chrome DevTools, grátis (acessibilidade, performance, SEO).
- **Palavras de teste:** "gioco da biliardo" (muitos resultados), "arancino" (Shopping quase vazio), uma em pt e uma em en.

## O que entregar (antes de implementar)
1. Uma lista de problemas por prioridade (impacto × esforço), com screenshot ou `arquivo:linha`.
2. Duas ou três direções visuais, só quando houver uma escolha real, com uma marcada "(recomendado)".
3. Um plano de implementação em passos pequenos.

## Regras de trabalho do usuário
- O usuário mora na Itália e não tem dinheiro: só soluções grátis. Mencione as pagas, mas não as sugira.
- Respostas concisas, em português. Opinião não vale como fato: traga o contra-argumento.
- Decisões simples e reversíveis, decida e avise. Pergunte só o que for difícil de desfazer (por exemplo, uma identidade visual nova).
- Faça o mínimo necessário e sem overengineering, sem mexer em código fora do escopo.
- **Git:**
  - Branch `feat/ui-…` ou `fix/ui-…` a partir da `main` atualizada, nunca commit direto na `main`.
  - Conventional Commits em inglês, com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Rode `/code-review` antes do merge.
- **Verificação:** `node --check public/app.js` e screenshots antes e depois.
