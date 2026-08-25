# V-DOC codebase audit

Date: 2026-08-25  
Scope: the current `vdoc-app` worktree, including Electron main/preload/renderer boundaries, local file and CLI integration, updater, telemetry, tests, dependencies, packaging, and release automation. The sibling `vdoc` CLI was treated as an external contract and was not audited.

## Executive summary

The codebase is generally readable, strongly typed, and deliberately structured. Raw Markdown HTML is escaped, CLI execution uses `execFile` instead of a shell, the preload exposes named operations instead of raw `ipcRenderer`, Monaco models are disposed, and the CLI log buffer is bounded.

It is not yet security-clean. The main issue is that the renderer is treated as trusted even though a confirmed frontmatter injection can execute JavaScript inside it. That JavaScript can reach broad IPC operations, including an updater that accepts an arbitrary URL and replaces the running application with an unsigned bundle. This creates a practical local code-execution chain.

Findings: 1 critical, 4 high, 5 medium, and 4 low.

| ID | Severity | Finding |
| --- | --- | --- |
| A-01 | Critical | The updater installs an arbitrary unsigned application from a renderer-controlled URL |
| A-02 | High | Frontmatter status values can inject executable HTML into the preview |
| A-03 | High | Privileged IPC does not enforce a renderer trust boundary |
| A-04 | High | Errors can send credentials and private documentation metadata to Sentry |
| A-05 | Medium | The editor's read-before-write guard is racy and saves can complete out of order |
| A-06 | High | The release workflow gives a mutable third-party action a release write token |
| A-07 | Medium | Critical Electron boundaries and packaged behavior have no tests |
| A-08 | Medium | Bundled DOMPurify has known security advisories |
| A-09 | Medium | Intel macOS artifacts are documented but not built |
| A-10 | Medium | Monaco is loaded eagerly into an 8.7 MB startup bundle |
| A-11 | Low | Scans and dashboard rendering perform avoidable disk and IPC work |
| A-12 | Low | The packaged application retains permissive Electron fuses |
| A-13 | Low | Copied CLI commands are not shell-escaped |
| A-14 | Low | Secret-like files are not covered by `.gitignore` |

## Findings

### A-01: The updater installs an arbitrary unsigned application from a renderer-controlled URL [Fixed]

Severity: Critical

Evidence:

- `src/preload/index.ts:50-51` exposes both update checking and `installUpdate(assetUrl)` to renderer JavaScript.
- `src/main/ipc.ts:264-266` forwards the renderer-provided string directly to `installUpdate`.
- `src/main/update.ts:111-131` downloads that URL, extracts it with `ditto`, selects the first `.app`, replaces the running bundle, and relaunches it.
- The installer does not bind the URL to the release returned by `checkUpdate`, restrict the scheme or host, cap the response size, apply a timeout, verify a checksum, inspect the expected version or bundle identifier, or validate an Apple code signature.
- `package.json:68-84` explicitly sets the macOS signing identity to `null`. The packaged artifact was confirmed to have only an ad-hoc linker signature, no Team Identifier, and no sealed resources.
- Temporary update directories and the previous application are not removed after success. Failed downloads and extraction can also leave files behind.

Impact:

Any JavaScript running in the renderer can download a zip from an attacker-controlled URL and replace V-DOC with the first application inside it. A-02 provides such a renderer execution path. TLS to GitHub is not an artifact integrity or publisher authenticity check, and the install method accepts non-GitHub URLs anyway.

Recommendation:

1. Disable in-app replacement while artifacts are unsigned. Keep update checking and open the verified release page in the browser.
2. For in-app updates, sign and notarize macOS artifacts and use a supported update mechanism that validates signatures and checksums.
3. Keep the selected release and asset in the main process. Expose an `installCheckedUpdate()` operation with no URL argument.
4. Allow only the expected HTTPS release host and repository asset, enforce time and size limits, verify version, app identifier, architecture, checksum, and signature before replacing anything.
5. Clean temporary data in `finally`, retaining the previous bundle only for the minimum rollback window.

References: [Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater), [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing), [electron-builder auto update](https://www.electron.build/docs/features/auto-update/).

### A-02: Frontmatter status values can inject executable HTML into the preview [Fixed]

Severity: High

Evidence:

- `src/shared/frontmatter.ts:19-42` accepts an arbitrary scalar for `status`.
- `src/renderer/src/components/PreviewView.tsx:36-38` escapes `&`, `<`, and `>`, but not quotes.
- `src/renderer/src/components/PreviewView.tsx:49-57` places the escaped value inside a double-quoted `data-status` attribute.
- `src/renderer/src/components/PreviewView.tsx:100-118` renders the resulting string with `dangerouslySetInnerHTML`.
- `src/renderer/index.html` has no Content Security Policy. Inline event handlers are therefore not blocked.

Confirmed proof using the repository parser and escaping logic:

```md
---
status: x" onmouseover="alert(1)
---
# Test
```

This produces:

```html
<span data-status="x" onmouseover="alert(1)">x" onmouseover="alert(1)</span>
```

Impact:

Opening or previewing a Markdown file can introduce executable DOM content. An attacker only needs to get a crafted document into the synced repository. The injected script runs in the privileged renderer and can call the exposed `window.vdoc` API.

Recommendation:

- Do not construct metadata HTML with string interpolation. Build React elements, or construct DOM nodes and set attributes through DOM APIs.
- If string generation remains, use context-specific attribute escaping that includes both quote characters and pass the final HTML through a reviewed sanitizer.
- Add a restrictive CSP that disallows inline script and event handlers. Account explicitly for Monaco workers, local images, and any Mermaid requirements.
- Add a regression test with quotes, event attributes, malformed URLs, SVG, MathML, and encoded payloads.

Reference: [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security#checklist-security-recommendations).

### A-03: Privileged IPC does not enforce a renderer trust boundary [Fixed]

Severity: High

Evidence:

- The handlers in `src/main/ipc.ts` do not validate `event.senderFrame`, the sender URL, or that the call came from the main local frame.
- `src/main/index.ts:18-37` does not block navigation, deny new windows, or define a permission-request policy. It also honors `ELECTRON_RENDERER_URL` without checking `app.isPackaged`.
- `src/main/ipc.ts:57` joins an unvalidated renderer path to the docs root. A value such as `../../...` escapes the root for reads.
- `src/main/ipc.ts:68-72` uses only lexical containment for writes. It follows symlinks and can be widened by changing the docs root.
- `src/main/ipc.ts:176-183` and `226` pass unvalidated paths to shell operations.
- `src/main/ipc.ts:187-195` merges any renderer-provided settings patch without runtime validation. This includes `docsRoot` and `vdocBin`.
- `src/preload/index.ts:28-29` and `src/main/ipc.ts:98-111` expose force pull, non-dry-run push, and force push directly. The preview and confirmation rules exist only in renderer UI state.
- The renderer can also write files directly, save credentials, edit CLI configuration, quit the app, and invoke the updater.

Impact:

A renderer compromise is promoted to arbitrary local file reads within the user's permissions, settings modification, destructive Confluence operations, and application replacement. Navigating the main window to remote content can also leave the same preload bridge available to that content. Sender validation alone does not stop an XSS in the legitimate frame, so least-privilege IPC and A-02's fix are both required.

Recommendation:

- Add one IPC registration wrapper that validates the exact sender window, main frame, and expected local URL before dispatch.
- Add runtime input validation, size limits, and enum checks at every IPC boundary. This can be implemented without a new production dependency.
- Centralize path resolution. Reject absolute, drive, UNC, NUL, and traversal input; use `resolve` plus `relative`; use `realpath` where symlink containment matters.
- Validate loaded settings before use and permit renderer patches only for explicitly allowed fields and values.
- Enforce push preview state and force confirmations in main. A native confirmation or a short-lived main-owned token bound to the exact previewed operation would prevent direct bypass.
- Deny `will-navigate`, use `setWindowOpenHandler(() => ({ action: 'deny' }))`, and explicitly deny unnecessary permissions.
- Set `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` explicitly so the intended posture does not depend on Electron defaults.
- Gate development URLs, CDP, screenshot scripts, and other automation hooks behind `!app.isPackaged`.

References: [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security#checklist-security-recommendations), [context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation), [Chromium sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox).

### A-04: Errors can send credentials and private documentation metadata to Sentry [Fixed]

Severity: High

Evidence:

- `src/main/vdoc.ts:79-93` redacts the argument after `--encrypt` in the local log entry, but always retains stderr and leaves other sensitive arguments unchanged.
- `src/main/vdoc.ts:140-164` constructs fallback errors with the original `args.join(' ')`. If token storage returns malformed JSON or a non-structured failure, the plaintext token is included in the thrown error.
- `src/main/ipc.ts:89-91` passes the full comment body as a CLI argument. Paths, page identifiers, spaces, and other document metadata are also included in command errors.
- `src/renderer/src/useApp.ts:149-155` sends every action error to `captureException`.
- `src/main/settings.ts:15-22` enables crash reports by default, and `src/main/sentry.ts:13-15` initializes Sentry for packaged builds without a `beforeSend` scrubber.
- `src/renderer/src/components/SettingsModal.tsx:114-121` describes these reports as anonymous.
- `docs/memory-autoupdate-analytics.md:101-105` states the privacy requirement that file paths, titles, and content never leave the machine.

Impact:

Credential values can be attached to an error in specific failure paths. More common CLI failures can transmit private file paths, comments, stderr, and documentation metadata to Sentry, contrary to the repository's documented privacy rule and UI wording.

Recommendation:

- Redact arguments before they are used anywhere, including local logs, copied commands, error messages, and telemetry.
- Treat tokens, comment text, file paths, page titles, URLs, stdout, and stderr as sensitive by default.
- Return structured errors containing a command identifier, exit code, and safe public message instead of raw argv and output.
- Add Sentry `beforeSend` and breadcrumb processors as a second scrubber, not the primary control.
- Prefer explicit opt-in for reports that may contain company data, and make the settings description match the actual data policy.
- Add regression tests for token, comment, path, stdout, stderr, and IPC-wrapped error redaction.

### A-05: The editor's read-before-write guard is racy and saves can complete out of order [Fixed]

Severity: Medium

Evidence:

- `src/renderer/src/components/DetailPane.tsx:72-89` checks the current disk value in one IPC call and writes in a later IPC call. An external process can modify the file between those operations.
- `flush` clears `pendingRef` before asynchronous work completes. A manual save followed by more typing can start a second save while the first is still active.
- Completions are not revisioned or serialized. An older save can finish after a newer one, overwrite it, and move `diskRef` back to stale content.
- `src/renderer/src/useApp.ts:621-627` uses the same separate read and write pattern when toggling `confluenceIgnore`.

Impact:

The documented guarantee that external edits are never clobbered is not absolute. Concurrent saves can also lose the user's newer draft.

Recommendation:

- Move compare-and-write into one main-process IPC operation receiving `{ path, expected, next, revision }`.
- Serialize mutations per canonical file path in main and reject when the current content does not match `expected`.
- Queue or coalesce renderer saves and only accept completion for the latest revision.
- Reuse the same guarded mutation for frontmatter changes.
- Test external modification between check and write, overlapping manual/debounced saves, file switching, reload, and unmount.

Resolution:

- Main performs the expected-content comparison and write in one path-serialized IPC operation.
- Renderer saves are coalesced and drained sequentially with revisioned acknowledgements.
- File-change refreshes wait for active saves, and conflicts retain the current draft until an explicit reload.
- Frontmatter ignore toggles use the same guarded write operation.

### A-06: The release workflow gives a mutable third-party action a release write token [Fixed]

Severity: High

Evidence:

- `.github/workflows/release.yml:10-11` grants `contents: write` to the job.
- `.github/workflows/release.yml:21-31` references actions by mutable version tags, including `softprops/action-gh-release@v3`.
- That third-party action runs after builds with the token that can alter the GitHub release and its executable assets.
- The uploaded artifacts are unsigned, and A-01 trusts an asset as executable application content.

Impact:

A compromised or moved action tag can replace release artifacts with attacker-controlled executables. The custom updater currently adds no independent signature or checksum barrier.

Recommendation:

- Pin every action to a reviewed full commit SHA, especially third-party actions.
- Separate unprivileged build jobs from the release-publishing job. Pass immutable artifacts into a minimal job with `contents: write`.
- Sign and notarize artifacts and publish checksums or provenance that the updater verifies independently.
- Add dependency review or automated notifications for action SHA updates.

Reference: [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use).

Resolution:

- Every action is pinned to a full commit SHA.
- Platform builds run with read-only repository permissions and upload one-day intermediate artifacts.
- A separate publishing job receives `contents: write` only after every build and test job succeeds.

### A-07: Critical Electron boundaries and packaged behavior have no tests

Severity: Medium

Evidence:

- `package.json:25-26` defines `npm test` as type checking plus `src/shared/__tests__/*.test.ts`.
- All 12 test files are in `src/shared/__tests__`. There are no tests for main, preload, IPC, updater, Sentry redaction, preview rendering, editor saves, settings, navigation policy, watcher behavior, or UI guardrails.
- `.github/workflows/release.yml:28-31` runs tests and creates installers, but does not launch or smoke-test the packaged artifact on its target runner.

Impact:

The XSS, updater trust, telemetry leak, and save race sit outside the tested layer. Packaging can succeed while the produced app fails to launch or violates its intended security posture.

Recommendation:

- Extract and unit-test pure policy functions for HTML generation, path containment, input validation, redaction, asset selection, and update verification.
- Add main/preload integration tests with a controlled BrowserWindow and explicit trusted/untrusted senders.
- Add renderer tests for preview payloads, confirmation flows, and overlapping saves.
- Launch each packaged target on its native CI runner and assert startup, preload availability, IPC health, architecture, signing state, and fuse configuration.

### A-08: Bundled DOMPurify has known security advisories

Severity: Medium

Evidence:

- Full `npm audit` reports two vulnerability entries: moderate `dompurify` and low `monaco-editor` through DOMPurify.
- `npm explain dompurify` resolves `dompurify@3.4.8` through both `mermaid@11.17.1` and `monaco-editor@0.56.0`.
- The affected packages are declared as dev dependencies, but Vite bundles their browser code into the shipped renderer. `npm audit --omit=dev` being clean does not make the renderer copy irrelevant.
- The advisories cover DOMPurify versions through 3.4.12. Direct exploitability through the current Monaco or Mermaid usage was not established during this review.

Recommendation:

- Track an upstream Monaco release that permits a fixed DOMPurify version, or test a controlled package override against editor and preview behavior.
- Verify the actual resolved and bundled version in CI.
- Do not apply npm's suggested forced downgrade to Monaco 0.53.0 without compatibility and security review.

Advisories: [GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7), [GHSA-cmwh-pvxp-8882](https://github.com/advisories/GHSA-cmwh-pvxp-8882), [GHSA-c2j3-45gr-mqc4](https://github.com/advisories/GHSA-c2j3-45gr-mqc4), [GHSA-vxr8-fq34-vvx9](https://github.com/advisories/GHSA-vxr8-fq34-vvx9).

### A-09: Intel macOS artifacts are documented but not built

Severity: Medium

Evidence:

- `README.md:62-64` tells Intel users to download `V-DOC-x.y.z-mac-x64.dmg`.
- `README.md:249-250` states that macOS `dist` builds both arm64 and x64.
- `package.json:68-81` configures both macOS targets for arm64 only.
- `npm run pack` produced `release/mac-arm64/V-DOC.app`; its executable was confirmed as Mach-O arm64 only.

Impact:

The documented Intel installation path cannot be fulfilled by the release workflow. Users can select an artifact that is never produced.

Recommendation:

Build both x64 and arm64, or publish a universal binary, and verify the artifact matrix in CI. If Intel support is intentionally dropped, remove it from the README and release expectations.

### A-10: Monaco is loaded eagerly into an 8.7 MB startup bundle

Severity: Medium

Evidence:

- `src/renderer/src/App.tsx:19` imports `applyMonacoTheme` from `monaco-setup.ts` at application startup.
- `src/renderer/src/components/monaco-setup.ts:1-6` imports the root Monaco package and configures its worker immediately.
- Code and diff views are also statically imported through the normal component tree.
- The production build emitted an 8,745.63 kB renderer entry chunk and warned that `PreviewView`'s dynamic `monaco-setup` import cannot create a separate chunk because the module is already statically imported.
- The generated TypeScript worker is 13,307.94 kB. It is a separate worker asset, but the app currently ships and configures more language machinery than a Markdown-focused editor normally needs.

Impact:

Every app launch pays the parse, compile, and memory cost of Monaco even when the user stays on the dashboard or preview. The intended lazy boundary is ineffective.

Recommendation:

- Lazy-load the code and diff views, and move theme application behind the same editor loader.
- Keep editor state independent from the eagerly loaded app shell so Monaco is requested only when an editor or code-highlighting path needs it.
- Recheck the bundle graph and add a startup chunk budget to CI.
- Keep Mermaid's current lazy import, which is working as intended.

### A-11: Scans and dashboard rendering perform avoidable disk and IPC work

Severity: Low

Evidence:

- `src/renderer/src/components/Dashboard.tsx:62-80` keeps a title cache and reads up to four recent files over IPC even though scan entries already include `title` (`src/shared/types.ts:170-180`). This redundancy is also documented in `docs/memory-autoupdate-analytics.md:47-53`.
- `src/main/vdoc.ts:256-259` uses `readFileSync(..., 'utf8').slice(0, 2048)`, which reads and decodes the entire file before retaining the first 2 KB. This runs for every Markdown file in a full scan.
- `src/main/watcher.ts:27-37` watches excluded directories and filters only dot-prefixed paths. A Markdown change under `Images`, `Private`, `Temp`, `_audit`, `Scripts`, `node_modules`, or `dist` still notifies the renderer.
- `src/renderer/src/useApp.ts:265-270` performs a full scan for every watcher batch.

Impact:

The current few-hundred-file corpus keeps this tolerable, but large Markdown files or noisy excluded directories produce unnecessary synchronous main-process I/O, IPC, and scans.

Recommendation:

- Use `entry.title` directly and delete the dashboard title state/effect.
- Read only the required initial bytes with a file descriptor.
- Apply `EXCLUDED_DIRS` in the watcher callback before scheduling a rescan.
- If the corpus grows materially, maintain a metadata index rather than adding more full rescans.

### A-12: The packaged application retains permissive Electron fuses

Severity: Low

Evidence:

The packaged arm64 application was inspected with `@electron/fuses` and reported:

```text
RunAsNode: Enabled
EnableNodeOptionsEnvironmentVariable: Enabled
EnableNodeCliInspectArguments: Enabled
EnableEmbeddedAsarIntegrityValidation: Disabled
OnlyLoadAppFromAsar: Disabled
GrantFileProtocolExtraPrivileges: Enabled
```

Impact:

These are defense-in-depth controls, not a standalone exploit. Leaving them at permissive defaults increases the options available after local tampering or process-launch control and provides no integrity check for the packaged ASAR.

Recommendation:

- Disable RunAsNode, NODE_OPTIONS, and Node CLI inspect arguments for packaged builds.
- Enable embedded ASAR integrity validation and only-load-from-ASAR if compatible with the final electron-builder layout.
- Assess whether file protocol extra privileges are required after navigation and CSP hardening.
- Make fuse assertions part of packaged-artifact CI.

Reference: [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses).

### A-13: Copied CLI commands are not shell-escaped

Severity: Low

Evidence:

- `src/renderer/src/components/LogsView.tsx:82` builds a copied command with `args.join(' ')`.
- `src/renderer/src/components/LogsView.tsx:113` displays the same unquoted form.
- Arguments can contain paths, spaces, comment bodies, quotes, semicolons, substitutions, and other shell metacharacters.

Impact:

The app itself executes safely through `execFile`, but a user who pastes a copied command into Zsh, Bash, PowerShell, or cmd can run a different command from the recorded argv. A crafted document name or copied comment can turn this into clipboard-assisted command execution.

Recommendation:

Copy a platform-specific safely quoted command, or copy an argv JSON representation and label it as non-executable. Apply A-04's redaction before either form.

### A-14: Secret-like files are not covered by `.gitignore`

Severity: Low

Evidence:

- `.gitignore` does not include `.env`, `*.secrets.env`, `*.pem`, `id_rsa`, or `credentials.json` patterns.
- No tracked file matching those secret-oriented names was found. Forbidden file contents were not read during this audit.

Impact:

A local credential file can be staged accidentally because the repository has no final ignore barrier for common secret file names.

Recommendation:

Add the repository's agreed secret patterns to `.gitignore` and optionally add a secret scanner to CI. Do not treat the Sentry DSN as a private credential; it is a client-side project identifier, but event payloads still require A-04's privacy controls.

## Validation performed

| Check | Result |
| --- | --- |
| `npm test` | Passed: both TypeScript configurations and 41 shared tests |
| `npm run build` | Passed; reported ineffective Monaco code splitting and an 8.7 MB renderer entry chunk |
| `npm run pack` | Passed after network access was available; produced arm64 macOS app |
| Packaged executable | Mach-O arm64 only; ad-hoc signature, no Team Identifier, no sealed resources |
| Electron fuses | Read from packaged app; permissive defaults confirmed |
| `npm audit --json` | 2 entries: 1 moderate and 1 low, both rooted in bundled DOMPurify |
| `npm audit --omit=dev --json` | Clean, but does not cover browser code bundled from dev dependencies |
| TypeScript with `noUnusedLocals` and `noUnusedParameters` | Both node and web configurations passed |
| Focused preview proof | Confirmed attribute breakout and inline event-handler injection |
| Tracked secret-name scan | No tracked `.env`, PEM, private-key, or credentials file found |

The test command emits Node's `MODULE_TYPELESS_PACKAGE_JSON` warning for each TypeScript test file. It is noisy but not a runtime correctness finding, so it is not assigned an audit ID.

A packaged GUI startup smoke test was not performed. Packaging success alone should not be treated as target-runtime proof; A-07 recommends making that check deterministic in CI with telemetry disabled and isolated test data.

## Recommended remediation order

1. Remove or secure the in-app installer (A-01).
2. Fix preview injection and add CSP/navigation controls (A-02, A-03).
3. Redesign the privileged IPC surface and enforce destructive guardrails in main (A-03).
4. Stop sensitive error data before telemetry (A-04).
5. Pin the release supply chain and sign artifacts (A-06).
6. Make file mutations atomic and serialized (A-05).
7. Add boundary and packaged-runtime tests, then address dependency and packaging drift (A-07 through A-09).
8. Apply startup, scan, fuse, clipboard, and repository hygiene improvements (A-10 through A-14).
