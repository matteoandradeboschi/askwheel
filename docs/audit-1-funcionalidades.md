# Auditoria AskWheel: funcionalidades vs mercado

2026-11-05. Feita por um subagente (Opus 5.5, só leitura e pesquisa web). A página de features da AnswerThePublic hoje mostra quase só os planos "Composeo" e a zendesk dela responde 403, então parte das afirmações sobre a ATP vem de terceiros.

## 0. Confirmações no código
- **Já existe:**
  - CSV por painel (`app.js:385`, `toCsv` em `:525`)
  - CSV do PAA (`:619`, `:531`)
  - link compartilhável `?q=&hl=&gl=` (`:519`, `:620`)
  - idioma e país (`index.html:28-43`)
  - filtro e chips na lista (`:340-353`, `:625-629`)
  - copiar item com o botão "+" (`:336`, `:624`)
- **Falta (confirmado):**
  - histórico: nenhum uso de `localStorage`
  - exportar PNG/SVG da roda e do mapa PAA
  - "copiar tudo" e CSV da lista unificada
  - palavras relacionadas semânticas (PASF). O grupo "Relacionadas" é só o que sobra do autocomplete (`:96-101`)
- **Categorias de modificadores:** já batem com a ATP (`modifiers.json`, `app.js:29`). O grupo 0–9 é um extra em relação a ela.

## 1. Funcionalidades × concorrentes

Legenda: ✅ sim · ❌ não · ½ parcial · ? não verificado.

| Funcionalidade | ATP | AlsoAsked | AnswerSocrates | Soovle | KeywordTool | Ubersuggest | KW Everywhere | **AskWheel** |
|---|---|---|---|---|---|---|---|---|
| Grátis sem limite diário e sem conta | ❌ ~3/dia [a][b] | ❌ créditos [c] | ❌ 3/dia [d] | ✅ [e] | ✅ sem conta [f] | ❌ ~3–5/dia [g] | ½ widgets sem métricas [h] | ✅ |
| Open source | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Autocomplete Google | ✅ [i] | ❌ | ✅ [d] | ✅ | ✅ [f] | ✅ [j] | ½ | ✅ |
| Multi-fontes | ✅ Bing/YT/TikTok/Amazon [i] | ❌ | ❌ | ✅ até 6 [e] | ✅ 17 [f] | ❌? | ✅ [h] | ½ site: Google+Shopping; skill: +YT/Bing/Amazon/TikTok/Trends |
| Perguntas/preposições/comparações/a–z | ✅ [k] | ❌ | ? | ❌ | ? | ✅ [j] | ❌ | ✅ (+0–9) |
| People Also Ask | ? | ✅ núcleo | ✅ [d] | ❌ | ❌ | ❌? | ✅ widget [h] | ✅ via extensão/favorito |
| Visualização roda/árvore | ✅ roda | ✅ árvore | ? | ❌ | ❌ | ✅ roda [j] | ❌ | ✅ roda + árvore |
| CSV | ½ [b][l] | ✅ pago [c] | ✅ [d] | ✅ [e] | ½ só Pro [f] | ? | ? | ✅ |
| Exportar imagem PNG | ✅ [l] | ✅ pago [c] | ? | ❌ | ❌ | ? | ❌ | ❌ |
| Histórico de buscas | ? | ✅ [c] | ? | ❌ | ? | ? | ❌ | ❌ |
| Favoritar | ? | ❌ | ? | ✅ [e] | ? | ? | ? | ❌ |
| Alertas / comparar no tempo | ✅ pago [k][b] | ❌ | ? | ❌ | ❌ | ❌ | ❌ | ❌ |
| Volume/CPC | ✅ pago [i] | ❌ | ✅ pago [d] | ❌ [e] | ✅ Pro [f] | ✅ limitado [g] | ✅ créditos [h] | ❌ |
| Lote / API / MCP | ? | ✅ [c] | ✅ MCP [d] | ❌ | ✅ Pro [f] | ? | ❌ | ½ skill Claude Code |
| Clusters/intenção por IA | ? | ❌ | ✅ [d] | ❌ | ❌ | ❌ | ❌ | ½ só na skill |
| Idiomas/países | muitos | todos [c] | todos [d] | ? | 190+ [f] | ? | ? | 4 idiomas × 8 países |
| Sem analytics/cadastro | ❌ | ❌ | ❌ | ? | ✅ | ❌ | ❌ | ✅ |

Extras encontrados:
- **KeywordsPeopleUse:** PAA + Reddit/Quora, só pago [m].
- **WildandFree Question Finder:** grátis, com CSV [n].

Fontes:
- [a] https://aeoengine.ai/blog/answer-the-public-free-guide-review
- [b] https://wildandfreetools.com/blog/answer-the-public-alternatives-free-question-finder/
- [c] https://alsoasked.com/pricing
- [d] https://answersocrates.com/
- [e] https://www.seo.com/soovle/
- [f] https://keywordtool.io/
- [g] https://aiproductivity.ai/pricing/ubersuggest/
- [h] https://keywordseverywhere.com/pricing.html
- [i] https://answerthepublic.zendesk.com/hc/en-us/articles/7299190956827-How-AnswerThePublic-Collects-Data (via snippet de busca)
- [j] https://ubersuggest.zendesk.com/hc/en-us/articles/4418317806747 (via snippet de busca)
- [k] https://answerthepublic.com/en/pages/features
- [l] https://carminemastropierro.com/?p=14454
- [m] https://keywordspeopleuse.com/pricing
- [n] = [b]

## 2. Lacunas priorizadas

Todas são viáveis sem backend e de graça, salvo nota em contrário. Impacto e esforço são opinião.

| # | Lacuna | Impacto | Esforço | Nota |
|---|---|---|---|---|
| 1 | **Exportar a roda e o mapa PAA em SVG/PNG** (recomendado) | alto | P | ATP e AlsoAsked cobram por isso |
| 2 | **YouTube e Bing opcionais no site** (já estão em `SOURCES`) (recomendado) | alto | P | Dobra as consultas: deixar desligado por padrão |
| 3 | **"Pesquisas relacionadas" do SERP**, lidas pela extensão/favorito junto com o PAA (recomendado) | alto | M | Mais um ponto de quebra quando o DOM do Google mudar |
| 4 | **Histórico local** (`localStorage`) (recomendado) | médio | P | |
| 5 | **Copiar tudo e CSV da lista unificada com filtro** (recomendado) | médio | P | |
| 6 | Modificadores em fr e de (os países já existem) | médio | P | |
| 7 | Publicar a extensão no AMO (Firefox, grátis) | alto (adoção) | P | Chrome Web Store tem taxa única |
| 8 | "Expandir" uma pergunta do PAA | médio | M | |
| 9 | Snapshot local + diff entre datas | médio | M | Alertas de verdade precisam de servidor |
| 10 | Favoritar sugestões | baixo | P | |
| 11 | Modificadores personalizados | baixo | P/M | |
| 12 | Palavras negativas no filtro | baixo | P | |
| 13 | Lote de keywords | baixo | M | Risco de rate limit |
| 14 | Clusters no site sem LLM | baixo | M | A skill já faz isso melhor |

## 3. Diferenciais
- O único grátis, sem conta e sem limite que junta autocomplete categorizado e PAA em árvore numa busca só.
- Open source, estático, sem analytics. As consultas saem do IP do visitante.
- Google Shopping como fonte, mais o grupo 0–9.
- A skill local entrega Amazon/TikTok/Trends, clusters, pautas e HTML offline.
- Contra-argumento: o PAA exige extensão em modo dev ou um favorito, só no desktop.

## 4. Fora do alcance sem dados pagos

| Dado | Alternativa grátis |
|---|---|
| Volume | Google Keyword Planner (faixas), Bing Webmaster Tools. No site: a posição no autocomplete como proxy |
| CPC | Keyword Planner |
| Tendência | Botão "abrir no Google Trends" por sugestão |
| Dificuldade (KD) | Nenhuma séria |
| Alertas | Precisam de servidor ou cron (GitHub Actions). Não vale agora |

## 5. Bugs e inconsistências vistos de passagem
1. **`app.js:607-608`: `hl`/`gl` da URL não são validados.** Com `?hl=fr` o `<select>` fica vazio e a busca sai com `hl=''`. Já existe `setSelect` (`:602`).
2. **`app.js:298` + `:433`: `drawMap` usa `getComputedTextLength`.** Se o mapa for desenhado com a aba escondida, as larguras saem 0 e os textos se sobrepõem. Inferido, não testado.
3. **Duplicatas entre grupos.** `norm` tira acentos (`é`/`è` → `e`), e `como`/`come`/`can` estão em mais de um grupo. A dedupe é só por modificador (`app.js:91`, `collect.py:149`), então os totais inflam.
4. **`app.js:545`:** `revokeObjectURL` logo após `click()`. Mais seguro com `setTimeout`.
5. **`app.js:55-56`:** JSONP que chega depois do timeout gera `ReferenceError` no console.
6. **`app.js:107`:** `modifiers.json` é buscado uma vez por fonte a cada busca.
7. **`index.html:41-42`:** os países França/Alemanha não têm idioma de modificadores.
8. **`extension/background.js:53`:** a barra de progresso usa o total fixo de 20 e quase nunca chega a 100%.
9. **`app.js:12`:** o link do Shopping usa `tbm=shop` (o Google migrou para `udm=28`). Testar.
10. **`style.css:15,29`:** os seletores de `data-theme` não têm toggle: código morto ou função por fazer.
11. **`index.html:107`:** no Firefox a extensão é temporária (ver lacuna 7).
