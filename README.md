# Code Quest

A free, open-source desktop app that teaches kids aged 8–12 to program, in
Norwegian and English. Kids drag code blocks (Blockly), learn the basics with
Bit the robot, and then build a real game step by step: Snake first, more later.
It runs offline from a USB stick or a laptop, with no accounts and no internet.

**Status: prototype (v0.1.0, 2026-10-30; code mode added 2026-11-05).** Built so
far: the basics course (5 lessons), Snake (6 lessons) and Minesweeper (6 lessons),
in all three modes: blocks, blocks + code, and typed code.

## What's in the prototype

| Part | What it does |
|---|---|
| Players | Nickname profiles, many kids on one PC. No real names or accounts needed. |
| Basics (5 lessons) | Bit the robot: steps in order, repeat, score (variables), if, key events. Lesson 4 is tested on two different maps, so the `if` really matters. |
| Snake (6 lessons) | Move, steer, eat, walls, don't bite yourself, make it yours. Each lesson starts with the kid's own blocks from the lesson before, so they build *one* game. |
| Three modes | A switch at the top of every lesson: **Blocks** (drag and drop), **Both** (blocks with the real JavaScript they make next to them) and **Code** (type JavaScript). The choice is saved per player. |
| Code mode | A kid-friendly editor (line numbers, colours, auto-indent, red/yellow squiggly lines under mistakes while typing, with the message on hover), a list of the lesson's commands to click in, and mistakes explained in plain words with the line marked in red. Switching to code the first time starts from the kid's own blocks, turned into code. `console.log` prints below the editor. Clicking any symbol or word (`{ }`, `( )`, `' '`, `;`, `for`, `i` …) explains what it means there, and a Symbols list sums them up. |
| Minesweeper (6 lessons) | The minefield (grid, coordinates x/y, click events), Boom! (if → game over), How many mines? (a loop over the 8 neighbours and a counter; wrong numbers are caught), Flags (right-click event), Open the empty areas (recursion as a ready-made block: `field.clickAround` runs the kid's own click code again), You win! Numbers along the edges and "column 3, row 5" on hover teach coordinates. The first click is never a mine. |
| Diploma | Printable diploma with the kid's name after finishing a game. |
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
- `ui/js/lesson.js`: lesson screen and mode switch, turns blocks or typed code into a program, runs it, checks the goal
- `ui/js/blocks.js`: Code Quest's blocks, their translated labels and the code they generate
- `ui/js/kidcode.js`: code mode's checker. While the kid types (like VS Code) it finds mistakes with their exact characters: missing `}` or `"`, a loop without `{ }`, `whenrunclicked` spelled wrong, a command that doesn't exist (`bit.mvoe`), a word a command doesn't know (`bit.move('downn')`), and a missing `;` (a yellow warning). Before running it adds a guard to every loop so `while (true)` can't freeze the app, and tags every command (`__t(7, bit).move(…)`) so an error while the game runs points at the exact command in every browser engine, without relying on stack traces
- `ui/js/hints.js`: "Find my mistake": compares the kid's code with the lesson's `solution`, piece by piece (functions, ifs, loops, commands and what's inside what), and finds what is missing, in the wrong place, almost right, or too early. Ignores small differences (loop variable names, `count++`, `===`). Hints come in two steps: first where, then what
- `ui/js/editor.js`: the code editor (a textarea on top of a coloured copy of the text)
- `ui/js/codehelp.js`: the command list in code mode, built from the lesson's toolbox (plus the Symbols list)
- `ui/js/explain.js`: the bar under the editor that explains the symbol or word at the cursor, in context (the `(` after `if` holds a question; the `(` after `bit.move` gives it extra information; a `}` says which function or loop it closes)
- `ui/js/worlds/robot.js`, `worlds/snake.js`, `worlds/mines.js`: the game worlds. Bit's world runs the kid's code instantly and records each step, then animates the steps, so typed code never needs `await`
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
Every lesson has a `solution` (the model code), used by "Find my mistake". Keep it simple and in the same style as the lesson texts.
For code mode, add `taskCode` and `hintCode` (both languages) when the normal task talks
about dragging blocks; they're shown instead of `task` and `hint` in code mode.
To limit blocks, use `"limits": { "bit_move": 2, "controls_repeat_ext": 1 }` (per block type).
In code mode the same limits count `bit.move(` and loops (see `LIMIT_MATCHERS` in `kidcode.js`).
Don't use Blockly's overall `maxBlocks`: it also counts the event block and the number
bubble inside "repeat", so kids get fewer blocks than the lesson says.

## Next steps

- Try it with a real kid (age 8–12) and fix what confuses them.
- Try code mode in the desktop window itself (tested in a browser so far) and with a 10–12 year old.
- Instructor guide for coding clubs.
- Export/import progress as a file for installed copies.
- Windows + macOS builds, then Garden defence ★★★.
