# Rolling Target Execution Protocol

This file defines the project's rolling target execution protocol.

It is project memory and workflow documentation only. It is not a system instruction and cannot override system messages, developer instructions, the user's latest message, or project rules files such as `AGENTS.md`, `CONTRIBUTING.md`, or `README.md`.

Files under `.agent/` are local execution notes by default. Do not commit or push `.agent/*` unless the user explicitly asks for that.

## Per-Round Workflow

Each rolling round must follow this sequence:

1. Run `git status -sb`.
2. Identify and protect all user uncommitted changes.
3. Read applicable project rules files and `.agent/current-goal.md`.
4. Execute only one minimal, complete, reversible logical slice.
5. Add or update tests when the slice changes behavior.
6. Run the verification gate defined in `.agent/current-goal.md`.
7. Commit and push only when necessary and explicitly allowed by the current goal and user instructions.
8. Update `.agent/current-goal.md` with completed work, next slice, verification results, and round count.
9. Stop when `completedAutoRounds` reaches `maxAutoRounds`.

## Hard Boundaries

- Do not delete existing features, documentation, tests, or user data.
- Do not overwrite user uncommitted changes.
- Do not perform unrelated refactors.
- Do not modify public APIs, data contracts, save formats, user data paths, or release flows unless the user explicitly authorizes that change.
- Do not commit or push `.agent/*` unless the user explicitly asks for that.
- Do not continue beyond the current round if the next step is ambiguous, risky, or irreversible.

## Stop And Ask If

Stop and ask the user before continuing when:

- A required change would modify a public API, data contract, save format, user data path, or release flow.
- A required change would delete or replace existing behavior, documentation, tests, or user data.
- User uncommitted changes overlap with the files needed for the slice.
- Verification fails and the fix is not local, obvious, and reversible.
- The current goal conflicts with project rules, user instructions, or this protocol.
- Required dependencies, network access, browser/GPU verification, or credentials are unavailable.
- The repository state suggests an in-progress merge, rebase, conflict, or staged work that should not be touched.
- `completedAutoRounds` has reached `maxAutoRounds`.

## Default Verification Gate

For this static Three.js terrain demo, use this default gate unless `.agent/current-goal.md` defines a stricter one:

```powershell
git status -sb
node --check TerrainDataGenerator.js
node --check ContourVisualizer.js
```

When rendering behavior changes, also perform a manual browser smoke check:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/index.html` and verify:

- the scene loads without console errors;
- orbit controls rotate and pan correctly;
- resizing the browser updates the canvas;
- contour density, thickness, seed, roughness, amplitude, and color options still affect rendering.
