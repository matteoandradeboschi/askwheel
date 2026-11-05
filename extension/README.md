# AskWheel PAA (extensão)

Traz o People Also Ask do Google para o AskWheel sozinho: a cada busca no site, a extensão abre a busca no Google numa aba em segundo plano, abre as perguntas, devolve o mapa ao site e fecha a aba. Não guarda nada e não manda dados para nenhum servidor além do Google.

Permissões: `www.google.com` (ler o PAA) e as páginas do AskWheel (conversar com o site).

## Instalar (enquanto não está nas lojas)

Baixe `askwheel-paa.zip` na aba **Extensão PAA** do site (ou use esta pasta) e descompacte.

- **Chrome, Edge, Brave, Opera, Vivaldi**: abra `chrome://extensions` (no Opera `opera://extensions`), ligue **Modo do desenvolvedor**, clique **Carregar sem compactação** e escolha a pasta `extension/`.
- **Firefox**: abra `about:debugging#/runtime/this-firefox` → **Carregar extensão temporária** → escolha `extension/manifest.json`. Some ao fechar o Firefox; a instalação permanente vem com a publicação no AMO.

Depois, recarregue o AskWheel e busque: o mapa de perguntas aparece em uns 20 segundos.

## Como funciona

- `site.js`: roda nas páginas do AskWheel, marca `<html data-askwheel-ext>` e repassa pedidos e respostas (`window.postMessage` ↔ background).
- `background.js`: abre a aba do Google e injeta `readPaa` (mesma lógica do bookmarklet `public/paa.js`; mudanças no DOM do Google afetam os dois).
- Captcha ou tela de cookies: a aba do Google fica aberta e visível para o usuário resolver; ao voltar para a busca, a coleta continua sozinha (o script é injetado a cada carregamento da aba).
- Domínios do site em `manifest.json` (`content_scripts.matches`): ajuste se o site mudar de endereço.
