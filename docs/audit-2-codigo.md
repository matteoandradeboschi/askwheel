# Auditoria AskWheel: código e segurança

2026-11-05. Feita por um subagente (Opus 5.5, só leitura). As checagens de sintaxe e uma coleta real do `collect.py` + `render.py` rodaram no scratchpad.

> [!warning] Números de linha
> Alguns números de linha do relatório original estavam errados e foram corrigidos aqui: `render.py:16` (era 216) e `paa.js:12` (era 170). Confira os demais antes de editar.

**Conclusão:** nada crítico nem alto. Não há XSS explorável com dado vindo do Google: o texto passa por `esc()` ou `textContent`. Os pontos fracos são a cadeia de suprimentos (D3 sem SRI, sem CSP, o `curl` da skill), o alcance dos `matches` da extensão e erros mal tratados.

## Itens da etapa 1
Todos confirmados: hl/gl sem validação (bug, não injeção), `drawMap` em aba escondida, duplicatas entre grupos (30 repetidas na coleta real de "caffè"), `revokeObjectURL`, `ReferenceError` do JSONP, `modifiers.json` buscado por fonte, barra de progresso, `tbm=shop`, `data-theme` morto.

## Achados novos

### Média
| # | Onde | Problema | Correção | Esforço | Status |
|---|---|---|---|---|---|
| 1 | `index.html:155` | D3 sem SRI e sem CSP: um cdnjs comprometido roda JS no site e controla a extensão | `integrity` + `_headers` (abaixo) | P | confirmado |
| 2 | `app.js:564` | O `curl` da skill não verifica integridade, e `for…done && echo` só checa o último arquivo: diz "instalada" mesmo com 404 | Um único `curl --fail-early -o … -o …`; avisar que o comando executa código | P | (a) plausível, (b) confirmado |
| 3 | `extension/manifest.json:10` | `matches` com `localhost`/`127.0.0.1` (qualquer porta) e domínio `askwheel.pages.dev` fixo: qualquer app local pode abrir abas do Google logadas | Tirar localhost do zip distribuído; confirmar o domínio; um job por vez | P | plausível |
| 4 | `extension/background.js:47-61` | Os listeners `onUpdated`/`onRemoved` são criados dentro de `start` e se perdem quando o worker dorme (~30 s). Captcha demorado → o site fica preso em "demorando" | Listener no topo + job em `chrome.storage.session` | M | plausível |

### Baixa
| # | Onde | Problema | Correção | Esforço |
|---|---|---|---|---|
| 5 | `app.js:513-522` | `try/finally` sem `catch` em `search`: o status fica preso em "Consultando…" | `catch` com `setStatus` | P |
| 6 | `render.py:16` | `safe_json` só escapa `</`. Um `<!--<script` no JSON quebra o HTML offline (não é XSS) | `.replace("<", "\\u003c")` | P |
| 7 | `app.js:399,402,25,337` | `count`/`total`/`marketplace` crus no HTML (dados preloaded: defesa em profundidade) | `esc()` / `Number()` | P |
| 8 | `app.js:560,564,570` | `siteUrl()` com `pathname` cru no comando shell e no bookmarklet; `replace` interpreta `$&` (mitigado hoje) | Só `location.origin`; `replace('__SITE__', () => url)` | P |
| 9 | `app.js:528,537` | CSV sem proteção contra fórmula (`=`, `+`, `-`, `@`) | Prefixar `'` | P |
| 10 | `extension/site.js:5-8` | Ponte sem rate limit, `id` não validado | Um job por vez; `q.slice(0,200)` | P |
| 11 | `collect.py:125-132` | O timeout vale por socket; o `sleep` só acontece em caso de sucesso (agrava bloqueios) | `sleep` no `finally` | P |
| 12 | `index.html:27,13-17,46,65` | Acessibilidade: `#q` sem label; tabs sem ARIA completa; status sem `aria-live`; roda e mapa sem teclado | `aria-label`, `aria-live`, `tabindex` + Enter | P |
| 13 | `paa.js:12` | Regex aceita `google.evil.com` (sem impacto real) | `^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$` | P |
| 14 | `app.js:577-591` | `#paa=` de qualquer link mostra perguntas falsas e dispara 140 consultas; `keyword` sem limite | `keyword.slice(0,200)` | P |
| 15 | `extension/manifest.json:7` | No Firefox AMO, a permissão de host pode exigir concessão manual | Testar ao publicar | — |

## Paridade `app.js` vs `collect.py`
- **Batem:** `SOURCES`, `build_plan`, `assemble` e o fallback para `en`.
- **Diferenças pequenas:**
  - `norm`: o JS remove só U+0300–036F; o Python remove toda a categoria `Mn`.
  - O Python colapsa espaços internos da keyword; o JS só faz `trim`.
  - O `sleep` do JS acontece sempre; o do Python só em caso de sucesso.
  - `collected_at`: milissegundos no JS, segundos no Python.
  - Bing: `x.Txt` indefinido quebraria o JS (o site não usa Bing hoje).

## Proposta de `public/_headers`
```
/*
  Content-Security-Policy: default-src 'none'; script-src 'self' https://cdnjs.cloudflare.com https://suggestqueries.google.com; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()

/skill/*
  Content-Type: text/plain; charset=utf-8
```
Se o JSONP for bloqueado por redirect, acrescentar `https://www.google.com` ao `script-src`. Testar no deploy de preview do Pages antes de mandar para a `main`.

SRI do D3 7.9.0:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js" integrity="sha512-vc58qvvBdrDR4etbxMdlTt4GBQk1qjvyORR2nrsPsFPyrs+/u5c3+1Ct6upOgdZoIl7eq6k3a1UPDSNAQi/32A==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
```

## Checagens
- `node --check` (4 arquivos .js) e `py_compile` (2 arquivos .py): ok.
- Os JSON são válidos; o zip é idêntico a `extension/`.
- `collect.py "caffè" --hl it --gl it`: 70 consultas, 0 falhas.

## O que está bem feito
- `esc()` e `textContent` em todo o texto externo.
- `openUrl` com prefixo `https` fixo + `encodeURIComponent`.
- `cleanPaa` com limites de tamanho, profundidade e quantidade.
- `postMessage` com `targetOrigin`, checagem de `source` e correlação por `id`.
- Permissões mínimas na extensão.
- Callback JSONP aleatório.
- Python só com biblioteca padrão, com timeout.
