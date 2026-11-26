# Plain JavaScript with JSDoc types checked by tsc, no build step

**Superseded** by [0006](0006-typescript-with-a-minified-build.md): the code is now TypeScript with a minified build.

The code is plain ES modules annotated with JSDoc and type-checked with `tsc --checkJs --noEmit` in CI. This gives type safety on the event interface and the data schemas while keeping deployment as "push to deploy" from the branch on GitHub Pages.

## Considered Options

- **Untyped plain JS**: rejected. Sim modules are shared between the browser and Node, and the parameters are data-driven, so schema drift would only show up at runtime.
- **TypeScript + Vite**: rejected for now. It adds a build step and a deploy pipeline for little extra benefit at this size.
