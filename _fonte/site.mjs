export const origin = 'https://melbees.games';
export const languages = ['pt', 'en', 'es', 'fr'];
export const htmlLang = { pt: 'pt-BR', en: 'en', es: 'es', fr: 'fr' };
export const labels = {
  pt: { home: 'Início', jogo: 'Jogo', professores: 'Professores', speedrun: 'Speedrun', imprensa: 'Imprensa', sobre: 'Sobre', contato: 'Contato', privacidade: 'Privacidade', termos: 'Termos', 'como-jogar': 'Como jogar', estrategia: 'Estratégia', desafios: 'Desafios', language: 'Idioma', footer: 'Rodapé', close: 'Fechar', answer: 'Gabarito', pdf: 'PDF em português', legal: 'Ler a política de privacidade', conditions: 'Ler os termos de uso', favo: 'Desafio' },
  en: { home: 'Home', jogo: 'Game', professores: 'Teachers', speedrun: 'Speedrun', imprensa: 'Press', sobre: 'About', contato: 'Contact', privacidade: 'Privacy', termos: 'Terms', 'como-jogar': 'How to play', estrategia: 'Strategy', desafios: 'Puzzles', language: 'Language', footer: 'Footer', close: 'Close', answer: 'Answer key', pdf: 'PDF in Portuguese', legal: 'Read the privacy policy', conditions: 'Read the terms of use', favo: 'Honeycomb' },
  es: { home: 'Inicio', jogo: 'Juego', professores: 'Profesores', speedrun: 'Speedrun', imprensa: 'Prensa', sobre: 'Sobre', contato: 'Contacto', privacidade: 'Privacidad', termos: 'Términos', 'como-jogar': 'Cómo jugar', estrategia: 'Estrategia', desafios: 'Desafíos', language: 'Idioma', footer: 'Pie de página', close: 'Cerrar', answer: 'Soluciones', pdf: 'PDF en portugués', legal: 'Leer la política de privacidad (en inglés)', conditions: 'Leer los términos de uso (en inglés)', favo: 'Panal' },
  fr: { home: 'Accueil', jogo: 'Jeu', professores: 'Enseignants', speedrun: 'Speedrun', imprensa: 'Presse', sobre: 'À propos', contato: 'Contact', privacidade: 'Confidentialité', termos: 'Conditions', 'como-jogar': 'Comment jouer', estrategia: 'Stratégie', desafios: 'Défis', language: 'Langue', footer: 'Pied de page', close: 'Fermer', answer: 'Solutions', pdf: 'PDF en portugais', legal: 'Lire la politique de confidentialité (en anglais)', conditions: 'Lire les conditions d’utilisation (en anglais)', favo: 'Rayon' },
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
