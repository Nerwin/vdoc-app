# V-DOC

Cross-platform (macOS, Windows, Linux) desktop app for keeping a Markdown documentation
repository in sync with Confluence. It is a GUI over the [vdoc CLI](../vdoc): the doc tree with
live sync states, side-by-side diffs, guarded pull/push, page linking/creation, comments, and
session-token renewal - without auto-resolving anything or surprising you.

**Markdown stays the source of truth.** Each file is linked to a Confluence page by frontmatter
keys (`confluencePageId`, `confluenceSpace`, `confluencePageVersion`); the CLI refreshes those
tracking lines and never rewrites your body. The app never talks to Confluence directly - every
operation spawns `vdoc … --json`, so the CLI and the app can never disagree.

## Getting started

### 1. Install the vdoc CLI

The app requires the `vdoc` binary. Pick one:

- **From the private registry** (requires CodeArtifact auth in your `.npmrc` - see the CLI
  repo's README): `bun install -g @vosker/vdoc`
- **From source**: clone the vdoc repo, then `bun install && bun run dev:link` (builds and
  `bun link`s it).
- **Standalone binary** (no bun needed): download `vdoc-<version>-<os>-<arch>` from the CLI
  repo's Bitbucket Downloads, `chmod +x` it, and point the app at it later
  (Settings → vdoc CLI → binary path).

bun-based installs land in `~/.bun/bin`, which the app auto-detects - zero configuration.

**Validate:** `vdoc status` - one-shot health check printing the CLI version, the resolved
config file, the Confluence authentication state, and CI detection.

### 2. Configure Confluence access

Create the config (globally, or as a `.vdocrc` in your docs repository):

```sh
vdoc config init                                          # writes ~/.config/vdoc/config.json
vdoc config set confluence.site your-org.atlassian.net
```

Then authenticate with either method (both can be stored; `confluence.authMethod` picks the
active one - the app's Settings switch this too):

- **API token** (preferred) - create one at [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens),
  then set `confluence.email` and the token via `vdoc config set`, or enter both in the app
  under Settings → Confluence authentication.
- **Session token** - paste your browser's Confluence session cookie in the app's token panel;
  it expires periodically and the app offers renewal when it does.

You can skip this step entirely and do it from the app after install - everything
Confluence-related is written through `vdoc config set`, so CLI and app always agree.

**Validate:** `vdoc cf whoami` prints the authenticated account, or check `vdoc status`.

### 3. Install the app

Grab the artifact for your OS from the latest GitHub release:

- **macOS** - `V-DOC-x.y.z-mac-arm64.dmg` (Apple Silicon) or `…-mac-x64.dmg` (Intel). The app is
  unsigned: on first launch right-click → Open, or clear the quarantine flag with
  `xattr -cr /Applications/V-DOC.app`.
- **Windows** - `V-DOC-x.y.z-win-x64.exe` (installer, per-user, no admin needed) or the
  `…-portable-x64.exe`. SmartScreen will warn about an unsigned app - More info → Run anyway.
- **Linux** - `V-DOC-x.y.z-linux-x64.AppImage` (`chmod +x`, run) or the `.deb`.

### 4. First launch

The app opens with a **welcome tour**: a live health check of the whole chain (CLI found, docs
repository scanned, Confluence connected) followed by a guided walk through the features. It can
be relaunched any time from the command palette (**App: Welcome tour**). The same checks, by
hand - open Settings (⌘, / Ctrl+,) and set up, top to bottom:

1. **Docs repository** - point it at your clone of the docs repo (native folder picker).
2. **Folders** - the root folders the tree shows (defaults: `1-Backend`, `2-DDA`, `3-Projects`;
   add/remove any folder inside the docs repo). Only Markdown files are listed.
3. **Space mapping** (optional) - folder → Confluence space key; prefills Create's space and
   narrows Find matching page's title search.
4. **Confluence authentication** - if you skipped step 2.
5. **vdoc CLI** - leave empty for auto-detect; the resolved `--version` shown here is your
   confirmation the binary works.

**Validate the whole chain:**

- Settings shows a CLI version → binary found and runnable.
- The sidebar tree lists your Markdown files → docs root and folders are right.
- Press ⌘⇧R (Check all) → sync states appear on every tracked file → Confluence auth works.
- Anything failing? The **Logs** button in the status bar shows every CLI command the app ran,
  with its exact stderr - right-click an entry to copy the command and re-run it in a terminal.

## How syncing works

Four verbs, precise meanings (also in-app: ⌘/ opens the same glossary):

- **Check** - version-level comparison (`cf check`), read-only: has Confluence moved since your
  last pull? Cheap, safe, run any time.
- **Pull** - refresh local files when Confluence is newer (`cf pull`). Skips files with local
  edits rather than overwrite them; skip reasons are listed in the result toast.
- **Push** - publish local Markdown (`cf push`). Always dry-runs first in the app and shows you
  the preview before anything is sent. Skips unchanged pages; refuses when Confluence moved
  since your last pull.
- **Verify** - content-level comparison (`cf diff --record`) for files whose versions match but
  whose actual content was never compared. Identical content records a **baseline** (the
  CLI's `.vdoc/state.json` fingerprint that makes local-edit detection possible) and turns the
  file green; different content opens the diff so you decide.

### Sync states

| State                  | Meaning                                       | What to do                                         |
| ---------------------- | --------------------------------------------- | -------------------------------------------------- |
| **Synced** (green)     | Content verified identical, baseline recorded | Nothing                                            |
| **Behind** ↓           | Confluence moved ahead                        | Pull                                               |
| **Ahead** ↑            | Local version ahead of Confluence             | Push                                               |
| **Local edits** ↑      | Local body changed since last sync            | Push                                               |
| **Diverged** ≠         | Both sides changed                            | Open the diff, merge by hand - never auto-resolved |
| **Unverified** (amber) | Versions match but content never compared     | Verify (dashboard has "Verify all")                |
| **No version**         | Tracked but never published by vdoc           | Push                                               |
| **Not linked**         | No `confluencePageId` frontmatter             | Find matching page, or Create                      |
| **Not found**          | The Confluence page is gone or not visible    | Investigate in Confluence                          |
| **Not checked**        | No check ran yet this session                 | Check (⌘R / ⌘⇧R)                                   |

A dim `±` marker flags files with uncommitted git changes - display-only, independent of the
Confluence states. Checks re-run automatically on window focus (attention files once a minute
at most, a full check at most once per hour); there is deliberately no check on startup.

### Guardrails

- Push always dry-runs and shows the preview first.
- When Confluence moved, Push turns amber and force-pushing requires an explicit red-confirm
  modal (`cf push --force`). Force-pull likewise requires confirmation.
- Conflicts are never auto-resolved; "versions match" is never shown green without a verified
  baseline.
- The editor refuses to save over a file that changed on disk outside the app.

## Actions

Everything lives in the command palette (⌘⇧P); the common ones also have buttons and shortcuts.

**Per file** (detail pane / palette):

- **Check · Pull · Push · Verify** - the four verbs above.
- **Force pull / Force push** - overwrite one side deliberately, behind confirmation
  (Actions menu / amber push button).
- **Diff** - side-by-side against the live page, rendered exactly as pull would write it.
- **Lint** - offline validation: frontmatter shape, links, image files, constructs Confluence
  would drop.
- **Find matching page** - link a Not-linked file to an existing page by exact title match
  (ambiguity is reported, never guessed).
- **Create** - publish a Not-linked file as a new page under a chosen parent.
- **Open in Confluence · Open in editor (⌘E) · Show in folder** - hand-offs.

**Views** (tabs, ⌘1–⌘5): **Content** (Monaco editor - edits auto-save after 800 ms, ⌘S flushes),
**Preview** (rendered Markdown with Mermaid; local `.md` links navigate in-app, web links open
in the browser; GitHub-style rendering, not Confluence's), **Split** (editor | live preview),
**Diff**, **Comments** (footer + inline comments, with a composer to post footer comments).
The tab row also shows **backlinks** - every doc whose links resolve to the open file.

**Global** (palette / dashboard):

- **Check all** (⌘⇧R) - refresh every tracked file's state.
- **Get page from Confluence…** - download a page that has no local file yet: pick a root
  folder, paste a page URL or id, and the file is created there named after the page title. If
  a local file already tracks that page, the app offers to open it instead.
- **Recent files / Go to file** (⌘P) - fuzzy navigation; ⌘[ / ⌘] walk your history.
- **Logs** - the last 200 CLI commands the app spawned, with output (secrets redacted).
- **Renew session token** - when session-cookie auth expires.
- **Welcome tour** - the guided intro from the first launch: a live setup health check, then a
  spotlight walk through the tree, sync verbs, dashboard, editor, and palette. The app stays
  usable while it runs.

With no file selected, the main pane is a **dashboard**: every file needing attention (including
who last changed pages that moved remotely), bulk Verify, quick actions, recent files, and last
sync activity. Right-click folders in the tree to pin, check just that folder, open it, or
remove a root folder.

## Shortcuts

⌘ is Ctrl (and ⌥ is Alt) on Windows and Linux - every keycap in the app renders the right one.

| Keys     | Action                                      |
| -------- | ------------------------------------------- |
| ⌘P       | Go to file                                  |
| ⌘⇧P      | Command palette - every action lives here   |
| ⌘F       | Focus the filter field                      |
| ⌘R / ⌘⇧R | Check this file / check all files           |
| ⌘1…⌘5    | Content · Preview · Split · Diff · Comments |
| ⌘[ / ⌘]  | Back / forward through visited files        |
| ⌘S       | Save the editor buffer immediately          |
| ⌘E       | Open in the default editor                  |
| ⌘/       | Help - sync concepts glossary               |
| ⌘,       | Settings                                    |
| ↑↓ / ⏎   | Browse the tree / load the diff             |

## Settings (⌘,)

App-local preferences (theme, docs root, folders, pins, binary path) live in `settings.json`
under Electron's `userData` directory. Everything Confluence-related - credentials, auth
method, the **space mapping**, and the **assets folder** (where pulled page images land,
`confluence.assetsDir`) - lives in the shared `.vdocrc` written through `vdoc config set`, so
the CLI and the app always agree. The **Config file** section shows the resolved path
(`vdoc config path`) with buttons to open or edit it directly.

- **Theme** - light or dark (UI and the Monaco editors).
- **Docs repository** - the docs repo clone the whole app works in (`VDOC_APP_ROOT` is the fallback).
- **Folders & spaces** - root folders, folder → space mapping, assets folder.
- **Confluence authentication** - session token or API key.
- **vdoc CLI** - explicit binary path (empty = auto-detect), with the resolved `--version` shown.

## Troubleshooting

- **No CLI version in Settings / every action fails** - the `vdoc` binary wasn't found or won't
  run. Set the path explicitly in Settings → vdoc CLI. The app already extends PATH with
  `~/.bun/bin` (plus `/opt/homebrew/bin` and `/usr/local/bin` on macOS/Linux) and imports your
  login shell's environment, so shell installs normally just work.
- **Everything shows Unverified after first setup** - normal: versions match but no baseline
  exists yet. Use the dashboard's "Verify all" - identical files turn green in one pass.
- **A pull skipped files** - the toast lists the per-file reasons (usually local edits the CLI
  refuses to overwrite). Inspect the diff, then push, or force-pull to discard local changes.
- **Something behaves oddly** - status bar → **Logs**: the exact CLI commands, stderr and
  stdout. Right-click to copy a command and reproduce it in a terminal.
- **`npm run dev` quits instantly** - a packaged V-DOC.app is running and holds the
  single-instance lock; quit it first.
- **Known formatting loss** - blank lines between list items don't survive Confluence's format
  round trip; such a file genuinely differs until force-pulled once.
- macOS/Windows unsigned-app warnings: see [Install](#3-install-the-app).

## Development

```sh
npm run dev            # launch in dev mode
npm test               # typecheck + unit tests
npm run build          # production bundle to out/
npm run pack           # quick unsigned app for this OS into release/
npm run release        # bump version + changelog + tag, then build this OS's binaries
npm run dist           # rebuild binaries without bumping (host OS) - or dist:mac / dist:win / dist:linux
```

`dist` builds the host platform (macOS builds both arm64 and x64); the release workflow covers
the rest. To generate a Windows release from the Mac, run `npm run dist:win` - it cross-builds
`V-DOC-x.y.z-win-x64.exe` (NSIS installer, per-user) and `…-portable-x64.exe` into `release/`.
The Windows arch is pinned to x64 in `package.json` (`build.win.target`): without the pin,
electron-builder defaults to the build host's arch, and an arm64 installer built on Apple
Silicon silently installs an app that can't run on a normal x64 Windows machine. All artifacts
are unsigned. Version comes from `package.json` and stamps the bundle,
the artifacts' names, and the status bar. The app icon lives in `build/icon.png` (1024×1024 -
electron-builder converts it per platform).

Everything ships bundled by Vite, so all npm packages are devDependencies and the package
contains `out/` only (33 MB asar) - no `node_modules`. See [CLAUDE.md](./CLAUDE.md) for the
architecture and contribution guardrails.

### Releases

`npm run release` is fully automated, driven by the conventional-commit history
([commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version)):

1. Computes the semver bump from the commits since the last tag - `fix:` → patch, `feat:` → minor,
   `feat!:` / `BREAKING CHANGE` → major.
2. Bumps `package.json` + `package-lock.json` and prepends the notes to `CHANGELOG.md`
   (sections configured in `.versionrc.json`; `chore`/`test` commits are hidden).
3. Commits those three files as `chore(release): X.Y.Z` and tags `vX.Y.Z`.
4. Builds the binaries from the freshly bumped version.

Pushing the tag (`git push --follow-tags`) triggers `.github/workflows/release.yml`, which builds
the installers on a real runner per OS (macOS, Windows, Linux) and attaches them all to the
GitHub release for that tag - that release page is what you share with the company.

Day-to-day commits never touch the version - releasing is a deliberate act, not a git hook.
Preview what a release would do with `npx commit-and-tag-version --dry-run`. To tag the current
version as-is (no bump), use `npx commit-and-tag-version --first-release && npm run dist`.

## Environment

- `VDOC_APP_ROOT` - docs repo root fallback when none is set in Settings
- `VDOC_DEBUG_PORT` - expose Chrome DevTools Protocol on that port (automation/debugging)
- `VDOC_SHOT=/path.png` - capture a window screenshot and quit (`VDOC_SHOT_JS` runs a renderer
  script first, `VDOC_SHOT_DELAY_MS` tunes the wait) - used for automated visual checks
