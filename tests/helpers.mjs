import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pages, languages, redirects, filename } from '../_fonte/site.mjs';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const read = p => fs.readFileSync(path.join(root, p), 'utf8');
export const generated = [
  ...pages.flatMap(page => languages.map(lang => ({ page, lang, path: page.paths[lang], file: filename(page.paths[lang]) }))),
  ...redirects.map(redirect => ({ page: pages.find(p => p.id === redirect.id), lang: 'pt', path: redirect.path, file: filename(redirect.path), redirect })),
];
export function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/\s([\w:-]+)(?:="([^"]*)")?/g)].map(m => [m[1], (m[2] || '').replaceAll('&amp;', '&').replaceAll('&quot;', '"')]));
}
export function publicFiles(dir = root, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['.git', '_fonte', 'tests'].includes(entry.name)) return [];
    const name = prefix + entry.name;
    return entry.isDirectory() ? publicFiles(path.join(dir, entry.name), name + '/') : [name];
  });
}
