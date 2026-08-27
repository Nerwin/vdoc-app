# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [1.19.0](https://github.com/Nerwin/vdoc-app/compare/v1.18.0...v1.19.0) (2026-08-27)

### Features

* **get-form:** add 'Get page from Confluence' to folder context menu ([9bfa49e](https://github.com/Nerwin/vdoc-app/commit/9bfa49e3be0f0d497ef4e01ddea19594e55a4354))
* **get-form:** fetch all nested pages with cf get --recursive ([6af1035](https://github.com/Nerwin/vdoc-app/commit/6af10357d3cf618da24dbc5cc52606ce93705142))
* **tree:** show folders on top with a folder icon ([9ffc3ef](https://github.com/Nerwin/vdoc-app/commit/9ffc3ef856290119b5ea0c556d9aa8562c13f731))
* **tree:** vdocHide and vdocPin frontmatter flags with pin/unpin context action ([0109465](https://github.com/Nerwin/vdoc-app/commit/0109465263e0082f7b8f93595c9be1e4bfa182bf))
## [1.18.0](https://github.com/Nerwin/vdoc-app/compare/v1.17.3...v1.18.0) (2026-08-26)

### Features

* **telemetry:** enhance Sentry events and add anonymous install id ([fe7115a](https://github.com/Nerwin/vdoc-app/commit/fe7115a1a0986958986f5ef21b58971e306fc0b6))
## [1.17.3](https://github.com/Nerwin/vdoc-app/compare/v1.17.2...v1.17.3) (2026-08-25)

### Bug Fixes

* **release:** sign macOS builds with internal certificate for auto-update ([bc59230](https://github.com/Nerwin/vdoc-app/commit/bc5923054ad694628b3522f86cc8e471360c71e6))
## [1.17.2](https://github.com/Nerwin/vdoc-app/compare/v1.17.1...v1.17.2) (2026-08-25)

### Bug Fixes

* remove manual update process ([4993e9e](https://github.com/Nerwin/vdoc-app/commit/4993e9e0323bf2034b80c7130d4a12b61bfb6d16))
## [1.17.1](https://github.com/Nerwin/vdoc-app/compare/v1.17.0...v1.17.1) (2026-08-25)

### Bug Fixes

* fix macos signing ([d809b98](https://github.com/Nerwin/vdoc-app/commit/d809b98e0a7daeb0ff0e41fd001d177de4549fd8))
## [1.17.0](https://github.com/Nerwin/vdoc-app/compare/v1.16.0...v1.17.0) (2026-08-25)

### Features

* add more trace for sentry and improve update process ([1e9ba96](https://github.com/Nerwin/vdoc-app/commit/1e9ba966d5a9fcbb8a69af09ca59f0289f38f8aa))
## [1.16.0](https://github.com/Nerwin/vdoc-app/compare/v1.15.1...v1.16.0) (2026-08-25)

### Features

* add tracing using Sentry ([58e9280](https://github.com/Nerwin/vdoc-app/commit/58e9280273017be74d5dfb3f3328c795251f73c1))
* **sync:** gate lossy force pushes ([a844692](https://github.com/Nerwin/vdoc-app/commit/a844692a4efa12b3464d5668e36acd5509829983))

### Bug Fixes

* **logs:** restore clipboard actions ([c86ed33](https://github.com/Nerwin/vdoc-app/commit/c86ed33207be1874d744db5f1ccf447083d1cca7))
* **tree:** restore clipboard actions ([e5bc930](https://github.com/Nerwin/vdoc-app/commit/e5bc930340c57565358eacff2f37ab007da2fd5e))
## [1.15.1](https://github.com/Nerwin/vdoc-app/compare/v1.15.0...v1.15.1) (2026-08-25)
## [1.15.0](https://github.com/Nerwin/vdoc-app/compare/v1.14.4...v1.15.0) (2026-08-25)

### Features

* **scripts:** improve release script to automate actions ([9758cde](https://github.com/Nerwin/vdoc-app/commit/9758cdedb03311178c455c382a08822580b5e144))
## [1.14.4](https://github.com/Nerwin/vdoc-app/compare/v1.14.3...v1.14.4) (2026-08-25)

### Bug Fixes

* **ci:** repair bundled dependency lock entries ([75966f4](https://github.com/Nerwin/vdoc-app/commit/75966f428901307a9d3e629387347e0dd108fc73))
* make CLI operations cancellable ([2aa82e3](https://github.com/Nerwin/vdoc-app/commit/2aa82e370ca67ffbd25e30e05417ca23c876315f))
## [1.14.3](https://github.com/Nerwin/vdoc-app/compare/v1.14.2...v1.14.3) (2026-08-25)

### Bug Fixes

* update packages ([36079eb](https://github.com/Nerwin/vdoc-app/commit/36079eb175aff62ccf80bb8e84503b65b0b0ae72))
## [1.14.2](https://github.com/Nerwin/vdoc-app/compare/v1.14.1...v1.14.2) (2026-08-25)

### Bug Fixes

* update package lock ([9cdc489](https://github.com/Nerwin/vdoc-app/commit/9cdc489f2da8a48425dc895c74cdc395e5ded358))
## [1.14.1](https://github.com/Nerwin/vdoc-app/compare/v1.14.0...v1.14.1) (2026-08-25)
## [1.14.0](https://github.com/Nerwin/vdoc-app/compare/v1.13.0...v1.14.0) (2026-08-25)

### Features

* show accessible Confluence spaces ([a899ac8](https://github.com/Nerwin/vdoc-app/commit/a899ac844592f0ce513c9d580c904e89f168fa3a))
* **updater:** adopt electron-updater ([f8dec8d](https://github.com/Nerwin/vdoc-app/commit/f8dec8d187427e7ab8e33264863c42db34b9ee1c))

### Bug Fixes

* **ci:** harden release publishing ([81e157f](https://github.com/Nerwin/vdoc-app/commit/81e157f4a291c2c2eca3f0d3b7a5805009eb87b9))
* **deps:** override vulnerable DOMPurify ([372aff7](https://github.com/Nerwin/vdoc-app/commit/372aff79b10b79f40ce4892868eafe4a6eb6988a))
* **editor:** serialize guarded file saves ([0b380aa](https://github.com/Nerwin/vdoc-app/commit/0b380aa30fa6b7d5d131f7f60b472ff6b6b8755d))
* **electron:** harden packaged runtime fuses ([054c117](https://github.com/Nerwin/vdoc-app/commit/054c1176fb8e76d32505ba8dfa2398c77ae60c13))
* **frontmatter:** harden metadata parsing ([e8d5f15](https://github.com/Nerwin/vdoc-app/commit/e8d5f1522e5072b75f7c08167d6bc9eea60cd2e4))
* **frontmatter:** include confluence space metadata ([1444510](https://github.com/Nerwin/vdoc-app/commit/144451024b21cb1a697e5c33f773989a0b38615e))
* **logs:** shell-quote copied commands ([931bc32](https://github.com/Nerwin/vdoc-app/commit/931bc32bfdcd5905df6b813968bdff75b2557bc6))
* remove Confluence email configuration ([e5113ab](https://github.com/Nerwin/vdoc-app/commit/e5113ab3ad52fd6ed4eff6e34f5a05b34ff256fa))
* **security:** enforce sync guardrails in main ([842a362](https://github.com/Nerwin/vdoc-app/commit/842a3623e0018255b57381517333b4a19aaa3bdf))
* **security:** harden electron renderer boundary ([7d8da23](https://github.com/Nerwin/vdoc-app/commit/7d8da237beecd31fd3253403738eee5c3cd9c433))
* **security:** prevent preview markup injection ([fabc49f](https://github.com/Nerwin/vdoc-app/commit/fabc49f7a225e41220b416888763ac76d7feb790))
* **security:** redact sensitive telemetry data ([30f0f6f](https://github.com/Nerwin/vdoc-app/commit/30f0f6f68c005c8e690ded2299de1c5dc2d4c560))
* **security:** remove unsigned in-app updater ([9ab0611](https://github.com/Nerwin/vdoc-app/commit/9ab0611831f9f45e8194c4e4869daf7257ec237b))
* **security:** validate ipc inputs and paths ([07cf8c7](https://github.com/Nerwin/vdoc-app/commit/07cf8c70cc4aa2272ba2f0085659f44a0acb8686))

### Performance

* **renderer:** lazy-load Monaco editor ([1e31de4](https://github.com/Nerwin/vdoc-app/commit/1e31de4ba2a81b75b7f8bf17cd6efac4c0cdb0ba))
* **scan:** remove redundant file reads ([64bf614](https://github.com/Nerwin/vdoc-app/commit/64bf614be0e7ec9e323832e17bc8bafa11d5eefd))

### Docs

* **readme:** document supported features ([d3522c4](https://github.com/Nerwin/vdoc-app/commit/d3522c404b5bab219cc8f3868031674f03894657))
* **release:** clarify Apple Silicon support ([ec9b012](https://github.com/Nerwin/vdoc-app/commit/ec9b0126d31029a8f2d32596d0f22a54d67df899))
## [1.13.0](https://github.com/Nerwin/vdoc-app/compare/v1.12.1...v1.13.0) (2026-08-25)

### Features

* **init:** add md init command to add missing frontmatter in a file ([3a47492](https://github.com/Nerwin/vdoc-app/commit/3a47492c5cf238b423d22ee01b89b9d80007c5c9))
* **tree:** add confluenceIgnore to exclude files from sync ([60cfc67](https://github.com/Nerwin/vdoc-app/commit/60cfc673d37c056ea7610c5007fb7f03b27648ae))
## [1.12.1](https://github.com/Nerwin/vdoc-app/compare/v1.12.0...v1.12.1) (2026-08-24)
## [1.12.0](https://github.com/Nerwin/vdoc-app/compare/v1.11.0...v1.12.0) (2026-08-24)

### Features

* **monitoring:** report toast-path errors and render crashes to Sentry ([63a5b45](https://github.com/Nerwin/vdoc-app/commit/63a5b45f21076398c6da23f53e5ed8ff2c0c3be4))
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
