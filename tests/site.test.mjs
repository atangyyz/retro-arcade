import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const games = ['pong', 'frogger', 'space-invaders', 'asteroids'];
const read = path => readFile(new URL(path, root), 'utf8');

test('homepage offers exactly one same-tab link to each playable game', async () => {
  const html = await read('index.html');
  const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)];
  const gameLinks = links.filter(([, href]) => href.startsWith('./games/'));
  assert.equal(gameLinks.length, games.length);
  for (const game of games) {
    const link = gameLinks.find(([, href]) => href === `./games/${game}/index.html`);
    assert.ok(link, `Missing ${game} card`);
    assert.doesNotMatch(link[0], /target=|tabindex="-1"/);
    assert.match(link[0], /aria-labelledby=/);
    await access(new URL(link[1], root));
  }
  assert.match(html, /class="skip-link" href="#games"/);
  assert.match(html, /id="games"[^>]*tabindex="-1"/);
});

for (const game of games) {
  test(`${game} has a keyboard-accessible return link under a Pages project subpath`, async () => {
    const html = await read(`games/${game}/index.html`);
    const link = html.match(/<a\b[^>]*class="arcade-navigation"[^>]*>([^<]+)<\/a>/);
    assert.ok(link, 'Missing return link');
    assert.match(link[1], /Back to Arcade/);
    assert.match(link[0], /href="\.\.\/\.\.\/index\.html"/);
    assert.doesNotMatch(link[0], /tabindex=|target=/);
    const page = new URL(`games/${game}/index.html`, 'https://example.com/retro-arcade/');
    assert.equal(new URL('../../index.html', page).pathname, '/retro-arcade/index.html');
    if (game === 'asteroids') {
      assert.match(html, /class="brand" href="\.\.\/\.\.\/index\.html" aria-label="Retro Arcade home"/);
    }
  });
}

test('all page assets and links resolve locally and stay within the Pages project', async () => {
  const pages = ['index.html', ...games.map(game => `games/${game}/index.html`)];
  const base = new URL('https://example.com/retro-arcade/');
  for (const path of pages) {
    const html = await read(path);
    for (const [, reference] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (reference.startsWith('#') || reference.startsWith('data:image/')) continue;
      assert.doesNotMatch(reference, /^(?:\/|[a-z]+:)/i, `${path}: non-relative reference`);
      const resolved = new URL(reference, new URL(path, base));
      assert.ok(resolved.pathname.startsWith(base.pathname), `${path}: escaped project subpath`);
      await access(new URL(resolved.pathname.slice(base.pathname.length), root));
    }
  }
});

test('shared styles retain visible focus and reduced-motion support', async () => {
  const homepage = await read('assets/arcade.css');
  const navigation = await read('assets/navigation.css');
  assert.match(homepage, /:focus-visible/);
  assert.match(navigation, /:focus-visible/);
  assert.match(homepage, /prefers-reduced-motion:\s*reduce/);
  assert.match(homepage, /scroll-behavior:\s*auto/);
  assert.match(homepage, /transition:\s*none/);
});
