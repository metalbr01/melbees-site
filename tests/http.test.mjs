import assert from 'node:assert/strict';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { createServer } from './serve.mjs';
import { root, read, generated } from './helpers.mjs';
const server = createServer();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
let requests = 0;
try {
  const oldFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', '0b1d10e'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  const oldURLs = oldFiles.map(p => p.endsWith('index.html') ? '/' + p.slice(0, -10) : '/' + p);
  for (const url of new Set([...oldURLs, ...generated.map(p => p.path)])) {
    const response = await fetch(base + url); requests++;
    assert.equal(response.status, 200, url);
    await response.arrayBuffer();
  }
  for (const item of generated) {
    const query = '?s=instagram&cid=campaign&lang=fr&utm_content=card';
    const response = await fetch(base + item.path + query, { headers: { 'Accept-Language': 'fr-FR', 'User-Agent': 'Googlebot' } }); requests++;
    assert.equal(response.status, 200); assert.equal(await response.text(), read(item.file), item.path);
    const visitor = await fetch(base + item.path + query, { headers: { 'Accept-Language': 'en-US', 'User-Agent': 'Mozilla/5.0' } }); requests++;
    assert.equal(await visitor.text(), read(item.file), item.path);
  }
  for (const alias of ['/about', '/contact', '/privacy', '/terms', '/professores', '/speedrun']) {
    const response = await fetch(base + alias + '?s=test&cid=campaign', { redirect: 'manual' }); requests++;
    assert.equal(response.status, 301); assert.equal(response.headers.get('location'), alias + '/?s=test&cid=campaign');
  }
  const missing = await fetch(base + '/does-not-exist/'); requests++;
  assert.equal(missing.status, 404); assert.match(await missing.text(), /<footer>/);
  console.log(`HTTP OK: ${requests} GETs; ${oldURLs.length} legacy URLs, ${generated.length} HTML pages, aliases and 404. Robots and visitors receive identical HTML.`);
} finally {
  server.closeAllConnections(); server.close(); await once(server, 'close');
}
