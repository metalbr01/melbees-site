# melbees.games

Gerar o site: `node _fonte/gerar.mjs` (Node 20 ou mais recente, sem dependências). Os HTMLs gerados são commitados; o GitHub Pages publica sem build.

Editar o corpo em `_fonte/conteudo/<idioma>/<id>.html`: fragmentos HTML UTF-8 sem BOM. As páginas novas e as traduções pendentes começam com a linha literal `RASCUNHO: texto a caminho`. Substitua a linha pelo HTML aprovado, sem documento completo, menu ou rodapé. O gerador nunca escreve nesses arquivos.

Rotas, títulos e rótulos: `_fonte/site.mjs`. Partes compartilhadas: `_fonte/partials/`. Dados dos desafios: `_fonte/tabuleiros.json`. Os SVGs foram incorporados dos materiais existentes; gerar o site não depende de nenhuma pasta externa. `_fonte/importar.mjs` registra a migração inicial do commit `0b1d10e` e recusa sobrescrever conteúdo existente.

Validar: `node --test tests/play.test.mjs tests/site.test.mjs`. Servir e verificar as URLs via HTTP local: `node tests/http.test.mjs`.

Os aliases `/professores/`, `/speedrun/`, `/about/`, `/contact/`, `/privacy/` e `/terms/` usam redirecionamento com fallback sem JavaScript. Preferências de idioma exibem somente uma sugestão com link; cada URL entrega o próprio idioma. `?lang=` é aceito como preferência para a faixa, sem redirecionamento automático.

## Publicar (guarda de push e ship leve)

Cada tarefa roda numa worktree ao lado do checkout principal (`git worktree add ../<nome> -b <branch> origin/main`) e chega ao `main` só por `node tools/ship.mjs`: árvore limpa, fetch, rebase em `origin/main`, `node _fonte/gerar.mjs` (a árvore tem de continuar limpa, os HTMLs gerados são commitados), `node --test tests/play.test.mjs tests/site.test.mjs tests/guard.test.mjs`, `node tests/http.test.mjs`, carimbo e push. Não há gate pesado: o site não tem build.

O carimbo é `<git-common-dir>/ship-stamps/<sha>.json` (sha e árvore). `tools/hooks/pre-push` (a lógica está em `pre-push.mjs`) recusa push ao `main` sem o carimbo do sha empurrado: `no ship stamp for <sha>`. Para ligar a guarda, uma vez, no checkout principal: `git -C C:\Melbees_marketing\site\melbees-site config core.hooksPath tools/hooks` (relativo: cada worktree roda a própria cópia versionada; uma worktree criada antes de `tools/hooks` existir precisa de rebase para ter a guarda). Só o Owner, por palavra dele, ignora a guarda com `MELBEES_SITE_ALLOW_UNGATED_PUSH=1`. Sem `node` no PATH o hook avisa e deixa passar. O GitHub Pages também serve `tools/`; ali só há código sem segredo.

O claude2-plus (modo escrita, conta 3) aceita worktrees deste repo quando o `core.hooksPath` está ligado e a guarda recusa um push sem carimbo.
