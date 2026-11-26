# The product uses an original name, never "Track and Field"

"Track & Field" is the title of the 1983 arcade game this genre comes from, and its owner actively enforces its IP. The product, repo, page title, storage keys and URLs therefore use an original name from the first commit, so there is nothing to rename later. "Track and Field", "Hyper Olympic" and the owner's name must not appear in any public-facing identifier.

## Considered Options

- **Build under "Track and Field" and rename at release**: rejected. The name spreads into code, storage keys, URLs and git history, and the public repo would be exposed to takedown in the meantime.

## Outcome

The product is named **Hexathlon**, and the repo will be renamed `hexathlon`. Near-miss spellings of the original title (e.g. "Tack and Feild") were also rejected, because trademark law treats look-alike and sound-alike names the same as the real one.

## Amendment: internal records may name the original

The project's internal records have to talk about the original to describe what is being matched. They are:

- the ADRs in `docs/architectural-decision-record/`
- the PRD in `docs/product-requirements-document/`

These may name the original game, its other release title and its publisher, in their text and in their filenames. Keeping the existing filenames also keeps the PRD and ADR links in the issue tracker working.

Everything else counts as public-facing and stays name-free. That covers the code, data, storage keys, page title, manifest, `package.json`, README, CREDITS, the player and developer guides in `docs/guide/`, the style guide and the calibration files. Public docs refer to an internal record by number (for example "ADR-0001") and link to its folder, not to a filename that contains the name. `test/naming.test.js` scans every file except the two internal folders above.

The repository is called `hexathlon`, so the `hexathlon` links in README, CREDITS and the deployment guide are correct from the moment it goes public.
