# melbees.games

Gerar o site: `node _fonte/gerar.mjs` (Node 20 ou mais recente, sem dependências). Os HTMLs gerados são commitados; o GitHub Pages publica sem build.

Editar o corpo em `_fonte/conteudo/<idioma>/<id>.html`: fragmentos HTML UTF-8 sem BOM. As páginas novas e as traduções pendentes começam com a linha literal `RASCUNHO: texto a caminho`. Substitua a linha pelo HTML aprovado, sem documento completo, menu ou rodapé. O gerador nunca escreve nesses arquivos.

Rotas, títulos e rótulos: `_fonte/site.mjs`. Partes compartilhadas: `_fonte/partials/`. Dados dos desafios: `_fonte/tabuleiros.json`. Os SVGs foram incorporados dos materiais existentes; gerar o site não depende de nenhuma pasta externa. `_fonte/importar.mjs` registra a migração inicial do commit `0b1d10e` e recusa sobrescrever conteúdo existente.

Validar: `node --test tests/play.test.mjs tests/site.test.mjs`. Servir e verificar as URLs via HTTP local: `node tests/http.test.mjs`.

Os aliases `/professores/`, `/speedrun/`, `/about/`, `/contact/`, `/privacy/` e `/terms/` usam redirecionamento com fallback sem JavaScript. Preferências de idioma exibem somente uma sugestão com link; cada URL entrega o próprio idioma. `?lang=` é aceito como preferência para a faixa, sem redirecionamento automático.

## Publicar (guarda de push e ship leve)

Cada tarefa roda numa worktree ao lado do checkout principal (`git worktree add ../<nome> -b <branch> origin/main`) e chega ao `main` só por `node tools/ship.mjs`: árvore limpa, fetch, rebase em `origin/main`, `node _fonte/gerar.mjs` (a árvore tem de continuar limpa, os HTMLs gerados são commitados), `node --test tests/play.test.mjs tests/site.test.mjs tests/guard.test.mjs tests/campo-minado.test.mjs`, `node tests/http.test.mjs`, carimbo e push. Não há gate pesado: o site não tem build.

O carimbo é `<git-common-dir>/ship-stamps/<sha>.json` (sha e árvore). `tools/hooks/pre-push` (a lógica está em `pre-push.mjs`) recusa push ao `main` sem o carimbo do sha empurrado: `no ship stamp for <sha>`. Para ligar a guarda, uma vez, no checkout principal: `git -C C:\Melbees_marketing\site\melbees-site config core.hooksPath tools/hooks` (relativo: cada worktree roda a própria cópia versionada; uma worktree criada antes de `tools/hooks` existir precisa de rebase para ter a guarda). Só o Owner, por palavra dele, ignora a guarda com `MELBEES_SITE_ALLOW_UNGATED_PUSH=1`. Apagar o `main` também é recusado. Sem `node` no PATH o hook recusa push ao `main` (e deixa os outros refs passarem). O ship valida um commit só (sha capturado depois do rebase; HEAD e árvore não podem mudar durante o gerador e os testes) e empurra esse sha com a guarda desta worktree selecionada (`-c core.hooksPath`), então o primeiro ship vale mesmo antes do `core.hooksPath` do principal estar ligado. Limites herdados: o carimbo é um recibo local (sha e árvore), quem escreve na pasta `.git` ou edita o gancho versionado o forja; ele não prova o que rodou. O GitHub Pages também serve `tools/`; ali só há código sem segredo.

O claude2-plus (modo escrita, conta 3) aceita worktrees deste repo quando o `core.hooksPath` está ligado e a guarda recusa um push sem carimbo.

## Blog

Artigos em `_fonte/conteudo/<idioma>/blog/<slug>.html`. O nome do arquivo é o slug da URL (`a-z`, `0-9` e hífen; não pode ser `feed`, `index`, `categoria`, `category`, `categorie`, `pagina` nem `page`). O arquivo tem um cabeçalho e, depois dele, o corpo em HTML. Pt e en publicam em `/blog/` e `/en/blog/`; es e fr funcionam com a mesma estrutura assim que houver um artigo publicado no idioma (nomes e slugs das categorias já existem nos quatro idiomas).

Cabeçalho (copie e preencha; o arquivo começa na linha `---`, sem BOM):

```
---
titulo: Título do artigo
descricao: Uma ou duas frases, usadas na meta description e no RSS.
publicado: 2026-11-20
atualizado: 2026-11-21
categorias: educacao, musical
balao: Frase curta do anfitrião no cabeçalho.
galeria: arte-1.webp|Texto alternativo; arte-2.webp|Outro texto
video: aqz-KE-bpKQ
traducao: en/slug-em-ingles
estado: rascunho
---
<p>Corpo do artigo, em HTML.</p>
```

- Uma chave por linha, no formato `chave: valor`. O valor vai até o fim da linha (pode ter `:`; não há valor em várias linhas nem aspas). Linhas em branco e linhas que começam com `#` são ignoradas.
- `estado` é obrigatório: `rascunho` ou `publicado`. Rascunho nunca gera página, lista, item de RSS, entrada de sitemap nem link de tradução; ele só precisa ter o cabeçalho bem formado.
- `titulo`, `descricao`, `publicado` e `categorias` são obrigatórios em artigo publicado. `atualizado` é opcional e, sem ele, vale a data de `publicado`; as duas datas aparecem sempre na página. As datas são `AAAA-MM-DD`, reais, e `atualizado` não pode ser anterior a `publicado`. Não há agendamento: `publicado` com data futura sai na hora.
- `categorias` é uma lista separada por vírgula com ids do registro `blogCategories` em `_fonte/site.mjs`: `ciencia`, `educacao`, `cultura`, `puzzle`, `jogos`, `musical`, `news` (sem repetir). Um artigo pode ter várias: cada uma vira um selo, o artigo aparece na página de cada categoria, e a primeira dá a cor do cartão e do cabeçalho, o anfitrião (um diferente por categoria, decisão do Owner de 18/11/2026: Hug em ciência, Lil em educação, Flo em cultura, Dot em puzzle, Red em jogos, Mel em musical, Lum em news), o breadcrumb e a categoria canônica de "Continue lendo". O registro guarda nome e slug por idioma (pt, en, es e fr já preenchidos), cor de fundo e do selo, e o anfitrião. A chave antiga `serie` é recusada com uma mensagem que aponta `categorias`.
- `balao` (opcional, 1 a 120 caracteres, texto simples) é a frase do balão do anfitrião no cabeçalho; sem ele não há balão. Passa pelo `bannedCopy`.
- `galeria` (opcional) lista as artes do post nas redes que viram um carrossel depois do texto: `arquivo.webp|Texto alternativo; outro.png|Outro texto`. Itens separados por `;`, arquivo e texto separados por exatamente um `|` (nenhum dos dois pode aparecer no texto alternativo). O arquivo é só um nome (`a-z`, `0-9`, `.`, `_`, `-`; `.webp`, `.png`, `.jpg`) em `assets/blog/<slug>/`, aparece uma vez só na lista e precisa existir em artigo publicado. A galeria nunca repete uma imagem que já aparece no corpo (comparação pelo nome do arquivo no `src` de cada `<img>`, sem `?` nem `#`; vale `src` com aspas duplas, simples, sem aspas ou com espaços em volta do `=`; `<img>` dentro de comentário e `data-src` não contam); sem imagens restantes, não há seção.
- `video` é o id do YouTube (11 caracteres). A página mostra a miniatura (`i.ytimg.com`, uma requisição externa de imagem, sem script) e só o clique carrega o player `youtube-nocookie.com` (`assets/blog.js`). Sem JavaScript, o link abre o vídeo no YouTube.
- `traducao` é opcional: `idioma/slug` do mesmo artigo em outro idioma (vários, separados por vírgula). Basta declarar de um lado; a relação vale nos dois sentidos. O hreflang e o botão de idioma só apontam para tradução publicada; apontar para um rascunho é permitido e não gera link. Dois artigos do mesmo idioma no mesmo grupo de tradução é erro.
- O corpo é um fragmento HTML confiável: sem `h1` (o título vem do cabeçalho), `script`, `iframe`, `style` nem documento completo, e com as tags balanceadas. O gerador recusa o resto com uma mensagem que cita o arquivo. Imagens do artigo ficam em `assets/blog/<slug>/`, nunca na pasta do blog.
- Artigo publicado com termo proibido no título, na descrição, no `balao`, na `galeria` ou no corpo (`bannedCopy` em `_fonte/site.mjs`: travessão, prêmio, sorteio, "sem chutar" e afins) derruba o gerador. Wordle e Termo valem em post e não estão na lista; "duelo" também saiu dela (o Duelo foi lançado na 1.0.42 e está no Diário web, na aba ao lado dos níveis). O corpo de um rascunho não é validado, só o cabeçalho.

O que o gerador cria por idioma com ao menos um artigo publicado: índice `/blog/` (10 por página; `/blog/pagina/2/`), uma página para cada uma das 7 categorias (`/blog/categoria/<slug>/`; en `/en/blog/category/<slug>/`; es `/es/blog/categoria/<slug>/`; fr `/fr/blog/categorie/<slug>/`), uma página por artigo (`/blog/<slug>/`) e o RSS `/blog/feed.xml` (uma `<category>` por categoria do artigo). Os botões de categoria do índice são links para essas páginas (funcionam sem JavaScript). Categoria sem artigo publicado continua tendo página, para o botão nunca levar a um 404: mostra "Ainda não há artigos nesta seção." (traduzido), é `noindex`, não leva a tag do AdSense, fica fora do sitemap e do hreflang e só tem a página 1. Quando o último artigo de uma categoria é despublicado, a página fica assim; quando o último artigo do idioma é despublicado, todas somem. As URLs `/blog/serie/...` do desenho anterior nunca foram publicadas, então não há redirecionamento. O item "Blog" entra no menu e no rodapé (depois de Imprensa) só desses idiomas. Páginas do blog entram no sitemap com `lastmod` (artigo: `atualizado`; listas: a maior data de atualização, uma aproximação: despublicar não aumenta a data), exceto as páginas 2 em diante das listas e as categorias vazias. Os HTMLs do blog são apagados e recriados a cada execução, então despublicar um artigo remove a página (só `*.html` e `feed.xml` dentro das pastas `blog/` são apagados, e só depois de tudo ser validado). Com zero artigos publicados, nada do blog é gerado e os demais HTMLs ficam idênticos.

Visual (Favo Vivo, BLOG-1): `assets/blog.css`, sem JavaScript novo. Índice e categorias: faixa de mel com Red, Mel e Hug, botões de categoria com o avatar do anfitrião de cada uma ("Todas" é um hexágono de mel), cartões na cor da primeira categoria com um selo por categoria (a miniatura é a primeira imagem do corpo, lida como na galeria; sem imagem, a arte do anfitrião). Artigo: cabeçalho na cor da primeira categoria com os selos (avatar do anfitrião de cada categoria), anfitrião e balão, o Short em moldura 9:16 com play hexagonal logo antes do primeiro `h2` (a fachada de `blog.js`, que só carrega o player no clique), `details` como cartões de pergunta e resposta, galeria, cartão do Diário com a Mel e "Continue lendo" (4 artigos, os que dividem mais categorias primeiro). As artes dos anfitriões ficam em `assets/blog/hosts/`, registradas em `blogHosts` (`_fonte/site.mjs`) com o id do hub Melbees Arts e o tamanho: `<chave>.webp` (`hug.webp`, `lil.webp`...) é o `fullbody/default.512.webp` do hub com 360 px de altura e `<chave>-avatar.webp` é o `portrait/avatar.png` em 96x96, os dois webp qualidade 80 (Pillow, LANCZOS, method 6), sem editar a arte. Um teste exige um anfitrião diferente em cada categoria e os dois arquivos de cada um no tamanho declarado. Não há espaço de anúncio no blog além da tag do AdSense que o gerador já põe.

Puzzle das redes: é um artigo com `categorias: puzzle` (imagem do puzzle, texto curto de contexto e a resposta em `<details>`); não há outra fonte de dados.

Os artigos `exemplo-de-artigo` (pt) e `example-blog-article` (en) são fixtures em rascunho, com texto neutro; os testes os usam para provar que rascunho não publica. Os três artigos reais (`hug-abelhas-do-chao`, `enem-media-mediana-moda`, `desafie-um-amigo-ao-vivo`) estão em `estado: rascunho` até o sim do Owner; um teste os gera como publicados numa cópia temporária. Publicar um deles (trocar `estado`) não quebra a suíte: os testes passam a checar as páginas reais do blog com as mesmas regras das cópias temporárias (links, AdSense, texto proibido, idioma, `play.js`). Para ver a página, copie o repositório para outra pasta, troque `estado` para `publicado` na cópia e rode o gerador lá.

## Ferramenta: Campo Minado

Página `campo-minado` (`/ferramentas/campo-minado/`, `/en/tools/minesweeper/`, `/es/herramientas/buscaminas/`, `/fr/outils/demineur/`), fora do menu principal; o link está na faixa lateral do blog e nos recursos da home. O jogo é `assets/campo-minado.js` (UMD: no navegador monta a interface em `#campo-minado`, no Node exporta o núcleo) com `assets/campo-minado.css`, carregados só nessa página (`assets` em `site.mjs`). O texto da página fica em `_fonte/conteudo/<idioma>/campo-minado.html`; os textos da interface e das dicas do Hug estão em `TEXT` no JS (lê `<html lang>`). `?seed=` e `?level=beginner|intermediate|advanced` reproduzem tabuleiros. A dica do Hug nunca confia em bandeiras: só prova por contagem, subconjunto e enumeração das formas da borda (com o total de minas quando exato), e `tests/campo-minado.test.mjs` confere cada afirmação contra os tabuleiros reais e contra todas as disposições possíveis em tabuleiros pequenos. Não há espaço de anúncio na página além da tag do AdSense que o gerador já põe.
