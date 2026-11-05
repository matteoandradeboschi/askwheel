# AskWheel

Alternativa grátis de *search listening*: digite uma palavra-chave e veja, numa busca só, perguntas, preposições, comparações, a–z, 0–9 e buscas relacionadas do autocomplete do Google e do Google Shopping (roda + tabela) e o mapa do People Also Ask do Google. Site estático, sem backend: as consultas vão do navegador do visitante direto para a fonte (JSONP). O People Also Ask é coletado pela extensão [AskWheel PAA](extension/) (automático) ou por um favorito (bookmarklet), na própria página de resultados do Google.

## Estrutura

```
extension/              # extensão do navegador que traz o PAA sozinho (vai para o site como public/askwheel-paa.zip)
public/                 # tudo que vai para o Cloudflare Pages
  index.html style.css app.js
  paa.js                # bookmarklet do People Also Ask
  modifiers.json        # modificadores por idioma (fonte única: site + skill)
  skill/                # skill opcional para Claude Code, servida pelo próprio site
    SKILL.md collect.py render.py
```

## Rodar localmente

```bash
python3 -m http.server 8000 --directory public
```

Abra http://localhost:8000. (Abrir `index.html` direto via `file://` não funciona para buscar: o `fetch('modifiers.json')` é bloqueado.)

## Publicar no Cloudflare Pages (grátis)

Opção sem instalar nada (recomendada):

1. Crie uma conta em https://dash.cloudflare.com.
2. **Workers & Pages → Create → Pages → Upload assets**.
3. Dê um nome ao projeto (vira `<nome>.pages.dev`) e arraste a pasta `public/`.
4. Para atualizar: **Create new deployment** no mesmo projeto e arraste `public/` de novo.

Opção por linha de comando (baixa o wrangler via npx, não instala globalmente):

```bash
npx wrangler pages deploy public --project-name askwheel
```

A aba **Skill p/ Claude Code** monta o comando de instalação com o endereço do próprio site.

## Skill (opcional)

A skill coleta os mesmos dados (`collect.py`, mesma lógica do `app.js`), acrescenta análise do Claude (intenção, clusters, pautas, perguntas prioritárias) e gera um HTML único reaproveitando o site (`render.py` embute `index.html`, `style.css`, `app.js` e os dados). Os dados extras aparecem na aba **Extras (Claude)**.

## Limitações

- Sem volume de busca nem CPC.
- Endpoint do autocomplete não oficial: pode limitar ou mudar sem aviso.
- A lógica de agrupamento existe duas vezes (`app.js` e `collect.py`); mudanças precisam ir nas duas.
