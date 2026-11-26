# Deployment

[Back to README](../../README.md)

The deployed site is the minified build in `dist/` (`pnpm build`), the same
folder `pnpm start` serves locally. There is no backend.

## Releases

Every push to `main` runs the `release` job in `.github/workflows/ci.yml`
after the `check` job (type check, tests, build and size budget) has passed.
It runs [semantic-release](https://semantic-release.gitbook.io/)
(`.releaserc.json`), which:

1. reads the commits since the last `v*` tag as
   [Conventional Commits](https://www.conventionalcommits.org/): `fix:`
   makes a patch release, `feat:` a minor one, and `BREAKING CHANGE:` (or
   `feat!:`) a major one; other types (`docs:`, `refactor:`, `chore:` and so
   on) make no release;
2. sets the new version in `package.json` (no npm publish: the package is
   private) and commits it back to `main` as
   `chore(release): <version> [skip ci]`;
3. tags it `v<version>` and publishes the GitHub release notes.

The Settings screen shows `VERSION: <version>` from `package.json`, so the
built game always names its release. The first release is `1.0.0`.

The job uses the workflow's `GITHUB_TOKEN`. If `main` is protected so that
only pull requests may change it, allow GitHub Actions to push the release
commit (or give the job a token that may).

## GitHub Pages

The `deploy` job publishes `dist/` to GitHub Pages. It runs only on a push to
`main`, after the `release` job, and checks out `main` so the version just
released is the one built in.

Its steps:

1. Check out `main`, install, `actions/configure-pages`.
2. `pnpm build` with `SW_VERSION` set to the commit SHA (below).
3. `actions/upload-pages-artifact` with `dist/`.
4. `actions/deploy-pages`.

The Pages source must be set to "GitHub Actions" in the repository settings.

**The job is currently disabled.** Its condition starts with `false &&`,
because Pages on a private repository needs a paid plan. It is to be
enabled when the repository goes public, as part of the v1.0 release issue
(#65), by deleting `false &&` from the `if:` line.

## Service worker version

`build.ts` builds the service worker with its `VERSION` taken from the
`SW_VERSION` environment variable, which the deploy job sets to the commit
SHA. So each release gets a fresh offline cache named `hexathlon-<sha>`, and
the old one is deleted when the new worker activates. Locally `SW_VERSION`
is unset, the version is `dev`, and the worker fetches from the network
first. See [Installing and offline play](installing-and-offline.md#offline-play).

## Site address

Once deployed, GitHub Pages serves a project site at
`https://<owner>.github.io/<repository>/`. For this repository
(<https://github.com/adrianeyre/hexathlon>) that is
<https://adrianeyre.github.io/hexathlon/>, so these links work from the
first public deploy.

Every path in the game is relative, so it works under that subpath, and the
service worker scope follows `sw.js`. A custom domain is optional: it needs a
`CNAME` file and DNS records.

## Before a release

- `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm size` pass (CI runs all four).
- Every file the page loads is in the build and precached (`test/pwa.test.ts` checks).
- Check the real load time and 60 FPS (`?fps`) on a real device; `pnpm size`
  only estimates the load time.
- The SEO tags, social previews and icons are described in
  [SEO, social previews and icons](../seo-and-icons.md).
