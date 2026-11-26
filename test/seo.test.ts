import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Search and social metadata (docs/seo-and-icons.md). The deployed site's
 * address is written into index.html, robots.txt and sitemap.xml because the
 * site has no build step; these tests keep them in step with each other and
 * with the files they point at.
 */
const SITE = 'https://adrianeyre.github.io/hexathlon/';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const html = read('index.html');

function meta(attr: 'name' | 'property', key: string) {
  const tag = [...html.matchAll(/<meta\s[^>]*?>/gs)].map((m) => m[0]).find((t) => t.includes(`${attr}="${key}"`));
  assert.ok(tag, `<meta ${attr}="${key}"> is missing`);
  const content = /content="([^"]*)"/s.exec(tag);
  assert.ok(content, `<meta ${attr}="${key}"> has no content`);
  return content[1].replace(/\s+/g, ' ').trim();
}

/** Width and height of a PNG. @param path */
function pngSize(path: string) {
  const buf = readFileSync(join(ROOT, path));
  assert.equal(buf.subarray(1, 4).toString(), 'PNG', `${path} is a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** The local file an absolute site URL refers to. @param url */
function local(url: string) {
  assert.ok(url.startsWith(SITE), `${url} is on ${SITE}`);
  return url.slice(SITE.length);
}

describe('search engine metadata', () => {
  it('has a title and description of a length search results show in full', () => {
    const title = /<title>([^<]+)<\/title>/.exec(html)?.[1] ?? '';
    assert.ok(title.includes('Hexathlon'));
    assert.ok(title.length >= 30 && title.length <= 60, `title is ${title.length} characters`);
    const description = meta('name', 'description');
    assert.ok(description.length >= 120 && description.length <= 200, `description is ${description.length} characters`);
  });

  it('declares the language, a canonical URL and that it may be indexed', () => {
    assert.match(html, /<html lang="en-GB"/);
    assert.match(html, new RegExp(`<link rel="canonical" href="${SITE}"`));
    assert.match(meta('name', 'robots'), /^index, follow/);
  });

  it('has a heading and summary for crawlers and screen readers, since the game is a canvas', () => {
    assert.match(html, /<h1 class="visually-hidden">[^<]*Hexathlon/);
    assert.match(read('css/style.css'), /\.visually-hidden\s*\{[^}]*clip-path: inset\(50%\)/);
  });

  it('has valid schema.org structured data describing the game', () => {
    const json = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
    assert.ok(json, 'JSON-LD is missing');
    const data = JSON.parse(json);
    const game = data['@graph'].find((n: any) => [n['@type']].flat().includes('VideoGame'));
    assert.ok(game);
    assert.equal(game.name, 'Hexathlon');
    assert.equal(game.url, SITE);
    assert.equal(game.gameItem.length, 6);
    assert.equal(game.offers.price, '0');
    for (const key of ['image', 'thumbnailUrl']) assert.ok(existsSync(join(ROOT, local(game[key]))), `${key} exists`);
  });

  it('robots.txt allows crawling and points at the sitemap, which lists the site', () => {
    const robots = read('robots.txt');
    assert.match(robots, /User-agent: \*\nAllow: \//);
    assert.match(robots, new RegExp(`Sitemap: ${SITE}sitemap\\.xml`));
    const sitemap = read('sitemap.xml');
    assert.match(sitemap, new RegExp(`<loc>${SITE}</loc>`));
    for (const [, url] of sitemap.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)) assert.ok(existsSync(join(ROOT, local(url))));
  });

  it('only links to the site at its one address', () => {
    for (const file of ['index.html', 'robots.txt', 'sitemap.xml']) {
      for (const [url] of read(file).matchAll(/https:\/\/adrianeyre\.github\.io\/[^\s"<]*/g)) assert.ok(url.startsWith(SITE), `${file}: ${url}`);
    }
  });
});

describe('social sharing previews', () => {
  it('has Open Graph tags for Facebook, LinkedIn, WhatsApp, Slack and others', () => {
    assert.equal(meta('property', 'og:type'), 'website');
    assert.equal(meta('property', 'og:url'), SITE);
    assert.equal(meta('property', 'og:site_name'), 'Hexathlon');
    assert.ok(meta('property', 'og:title').includes('Hexathlon'));
    assert.ok(meta('property', 'og:description').length > 50);
    assert.ok(meta('property', 'og:image:alt').length > 20);
  });

  it('has a 1200x630 share image that exists, with its size declared', () => {
    const image = meta('property', 'og:image');
    assert.deepEqual(pngSize(local(image)), { width: 1200, height: 630 });
    assert.equal(meta('property', 'og:image:width'), '1200');
    assert.equal(meta('property', 'og:image:height'), '630');
    assert.equal(meta('property', 'og:image:type'), 'image/png');
    assert.ok(readFileSync(join(ROOT, local(image))).length < 1024 * 1024, 'under 1 MB, so every network fetches it');
  });

  it('has a large X (Twitter) card with the same title, description and image', () => {
    assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
    assert.equal(meta('name', 'twitter:title'), meta('property', 'og:title'));
    assert.equal(meta('name', 'twitter:description'), meta('property', 'og:description'));
    assert.equal(meta('name', 'twitter:image'), meta('property', 'og:image'));
  });
});

describe('icons for every platform', () => {
  const links = (rel: string) => [...html.matchAll(new RegExp(`<link rel="${rel}"[^>]*>`, 'g'))].map((m) => m[0]);
  const href = (tag: string) => /href="([^"]+)"/.exec(tag)?.[1] ?? '';

  it('links a .ico, an SVG and PNG favicons that exist', () => {
    const icons = links('icon');
    assert.ok(icons.some((t) => href(t) === 'favicon.ico'));
    assert.ok(icons.some((t) => t.includes('image/svg+xml')));
    for (const size of [16, 32, 48, 96]) {
      const tag = icons.find((t) => t.includes(`sizes="${size}x${size}"`) && t.includes('image/png'));
      assert.ok(tag, `${size}px favicon`);
      assert.deepEqual(pngSize(href(tag)), { width: size, height: size });
    }
  });

  it('links Apple touch icons for iPhone and iPad at their stated sizes', () => {
    for (const tag of links('apple-touch-icon')) {
      const size = /sizes="(\d+)x\d+"/.exec(tag)?.[1] ?? '180';
      assert.deepEqual(pngSize(href(tag)), { width: Number(size), height: Number(size) });
    }
    assert.equal(links('apple-touch-icon').length, 5);
  });

  it('has a Safari pinned-tab mask and Windows tiles', () => {
    assert.ok(existsSync(join(ROOT, href(links('mask-icon')[0]))));
    assert.equal(meta('name', 'msapplication-config'), 'browserconfig.xml');
    for (const [, src] of read('browserconfig.xml').matchAll(/src="([^"]+)"/g)) assert.ok(existsSync(join(ROOT, src)), src);
  });
});
