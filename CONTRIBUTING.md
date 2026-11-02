# Contributing to pyxis-gtm-template

Thanks for your interest. This document explains how the repository is organized and what a pull
request needs before it can be merged.

## Prerequisites

- Node.js 24 (`.nvmrc`) and npm 11, for development only. Tag Manager runs the template itself.

## Setup

```bash
npm ci
npm run build      # writes template.tpl from src/
```

`npm ci` also installs the Git hooks (Husky).

## How the template is built

`template.tpl` is the file the Community Template Gallery reads, and it is **generated**: never edit
it by hand. `npm run build` assembles it from:

| Source                         | Section of `template.tpl`                                                    |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `src/terms-of-service.txt`     | `___TERMS_OF_SERVICE___`, the gallery terms the owner accepted in the editor |
| `src/info.json`                | `___INFO___`, with the thumbnail from `.github/assets/thumbnail-96.png`      |
| `src/template-parameters.json` | `___TEMPLATE_PARAMETERS___` (the fields)                                     |
| `src/template.ts`              | `___SANDBOXED_JS_FOR_WEB_TEMPLATE___` (the code)                             |
| `src/web-permissions.json`     | `___WEB_PERMISSIONS___`                                                      |
| `src/tests.yaml`               | `___TESTS___` (the scenarios of the editor)                                  |
| `src/notes.txt`                | `___NOTES___`, the note the editor wrote on export                           |

The code section is the body of `run()` in `src/template.ts`, transpiled to ES2015 and formatted
without trailing commas in calls. Sandboxed JavaScript is ES5.1 plus arrow functions, `const` and
`let`, with no globals besides `require` and `data`: the `src` project compiles against the ES5
library and ESLint rejects the syntax and globals the sandbox lacks. Everything the tag does must
live inside `run()`; the build refuses code outside it.

`template.tpl` must stay byte for byte what the template editor exports, so that a template
imported, saved and exported again in Tag Manager comes back unchanged. The JSON sections are
written with the editor's escaping (an apostrophe as `\u0027`), and `src/tests.yaml` keeps the
editor's layout, list items at column 0, which is why Prettier leaves that file alone.

## Scripts

| Script                            | What it does                                                    |
| --------------------------------- | --------------------------------------------------------------- |
| `npm run build`                   | Writes `template.tpl` from `src/`                               |
| `npm run lint`                    | ESLint, then the comment check for YAML, shell and config files |
| `npm run format` / `format:check` | Prettier                                                        |
| `npm run typecheck`               | The tag code, the tests and the scripts                         |
| `npm test` / `npm run test:cov`   | The tag code and the editor scenarios; `test:cov` enforces 100% |
| `npm run test:tooling`            | The lint rule, the scripts, and `template.tpl` against `src/`   |

## Workflow

- `main` is the only long-lived branch and is protected. Cut a branch from an up-to-date `main`
  (`feat/…`, `fix/…`, `refactor/…`, `test/…`, `docs/…`, `ci/…`, `build/…`, `chore/…`) and open a
  pull request into `main`.
- Pull requests are merged with **Rebase and merge**. Keep commits atomic: each builds and passes
  the tests on its own.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/); a hook and a
  CI job check them.
- A new version reaches Tag Manager users only when its commit SHA is added at the top of
  `versions` in `metadata.yaml`. Bumping the pinned tracker version is such a change: the script
  URL in `src/template.ts`, its permission in `src/web-permissions.json` and the scenarios move
  together.

## Code rules

- **No comments in code**, in any file, including the scenarios in `src/tests.yaml`. Names, small
  functions, types and tests carry the meaning; the _why_ goes in the commit body, the pull request
  or the README. An ESLint rule and a script enforce it.
- Never silence a check: no `eslint-disable`, `@ts-ignore`, `@ts-expect-error` or coverage ignore
  comments.
- Permissions stay the narrowest the code needs, and the tracker URL stays pinned to an exact
  version.
- Development dependencies must be MIT, Apache-2.0, BSD or ISC licensed, and justified in the pull
  request.

## Tests

- Coverage of `src/` stays at **100%** of statements, branches, functions and lines.
- The fake sandbox in `test/` throws when the code reaches an API that `src/web-permissions.json`
  does not allow, as Tag Manager does.
- Every branch a change introduces has a test for each side; a bug fix starts with a failing test.

## Security

Report vulnerabilities privately, as described in [SECURITY.md](SECURITY.md), never in a public
issue.
