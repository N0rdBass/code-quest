// Code Quest's own blocks: how they look (with translated labels) and what
// JavaScript they turn into. Built-in Blockly blocks (repeat, if) are reused.
//
// The generator has two modes:
//   - run mode: real code for the game, with a loop guard so a huge repeat
//     can't freeze the app
//   - display mode (gen.cqDisplay): tidy code for the "Show code" panel. This is
//     also exactly what a kid types in code mode, so switching from blocks to
//     code starts from their own blocks.

import { t } from './i18n.js';

const COLOUR = { events: 45, robot: 210, snake: 135, score: 25, game: 0, field: 195, where: 290, count: 25, garden: 95, coins: 45 };

function dirOptions(group) {
  return ['up', 'down', 'left', 'right'].map((d) => [t(`blocks.${group}.${d}`), d]);
}

/** (Re)define all blocks with labels in the current language. */
export function defineBlocks() {
  Blockly.common.defineBlocksWithJsonArray([
    // ---- events (hats) ----
    {
      type: 'event_start',
      message0: `${t('blocks.eventStart')} %1 %2`,
      args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      colour: COLOUR.events,
    },
    {
      type: 'event_tick',
      message0: `${t('blocks.eventTick')} %1 %2`,
      args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      colour: COLOUR.events,
    },
    {
      type: 'event_key',
      message0: `${t('blocks.eventKey')} %2 %3`,
      args0: [
        { type: 'field_dropdown', name: 'KEY', options: dirOptions('key') },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: COLOUR.events,
    },

    // ---- Bit the robot ----
    {
      type: 'bit_move',
      message0: t('blocks.move'),
      args0: [{ type: 'field_dropdown', name: 'DIR', options: rightFirst(dirOptions('dir')) }],
      previousStatement: null,
      nextStatement: null,
      colour: COLOUR.robot,
    },
    {
      type: 'bit_pickup',
      message0: t('blocks.pickUp'),
      previousStatement: null,
      nextStatement: null,
      colour: COLOUR.robot,
    },
    {
      type: 'bit_on_coin',
      message0: t('blocks.onCoin'),
      output: 'Boolean',
      colour: COLOUR.robot,
    },

    // ---- score (shared by all worlds) ----
    {
      type: 'score_change',
      message0: t('blocks.changeScore'),
      args0: [{ type: 'field_number', name: 'N', value: 1, precision: 1, min: -100, max: 100 }],
      previousStatement: null,
      nextStatement: null,
      colour: COLOUR.score,
    },

    // ---- Snake ----
    statement('snake_move', t('blocks.snakeMove'), COLOUR.snake),
    {
      type: 'snake_turn',
      message0: t('blocks.snakeTurn'),
      args0: [{ type: 'field_dropdown', name: 'DIR', options: dirOptions('dir') }],
      previousStatement: null,
      nextStatement: null,
      colour: COLOUR.snake,
    },
    statement('snake_grow', t('blocks.snakeGrow'), COLOUR.snake),
    statement('food_place', t('blocks.placeFood'), COLOUR.snake),
    question('snake_on_food', t('blocks.onFood'), COLOUR.snake),
    question('snake_hits_wall', t('blocks.hitsWall'), COLOUR.snake),
    question('snake_hits_self', t('blocks.hitsSelf'), COLOUR.snake),
    statement('game_over', t('blocks.gameOver'), COLOUR.game, { nextStatement: undefined }),
    statement('speed_up', t('blocks.speedUp'), COLOUR.snake),
    {
      type: 'snake_color',
      message0: t('blocks.snakeColor'),
      args0: [
        {
          type: 'field_dropdown',
          name: 'COLOUR',
          options: ['green', 'blue', 'purple', 'orange', 'pink'].map((c) => [t(`blocks.colour.${c}`), c]),
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOUR.snake,
    },

    // ---- Minesweeper ----
    {
      type: 'event_click',
      message0: `${t('blocks.eventClick')} %1 %2`,
      args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      colour: COLOUR.events,
    },
    {
      type: 'event_rightclick',
      message0: `${t('blocks.eventRightClick')} %1 %2`,
      args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      colour: COLOUR.events,
    },
    reporter('click_x', t('blocks.clickX'), COLOUR.where),
    reporter('click_y', t('blocks.clickY'), COLOUR.where),
    reporter('square_x', t('blocks.squareX'), COLOUR.where),
    reporter('square_y', t('blocks.squareY'), COLOUR.where),
    {
      type: 'field_place_mines',
      message0: t('blocks.placeMines'),
      args0: [{ type: 'field_number', name: 'N', value: 10, precision: 1, min: 1, max: 40 }],
      previousStatement: null,
      nextStatement: null,
      colour: COLOUR.field,
    },
    xyBlock('field_reveal', t('blocks.reveal'), { statement: true }),
    xyBlock('field_reveal_n', t('blocks.revealN'), { statement: true, extra: [{ type: 'input_value', name: 'N', check: 'Number' }] }),
    xyBlock('field_has_mine', t('blocks.hasMine'), { output: 'Boolean' }),
    xyBlock('field_flag', t('blocks.flag'), { statement: true }),
    xyBlock('field_click_around', t('blocks.clickAround'), { statement: true }),
    statement('field_show_mines', t('blocks.showMines'), COLOUR.field),
    question('field_all_open', t('blocks.allOpen'), COLOUR.field),
    statement('game_win', t('blocks.win'), COLOUR.game, { nextStatement: undefined }),
    {
      type: 'for_neighbours',
      message0: `${t('blocks.forNeighbours')} %3 %4`,
      args0: [
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      colour: 120,
    },
    // ---- Garden defence ----
    xyBlock('garden_build', t('blocks.build'), { statement: true, colour: COLOUR.garden }),
    xyBlock('garden_fence', t('blocks.buildFence'), { statement: true, colour: COLOUR.garden }),
    xyBlock('garden_shoot', t('blocks.shoot'), { statement: true, colour: COLOUR.garden }),
    statement('garden_new_bug', t('blocks.newBug'), COLOUR.garden),
    statement('garden_move_bugs', t('blocks.moveBugs'), COLOUR.garden),
    question('garden_bug_home', t('blocks.bugAtHouse'), COLOUR.garden),
    reporter('garden_stopped', t('blocks.stopped'), COLOUR.garden),
    {
      type: 'game_every',
      message0: t('blocks.every'),
      args0: [{ type: 'field_number', name: 'N', value: 30, precision: 1, min: 1, max: 500 }],
      output: 'Boolean',
      colour: COLOUR.events,
    },
    {
      type: 'for_sprinklers',
      message0: `${t('blocks.forSprinklers')} %1 %2`,
      args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      previousStatement: null,
      nextStatement: null,
      colour: 120,
    },
    reporter('sprinkler_x', t('blocks.sprinklerX'), COLOUR.where),
    reporter('sprinkler_y', t('blocks.sprinklerY'), COLOUR.where),
    {
      type: 'coins_change',
      message0: t('blocks.changeCoins'),
      args0: [{ type: 'field_number', name: 'N', value: -10, precision: 1, min: -100, max: 100 }],
      previousStatement: null,
      nextStatement: null,
      colour: COLOUR.coins,
    },
    reporter('coins_get', t('blocks.coins'), COLOUR.coins),

    statement('count_set', t('blocks.countSet'), COLOUR.count),
    statement('count_add', t('blocks.countAdd'), COLOUR.count),
    reporter('count_get', t('blocks.countGet'), COLOUR.count),
  ]);
}

/** A block with "column [x] row [y]" inputs. */
function xyBlock(type, label, { statement: isStatement, output, extra = [], colour = COLOUR.field }) {
  const def = {
    type,
    message0: label,
    args0: [{ type: 'input_value', name: 'X', check: 'Number' }, { type: 'input_value', name: 'Y', check: 'Number' }, ...extra],
    inputsInline: true,
    colour,
  };
  if (isStatement) Object.assign(def, { previousStatement: null, nextStatement: null });
  if (output) def.output = output;
  return def;
}

function reporter(type, label, colour) {
  return { type, message0: label, output: 'Number', colour };
}

function rightFirst(options) {
  // Kids almost always start by moving right, so make that the default.
  return [...options.filter((o) => o[1] === 'right'), ...options.filter((o) => o[1] !== 'right')];
}

function statement(type, label, colour, extra = {}) {
  const def = { type, message0: label, previousStatement: null, nextStatement: null, colour, ...extra };
  for (const k of Object.keys(def)) if (def[k] === undefined) delete def[k];
  return def;
}

function question(type, label, colour) {
  return { type, message0: label, output: 'Boolean', colour };
}

// ---------------------------------------------------------------------------
// Code generators

let generatorsReady = false;

export function defineGenerators() {
  if (generatorsReady) return;
  generatorsReady = true;

  const gen = javascript.javascriptGenerator;
  const Order = javascript.Order;
  const show = () => gen.cqDisplay === true;
  const guard = '  __loopGuard = 100000;\n';

  const hat = (displayName, register, params = '') => (block) => {
    const body = gen.statementToCode(block, 'DO');
    if (show()) return `function ${displayName(block)}(${params}) {\n${body || `${gen.INDENT}// ${t('code.yourCodeHere')}\n`}}\n\n`;
    return `${register(block)}(${params}) => {\n${guard}${body}});\n`;
  };

  gen.forBlock['event_start'] = hat(() => 'whenRunClicked', () => '__events.onStart(');
  gen.forBlock['event_tick'] = hat(() => 'everyTick', () => '__events.onTick(');
  gen.forBlock['event_key'] = hat(
    (b) => `whenKey${capital(b.getFieldValue('KEY'))}`,
    (b) => `__events.onKey('${b.getFieldValue('KEY')}', `,
  );

  // "repeat 4 times" as the for loop kids see in books: i, then j, k when nested.
  gen.forBlock['controls_repeat_ext'] = (block) => {
    const times = gen.valueToCode(block, 'TIMES', Order.ASSIGNMENT) || '0';
    const branch = gen.addLoopTrap(gen.statementToCode(block, 'DO'), block);
    let depth = 0;
    for (let p = block.getSurroundParent(); p; p = p.getSurroundParent()) if (p.type === 'controls_repeat_ext') depth++;
    const v = 'ijk'[depth] || `i${depth}`;
    return `for (let ${v} = 0; ${v} < ${times}; ${v}++) {\n${branch}}\n`;
  };

  gen.forBlock['bit_move'] = (b) => `bit.move('${b.getFieldValue('DIR')}');\n`;
  gen.forBlock['bit_pickup'] = () => 'bit.pickUpCoin();\n';
  gen.forBlock['bit_on_coin'] = () => ['bit.isOnCoin()', Order.FUNCTION_CALL];

  gen.forBlock['score_change'] = (b) => `game.changeScore(${Number(b.getFieldValue('N')) || 0});\n`;

  gen.forBlock['snake_move'] = () => 'snake.move();\n';
  gen.forBlock['snake_turn'] = (b) => `snake.turn('${b.getFieldValue('DIR')}');\n`;
  gen.forBlock['snake_grow'] = () => 'snake.grow();\n';
  gen.forBlock['food_place'] = () => 'snake.placeFood();\n';
  gen.forBlock['snake_on_food'] = () => ['snake.isOnFood()', Order.FUNCTION_CALL];
  gen.forBlock['snake_hits_wall'] = () => ['snake.hitsWall()', Order.FUNCTION_CALL];
  gen.forBlock['snake_hits_self'] = () => ['snake.bitesItself()', Order.FUNCTION_CALL];
  gen.forBlock['game_over'] = () => 'game.over();\n';
  gen.forBlock['speed_up'] = () => 'game.faster();\n';
  gen.forBlock['snake_color'] = (b) => `snake.setColour('${b.getFieldValue('COLOUR')}');\n`;

  // Minesweeper
  gen.forBlock['event_click'] = hat(() => 'whenSquareClicked', () => '__events.onClick(', 'x, y');
  gen.forBlock['event_rightclick'] = hat(() => 'whenSquareRightClicked', () => '__events.onRightClick(', 'x, y');
  const atom = (code) => () => [code, Order.ATOMIC];
  gen.forBlock['click_x'] = atom('x');
  gen.forBlock['click_y'] = atom('y');
  gen.forBlock['square_x'] = () => ['square.x', Order.MEMBER];
  gen.forBlock['square_y'] = () => ['square.y', Order.MEMBER];
  gen.forBlock['count_get'] = atom('count');
  const xy = (b) => `${gen.valueToCode(b, 'X', Order.NONE) || '0'}, ${gen.valueToCode(b, 'Y', Order.NONE) || '0'}`;
  gen.forBlock['field_place_mines'] = (b) => `field.placeMines(${Number(b.getFieldValue('N')) || 10});\n`;
  gen.forBlock['field_reveal'] = (b) => `field.reveal(${xy(b)});\n`;
  gen.forBlock['field_reveal_n'] = (b) => `field.reveal(${xy(b)}, ${gen.valueToCode(b, 'N', Order.NONE) || '0'});\n`;
  gen.forBlock['field_has_mine'] = (b) => [`field.hasMine(${xy(b)})`, Order.FUNCTION_CALL];
  gen.forBlock['field_flag'] = (b) => `field.toggleFlag(${xy(b)});\n`;
  gen.forBlock['field_click_around'] = (b) => `field.clickAround(${xy(b)});\n`;
  gen.forBlock['field_show_mines'] = () => 'field.showMines();\n';
  gen.forBlock['field_all_open'] = () => ['field.allSafeOpen()', Order.FUNCTION_CALL];
  gen.forBlock['game_win'] = () => 'game.win();\n';
  // Garden defence
  gen.forBlock['garden_build'] = (b) => `garden.build(${xy(b)});\n`;
  gen.forBlock['garden_fence'] = (b) => `garden.buildFence(${xy(b)});\n`;
  gen.forBlock['garden_shoot'] = (b) => `garden.shoot(${xy(b)});\n`;
  gen.forBlock['garden_new_bug'] = () => 'garden.newBug();\n';
  gen.forBlock['garden_move_bugs'] = () => 'garden.moveBugs();\n';
  gen.forBlock['garden_bug_home'] = () => ['garden.bugAtHouse()', Order.FUNCTION_CALL];
  gen.forBlock['garden_stopped'] = () => ['garden.stopped()', Order.FUNCTION_CALL];
  gen.forBlock['game_every'] = (b) => [`game.every(${Number(b.getFieldValue('N')) || 1})`, Order.FUNCTION_CALL];
  gen.forBlock['sprinkler_x'] = () => ['sprinkler.x', Order.MEMBER];
  gen.forBlock['sprinkler_y'] = () => ['sprinkler.y', Order.MEMBER];
  gen.forBlock['coins_change'] = (b) => `game.changeCoins(${Number(b.getFieldValue('N')) || 0});\n`;
  gen.forBlock['coins_get'] = () => ['game.coins()', Order.FUNCTION_CALL];
  gen.forBlock['for_sprinklers'] = (block) => {
    const branch = gen.addLoopTrap(gen.statementToCode(block, 'DO'), block);
    return `for (const sprinkler of garden.sprinklers()) {\n${branch}}\n`;
  };

  gen.forBlock['count_set'] = () => 'let count = 0;\n';
  gen.forBlock['count_add'] = () => 'count = count + 1;\n';
  gen.forBlock['for_neighbours'] = (block) => {
    const branch = gen.addLoopTrap(gen.statementToCode(block, 'DO'), block);
    return `for (const square of field.neighbours(${xy(block)})) {\n${branch}}\n`;
  };
}

const HATS = new Set(['event_start', 'event_tick', 'event_key', 'event_click', 'event_rightclick']);

/**
 * Code for the workspace, using only blocks inside event blocks. Loose blocks
 * can never run, so they never become code (not even for a moment before
 * Blockly greys them out).
 */
export function workspaceCode(ws, { display = false, loopTrap = null } = {}) {
  const gen = javascript.javascriptGenerator;
  gen.cqDisplay = display;
  gen.INFINITE_LOOP_TRAP = loopTrap;
  try {
    gen.init(ws);
    let code = '';
    for (const block of ws.getTopBlocks(true)) {
      if (HATS.has(block.type) && block.isEnabled()) code += gen.blockToCode(block);
    }
    return gen.finish(code);
  } finally {
    gen.cqDisplay = false;
    gen.INFINITE_LOOP_TRAP = null;
  }
}

/**
 * The blocks as code (like "Show code"), where every block also leaves its id
 * in a comment line just above its code: //@'id'. The hints compare this code
 * with the lesson's solution and then use blockAt(line) to point at the block.
 */
export function workspaceCodeWithIds(ws) {
  const gen = javascript.javascriptGenerator;
  gen.STATEMENT_PREFIX = '//@%1\n';
  let code;
  try {
    code = workspaceCode(ws, { display: true });
  } finally {
    gen.STATEMENT_PREFIX = null;
  }
  const lines = code.split('\n');
  const blockAt = (line) => {
    const m = /^\s*\/\/@'(.*)'\s*$/.exec(lines[line - 2] ?? '');
    return m ? ws.getBlockById(m[1]) : null;
  };
  return { code, blockAt };
}

/** Saved blocks (JSON) as the code a kid would type, without showing them. */
export function codeFromBlocks(json) {
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(json, ws);
    return `${workspaceCode(ws, { display: true }).trim()}\n`;
  } finally {
    ws.dispose();
  }
}

function capital(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Toolbox: lessons list short names; this turns them into Blockly entries.

const TOOLBOX_ENTRIES = {
  repeat: {
    kind: 'block',
    type: 'controls_repeat_ext',
    inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 4 } } } },
  },
  if: { kind: 'block', type: 'controls_if' },
  // Minesweeper blocks come with the clicked square (x, y) already filled in.
  field_reveal: xyEntry('field_reveal'),
  field_reveal_n: xyEntry('field_reveal_n', { N: { shadow: { type: 'count_get' } } }),
  field_has_mine: xyEntry('field_has_mine'),
  field_flag: xyEntry('field_flag'),
  field_click_around: xyEntry('field_click_around'),
  for_neighbours: xyEntry('for_neighbours'),
  has_mine_square: {
    kind: 'block',
    type: 'field_has_mine',
    inputs: { X: { shadow: { type: 'square_x' } }, Y: { shadow: { type: 'square_y' } } },
  },
  garden_build: xyEntry('garden_build'),
  garden_fence: xyEntry('garden_fence'),
  garden_shoot: {
    kind: 'block',
    type: 'garden_shoot',
    inputs: { X: { shadow: { type: 'sprinkler_x' } }, Y: { shadow: { type: 'sprinkler_y' } } },
  },
  coins_enough: {
    kind: 'block',
    type: 'logic_compare',
    fields: { OP: 'GTE' },
    inputs: { A: { block: { type: 'coins_get' } }, B: { shadow: { type: 'math_number', fields: { NUM: 10 } } } },
  },
  stopped_enough: {
    kind: 'block',
    type: 'logic_compare',
    fields: { OP: 'GTE' },
    inputs: { A: { block: { type: 'garden_stopped' } }, B: { shadow: { type: 'math_number', fields: { NUM: 15 } } } },
  },
  count_is_zero: {
    kind: 'block',
    type: 'logic_compare',
    fields: { OP: 'EQ' },
    inputs: { A: { block: { type: 'count_get' } }, B: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
  },
};

function xyEntry(type, more = {}) {
  return { kind: 'block', type, inputs: { X: { shadow: { type: 'click_x' } }, Y: { shadow: { type: 'click_y' } }, ...more } };
}

export function toolboxFor(names) {
  return {
    kind: 'flyoutToolbox',
    contents: names.map((name) => TOOLBOX_ENTRIES[name] || { kind: 'block', type: name }),
  };
}
