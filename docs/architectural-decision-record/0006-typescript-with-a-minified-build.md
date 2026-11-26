# TypeScript, run directly by Node, with a minified build for the browser

Supersedes [0003](0003-jsdoc-checkjs-no-build.md).

All the code (the game, the service worker, the tests, the tools and the
calibration scripts) is TypeScript, type-checked by `tsc --noEmit` in strict
mode. The browser gets a build: `build.ts` uses esbuild to bundle the game,
with the JSON data it imports, into one minified script, minifies the service
worker, page and stylesheet, and writes the site to `dist/`. `pnpm start`
serves `dist/` and the deploy job publishes the same folder to GitHub Pages,
so what is played locally is exactly what is deployed.

Only erasable TypeScript syntax is used (`erasableSyntaxOnly`) and relative
imports name the `.ts` file, so Node 26 runs the sources directly: the tests,
tools and calibration scripts need no compile step, and the simulation is
still shared between the browser and Node unchanged.

## Why the change

- Types in the language rather than in comments: generics, interfaces and
  casts read naturally, and the JSDoc annotations no longer drift from the code.
- One minified script instead of about 70 modules fetched along an import
  chain: fewer round trips and fewer bytes on a first visit, still well inside
  the 2 MB and 2 second budget.
- The service worker's precache list is generated from the built page, so a
  missing runtime file can no longer be forgotten by hand.

## Considered Options

- **Keep JSDoc and no build (ADR-0003)**: rejected; see above.
- **TypeScript + Vite**: rejected. A dev server and its plugin pipeline are
  more than this needs; esbuild alone builds the site in well under a second.
- **`tsc` emitting JavaScript files**: rejected. It doesn't bundle or minify,
  so the browser would still walk the import chain.
