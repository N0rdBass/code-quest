// Signals used to stop kid code. None of these are real bugs.

/** The Stop button was pressed (or the lesson closed): end quietly. */
export class StopSignal extends Error {}

/** "game over" was called: end this tick, the game handles the rest. */
export class GameOverSignal extends Error {}

/** A loop ran far too many times. */
export class LoopError extends Error {}

/** Something the kid can fix; `key` is a translation key like 'msg.bump'. */
export class KidError extends Error {
  constructor(key, vars) {
    super(key);
    this.key = key;
    this.vars = vars;
  }
}
