import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const games = ['frogger', 'space-invaders', 'asteroids', 'tilt-dodger'];
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

test('Tilt Dodger gives keyboard players a larger, aligned portrait playfield', async () => {
  const css = await read('games/tilt-dodger/style.css');
  assert.match(css, /\.keyboard-controls \.arcade\s*\{\s*width:\s*min\(100% - 24px, 480px, 46\.667svh\);/);
  assert.match(css, /\.keyboard-controls \.flight-deck\s*\{\s*width:\s*100%;/);
  assert.match(css, /\.flight-deck\s*\{[^}]*aspect-ratio:\s*2 \/ 3;/);
  assert.match(css, /\.flight-mode \.flight-deck\s*\{[^}]*aspect-ratio:\s*auto;/);
  assert.match(css, /\.flight-mode canvas\s*\{[^}]*object-fit:\s*contain;/);
});

test('homepage theme toggle defaults to dark and supports a saved light theme', async () => {
  const html = await read('index.html');
  const css = await read('assets/arcade.css');
  const script = await read('assets/theme.js');
  assert.match(html, /<html lang="en" data-theme="dark">/);
  assert.match(html, /id="theme-toggle"[^>]*aria-label="Switch to light mode"/);
  assert.match(css, /:root\[data-theme="light"\]/);
  assert.match(script, /localStorage\.getItem\('retro-arcade-theme'\)/);
  assert.match(script, /localStorage\.setItem\('retro-arcade-theme', theme\)/);
  assert.match(script, /toggle\.addEventListener\('click'/);
});

test('homepage copy reflects all four games and includes inline game previews', async () => {
  const html = await read('index.html');
  assert.match(html, /Four arcade games/);
  assert.match(html, /<title>Retro Arcade/);
  assert.match(html, /<h1 id="welcome">Retro<br><span>Arcade\.<\/span><\/h1>/);
  assert.doesNotMatch(html, /\bgift\b/i);
  assert.doesNotMatch(html, /Miles/i);
  assert.match(html, /BUILT FOR ARCADE FANS/);
  assert.doesNotMatch(html, /fencer/i);
  assert.doesNotMatch(html, /fencing/i);
  assert.match(html, /04 GAMES \/ FREE PLAY/);
  assert.match(html, /FOUR GAMES\./);
  assert.doesNotMatch(html, /(?:seven|five) (?:arcade classics|games)/i);
  assert.doesNotMatch(html, /pong|snake|gauntlet/i);
  const grid = html.match(/<div class="game-grid">([\s\S]*?)<\/section>/);
  assert.ok(grid);
  assert.equal([...grid[1].matchAll(/class="game-card /g)].length, games.length);
  const dodger = grid[1].match(/<a class="game-card tilt-dodger"[\s\S]*?<\/a>/);
  assert.ok(dodger);
  assert.match(dodger[0], /<svg viewBox=/);
  assert.match(dodger[0], /id="tilt-dodger-description"/);
  assert.match(dodger[0], /id="tilt-dodger-controls"/);
});

test('homepage no longer ships mascot characters', async () => {
  const html = await read('index.html');
  const css = await read('assets/arcade.css');
  for (const source of [html, css]) {
    assert.doesNotMatch(source, /fencer/i);
    assert.doesNotMatch(source, /mascot/i);
    assert.doesNotMatch(source, /pixel[- ]pip/i);
    assert.doesNotMatch(source, /princess|plum/i);
  }
});
