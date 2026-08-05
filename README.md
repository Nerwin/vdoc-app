# V-DOC

macOS Electron GUI over the [vdoc CLI](../vdoc) for the Vosker-doc repository. Shows the doc tree with
live Confluence sync states, side-by-side diffs, guarded pull/push, page linking/creation, and
session-token renewal.

## Run

```sh
npm run dev            # launch in dev mode
npm test               # typecheck + unit tests
npm run build          # production bundle to out/
npm run pack           # quick unsigned V-DOC.app into release/mac-arm64/
npm run release        # dmg+zip (mac), nsis+portable (win), AppImage+deb (linux)
npm run release:mac    # or per-platform: release:win / release:linux
```

Builds target the host arch (arm64 here); add `-- --x64` to an electron-builder script for Intel
artifacts. All artifacts are unsigned. Version comes from `package.json` and stamps the bundle,
the artifacts' names, and the status bar. The app icon lives in `build/icon.png` (1024×1024 —
electron-builder converts it per platform).

Everything ships bundled by Vite, so all npm packages are devDependencies and the package contains
`out/` only (33 MB asar) — no `node_modules`.

Requires the `vdoc` binary (auto-detected at `~/.bun/bin/vdoc`, then PATH — overridable in
Settings). Spawns extend PATH with `~/.bun/bin`, `/opt/homebrew/bin`, and `/usr/local/bin` so the
CLI's `#!/usr/bin/env bun` shebang resolves even from a Finder-launched app.

## Shortcuts

| Keys | Action |
|------|--------|
| ⌘P | Go to file (command palette) |
| ⌘F | Focus the filter field |
| ⌘R | Check all files |
| ⌘, | Settings |
| ↑↓ / ⏎ | Browse the tree / load the diff |

## Settings (⌘,)

App-local preferences (theme, folders, pins, binary path) live in `settings.json` under Electron's
`userData` directory. Everything Confluence-related — credentials, auth method, and the
**space mapping** — lives in the shared `.vdocrc` written through `vdoc config set`, so the CLI and
the app always agree; the resolved config path is shown in Settings with a "Reveal in Finder" button
(`vdoc config path`).

- **Theme** — light or dark (applies to the UI and the Monaco editors).
- **Folders** — the tree's root folders (add via native picker, remove; also right-click a folder in the tree).
- **Space mapping** — folder → Confluence space key; prefills Create's space and narrows Sync's title search.
- **Confluence authentication** — session token or API key.
- **vdoc CLI** — explicit binary path (empty = auto-detect), with the resolved `--version` shown and reloadable.

## Environment

- `VDOC_APP_ROOT` — docs repo root (default `~/Projects/documentation/Vosker-doc`)
- `VDOC_DEBUG_PORT` — expose Chrome DevTools Protocol on that port (automation/debugging)

## Scope

The tree's root folders are user-configurable (Settings → Folders, defaults: `1-Backend`, `2-DDA`,
`3-Projects`) and must live inside the docs repository; only Markdown files are ever listed.
Right-click any folder for actions: pin on top, check only that folder, open in Finder, and — on
root folders — remove from the tree.

## How it talks to the CLI

Everything goes through `vdoc … --json` spawned from the main process (`src/main/vdoc.ts`) — the app
never reads or writes `.vdoc/state.json`, `confluencePageVersion`, or Confluence itself. Sync states
come from `cf check`; two extra app-side states exist: `unverified` (version match but no local-edit
baseline in state.json — deliberately not shown green) and `unchecked`. Unverified files can be
promoted with "Mark verified" (or the dashboard's bulk button), which runs `cf diff --record`:
the baseline is only written when the content is proven identical to Confluence.

With no file selected, the main pane is a dashboard listing everything needing attention, including
who last changed pages that moved remotely (`cf versions --limit 1`). On window focus the app
re-checks attention files (throttled to once a minute) and runs a full check at most once per hour.

Per-file commands: Check, Pull, Push, Lint, plus Sync (link by exact title match) and Create (new page
under a chosen parent) for files without a `confluencePageId`.

The detail pane has four views: **Content** (raw markdown), **Preview** (rendered markdown with lazy-loaded
Mermaid diagrams — approximates GitHub-style rendering, not Confluence's), **Diff** (side-by-side vs the
live page), and **Comments** (footer + inline comments via `cf comments`, with a composer that posts
footer comments through `cf comment`).

A dim `±` marker flags files with uncommitted git changes — display-only, independent from the
Confluence sync states.

Guardrails baked in: push always dry-runs first and shows the preview; when Confluence moved, Push
turns amber and force-pushing requires an explicit red-confirm modal (`cf push --force`); force-pull
requires confirmation; conflicts are never auto-resolved.
