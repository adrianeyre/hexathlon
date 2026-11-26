/**
 * Writes every icon the site needs from the code-defined logo mark in
 * `tools/icon-art.js`, so no image editor or third-party asset is involved.
 * Run with `pnpm icons` after changing the art; the files are committed
 * because the site has no build step, and `test/pwa.test.js` fails if any is
 * stale.
 *
 * What each platform gets:
 *
 * - Browsers: `favicon.ico` (16, 32 and 48 px, for legacy browsers and
 *   Windows), `icons/favicon.svg` (sharp at any size), and PNG favicons at 16,
 *   32, 48 and 96 px (Google Search wants a multiple of 48 px).
 * - iOS and iPadOS: Apple touch icons at 180 (iPhone), 167 (iPad Pro), 152
 *   (iPad) and 120 px (older iPhones), on a full-bleed square because iOS
 *   rounds the corners itself.
 * - Android, ChromeOS and desktop installs (web app manifest): 192 and 512 px
 *   rounded icons, maskable 192 and 512 px versions with the mark inside the
 *   safe zone, and a monochrome version for themed icons.
 * - Windows tiles: `browserconfig.xml` with 70, 150, 310 and 310x150 px tiles.
 * - Safari pinned tabs and the macOS Touch Bar: a one-colour mask SVG.
 * - A 1024 px master for app stores, structured data and anything else.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { svg, rasterise } from './icon-art.ts';
import { encodePngRgba } from './png.ts';

/** The page and tile background, matching the manifest and the game. */
export const THEME = '#10162f';

export interface PngSpec {
  width: number;
  height: number;
  tile: import('./icon-art.ts').Tile;
  scale?: number;
  simple?: boolean;
  /** Size of the mark in the image, if not the smaller side. */
  size?: number;
  monochrome?: string;
}

export function png({ width, height, ...options }: PngSpec) {
  return encodePngRgba(width, height, rasterise(width, height, options));
}

/**
 * A Windows .ico holding PNG images, which every browser since IE 11 reads.
 */
export function ico(sizes: number[]) {
  const images = sizes.map((size) => png({ width: size, height: size, tile: 'rounded', simple: true }));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // icon
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, i) => {
    const entry = 6 + 16 * i;
    header[entry] = size >= 256 ? 0 : size;
    header[entry + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(images[i].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[i].length;
  });
  return Buffer.concat([header, ...images]);
}

const browserconfig = `<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
  <msapplication>
    <tile>
      <square70x70logo src="icons/mstile-70x70.png"/>
      <square150x150logo src="icons/mstile-150x150.png"/>
      <wide310x150logo src="icons/mstile-310x150.png"/>
      <square310x310logo src="icons/mstile-310x310.png"/>
      <TileColor>${THEME}</TileColor>
    </tile>
  </msapplication>
</browserconfig>
`;

const square = (size: number, extra: Partial<PngSpec> = {}) => () => png({ width: size, height: size, tile: 'rounded', ...extra });

/**
 * Every generated file, relative to the repository root.
 */
export const ICONS: readonly { file: string; render: () => Buffer | string; }[] = Object.freeze([
  { file: 'favicon.ico', render: () => ico([16, 32, 48]) },
  { file: 'icons/favicon.svg', render: () => svg({ simple: true }) },
  { file: 'icons/icon.svg', render: () => svg() },
  { file: 'icons/safari-pinned-tab.svg', render: () => svg({ tile: 'none', monochrome: '#000000' }) },
  { file: 'icons/favicon-16x16.png', render: square(16, { simple: true }) },
  { file: 'icons/favicon-32x32.png', render: square(32, { simple: true }) },
  { file: 'icons/favicon-48x48.png', render: square(48, { simple: true }) },
  { file: 'icons/favicon-96x96.png', render: square(96) },
  { file: 'icons/apple-touch-icon.png', render: square(180, { tile: 'square' }) },
  { file: 'icons/apple-touch-icon-167x167.png', render: square(167, { tile: 'square' }) },
  { file: 'icons/apple-touch-icon-152x152.png', render: square(152, { tile: 'square' }) },
  { file: 'icons/apple-touch-icon-120x120.png', render: square(120, { tile: 'square' }) },
  { file: 'icons/icon-192.png', render: square(192) },
  { file: 'icons/icon-512.png', render: square(512) },
  { file: 'icons/icon-1024.png', render: square(1024) },
  { file: 'icons/icon-maskable-192.png', render: square(192, { tile: 'square', scale: 0.9 }) },
  { file: 'icons/icon-maskable-512.png', render: square(512, { tile: 'square', scale: 0.9 }) },
  { file: 'icons/icon-monochrome-512.png', render: square(512, { tile: 'none', monochrome: '#ffffff' }) },
  { file: 'icons/mstile-70x70.png', render: () => png({ width: 70, height: 70, tile: 'none', size: 56, simple: true }) },
  { file: 'icons/mstile-150x150.png', render: () => png({ width: 150, height: 150, tile: 'none', size: 96 }) },
  { file: 'icons/mstile-310x150.png', render: () => png({ width: 310, height: 150, tile: 'none', size: 96 }) },
  { file: 'icons/mstile-310x310.png', render: () => png({ width: 310, height: 310, tile: 'none', size: 190 }) },
  { file: 'browserconfig.xml', render: () => browserconfig },
]);

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = new URL('..', import.meta.url);
  mkdirSync(new URL('icons/', root), { recursive: true });
  for (const { file, render } of ICONS) {
    writeFileSync(new URL(file, root), render());
    console.log(`wrote ${file}`);
  }
}
