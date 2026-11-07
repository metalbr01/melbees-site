# melbees.games

Gerar o site: `node _fonte/gerar.mjs` (Node 20 ou mais recente, sem dependências). Os HTMLs gerados são commitados; o GitHub Pages publica sem build.

Editar o corpo em `_fonte/conteudo/<idioma>/<id>.html`: fragmentos HTML UTF-8 sem BOM. As páginas novas e as traduções pendentes começam com a linha literal `RASCUNHO: texto a caminho`. Substitua a linha pelo HTML aprovado, sem documento completo, menu ou rodapé. O gerador nunca escreve nesses arquivos.

Rotas, títulos e rótulos: `_fonte/site.mjs`. Partes compartilhadas: `_fonte/partials/`. Dados dos desafios: `_fonte/tabuleiros.json`. Os SVGs foram incorporados dos materiais existentes; gerar o site não depende de nenhuma pasta externa. `_fonte/importar.mjs` registra a migração inicial do commit `0b1d10e` e recusa sobrescrever conteúdo existente.

Validar: `node --test tests/play.test.mjs tests/site.test.mjs`. Servir e verificar as URLs via HTTP local: `node tests/http.test.mjs`.

Os aliases `/professores/`, `/speedrun/`, `/about/`, `/contact/`, `/privacy/` e `/terms/` usam redirecionamento com fallback sem JavaScript. Preferências de idioma exibem somente uma sugestão com link; cada URL entrega o próprio idioma. `?lang=` é aceito como preferência para a faixa, sem redirecionamento automático.
