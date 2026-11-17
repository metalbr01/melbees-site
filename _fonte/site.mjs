export const origin = 'https://melbees.games';
export const languages = ['pt', 'en', 'es', 'fr'];
export const htmlLang = { pt: 'pt-BR', en: 'en', es: 'es', fr: 'fr' };
export const labels = {
  pt: { home: 'Início', jogo: 'Jogo', professores: 'Professores', speedrun: 'Speedrun', imprensa: 'Imprensa', sobre: 'Sobre', contato: 'Contato', privacidade: 'Privacidade', termos: 'Termos', 'como-jogar': 'Como jogar', estrategia: 'Estratégia', desafios: 'Desafios', language: 'Idioma', footer: 'Rodapé', close: 'Fechar', answer: 'Gabarito', pdf: 'PDF em português', legal: 'Ler a política de privacidade', conditions: 'Ler os termos de uso', favo: 'Desafio', blog: 'Blog' },
  en: { home: 'Home', jogo: 'Game', professores: 'Teachers', speedrun: 'Speedrun', imprensa: 'Press', sobre: 'About', contato: 'Contact', privacidade: 'Privacy', termos: 'Terms', 'como-jogar': 'How to play', estrategia: 'Strategy', desafios: 'Puzzles', language: 'Language', footer: 'Footer', close: 'Close', answer: 'Answer key', pdf: 'PDF in Portuguese', legal: 'Read the privacy policy', conditions: 'Read the terms of use', favo: 'Honeycomb', blog: 'Blog' },
  es: { home: 'Inicio', jogo: 'Juego', professores: 'Profesores', speedrun: 'Speedrun', imprensa: 'Prensa', sobre: 'Sobre', contato: 'Contacto', privacidade: 'Privacidad', termos: 'Términos', 'como-jogar': 'Cómo jugar', estrategia: 'Estrategia', desafios: 'Desafíos', language: 'Idioma', footer: 'Pie de página', close: 'Cerrar', answer: 'Soluciones', pdf: 'PDF en portugués', legal: 'Leer la política de privacidad (en inglés)', conditions: 'Leer los términos de uso (en inglés)', favo: 'Panal', blog: 'Blog' },
  fr: { home: 'Accueil', jogo: 'Jeu', professores: 'Enseignants', speedrun: 'Speedrun', imprensa: 'Presse', sobre: 'À propos', contato: 'Contact', privacidade: 'Confidentialité', termos: 'Conditions', 'como-jogar': 'Comment jouer', estrategia: 'Stratégie', desafios: 'Défis', language: 'Langue', footer: 'Pied de page', close: 'Fermer', answer: 'Solutions', pdf: 'PDF en portugais', legal: 'Lire la politique de confidentialité (en anglais)', conditions: 'Lire les conditions d’utilisation (en anglais)', favo: 'Rayon', blog: 'Blog' },
};

// Blog: words inside the URLs, the series registry and the interface strings. Adding es or fr later means
// adding content files and the series names below; no generator change.
export const blogRoutes = {
  pt: { series: 'serie', page: 'pagina' }, en: { series: 'series', page: 'page' },
  es: { series: 'serie', page: 'pagina' }, fr: { series: 'serie', page: 'page' },
};
// The id is what an article writes in `serie:`. Each language needs its own URL slug and display name.
// Owner copy rules for blog articles (title, description, body). Wordle and Termo are allowed in posts (CLAUDE.md), so they are not listed.
export const bannedCopy = /\u2014|\bduelo\b|adsense|destaque do google|loja em destaque|sem anúncios|sem chutar|feito no brasil|from brazil|nova temporada|\bpr[eê]mios?\b|\bsorteios?\b|\bprizes?\b|\bsweepstakes?\b/iu;
export const blogSeries = {
  'macetes-do-enem': { slug: { pt: 'macetes-do-enem', en: 'enem-tips' }, name: { pt: 'Macetes do Enem', en: 'Enem tips' } },
  'ciencia-do-hug': { slug: { pt: 'ciencia-do-hug', en: 'science-of-hug' }, name: { pt: 'A ciência do Hug', en: 'The science of Hug' } },
  'quiz-explicado': { slug: { pt: 'quiz-explicado', en: 'quiz-explained' }, name: { pt: 'Quiz explicado', en: 'Quiz explained' } },
  duelo: { slug: { pt: 'duelo', en: 'duel' }, name: { pt: 'Duelo', en: 'Duel' } },
  'bastidores-do-dev': { slug: { pt: 'bastidores-do-dev', en: 'dev-behind-the-scenes' }, name: { pt: 'Bastidores do dev', en: 'Dev behind the scenes' } },
  'novidades-do-jogo': { slug: { pt: 'novidades-do-jogo', en: 'game-updates' }, name: { pt: 'Novidades do jogo', en: 'Game updates' } },
};
const months = {
  pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
};
// Fixed formats (no Intl): the output must not depend on the machine's ICU data or time zone.
export const formatDate = (iso, lang) => {
  const [y, m, d] = iso.split('-').map(Number);
  const month = months[lang][m - 1];
  return { pt: `${d} de ${month} de ${y}`, en: `${month} ${d}, ${y}`, es: `${d} de ${month} de ${y}`, fr: `${d} ${month} ${y}` }[lang];
};
export const daily = { pt: 'https://diario.melbees.games/', en: 'https://daily.melbees.games/', es: 'https://daily.melbees.games/', fr: 'https://daily.melbees.games/' };
export const blogText = {
  pt: { intro: 'Artigos do estúdio Melbees sobre o jogo, o desenvolvimento e o que aprendemos pelo caminho.', by: 'Por', author: 'Melbees', published: 'Publicado em', updated: 'Atualizado em', crumbs: 'Trilha de navegação', series: 'Série', allSeries: 'Séries', more: 'Mais nesta série', all: 'Todos os artigos', page: 'Página', paging: 'Paginação', newer: 'Mais recentes', older: 'Mais antigos', watch: 'Assistir ao vídeo', watchOn: 'Assistir no YouTube', rss: 'Assinar por RSS', lead: 'Quer ver na prática? Jogue o Diário de hoje.', play: 'Jogar o Diário no navegador', empty: 'Nenhum artigo nesta lista.' },
  en: { intro: 'Articles from the Melbees studio about the game, its development and what we learn along the way.', by: 'By', author: 'Melbees', published: 'Published on', updated: 'Updated on', crumbs: 'Breadcrumbs', series: 'Series', allSeries: 'Series', more: 'More in this series', all: 'All articles', page: 'Page', paging: 'Pagination', newer: 'Newer', older: 'Older', watch: 'Watch the video', watchOn: 'Watch on YouTube', rss: 'Subscribe by RSS', lead: 'Want to see it in action? Play today’s Daily.', play: 'Play the Daily in your browser', empty: 'No articles in this list.' },
  es: { intro: 'Artículos del estudio Melbees sobre el juego, su desarrollo y lo que aprendemos por el camino.', by: 'Por', author: 'Melbees', published: 'Publicado el', updated: 'Actualizado el', crumbs: 'Ruta de navegación', series: 'Serie', allSeries: 'Series', more: 'Más de esta serie', all: 'Todos los artículos', page: 'Página', paging: 'Paginación', newer: 'Más recientes', older: 'Más antiguos', watch: 'Ver el vídeo', watchOn: 'Ver en YouTube', rss: 'Suscribirse por RSS', lead: '¿Quieres verlo en acción? Juega el Desafío diario de hoy.', play: 'Juega el Desafío diario en tu navegador', empty: 'No hay artículos en esta lista.' },
  fr: { intro: 'Articles du studio Melbees sur le jeu, son développement et ce que nous apprenons en chemin.', by: 'Par', author: 'Melbees', published: 'Publié le', updated: 'Mis à jour le', crumbs: 'Fil d’Ariane', series: 'Série', allSeries: 'Séries', more: 'Plus dans cette série', all: 'Tous les articles', page: 'Page', paging: 'Pagination', newer: 'Plus récents', older: 'Plus anciens', watch: 'Regarder la vidéo', watchOn: 'Regarder sur YouTube', rss: 'S’abonner par RSS', lead: 'Envie de le voir en action ? Jouez au Défi du jour.', play: 'Jouer au Défi du jour dans le navigateur', empty: 'Aucun article dans cette liste.' },
};
const page = (id, paths, existing = false) => ({ id, paths: Object.fromEntries(languages.map((l, i) => [l, paths[i]])), existing });
const translated = (suffix) => languages.map(l => `${l === 'pt' ? '' : '/' + l}${suffix}`);
export const pages = [
  page('home', translated('/'), true),
  page('jogo', translated('/secret-of-bees/'), true),
  page('professores', translated('/secret-of-bees/professores/'), true),
  page('speedrun', translated('/secret-of-bees/speedrun/'), true),
  page('imprensa', translated('/secret-of-bees/press/'), true),
  page('como-jogar', ['/secret-of-bees/como-jogar/', '/en/secret-of-bees/how-to-play/', '/es/secret-of-bees/como-jugar/', '/fr/secret-of-bees/comment-jouer/']),
  page('estrategia', ['/secret-of-bees/estrategia/', '/en/secret-of-bees/strategy/', '/es/secret-of-bees/estrategia/', '/fr/secret-of-bees/strategie/']),
  page('desafios', ['/secret-of-bees/desafios/', '/en/secret-of-bees/puzzles/', '/es/secret-of-bees/desafios/', '/fr/secret-of-bees/defis/']),
  page('sobre', ['/sobre/', '/en/about/', '/es/sobre/', '/fr/a-propos/']),
  page('contato', ['/contato/', '/en/contact/', '/es/contacto/', '/fr/contact/']),
  page('privacidade', ['/privacidade/', '/en/privacy/', '/es/privacidad/', '/fr/confidentialite/']),
  page('termos', ['/termos/', '/en/terms/', '/es/terminos/', '/fr/conditions/']),
  page('404', ['/404.html', '/en/404.html', '/es/404.html', '/fr/404.html'], true),
];
export const byId = Object.fromEntries(pages.map(p => [p.id, p]));
export const redirects = [
  { path: '/professores/', id: 'professores', fallback: '?s=curto&c=professores' },
  { path: '/speedrun/', id: 'speedrun', fallback: '?s=curto' },
  ...Object.entries({ about: 'sobre', contact: 'contato', privacy: 'privacidade', terms: 'termos' }).map(([slug, id]) => ({ path: `/${slug}/`, id, fallback: '' })),
];
export const filename = path => path.endsWith('/') ? path.slice(1) + 'index.html' : path.slice(1);
export const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
