// Code Quest's own blocks: how they look (with translated labels) and what
// JavaScript they turn into. Built-in Blockly blocks (repeat, if) are reused.
//
// The generator has two modes:
//   - run mode: real code for the game, with `await` for animated robot steps
//     and a loop guard so a huge repeat can't freeze the app
//   - display mode (gen.cqDisplay): tidy code for the "Show code" panel

import { t } from './i18n.js';

const COLOUR = { events: 45, robot: 210, snake: 135, score: 25, game: 0 };

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
  ]);
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
  const aw = () => (show() || !gen.cqAsync ? '' : 'await ');
  const asyncKw = () => (gen.cqAsync ? 'async ' : '');
  const guard = '  __loopGuard = 100000;\n';

  const hat = (displayName, register) => (block) => {
    const body = gen.statementToCode(block, 'DO');
    if (show()) return `function ${displayName(block)}() {\n${body}}\n\n`;
    return `${register(block)}${asyncKw()}() => {\n${guard}${body}});\n`;
  };

  gen.forBlock['event_start'] = hat(() => 'whenRunClicked', () => 'events.onStart(');
  gen.forBlock['event_tick'] = hat(() => 'everyTick', () => 'events.onTick(');
  gen.forBlock['event_key'] = hat(
    (b) => `whenKey${capital(b.getFieldValue('KEY'))}`,
    (b) => `events.onKey('${b.getFieldValue('KEY')}', `,
  );

  gen.forBlock['bit_move'] = (b) => `${aw()}bit.move('${b.getFieldValue('DIR')}');\n`;
  gen.forBlock['bit_pickup'] = () => `${aw()}bit.pickUpCoin();\n`;
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
}

const HATS = new Set(['event_start', 'event_tick', 'event_key']);

/**
 * Code for the workspace, using only blocks inside event blocks. Loose blocks
 * can never run, so they never become code (not even for a moment before
 * Blockly greys them out).
 */
export function workspaceCode(ws, { display = false, async = false, loopTrap = null } = {}) {
  const gen = javascript.javascriptGenerator;
  gen.cqDisplay = display;
  gen.cqAsync = async;
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
};

export function toolboxFor(names) {
  return {
    kind: 'flyoutToolbox',
    contents: names.map((name) => TOOLBOX_ENTRIES[name] || { kind: 'block', type: name }),
  };
}
