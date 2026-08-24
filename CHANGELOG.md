# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [1.11.0](https://github.com/Nerwin/vdoc-app/compare/v1.10.0...v1.11.0) (2026-08-24)

### Features

* **monitoring:** optional Sentry crash reports with a Settings toggle ([13dca11](https://github.com/Nerwin/vdoc-app/commit/13dca11860891fd6344393ccf33646244e0b9532))
* **update:** in-app install on macOS - download release zip, swap bundle, relaunch ([57651b3](https://github.com/Nerwin/vdoc-app/commit/57651b3a6d6d4aa927ef9b0d9a2230b279d45ed3))
## [1.10.0](https://github.com/Nerwin/vdoc-app/compare/v1.9.2...v1.10.0) (2026-08-24)

### Features

* **commands:** add Check for updates to the command palette ([e391fdd](https://github.com/Nerwin/vdoc-app/commit/e391fdd0d84676b90623fb654b1b0aa3cc181cbc))
## [1.9.2](https://github.com/Nerwin/vdoc-app/compare/v1.9.1...v1.9.2) (2026-08-24)

### Bug Fixes

* **update:** report 'no newer release found' on manual check ([b2b1773](https://github.com/Nerwin/vdoc-app/commit/b2b1773becfd8d1d120bb2e35f473160279dbb60))

### Refactoring

* **update:** release-provider adapters with the feed sourced from package.json ([8081cc2](https://github.com/Nerwin/vdoc-app/commit/8081cc2d3703cd21cfec6a0c864b5983ba0cd787))
## [1.9.1](https://github.com/Nerwin/vdoc-app/compare/v1.9.0...v1.9.1) (2026-08-24)

### Bug Fixes

* **build:** stop electron-builder self-publishing and set deb maintainer email ([7dd5809](https://github.com/Nerwin/vdoc-app/commit/7dd5809511dbfe2f4a31e3a1508b22d62831eddf))
## [1.9.0](https://github.com/Nerwin/vdoc-app/compare/v1.8.0...v1.9.0) (2026-08-24)

### Features

* **renderer:** in-document find, preview code highlighting, sidebar titles, and full-text search ([c5d277d](https://github.com/Nerwin/vdoc-app/commit/c5d277ddc31a2d2d5403db423a948363382af791))
* **settings:** add credential preview and removal for stored keys ([25f2d9b](https://github.com/Nerwin/vdoc-app/commit/25f2d9b6aacedaf40f525194e17019295075c48f))
* **update:** GitHub-release update check in the status bar ([ac159cb](https://github.com/Nerwin/vdoc-app/commit/ac159cb70caf73b0b865f7a06c42c8259146cac0))

### Docs

* memory, auto-update, and monitoring analysis ([32bb778](https://github.com/Nerwin/vdoc-app/commit/32bb7789fe7500e68cf854230d0fbc8c4e4e47d5))
## [1.8.0](///compare/v1.7.0...v1.8.0) (2026-08-24)

### Features

* **settings:** add editable Confluence site in settings modal 12bde00
## [1.7.0](///compare/v1.6.0...v1.7.0) (2026-08-24)

### Features

* **tour:** add app welcome tour with guided steps b462d46
## [1.6.0](///compare/v1.5.1...v1.6.0) (2026-08-24)

### Features

* **renderer:** add editable assets dir and config file editing de05a6a
* **renderer:** add force-pull action and log copy menu 75c2cad
## [1.5.1](///compare/v1.5.0...v1.5.1) (2026-08-20)

### Refactoring

* **renderer:** consolidate time helpers and fuzzy match indices f4f0df0
## [1.5.0](///compare/v1.4.0...v1.5.0) (2026-08-20)

### Features

* **logs:** add CLI logs view, sync help modal, and persisted checks 8944219
## [1.4.0](///compare/v1.3.0...v1.4.0) (2026-08-20)

### Features

* cross-platform support (Windows/Linux) and configurable docs repository c8d8389
* **topbar:** move check all to dashboard, fix mermaid rendering 5f2cda2
## [1.3.0](///compare/v1.2.1...v1.3.0) (2026-08-19)

### Features

* **navigation:** add forward history and recent files palette b602d8e
## [1.2.1](///compare/v1.2.0...v1.2.1) (2026-08-19)
## [1.2.0](///compare/v1.1.3...v1.2.0) (2026-08-19)

### Features

* **detail-pane:** show confluence labels in tab bar 231ef08
## [1.1.3](///compare/v1.1.2...v1.1.3) (2026-08-18)
## [1.1.2](///compare/v1.1.1...v1.1.2) (2026-08-18)
## [1.1.1](///compare/v1.1.0...v1.1.1) (2026-08-18)
## 1.1.0 (2026-08-11)

### Features

* add dashboard view, comments view and the markdown previsualisation b85f12e
* add new settings for projects mapping and config file open button 4580ee8
* backlinks panel and local link navigation in the preview 6eb11da
* **editor:** edit markdown in-app with debounced auto-save 6d7cf7b
* get a Confluence page into a chosen folder 7e4be31
* navigation history with a Back button 8f1777c
* new setting to add and remove folders to the tree. And improve CLI path support 9be536d
* split view with live editor and preview c0ce7a5
* **ui:** redesign layout and command palette b3b6769
* V1 of the application 998656d

### Bug Fixes

* **ui:** name the baseline action Verify and correct the unverified hint 680a1ce

### Docs

* catch the README up and document the release flow 2e4cb19
