import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pages, languages, redirects, filename } from '../_fonte/site.mjs';
import { loadBlog, planPages, feedPath } from '../_fonte/blog.mjs';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const read = p => fs.readFileSync(path.join(root, p), 'utf8');
export const generated = [
  ...pages.flatMap(page => languages.map(lang => ({ page, lang, path: page.paths[lang], file: filename(page.paths[lang]) }))),
  ...redirects.map(redirect => ({ page: pages.find(p => p.id === redirect.id), lang: 'pt', path: redirect.path, file: filename(redirect.path), redirect })),
];
// Blog pages that the committed sources publish. Zero while every article is a draft.
export const blogGenerated = (() => {
  const blog = loadBlog(path.join(root, '_fonte/conteudo'));
  return {
    pages: planPages(blog).map(p => ({ ...p, article: undefined, items: undefined })),
    feeds: blog.langs.map(lang => ({ lang, path: feedPath(lang), file: filename(feedPath(lang)) })),
  };
})();
export function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/\s([\w:-]+)(?:="([^"]*)")?/g)].map(m => [m[1], (m[2] || '').replaceAll('&amp;', '&').replaceAll('&quot;', '"')]));
}
export function publicFiles(dir = root, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['.git', '.dev', '_fonte', 'tests'].includes(entry.name)) return [];
    const name = prefix + entry.name;
    return entry.isDirectory() ? publicFiles(path.join(dir, entry.name), name + '/') : [name];
  });
}

/** A header + body article file, as an editor would write it. */
export function article({ title = 'Título de teste', description = 'Descrição de teste.', published = '2026-11-20', updated, series = 'bastidores-do-dev', video, translation, state = 'publicado', body = '<p>Texto de teste.</p>' } = {}) {
  const lines = ['---', ...(title === null ? [] : [`titulo: ${title}`]), `descricao: ${description}`, `publicado: ${published}`, ...(updated ? [`atualizado: ${updated}`] : []), `serie: ${series}`, ...(video ? [`video: ${video}`] : []), ...(translation ? [`traducao: ${translation}`] : []), `estado: ${state}`, '---', body];
  return lines.join('\n') + '\n';
}

/**
 * A throwaway copy of the generator, assets and ads.txt in the OS temp folder, with the blog sources replaced by
 * `files` ({ 'pt/slug': text }). The repository is never written.
 */
export function makeSite(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'melbees-blog-'));
  for (const p of ['_fonte', 'assets', 'ads.txt']) fs.cpSync(path.join(root, p), path.join(dir, p), { recursive: true });
  for (const lang of languages) fs.rmSync(path.join(dir, '_fonte/conteudo', lang, 'blog'), { recursive: true, force: true });
  const site = {
    dir,
    read: p => fs.readFileSync(path.join(dir, p), 'utf8'),
    exists: p => fs.existsSync(path.join(dir, p)),
    set(key, text) { const [lang, slug] = key.split('/'); const f = path.join(dir, '_fonte/conteudo', lang, 'blog', `${slug}.html`); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text, 'utf8'); },
    remove(key) { const [lang, slug] = key.split('/'); fs.rmSync(path.join(dir, '_fonte/conteudo', lang, 'blog', `${slug}.html`)); },
    generate() {
      try { return { ok: true, out: execFileSync(process.execPath, ['_fonte/gerar.mjs'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }) }; }
      catch (e) { return { ok: false, out: String(e.stderr || e.message) }; }
    },
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
  for (const [key, text] of Object.entries(files)) site.set(key, text);
  return site;
}
