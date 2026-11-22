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
  pt: { category: 'categoria', page: 'pagina' }, en: { category: 'category', page: 'page' },
  es: { category: 'categoria', page: 'pagina' }, fr: { category: 'categorie', page: 'page' },
};
// The ids are what an article writes in `categorias:`. Each language has its own URL slug and display name; bg/ink are the card and badge colours.
// host is the host character of the category (a key of blogHosts, a different one per category, Owner 18/11/2026): its art heads
// the article and its avatar marks the category button and badge.
// Owner copy rules for blog articles (title, description, body). Wordle and Termo are allowed in posts (CLAUDE.md), so they are not listed.
export const bannedCopy = /\u2014|adsense|destaque do google|loja em destaque|sem anúncios|sem chutar|feito no brasil|from brazil|nova temporada|\bpr[eê]mios?\b|\bsorteios?\b|\bprizes?\b|\bsweepstakes?\b/iu;
export const blogCategories = {
  ciencia: { slug: { pt: 'ciencia', en: 'science', es: 'ciencia', fr: 'science' }, name: { pt: 'Ciência', en: 'Science', es: 'Ciencia', fr: 'Science' }, bg: '#DFF2E7', ink: '#16774A', host: 'hug' },
  educacao: { slug: { pt: 'educacao', en: 'education', es: 'educacion', fr: 'education' }, name: { pt: 'Educação', en: 'Education', es: 'Educación', fr: 'Éducation' }, bg: '#FCE3A0', ink: '#8A5A06', host: 'lil' },
  cultura: { slug: { pt: 'cultura', en: 'culture', es: 'cultura', fr: 'culture' }, name: { pt: 'Cultura', en: 'Culture', es: 'Cultura', fr: 'Culture' }, bg: '#F9DDE1', ink: '#A3324A', host: 'flo' },
  puzzle: { slug: { pt: 'puzzle', en: 'puzzle', es: 'puzzle', fr: 'puzzle' }, name: { pt: 'Puzzle', en: 'Puzzle', es: 'Puzzle', fr: 'Puzzle' }, bg: '#E9E2F6', ink: '#5B3FA0', host: 'dot' },
  jogos: { slug: { pt: 'jogos', en: 'games', es: 'juegos', fr: 'jeux' }, name: { pt: 'Jogos', en: 'Games', es: 'Juegos', fr: 'Jeux' }, bg: '#F1E4CB', ink: '#4A3414', host: 'red' },
  musical: { slug: { pt: 'musical', en: 'music', es: 'musical', fr: 'musique' }, name: { pt: 'Musical', en: 'Music', es: 'Musical', fr: 'Musique' }, bg: '#DCEBF7', ink: '#1F5E9A', host: 'mel' },
  news: { slug: { pt: 'news', en: 'news', es: 'noticias', fr: 'actualites' }, name: { pt: 'News', en: 'News', es: 'Noticias', fr: 'Actualités' }, bg: '#FBE2CC', ink: '#A4520E', host: 'lum' },
};
// Host characters of the blog (Melbees Arts ids). Each key has assets/blog/hosts/<key>.webp (the hub's fullbody/default.512.webp
// at 360 px high; size is its width and height) and <key>-avatar.webp (portrait/avatar.png at 96x96), both webp quality 80.
export const blogHosts = {
  hug: { id: 'friend_hug_hummingbird', size: [332, 360], name: { pt: 'Hug, o professor', en: 'Hug, the teacher', es: 'Hug, el profesor', fr: 'Hug, le professeur' } },
  lil: { id: 'friend_lil_worker', size: [396, 360], name: { pt: 'Lil', en: 'Lil', es: 'Lil', fr: 'Lil' } },
  flo: { id: 'friend_flo_butterfly', size: [370, 360], name: { pt: 'Flo', en: 'Flo', es: 'Flo', fr: 'Flo' } },
  dot: { id: 'friend_dot_ladybug', size: [286, 360], name: { pt: 'Dot', en: 'Dot', es: 'Dot', fr: 'Dot' } },
  red: { id: 'friend_red_miningbee', size: [282, 360], name: { pt: 'Red', en: 'Red', es: 'Red', fr: 'Red' } },
  mel: { id: 'friend_mel_queen', size: [287, 360], name: { pt: 'Mel', en: 'Mel', es: 'Mel', fr: 'Mel' } },
  lum: { id: 'friend_lum_firefly', size: [361, 360], name: { pt: 'Lum', en: 'Lum', es: 'Lum', fr: 'Lum' } },
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
  pt: { minRead: 'min de leitura', trending: 'Em alta agora', homeTitle: 'Em alta no blog', side: { title: 'Jogue agora', daily: ['Desafio diário', 'Forca com Campo Minado num favo de mel, grátis no navegador.'], duel: ['Duelo com um amigo', 'Crie uma sala e jogue ao vivo, sem instalar nada.'], how: ['Como jogar', 'As regras em poucos minutos.'], teachers: ['Para professores', 'Uma atividade de sala de aula com o jogo.'] },intro: 'Ciência, educação, cultura, puzzles, jogos e música. Tudo o que postamos nas redes, explicado com calma.', categories: 'Categorias', allCategories: 'Todas', emptyCategory: 'Ainda não há artigos nesta seção.', video: 'Vídeo', shortTitle: 'Assista ao Short do post', shortText: 'O vídeo que saiu nas redes. Ele só carrega quando você toca no play.', keepReading: 'Continue lendo', gallery: 'O post nas redes', galleryOf: 'de', by: 'Por', author: 'Melbees', published: 'Publicado em', updated: 'Atualizado em', crumbs: 'Trilha de navegação', all: 'Todos os artigos', page: 'Página', paging: 'Paginação', newer: 'Mais recentes', older: 'Mais antigos', watch: 'Assistir ao vídeo', watchOn: 'Assistir no YouTube', rss: 'Assinar por RSS', lead: 'Quer ver na prática? Jogue o Diário de hoje.', play: 'Jogar o Diário no navegador', empty: 'Nenhum artigo nesta lista.' },
  en: { minRead: 'min read', trending: 'Trending now', homeTitle: 'Trending on the blog', side: { title: 'Play now', daily: ['Daily Challenge', 'Hangman meets Minesweeper on a honeycomb, free in your browser.'], duel: ['Duel a friend', 'Create a room and play live, nothing to install.'], how: ['How to play', 'The rules in a few minutes.'], teachers: ['For teachers', 'A classroom activity built on the game.'] },intro: 'Science, education, culture, puzzles, games and music. Everything we post on social media, explained at an easy pace.', categories: 'Categories', allCategories: 'All', emptyCategory: 'There are no articles in this section yet.', video: 'Video', shortTitle: 'Watch the post’s Short', shortText: 'The video that went out on social media. It only loads when you tap play.', keepReading: 'Keep reading', gallery: 'The post on social media', galleryOf: 'of', by: 'By', author: 'Melbees', published: 'Published on', updated: 'Updated on', crumbs: 'Breadcrumbs', all: 'All articles', page: 'Page', paging: 'Pagination', newer: 'Newer', older: 'Older', watch: 'Watch the video', watchOn: 'Watch on YouTube', rss: 'Subscribe by RSS', lead: 'Want to see it in action? Play today’s Daily.', play: 'Play the Daily in your browser', empty: 'No articles in this list.' },
  es: { minRead: 'min de lectura', trending: 'En tendencia', homeTitle: 'En tendencia en el blog', side: { title: 'Juega ahora', daily: ['Desafío diario', 'Ahorcado con Buscaminas en un panal, gratis en el navegador.'], duel: ['Duelo con un amigo', 'Crea una sala y juega en vivo, sin instalar nada.'], how: ['Cómo jugar', 'Las reglas en pocos minutos.'], teachers: ['Para docentes', 'Una actividad de aula con el juego.'] },intro: 'Ciencia, educación, cultura, puzzles, juegos y música. Todo lo que publicamos en las redes, explicado con calma.', categories: 'Categorías', allCategories: 'Todas', emptyCategory: 'Todavía no hay artículos en esta sección.', video: 'Vídeo', shortTitle: 'Mira el Short del post', shortText: 'El vídeo que salió en las redes. Solo se carga cuando tocas el play.', keepReading: 'Sigue leyendo', gallery: 'El post en las redes', galleryOf: 'de', by: 'Por', author: 'Melbees', published: 'Publicado el', updated: 'Actualizado el', crumbs: 'Ruta de navegación', all: 'Todos los artículos', page: 'Página', paging: 'Paginación', newer: 'Más recientes', older: 'Más antiguos', watch: 'Ver el vídeo', watchOn: 'Ver en YouTube', rss: 'Suscribirse por RSS', lead: '¿Quieres verlo en acción? Juega el Desafío diario de hoy.', play: 'Juega el Desafío diario en tu navegador', empty: 'No hay artículos en esta lista.' },
  fr: { minRead: 'min de lecture', trending: 'À la une', homeTitle: 'À la une du blog', side: { title: 'Jouez maintenant', daily: ['Défi du jour', 'Pendu et Démineur sur un rayon de miel, gratuit dans le navigateur.'], duel: ['Duel avec un ami', 'Créez une salle et jouez en direct, rien à installer.'], how: ['Comment jouer', 'Les règles en quelques minutes.'], teachers: ['Pour les enseignants', 'Une activité de classe autour du jeu.'] },intro: 'Science, éducation, culture, puzzles, jeux et musique. Tout ce que nous publions sur les réseaux, expliqué sans se presser.', categories: 'Catégories', allCategories: 'Toutes', emptyCategory: 'Il n’y a pas encore d’articles dans cette section.', video: 'Vidéo', shortTitle: 'Regardez le Short du post', shortText: 'La vidéo publiée sur les réseaux. Elle ne se charge que si vous touchez lecture.', keepReading: 'Continuer la lecture', galleryOf: 'sur', gallery: 'Le post sur les réseaux', by: 'Par', author: 'Melbees', published: 'Publié le', updated: 'Mis à jour le', crumbs: 'Fil d’Ariane', all: 'Tous les articles', page: 'Page', paging: 'Pagination', newer: 'Plus récents', older: 'Plus anciens', watch: 'Regarder la vidéo', watchOn: 'Regarder sur YouTube', rss: 'S’abonner par RSS', lead: 'Envie de le voir en action ? Jouez au Défi du jour.', play: 'Jouer au Défi du jour dans le navigateur', empty: 'Aucun article dans cette liste.' },
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
