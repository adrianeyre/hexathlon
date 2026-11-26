import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render/display.ts';
import { PALETTE } from '../render/palette.ts';
import { drawText } from '../render/text.ts';
import { tapIn, wasPressed } from './manager.ts';

/** One line of a text page: plain text, or a heading drawn in the highlight colour. */
export type PageLine = string | { text: string, heading?: boolean, scale?: number };

export interface TextPage {
  title: string;
  /** Upper case: the pixel font has no lower case. */
  lines: readonly PageLine[];
  /** An address the page can open in a new tab. */
  link?: { label: string, url: string };
  /** Scene to return to. */
  back: string;
}

/** Layout of a text page, in internal pixels. */
export const PAGE = Object.freeze({ top: 46, bottom: SCREEN_HEIGHT - 44, rowHeight: 11 });

/** The buttons along the bottom. */
export const PAGE_BUTTONS = Object.freeze({
  link: Object.freeze({ x: 6, y: SCREEN_HEIGHT - 36, w: 228, h: 22 }),
  back: Object.freeze({ x: SCREEN_WIDTH - 80, y: SCREEN_HEIGHT - 36, w: 74, h: 22 }),
});

/**
 * A page of text with an optional link, for the Cookie Policy and Credits.
 * Up and Down scroll when the text is longer than the screen (tapping the top
 * or bottom half of the text scrolls too). Left and Right move between the
 * link and BACK (BACK is picked to start with); START or ACTION picks;
 * Escape goes back.
 */
export function createTextPageScene(manager: import('./manager.ts').SceneChanger, services: import('./services.ts').Services, page: TextPage): import('./manager.ts').Scene & { readonly scroll: number; readonly focus: 'link' | 'back'; } {
  const visibleRows = Math.floor((PAGE.bottom - PAGE.top) / PAGE.rowHeight);
  const maxScroll = Math.max(0, page.lines.length - visibleRows);
  let scroll = 0;
  let focus: 'link' | 'back' = 'back';

  const open = () => {
    if (!page.link) return;
    services.sounds.select();
    services.openUrl?.(page.link.url);
  };
  const back = () => manager.change(page.back);

  const scrollBy = (direction: -1 | 1) => {
    const next = Math.max(0, Math.min(maxScroll, scroll + direction));
    if (next !== scroll) services.sounds.move();
    scroll = next;
  };

  return {
    get scroll() {
      return scroll;
    },
    get focus() {
      return focus;
    },

    enter() {
      scroll = 0;
      focus = 'back';
    },

    step(input) {
      if (wasPressed(input, 'UP')) scrollBy(-1);
      if (wasPressed(input, 'DOWN')) scrollBy(1);
      if (page.link && (wasPressed(input, 'LEFT') || wasPressed(input, 'RIGHT'))) {
        focus = focus === 'link' ? 'back' : 'link';
        services.sounds.move();
      }
      if (page.link && tapIn(input, PAGE_BUTTONS.link)) {
        open();
        return;
      }
      if (tapIn(input, PAGE_BUTTONS.back) || wasPressed(input, 'PAUSE')) {
        back();
        return;
      }
      if (tapIn(input, { x: 0, y: PAGE.top - 6, w: SCREEN_WIDTH, h: (PAGE.bottom - PAGE.top) / 2 })) scrollBy(-1);
      if (tapIn(input, { x: 0, y: (PAGE.top + PAGE.bottom) / 2, w: SCREEN_WIDTH, h: (PAGE.bottom - PAGE.top) / 2 })) scrollBy(1);
      if (wasPressed(input, 'START') || wasPressed(input, 'ACTION')) {
        if (focus === 'link') open();
        else back();
      }
    },

    render(ctx) {
      ctx.fillStyle = PALETTE.background;
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      drawText(ctx, page.title, SCREEN_WIDTH / 2, 22, { scale: 2, color: PALETTE.highlight });
      page.lines.slice(scroll, scroll + visibleRows).forEach((line, i) => {
        const { text, heading = false } = typeof line === 'string' ? { text: line } : line;
        drawText(ctx, text, SCREEN_WIDTH / 2, PAGE.top + i * PAGE.rowHeight, { color: heading ? PALETTE.highlight : PALETTE.text });
      });
      // Scroll hints, so it's clear there's more.
      if (scroll > 0) drawText(ctx, '▲', SCREEN_WIDTH - 10, PAGE.top, { color: PALETTE.dim });
      if (scroll < maxScroll) drawText(ctx, '▼', SCREEN_WIDTH - 10, PAGE.bottom - PAGE.rowHeight, { color: PALETTE.dim });
      const button = (r: { x: number; y: number; w: number; h: number; }, label: string, active: boolean) => {
        ctx.fillStyle = active ? PALETTE.accent : PALETTE.panel;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        drawText(ctx, active ? `▶ ${label}` : label, r.x + r.w / 2, r.y + r.h / 2, { color: active ? PALETTE.background : PALETTE.text });
      };
      if (page.link) button(PAGE_BUTTONS.link, page.link.label, focus === 'link');
      button(PAGE_BUTTONS.back, 'BACK', focus === 'back');
    },
  };
}

/** The Cookie Policy, in words a player can read in a minute. */
export const COOKIE_POLICY = Object.freeze(
  ({
    title: 'COOKIE POLICY',
    back: 'settings',
    lines: Object.freeze([
      { text: 'NO COOKIES', heading: true },
      'HEXATHLON DOES NOT SET ANY COOKIES.',
      'THERE ARE NO ADS, NO ANALYTICS AND NO TRACKING,',
      'AND NOTHING YOU DO IS SENT ANYWHERE.',
      '',
      { text: 'WHAT IS SAVED ON YOUR DEVICE', heading: true },
      "YOUR BROWSER'S LOCAL STORAGE KEEPS, ON THIS",
      'DEVICE ONLY:',
      '- SETTINGS: DIFFICULTY, FULL SCREEN, SOUND,',
      '  VOLUME AND REDUCED FLASH',
      '- YOUR CONTROLS, IF YOU REMAP THEM',
      '- PERSONAL BESTS AND THE HIGH SCORE TABLE',
      '  (THREE-LETTER INITIALS ONLY)',
      '',
      { text: 'OFFLINE PLAY', heading: true },
      'THE GAME KEEPS A COPY OF ITS OWN FILES IN',
      'YOUR BROWSER SO IT CAN BE PLAYED OFFLINE.',
      '',
      { text: 'CLEARING IT', heading: true },
      "CLEAR THIS SITE'S DATA IN YOUR BROWSER'S",
      'SETTINGS TO REMOVE ALL OF IT AT ANY TIME.',
    ]),
  } as TextPage),
);

/** The game's public repository. */
export const REPO_URL = 'https://github.com/adrianeyre/hexathlon';

/** The Credits, starting with the game's creator. Provenance in detail is in CREDITS.md. */
export const CREDITS = Object.freeze(
  ({
    title: 'CREDITS',
    back: 'settings',
    link: { label: 'GITHUB.COM/ADRIANEYRE/HEXATHLON', url: REPO_URL },
    lines: Object.freeze([
      { text: 'CREATED BY', heading: true },
      'ADRIAN EYRE',
      '',
      { text: 'ART, MUSIC AND SOUND', heading: true },
      'ORIGINAL PIXEL ART, FONT, THEME, INTRO FANFARE',
      'AND SOUND EFFECTS, ALL MADE FOR HEXATHLON',
      'AND DRAWN OR SYNTHESISED IN CODE',
      '',
      { text: 'COLOUR', heading: true },
      'ACCENT COLOURS FROM THE OKABE-ITO COLOUR-BLIND',
      'SAFE SET. COLOUR-VISION CHECKS AFTER MACHADO,',
      'OLIVEIRA AND FERNANDES (2009)',
      '',
      { text: 'BUILT WITH', heading: true },
      'HTML, JAVASCRIPT AND CANVAS. CHECKED WITH',
      'TYPESCRIPT, SERVED LOCALLY WITH HTTP-SERVER',
      '',
      { text: 'LICENCE', heading: true },
      'MIT. SEE CREDITS.MD IN THE REPOSITORY',
      '',
      'THANKS FOR PLAYING!',
    ]),
  } as TextPage),
);
