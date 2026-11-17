# melbees.games

Gerar o site: `node _fonte/gerar.mjs` (Node 20 ou mais recente, sem dependências). Os HTMLs gerados são commitados; o GitHub Pages publica sem build.

Editar o corpo em `_fonte/conteudo/<idioma>/<id>.html`: fragmentos HTML UTF-8 sem BOM. As páginas novas e as traduções pendentes começam com a linha literal `RASCUNHO: texto a caminho`. Substitua a linha pelo HTML aprovado, sem documento completo, menu ou rodapé. O gerador nunca escreve nesses arquivos.

Rotas, títulos e rótulos: `_fonte/site.mjs`. Partes compartilhadas: `_fonte/partials/`. Dados dos desafios: `_fonte/tabuleiros.json`. Os SVGs foram incorporados dos materiais existentes; gerar o site não depende de nenhuma pasta externa. `_fonte/importar.mjs` registra a migração inicial do commit `0b1d10e` e recusa sobrescrever conteúdo existente.

Validar: `node --test tests/play.test.mjs tests/site.test.mjs`. Servir e verificar as URLs via HTTP local: `node tests/http.test.mjs`.

Os aliases `/professores/`, `/speedrun/`, `/about/`, `/contact/`, `/privacy/` e `/terms/` usam redirecionamento com fallback sem JavaScript. Preferências de idioma exibem somente uma sugestão com link; cada URL entrega o próprio idioma. `?lang=` é aceito como preferência para a faixa, sem redirecionamento automático.

## Publicar (guarda de push e ship leve)

Cada tarefa roda numa worktree ao lado do checkout principal (`git worktree add ../<nome> -b <branch> origin/main`) e chega ao `main` só por `node tools/ship.mjs`: árvore limpa, fetch, rebase em `origin/main`, `node _fonte/gerar.mjs` (a árvore tem de continuar limpa, os HTMLs gerados são commitados), `node --test tests/play.test.mjs tests/site.test.mjs tests/guard.test.mjs`, `node tests/http.test.mjs`, carimbo e push. Não há gate pesado: o site não tem build.

O carimbo é `<git-common-dir>/ship-stamps/<sha>.json` (sha e árvore). `tools/hooks/pre-push` (a lógica está em `pre-push.mjs`) recusa push ao `main` sem o carimbo do sha empurrado: `no ship stamp for <sha>`. Para ligar a guarda, uma vez, no checkout principal: `git -C C:\Melbees_marketing\site\melbees-site config core.hooksPath tools/hooks` (relativo: cada worktree roda a própria cópia versionada; uma worktree criada antes de `tools/hooks` existir precisa de rebase para ter a guarda). Só o Owner, por palavra dele, ignora a guarda com `MELBEES_SITE_ALLOW_UNGATED_PUSH=1`. Apagar o `main` também é recusado. Sem `node` no PATH o hook recusa push ao `main` (e deixa os outros refs passarem). O ship valida um commit só (sha capturado depois do rebase; HEAD e árvore não podem mudar durante o gerador e os testes) e empurra esse sha com a guarda desta worktree selecionada (`-c core.hooksPath`), então o primeiro ship vale mesmo antes do `core.hooksPath` do principal estar ligado. Limites herdados: o carimbo é um recibo local (sha e árvore), quem escreve na pasta `.git` ou edita o gancho versionado o forja; ele não prova o que rodou. O GitHub Pages também serve `tools/`; ali só há código sem segredo.

O claude2-plus (modo escrita, conta 3) aceita worktrees deste repo quando o `core.hooksPath` está ligado e a guarda recusa um push sem carimbo.

## Blog

Artigos em `_fonte/conteudo/<idioma>/blog/<slug>.html`. O nome do arquivo é o slug da URL (`a-z`, `0-9` e hífen; não pode ser `feed`, `index`, `serie`, `series`, `pagina` nem `page`). O arquivo tem um cabeçalho e, depois dele, o corpo em HTML. Pt e en publicam em `/blog/` e `/en/blog/`; es e fr funcionam com a mesma estrutura assim que houver um artigo publicado no idioma (veja "Séries").

Cabeçalho (copie e preencha; o arquivo começa na linha `---`, sem BOM):

```
---
titulo: Título do artigo
descricao: Uma ou duas frases, usadas na meta description e no RSS.
publicado: 2026-11-20
atualizado: 2026-11-21
serie: bastidores-do-dev
video: aqz-KE-bpKQ
traducao: en/slug-em-ingles
estado: rascunho
---
<p>Corpo do artigo, em HTML.</p>
```

- Uma chave por linha, no formato `chave: valor`. O valor vai até o fim da linha (pode ter `:`; não há valor em várias linhas nem aspas). Linhas em branco e linhas que começam com `#` são ignoradas.
- `estado` é obrigatório: `rascunho` ou `publicado`. Rascunho nunca gera página, lista, item de RSS, entrada de sitemap nem link de tradução; ele só precisa ter o cabeçalho bem formado.
- `titulo`, `descricao`, `publicado` e `serie` são obrigatórios em artigo publicado. `atualizado` é opcional e, sem ele, vale a data de `publicado`; as duas datas aparecem sempre na página. As datas são `AAAA-MM-DD`, reais, e `atualizado` não pode ser anterior a `publicado`. Não há agendamento: `publicado` com data futura sai na hora.
- `serie` é o id do registro `blogSeries` em `_fonte/site.mjs` (macetes-do-enem, ciencia-do-hug, quiz-explicado, duelo, bastidores-do-dev, novidades-do-jogo). Cada série tem o slug da URL e o nome por idioma; para publicar em es ou fr, acrescente ali o nome e o slug nesse idioma (o gerador avisa se faltar).
- `video` é o id do YouTube (11 caracteres). A página mostra a miniatura (`i.ytimg.com`, uma requisição externa de imagem, sem script) e só o clique carrega o player `youtube-nocookie.com` (`assets/blog.js`). Sem JavaScript, o link abre o vídeo no YouTube.
- `traducao` é opcional: `idioma/slug` do mesmo artigo em outro idioma (vários, separados por vírgula). Basta declarar de um lado; a relação vale nos dois sentidos. O hreflang e o botão de idioma só apontam para tradução publicada; apontar para um rascunho é permitido e não gera link. Dois artigos do mesmo idioma no mesmo grupo de tradução é erro.
- O corpo é um fragmento HTML confiável: sem `h1` (o título vem do cabeçalho), `script`, `iframe`, `style` nem documento completo, e com as tags balanceadas. O gerador recusa o resto com uma mensagem que cita o arquivo. Imagens do artigo ficam em `assets/blog/<slug>/`, nunca na pasta do blog.
- Artigo publicado com termo proibido no título, na descrição ou no corpo (`bannedCopy` em `_fonte/site.mjs`: travessão, "duelo", prêmio, sorteio, "sem chutar" e afins) derruba o gerador. Wordle e Termo valem em post e não estão na lista. Só o nome de uma série cadastrada, como "Duelo", aparece nas páginas geradas. O corpo de um rascunho não é validado, só o cabeçalho.

O que o gerador cria por idioma com ao menos um artigo publicado: índice `/blog/` (10 por página; `/blog/pagina/2/`), uma página por série com artigos (`/blog/serie/<slug>/`), uma página por artigo (`/blog/<slug>/`) e o RSS `/blog/feed.xml`. O item "Blog" entra no menu e no rodapé (depois de Imprensa) só desses idiomas. Páginas do blog entram no sitemap com `lastmod` (artigo: `atualizado`; listas: a maior data de atualização, uma aproximação: despublicar não aumenta a data), exceto as páginas 2 em diante das listas, que continuam rastreáveis por links. Os HTMLs do blog são apagados e recriados a cada execução, então despublicar um artigo remove a página (só `*.html` e `feed.xml` dentro das pastas `blog/` são apagados, e só depois de tudo ser validado). Com zero artigos publicados, nada do blog é gerado e os demais HTMLs ficam idênticos.

Os artigos `exemplo-de-artigo` (pt) e `example-blog-article` (en) são fixtures em rascunho, com texto neutro; os testes os usam para provar que rascunho não publica. Para ver a página, copie o repositório para outra pasta, troque `estado` para `publicado` na cópia e rode o gerador lá.
