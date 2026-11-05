---
name: askwheel
description: Gera um relatório de search listening (estilo AnswerThePublic) para uma palavra-chave — perguntas, preposições, comparações, a–z, 0–9 e relacionadas, com dados reais do autocomplete (Google, YouTube, Google Shopping, Bing, Amazon, TikTok ou Google Trends) — e acrescenta análise do Claude (intenção, clusters, pautas, FAQs) num HTML único. Use quando o usuário rodar /askwheel <keyword>, pedir "o que as pessoas perguntam sobre X", "ideias de conteúdo para X", "keyword research grátis" ou "relatório AskWheel".
---

# AskWheel

Mesma coleta do site AskWheel, mais o que só o Claude faz. O HTML final reaproveita o próprio site (pasta `site/` ao lado deste arquivo).

## Entrada

`$ARGUMENTS` = `<keyword> [--hl it|pt|en|es] [--gl it|br|pt|us|gb|es|fr|de] [--source google|youtube|shopping|bing|amazon|tiktok|trends]`. Sem `--hl`/`--gl`: deduza do idioma da keyword; na dúvida use `it`/`it`. Para fr/de (sem modificadores próprios) use `--hl en`: outros idiomas caem nos modificadores em `en`. Sem `--source`: `google`. Uma fonte por execução. `amazon`, `tiktok` e `trends` só existem na skill (o navegador bloqueia por CORS, o site não os oferece). `amazon` usa a loja do `--gl` (it, br, us, gb, es, fr, de; pt usa amazon.es; outros caem em amazon.it). `tiktok` ignora `--hl`/`--gl` (os resultados seguem a região do IP de quem roda). `trends` é experimental: devolve tópicos/produtos (títulos), não consultas, e o Google pode limitar (429). Instagram e People Also Ask não são suportados.

## Passos

1. **Coletar** (dados reais, ~70 consultas, ~10 s):
   ```bash
   python3 <pasta-da-skill>/collect.py "<keyword>" --hl <hl> --gl <gl> --source <src> -o <scratch>/dados.json
   ```
   Se sair com erro ou com quase tudo vazio (bloqueio/sem rede): avise o usuário e gere você mesmo as sugestões no mesmo formato de `dados.json`, com `"source": "claude-generated"`. Nunca apresente sugestões geradas como dados reais de nenhuma fonte.

2. **Analisar**: leia `dados.json` (`groups.<grupo>.modifiers[].items[]`). Escreva `<scratch>/extras.json`:
   ```json
   {"sections": [
     {"title": "Intenção de busca", "intro": "…", "items": [{"text": "Informacional", "note": "42 sugestões", "keywords": ["…", "…"]}]},
     {"title": "Clusters de tópicos", "items": [{"text": "<nome do cluster>", "note": "<1 frase>", "keywords": ["…"]}]},
     {"title": "Pautas de conteúdo", "items": [{"text": "<título do artigo/vídeo>", "note": "<formato e ângulo>", "keywords": ["<keyword-alvo>", "…"]}]},
     {"title": "Perguntas prioritárias", "items": [{"text": "<pergunta>", "note": "<por quê>"}]}
   ]}
   ```
   Regras:
   - Use só sugestões que estão em `dados.json` em `keywords` (copie o texto exato).
   - Intenção: informacional, comercial, transacional, navegacional. Classifique por interpretação — diga isso no `intro`.
   - 4–8 clusters, 8–12 pautas, 10 perguntas prioritárias. Escreva no idioma da keyword.
   - Não invente volume de busca ou CPC: não há esses dados.

3. **Renderizar**:
   ```bash
   python3 <pasta-da-skill>/render.py <scratch>/dados.json <scratch>/extras.json -o ./askwheel-<slug>.html
   ```
   `slug` = keyword minúscula, sem acentos, com hífens.

4. **Entregar**: o arquivo HTML (SendUserFile com `display: "render"` quando existir). No chat, só: caminho, fonte, contagem por grupo e as 3 pautas mais fortes. Não repita as listas inteiras.

## Notas

- O endpoint do autocomplete é não oficial: pode limitar ou mudar.
- Para atualizar a skill e o site embutido, rode de novo o comando de instalação da aba **Skill p/ Claude Code** do site.
