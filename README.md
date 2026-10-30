# Code Quest

A free, open-source desktop app that teaches kids aged 8–12 to program, in
Norwegian and English. Kids drag code blocks (Blockly), learn the basics with
Bit the robot, and then build a real game step by step: Snake first, more later.
It runs offline from a USB stick or a laptop, with no accounts and no internet.

**Status: prototype (v0.1.0, 2026-10-30).** Built so far: the basics course
(5 lessons) and Snake (6 lessons), in blocks mode with a "Show code" panel.

## What's in the prototype

| Part | What it does |
|---|---|
| Players | Nickname profiles, many kids on one PC. No real names or accounts needed. |
| Basics (5 lessons) | Bit the robot: steps in order, repeat, score (variables), if, key events. Lesson 4 is tested on two different maps, so the `if` really matters. |
| Snake (6 lessons) | Move, steer, eat, walls, don't bite yourself, make it yours. Each lesson starts with the kid's own blocks from the lesson before, so they build *one* game. |
| Show code | Shows the blocks as real JavaScript, side by side (the "blocks → code" bridge). |
| Diploma | Printable diploma with the kid's name after finishing Snake. |
| Languages | Norsk / English switch on the start screen and the map. |
| Portable saves | Progress is saved in `code-quest-data/` next to the app, so it travels on the USB stick. |

Lessons open in order. Teachers can **Shift-click** a locked lesson to open it anyway.

## Folders

```
code-quest/
├── app/                 everything shown in the app window (HTML/CSS/JS)
│   ├── index.html
│   ├── ui/              app code: js/, css/, i18n/ (en.json, no.json), img/
│   ├── lessons/         lesson texts and maps: CC BY-SA 4.0 (see LICENSE-CONTENT.md)
│   └── vendor/blockly/  Blockly 12.5.1 (Apache 2.0), stored here so it works offline
├── src-tauri/           the desktop shell (Rust/Tauri 2): window + saving progress
├── licenses/            full licence texts of third-party code
├── LICENSE              MIT (code)
└── THIRD-PARTY-NOTICES.md
```

How the code fits together:

- `ui/js/app.js`: screens (players → map → lesson → diploma)
- `ui/js/lesson.js`: lesson screen, turns blocks into code, runs it, checks the goal
- `ui/js/blocks.js`: Code Quest's blocks, their translated labels and the code they generate
- `ui/js/worlds/robot.js`, `worlds/snake.js`: the two game worlds
- `ui/js/storage.js`: profiles and saving (through Rust in the app, localStorage in a browser)
- `src-tauri/src/main.rs`: finds the portable save folder and reads/writes `progress.json`

## Build and run

Needs Rust and, on Linux, the WebKitGTK dev packages (already set up on jan-desktop for Solvex).

```bash
cd src-tauri
cargo build --release
./target/release/code-quest
```

The finished program is `src-tauri/target/release/code-quest` (about 5 MB). The
web files are packed inside it, so you only need that one file.

**After changing anything in `app/`, run `touch src/main.rs` before `cargo build`.**
Cargo doesn't notice changed web files by itself, and would keep the old ones.

**Put it on a USB stick (Linux):** copy `code-quest` to the stick and run it from
there. A `code-quest-data/` folder appears next to it with the saved progress.

**Windows / macOS:** build on the Windows VM / MacBook the same way as Solvex
(`cargo build --release` there gives `code-quest.exe` / `code-quest`). Windows
needs WebView2, which comes with Windows 10 and 11. Installers (`.msi`, `.dmg`,
AppImage) need the Tauri CLI (`cargo install tauri-cli`, then `cargo tauri build`).
That's for later.

If the app's folder can't be written to (e.g. installed in Program Files), progress
goes to the normal per-user app data folder instead. The start screen shows where.

## Quick testing in a browser

```bash
cd app
python3 -m http.server 8765
```

Open <http://127.0.0.1:8765/>. In a browser, progress goes to localStorage instead
of the file. Add `?debug` to the address to expose the lesson as `window.cqLesson`
for test scripts.

## Adding a lesson

Lessons are JSON in `app/lessons/`. Each has `title`, `story`, `task`, `hint` and
`concept` in both `en` and `no`, a `toolbox` (block names), a `goal`, and either
`starter` blocks or `carryFrom` (start from the kid's blocks in another lesson).
Robot maps are rows of characters: `S` start, `F` flag, `C` coin, `#` wall, `.` floor.
To limit blocks, use `"limits": { "bit_move": 2, "controls_repeat_ext": 1 }` (per block type).
Don't use Blockly's overall `maxBlocks`: it also counts the event block and the number
bubble inside "repeat", so kids get fewer blocks than the lesson says.

## Next steps

- Try it with a real kid (age 8–12) and fix what confuses them.
- Code mode (typing instead of blocks) for ages 10–12.
- Instructor guide for coding clubs.
- Export/import progress as a file for installed copies.
- Windows + macOS builds, then Minesweeper ★★.
