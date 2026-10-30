# Third-party notices

Code Quest includes or is built with the following open-source software.

## Blockly 12.5.1
- Files: `app/vendor/blockly/` (unchanged copies from the npm package `blockly@12.5.1`)
- Copyright 2011 Google LLC
- Licence: Apache License 2.0, full text in `licenses/Apache-2.0.txt`
- <https://github.com/google/blockly>

## Tauri 2
- Used to build the desktop app (`src-tauri/`)
- Licence: MIT or Apache License 2.0
- <https://tauri.app>

## Rust crates
The desktop app is compiled from many Rust crates (listed in `src-tauri/Cargo.lock`),
almost all under MIT and/or Apache 2.0. Before a public release, generate a full list
with `cargo about` or `cargo license` and ship it next to the app.
