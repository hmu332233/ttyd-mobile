import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { server } from './dev.mjs';

test('serves launcher assets and rejects invalid requests', async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [path, type] of [
      ['/?add=https://example.com/', 'text/html'],
      ['/app.js', 'text/javascript'],
      ['/styles.css', 'text/css'],
      ['/manifest.webmanifest', 'application/manifest+json'],
      ['/icons/icon.svg', 'image/svg+xml'],
      ['/icons/icon-192.png', 'image/png'],
    ]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.ok(response.headers.get('content-type').startsWith(type));
      const file = path.startsWith('/?') ? '/index.html' : path;
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),
        await readFile(new URL(`./public${file}`, import.meta.url)));
    }
    const head = await fetch(base, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    for (const [path, status] of [
      ['/missing', 404], ['/icons/', 404], ['/%ZZ', 400],
      ['/%00', 400], ['/..%2fpackage.json', 403],
    ]) {
      assert.equal((await fetch(base + path)).status, status, path);
    }
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
