import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const games = ['pong', 'frogger', 'space-invaders', 'asteroids', 'snake', 'gauntlet'];
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

test('homepage copy reflects all six games and includes inline game previews', async () => {
  const html = await read('index.html');
  assert.match(html, /Six arcade classics/);
  assert.match(html, /<title>Retro Arcade/);
  assert.match(html, /<h1 id="welcome">Retro<br><span>Arcade\.<\/span><\/h1>/);
  assert.doesNotMatch(html, /\bgift\b/i);
  assert.doesNotMatch(html, /Miles/i);
  assert.match(html, /BUILT FOR ARCADE FANS/);
  assert.doesNotMatch(html, /fencer/i);
  assert.doesNotMatch(html, /fencing/i);
  assert.match(html, /06 CLASSICS \/ FREE PLAY/);
  assert.match(html, /SIX GAMES\./);
  assert.doesNotMatch(html, /five (?:arcade classics|games)/i);
  const grid = html.match(/<div class="game-grid">([\s\S]*?)<\/section>/);
  assert.ok(grid);
  assert.equal([...grid[1].matchAll(/class="game-card /g)].length, games.length);
  const card = grid[1].match(/<a class="game-card snake"[\s\S]*?<\/a>/);
  assert.ok(card);
  assert.match(card[0], /<svg viewBox=/);
  assert.match(card[0], /id="snake-description"/);
  assert.match(card[0], /id="snake-controls"/);
  const gauntlet = grid[1].match(/<a class="game-card gauntlet"[\s\S]*?<\/a>/);
  assert.ok(gauntlet);
  assert.match(gauntlet[0], /<svg viewBox=/);
  assert.match(gauntlet[0], /id="gauntlet-description"/);
  assert.match(gauntlet[0], /id="gauntlet-controls"/);
});

test('homepage no longer ships mascots', async () => {
  const html = await read('index.html');
  const css = await read('assets/arcade.css');
  assert.doesNotMatch(css, /fencer/i);
  assert.doesNotMatch(html, /mascot/i);
  assert.doesNotMatch(css, /mascot/i);
  assert.doesNotMatch(html, /Pixel Pip|Princess Plum/i);
  assert.doesNotMatch(css, /pixel-pip|princess-plum/i);
});

test('Snake exposes instructions, live status, touch controls and visible focus', async () => {
  const html = await read('games/snake/index.html');
  const css = await read('games/snake/style.css');
  const main = await read('games/snake/main.js');
  assert.match(html, /<canvas[^>]*tabindex="0"[^>]*aria-describedby="instructions status"/);
  assert.match(html, /id="status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="instructions"/);
  assert.match(html, /id="start"[^>]*>Start game/);
  assert.match(html, /id="pause"[^>]*disabled/);
  for (const direction of ['up', 'down', 'left', 'right']) {
    assert.match(html, new RegExp(`data-direction="${direction}" aria-label="Move ${direction}"`));
  }
  assert.match(css, /button:focus-visible/);
  assert.match(css, /canvas:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  const page = new URL('games/snake/main.js', 'https://example.com/retro-arcade/');
  for (const [, reference] of main.matchAll(/from '([^']+)'/g)) {
    assert.ok(reference.startsWith('./'));
    const resolved = new URL(reference, page);
    assert.ok(resolved.pathname.startsWith('/retro-arcade/games/snake/'));
    await access(new URL(resolved.pathname.slice('/retro-arcade/'.length), root));
  }
});

test('Gauntlet exposes keyboard instructions, status and touch controls', async () => {
  const html = await read('games/gauntlet/index.html');
  const css = await read('games/gauntlet/style.css');
  assert.match(html, /<canvas[^>]*tabindex="0"[^>]*aria-describedby="instructions status"/);
  assert.match(html, /id="status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="start"[^>]*>Start run/);
  assert.match(html, /id="attack"[^>]*>Attack/);
  for (const direction of ['up', 'down', 'left', 'right']) {
    assert.match(html, new RegExp(`data-direction="${direction}" aria-label="Move ${direction}"`));
  }
  assert.match(css, /button:focus-visible/);
  assert.match(css, /canvas:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
