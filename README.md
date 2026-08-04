# V-DOC

macOS Electron GUI over the [vdoc CLI](../vdoc) for the Vosker-doc repository. Shows the doc tree with
live Confluence sync states, side-by-side diffs, guarded pull/push, page linking/creation, and
session-token renewal.

## Run

```sh
npm run dev        # launch in dev mode
npm test           # typecheck + unit tests
npm run build      # production bundle to out/
```

Requires the `vdoc` binary (auto-detected at `~/.bun/bin/vdoc`, then PATH — overridable in Settings).

## Shortcuts

| Keys | Action |
|------|--------|
| ⌘P | Go to file (command palette) |
| ⌘F | Focus the filter field |
| ⌘R | Check all files |
| ⌘, | Settings |
| ↑↓ / ⏎ | Browse the tree / load the diff |

## Settings (⌘,)

Stored in `settings.json` under Electron's `userData` directory.

- **Theme** — light or dark (applies to the UI and the Monaco editors).
- **vdoc CLI** — explicit binary path (empty = auto-detect), with the resolved `--version` shown and reloadable.

## Environment

- `VDOC_APP_ROOT` — docs repo root (default `~/Projects/documentation/Vosker-doc`)
- `VDOC_DEBUG_PORT` — expose Chrome DevTools Protocol on that port (automation/debugging)

## Scope

The tree covers `1-Backend`, `2-DDA`, and `3-Projects` (`4-Notes` is local-only by choice).

## How it talks to the CLI

Everything goes through `vdoc … --json` spawned from the main process (`src/main/vdoc.ts`) — the app
never reads or writes `.vdoc/state.json`, `confluencePageVersion`, or Confluence itself. Sync states
come from `cf check`; two extra app-side states exist: `unverified` (version match but no local-edit
baseline in state.json — deliberately not shown green) and `unchecked`.

Per-file commands: Check, Pull, Push, Lint, plus Sync (link by exact title match) and Create (new page
under a chosen parent) for files without a `confluencePageId`.

Guardrails baked in: push always dry-runs first and shows the preview; when Confluence moved, Push
turns amber and force-pushing requires an explicit red-confirm modal (`cf push --force`); force-pull
requires confirmation; conflicts are never auto-resolved.
