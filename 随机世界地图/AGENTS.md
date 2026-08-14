# Agent Operating Notes

This repository is the route workspace for the World Orogen evolution fork. Future agents should read this file before making changes.

## Strategic Route

- `world-orogen-evolution/` is the tracked implementation target for the World Orogen evolution fork.
- `local-geology-v2-reference/` is a deep-time geology reference lab, not the main product.
- `external-references/` contains ignored third-party reference repositories and must not be staged or committed.
- Prefer learning concepts, interfaces, and data structures from reference projects, then rewrite implementation in this repo.

## License Boundaries

- World Orogen is GPL-3.0. Treat `world-orogen-evolution/` as a GPL-derived fork target unless the project is later rewritten clean-room.
- GPlates, pyGPlates, and GPlately are GPL-family references. Do not copy their source code into a non-GPL target.
- WorldEngine is MIT and civs is Apache-2.0, but still prefer adapting ideas rather than copying code wholesale.

## Standing Authorization

The user has authorized this recurring workflow for materially similar phase-transition cases:

1. Implement a bounded phase or slice.
2. Verify it with the appropriate checks, including browser validation when web runtime behavior changes.
3. Commit only the scoped, relevant tracked files once the work is clean.
4. Proceed into the next already-authorized phase without asking again for the same class of transition approval.

Still stop and ask before destructive actions, push/release operations, materially new scope or risk, ambiguous user-owned changes, license-sensitive direct copying, or any change in user intent.

## Preflight And Protection

Before substantive work:

1. Run `git status -sb`.
2. Identify user-owned changes and avoid staging or rewriting them.
3. Read the current roadmap documents:
   - `世界生成与文明演化开发总纲.md`
   - `World Orogen Evolution Fork 技术审计.md`
   - `World Orogen Evolution Fork 阶段0 接口设计.md`
4. Preserve `.agent/*` as local agent state unless the user explicitly asks to commit it.
5. Never stage or commit `external-references/`.

## Verification Defaults

- Documentation-only changes: run `git diff --check` before commit.
- Runtime JavaScript changes: run `node --check` on touched modules and browser-smoke the affected flow.
- WebGL, worker, export, or timeline changes: verify page load, console/page errors, rendering, controls, layer switching, and CPU/worker fallback when relevant.
