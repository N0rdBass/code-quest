#!/usr/bin/env bash
# Starts Code Quest on Linux, also from a USB stick.
#
# Many Linux PCs mount FAT USB sticks so that programs on them can't be started
# directly (the "showexec" mount option: only .exe/.com/.bat count as programs).
# This script then starts Code Quest through the Linux program loader, which
# works anyway. Progress is still saved on the stick, in code-quest-data next
# to the program.
#
# Run it with:   bash start-code-quest-linux.sh

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The program: next to this script (a plain copy on a stick), or in the build
# folder (a copy of the whole project).
app=""
for candidate in "$here/code-quest" "$here/src-tauri/target/release/code-quest"; do
  if [ -f "$candidate" ]; then
    app="$candidate"
    break
  fi
done
if [ -z "$app" ]; then
  echo "Could not find the Code Quest program next to this script." >&2
  exit 1
fi

# Allowed to run directly? Then just do that.
if [ -x "$app" ]; then
  exec "$app" "$@"
fi

# Otherwise through the program loader. Code Quest notices this and still saves
# progress next to the program, not next to the loader.
for loader in /lib64/ld-linux-x86-64.so.2 /lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 /lib/ld-linux-aarch64.so.1; do
  if [ -e "$loader" ]; then
    exec "$loader" "$app" "$@"
  fi
done

echo "Could not find the Linux program loader to start Code Quest." >&2
exit 1
