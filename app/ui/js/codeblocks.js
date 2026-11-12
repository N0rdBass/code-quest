// Turns a piece of code back into blocks, so blocks-mode hints can show the
// missing piece as real blocks instead of code. It only needs to know Code
// Quest's own blocks: the code it gets comes from the lessons' solutions.
//
// Works on the statement tree from hints.js, whose keys are already tidied:
// no spaces, loop variables renamed to $0, $1 …

const HATS = {
  whenRunClicked: { type: 'event_start' },
  everyTick: { type: 'event_tick' },
  whenSquareClicked: { type: 'event_click' },
  whenSquareRightClicked: { type: 'event_rightclick' },
  whenCreated: { type: 'event_created' },
  whenHit: { type: 'event_hit' },
  whenKeyUp: { type: 'event_key', fields: { KEY: 'up' } },
  whenKeyDown: { type: 'event_key', fields: { KEY: 'down' } },
  whenKeyLeft: { type: 'event_key', fields: { KEY: 'left' } },
  whenKeyRight: { type: 'event_key', fields: { KEY: 'right' } },
};

// obj.method(…) → block. `field`: the argument goes in a dropdown or number field.
// `xy`: the arguments go in the X and Y inputs (and a third one in N).
const CALLS = {
  'bit.move': { type: 'bit_move', field: 'DIR' },
  'bit.pickUpCoin': { type: 'bit_pickup' },
  'bit.isOnCoin': { type: 'bit_on_coin' },
  'game.changeScore': { type: 'score_change', field: 'N' },
  'game.over': { type: 'game_over' },
  'game.faster': { type: 'speed_up' },
  'game.win': { type: 'game_win' },
  'snake.move': { type: 'snake_move' },
  'snake.turn': { type: 'snake_turn', field: 'DIR' },
  'snake.grow': { type: 'snake_grow' },
  'snake.placeFood': { type: 'food_place' },
  'snake.isOnFood': { type: 'snake_on_food' },
  'snake.hitsWall': { type: 'snake_hits_wall' },
  'snake.bitesItself': { type: 'snake_hits_self' },
  'snake.setColour': { type: 'snake_color', field: 'COLOUR' },
  'field.placeMines': { type: 'field_place_mines', field: 'N' },
  'field.reveal': { type: 'field_reveal', xy: true, withN: 'field_reveal_n' },
  'field.hasMine': { type: 'field_has_mine', xy: true },
  'field.toggleFlag': { type: 'field_flag', xy: true },
  'field.clickAround': { type: 'field_click_around', xy: true },
  'field.showMines': { type: 'field_show_mines' },
  'field.allSafeOpen': { type: 'field_all_open' },
  'garden.build': { type: 'garden_build', xy: true },
  'garden.buildFence': { type: 'garden_fence', xy: true },
  'garden.newBug': { type: 'garden_new_bug' },
  'me.move': { type: 'me_move' },
  'me.squash': { type: 'me_squash' },
  'me.shoot': { type: 'me_shoot' },
  'garden.bugAtHouse': { type: 'garden_bug_home' },
  'garden.stopped': { type: 'garden_stopped' },
  'game.every': { type: 'game_every', field: 'N' },
  'game.changeCoins': { type: 'coins_change', field: 'N' },
  'game.coins': { type: 'coins_get' },
  'map.put': { type: 'map_put', field: 'TILE', xyFrom: 1 },
  'map.house': { type: 'map_house', inputs: ['Y'] },
  'map.create': { type: 'map_create', fields: ['COLS', 'ROWS'] },
};

// Inside "for each sprinkler" a loop variable's .x means the sprinkler's column;
// inside "for each square around" it means that square's column.
let loopItem = 'square';

const VALUES = {
  x: { type: 'click_x' },
  y: { type: 'click_y' },
  count: { type: 'count_get' },
  'me.hp': { type: 'me_hp' },
};

/** Split "a,b(c,d),e" at the commas that aren't inside brackets. */
function splitArgs(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** A call like field.hasMine(x,y) → { name: 'field.hasMine', args: ['x', 'y'] }. */
function call(s) {
  const m = /^([\w$]+\.[\w$]+)\((.*)\)$/.exec(s);
  return m ? { name: m[1], args: splitArgs(m[2]) } : null;
}

// Inside the map's row/column loops, the loop variables ($0, $1 …) are the
// "row y" / "column x" blocks.
const gridVars = {};

function value(s) {
  if (gridVars[s]) return { type: gridVars[s] };
  if (VALUES[s]) return { ...VALUES[s] };
  if (/^\$\d+\.x$/.test(s)) return { type: `${loopItem}_x` };
  if (/^\$\d+\.y$/.test(s)) return { type: `${loopItem}_y` };
  if (/^-?\d+(\.\d+)?$/.test(s)) return { type: 'math_number', fields: { NUM: Number(s) } };
  const cmp = /^(.+?)(==|!=|<=|>=|<|>)(.+)$/.exec(s);
  if (cmp) {
    const OP = { '==': 'EQ', '!=': 'NEQ', '<': 'LT', '<=': 'LTE', '>': 'GT', '>=': 'GTE' }[cmp[2]];
    return { type: 'logic_compare', fields: { OP }, inputs: { A: input(cmp[1]), B: input(cmp[3]) } };
  }
  return callBlock(s);
}

function input(s) {
  const b = value(s);
  return b ? { block: b } : undefined;
}

function callBlock(s) {
  const c = call(s);
  const spec = c && CALLS[c.name];
  if (!spec) return null;
  const block = { type: spec.withN && c.args.length > 2 ? spec.withN : spec.type };
  if (spec.field && c.args[0] != null) block.fields = { [spec.field]: c.args[0].replace(/^'|'$/g, '') };
  // Several numbers in fields (map.create(9, 5)) or in named inputs (map.house(2)).
  if (spec.fields) block.fields = Object.fromEntries(spec.fields.map((f, i) => [f, Number(c.args[i])]));
  if (spec.inputs) block.inputs = Object.fromEntries(spec.inputs.map((name, i) => [name, input(c.args[i])]));
  if (spec.xyFrom != null) block.inputs = { X: input(c.args[spec.xyFrom]), Y: input(c.args[spec.xyFrom + 1]) };
  if (spec.xy) {
    block.inputs = { X: input(c.args[0]), Y: input(c.args[1]) };
    if (c.args[2] != null) block.inputs.N = input(c.args[2]);
  }
  return block;
}

/** One statement (with what's inside it) → a block, or null if it isn't known. */
function statement(node) {
  const [, body] = node.key.split(/:(.*)/s);
  if (node.kind === 'function') {
    const hat = HATS[node.name];
    return hat ? { ...hat, inputs: { DO: chain(node.body || []) } } : null;
  }
  if (node.kind === 'if') {
    return { type: 'controls_if', inputs: { IF0: input(body), DO0: chain(node.body || []) } };
  }
  if (node.kind === 'for') {
    // The map's loops: for (let y = 0; y < 5; y++) / for (let x = 0; x < 9; x++)
    const grid = /^for \(let ([xy]) = 0; \1 < (?:\d+|map\.(?:rows|columns)\(\)); \1\+\+\)/.exec(node.show);
    const renamed = /^let(\$\d+)=0;/.exec(body);
    if (grid && renamed) {
      gridVars[renamed[1]] = grid[1] === 'x' ? 'click_x' : 'click_y';
      try {
        return { type: grid[1] === 'x' ? 'map_for_columns' : 'map_for_rows', inputs: { DO: chain(node.body || []) } };
      } finally {
        delete gridVars[renamed[1]];
      }
    }
    const times = /^let\$\d+=0;\$\d+<(\d+);\$\d+\+\+$/.exec(body);
    if (times) {
      return {
        type: 'controls_repeat_ext',
        inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: Number(times[1]) } } }, DO: chain(node.body || []) },
      };
    }
    const around = /^const\$\d+offield\.neighbours\((.*)\)$/.exec(body);
    if (around) {
      const [x, y] = splitArgs(around[1]);
      return { type: 'for_neighbours', inputs: { X: input(x), Y: input(y), DO: inLoop('square', node) } };
    }
    return null;
  }
  if (node.kind === 'let' && /^letcount=0$/.test(body)) return { type: 'count_set' };
  let m;
  if ((m = /^me\.speed=(-?[\d.]+)$/.exec(body))) return { type: 'me_set_speed', fields: { N: Number(m[1]) } };
  if ((m = /^me\.hp=(-?\d+)$/.exec(body))) return { type: 'me_set_hp', fields: { N: Number(m[1]) } };
  if ((m = /^me\.hp=me\.hp([+-])(\d+)$/.exec(body))) return { type: 'me_change_hp', fields: { N: Number(m[2]) * (m[1] === '-' ? -1 : 1) } };
  if (body === 'count=count+1') return { type: 'count_add' };
  return callBlock(body);
}

function inLoop(item, node) {
  const outer = loopItem;
  loopItem = item;
  try {
    return chain(node.body || []);
  } finally {
    loopItem = outer;
  }
}

/** Statements → one stack of blocks (each one's `next` is the one after it). */
function chain(nodes) {
  const blocks = nodes.map(statement).filter(Boolean);
  for (let i = blocks.length - 2; i >= 0; i--) blocks[i].next = { block: blocks[i + 1] };
  return blocks.length ? { block: blocks[0] } : undefined;
}

/** A statement node from hints.js → Blockly JSON for one block stack, or null. */
export function blocksFor(node) {
  return statement(node);
}
