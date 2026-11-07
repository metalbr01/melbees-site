# Missão 210, estágio 1

06/11/2026. Branch `adsense-210`. Trabalho restrito a este checkout. Sem push, publicação, alteração remota ou acesso a credenciais.

Commit da implementação: `2225ea4` (`feat(site): generate localized static pages and shared navigation for issue 210`). Este relatório entra no commit seguinte, com a mensagem `docs(site): record issue 210 stage 1 validation and handoff`.

Estrutura entregue: gerador Node sem dependências, parciais de head/cabeçalho/menu/rodapé, 52 páginas em quatro idiomas e 6 aliases. Há 48 URLs no sitemap; as quatro páginas 404 e os seis aliases usam `noindex`. O deploy continua usando os HTMLs commitados, sem build.

Gerar: `node _fonte/gerar.mjs`. O corpo de cada página vem de `_fonte/conteudo/<idioma>/<id>.html`. O gerador somente lê esses fragmentos. Os textos existentes foram separados por idioma; os corpos novos não foram redigidos.

## URLs

Todos os caminhos abaixo usam a origem `https://melbees.games`. A matriz é também o inventário das 52 páginas com corpo próprio.

| Página | pt | en | es | fr |
|---|---|---|---|---|
| Início | `/` | `/en/` | `/es/` | `/fr/` |
| Jogo | `/secret-of-bees/` | `/en/secret-of-bees/` | `/es/secret-of-bees/` | `/fr/secret-of-bees/` |
| Professores | `/secret-of-bees/professores/` | `/en/secret-of-bees/professores/` | `/es/secret-of-bees/professores/` | `/fr/secret-of-bees/professores/` |
| Speedrun | `/secret-of-bees/speedrun/` | `/en/secret-of-bees/speedrun/` | `/es/secret-of-bees/speedrun/` | `/fr/secret-of-bees/speedrun/` |
| Imprensa | `/secret-of-bees/press/` | `/en/secret-of-bees/press/` | `/es/secret-of-bees/press/` | `/fr/secret-of-bees/press/` |
| Como jogar | `/secret-of-bees/como-jogar/` | `/en/secret-of-bees/how-to-play/` | `/es/secret-of-bees/como-jugar/` | `/fr/secret-of-bees/comment-jouer/` |
| Estratégia | `/secret-of-bees/estrategia/` | `/en/secret-of-bees/strategy/` | `/es/secret-of-bees/estrategia/` | `/fr/secret-of-bees/strategie/` |
| Desafios | `/secret-of-bees/desafios/` | `/en/secret-of-bees/puzzles/` | `/es/secret-of-bees/desafios/` | `/fr/secret-of-bees/defis/` |
| Sobre | `/sobre/` | `/en/about/` | `/es/sobre/` | `/fr/a-propos/` |
| Contato | `/contato/` | `/en/contact/` | `/es/contacto/` | `/fr/contact/` |
| Privacidade | `/privacidade/` | `/en/privacy/` | `/es/privacidad/` | `/fr/confidentialite/` |
| Termos | `/termos/` | `/en/terms/` | `/es/terminos/` | `/fr/conditions/` |
| 404 | `/404.html` | `/en/404.html` | `/es/404.html` | `/fr/404.html` |

Os aliases abaixo também têm menu, rodapé, privacidade e `noindex`. A versão sem barra final é atendida pela normalização de diretório do servidor, preservando a query.

| Alias | Destino |
|---|---|
| `/professores/` | `/secret-of-bees/professores/` |
| `/speedrun/` | `/secret-of-bees/speedrun/` |
| `/about/` | `/sobre/` |
| `/contact/` | `/contato/` |
| `/privacy/` | `/privacidade/` |
| `/terms/` | `/termos/` |

Os caminhos anteriores de imagens, PDF, arquivos de parciais, configurações e anúncios técnicos permanecem disponíveis. `sitemap.xml` e `robots.txt` foram atualizados; `_fonte/` e `tests/` estão em `Disallow`.

## Verificação

`node --test tests/play.test.mjs tests/site.test.mjs`: **28 testes aprovados, zero falhas**. São 12 testes de atribuição/navegação e 16 de estrutura e comportamento do site.

Cobertura: links internos e fragmentos; imagens/scripts/CSS locais; menu e rodapé; privacidade; ausência dos antigos blocos de idioma e das expressões vetadas; HTML/SVG balanceado; idioma da URL; canonical próprio; quatro alternates e `x-default`; sitemap; links legais; marcadores e fragmentos de fonte; sugestão de idioma; fechamento da faixa; armazenamento indisponível; query e hash; aliases; selos Microsoft; integridade dos tabuleiros; UTF-8 válido sem BOM; arquivos protegidos; geração determinística byte a byte.

`node tests/http.test.mjs`: **271 GETs aprovados** em servidor HTTP local. Foram atendidas as 98 URLs/arquivos do commit anterior e todas as 58 páginas geradas. Também foram verificadas as formas curtas sem barra, queries e o retorno 404. As respostas HTML foram idênticas para robô/visitante, com idiomas de navegador diferentes.

`git diff --check`: aprovado. Os caminhos protegidos não têm diff; SHA-256 registrado em `_fonte/protegidos.json` confirma os bytes de `ads.txt`, `app-ads.txt`, `CNAME`, `.nojekyll`, `secret-of-bees/app-update.json`, todos os `.lss` e também `assets/play.js`.

O servidor persistente de conferência foi iniciado com `node tests/serve.mjs`. A ferramenta de inspeção visual não conseguiu conectar: o host de navegador e o canal nativo estavam indisponíveis. Portanto, não houve inspeção visual em navegador nem conferência visual da impressão. A validação dos SVGs, das regras de impressão e dos comportamentos de navegação foi feita por testes locais; esta limitação permanece para a revisão do CMO.

## Tabuleiros

Foram incorporados os seis desafios de `professores/boards.json` e os tabuleiros existentes em `criadores/favo/boards.json`: dois em inglês, três em espanhol e dois em francês. Nenhum desses idiomas ficou sem tabuleiro.

Os desenhos incorporam a geometria, letras, flores e estados dos SVGs já renderizados nos materiais autorizados. Os gabaritos usam os dados `solution` originais e ficam em `<details>`. Os testes recalculam vizinhança e Pólen pela geometria, verificam as máscaras e confirmam solução única nos 13 tabuleiros. Não foi gerada arte nova nem copiado outro material de imagem.

O PDF existente é ligado em todas as páginas de desafios, com indicação de que está em português. A impressão oculta a navegação e os gabaritos fechados; abrir um gabarito permite imprimi-lo em página própria. A geração normal é independente das pastas externas.

## Conteúdo pendente e decisões para revisão

Há **35 fontes com somente `RASCUNHO: texto a caminho`**. São as sete páginas novas (`como-jogar`, `estrategia`, `desafios`, `sobre`, `contato`, `privacidade`, `termos`) nos quatro idiomas, mais estas sete traduções não feitas:

- `_fonte/conteudo/en/professores.html`
- `_fonte/conteudo/es/professores.html`
- `_fonte/conteudo/fr/professores.html`
- `_fonte/conteudo/es/imprensa.html`
- `_fonte/conteudo/fr/imprensa.html`
- `_fonte/conteudo/es/speedrun.html`
- `_fonte/conteudo/fr/speedrun.html`

O corpo editorial desses arquivos aguarda o modelo responsável. A estrutura de desafios e os links para os documentos legais são acrescentados pelo gerador, fora do fragmento editorial. As políticas não foram copiadas: português aponta ao documento `pt-BR`; inglês, espanhol e francês apontam ao documento `en`. Os links espanhol e francês indicam o idioma do documento.

As páginas com marcador continuam indexáveis e entram no sitemap, conforme a estrutura solicitada para esta etapa. Antes de qualquer publicação, o CMO deve receber os textos aprovados, substituir os marcadores, regenerar e validar. O commit desta etapa ainda contém esses marcadores de propósito.

Preferências de idioma nunca causam navegação automática. A ordem da sugestão é `?lang=`, preferência salva e idiomas do navegador. O seletor usa links reais e salva `melbees-lang`. Query e hash acompanham os links; quando já existe `lang`, seu valor acompanha o idioma escolhido para evitar uma sugestão contraditória na chegada. O fechamento da faixa vale na sessão para o par de idiomas.

`assets/play.js` ficou byte a byte igual. `assets/navigation.js` complementa a propagação de query em links `keep-src`, inclusive visitas contendo somente `cid`. Um `cid` explícito e válido chega à Microsoft quando não há origem/campanha válida; quando há, prevalece a atribuição já feita por `play.js`. Os testes anteriores foram mantidos e adaptados às quantidades de botões por URL, com cobertura adicional das traduções.

Nos textos antigos, foram removidas somente alegações vetadas pelo briefing em Professores e Speedrun. Também foi retirado do Speedrun em português o exemplo compartilhado de nome de sala que estava apenas em inglês. A descrição acessível bilíngue do SVG explicativo do jogo foi separada nas versões pt/en; es/fr usam o nome do jogo nesse título, sem tradução inventada. Os demais textos localizados foram preservados. Títulos, navegação e metadados agora seguem o idioma da URL.

Aliases e páginas 404 têm canonical próprio e alternates para o conjunto correspondente. O GitHub Pages continua usando `/404.html` em português como resposta para um caminho inexistente; as outras três 404 têm URLs explícitas. Nenhuma preferência altera esse conteúdo.

O próximo passo editorial está documentado no README. O push permanece a cargo do CMO após o sim do Owner.
