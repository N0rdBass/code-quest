// The "commands" list in code mode: the typed version of the lesson's toolbox.
// Each block a lesson offers becomes a line of code the kid can click to add.
// `¦` marks where the cursor goes after adding it.

import { t } from './i18n.js';

const SNIPPETS = {
  event_start: { code: 'function whenRunClicked() {\n  ¦\n}', help: 'blocks.eventStart' },
  event_tick: { code: 'function everyTick() {\n  ¦\n}', help: 'blocks.eventTick' },
  event_key: { code: 'function whenKeyUp() {\n  ¦\n}', help: 'code.help.key' },
  bit_move: { code: "bit.move('right');¦", help: 'code.help.move' },
  bit_pickup: { code: 'bit.pickUpCoin();¦', help: 'blocks.pickUp' },
  bit_on_coin: { code: 'bit.isOnCoin()¦', help: 'blocks.onCoin' },
  score_change: { code: 'game.changeScore(1);¦', help: 'code.help.score' },
  repeat: { code: 'for (let i = 0; i < 4; i++) {\n  ¦\n}', help: 'code.help.repeat' },
  if: { code: 'if (¦) {\n  \n}', help: 'code.help.if' },
  snake_move: { code: 'snake.move();¦', help: 'blocks.snakeMove' },
  snake_turn: { code: "snake.turn('up');¦", help: 'code.help.turn' },
  snake_grow: { code: 'snake.grow();¦', help: 'blocks.snakeGrow' },
  food_place: { code: 'snake.placeFood();¦', help: 'blocks.placeFood' },
  snake_on_food: { code: 'snake.isOnFood()¦', help: 'blocks.onFood' },
  snake_hits_wall: { code: 'snake.hitsWall()¦', help: 'blocks.hitsWall' },
  snake_hits_self: { code: 'snake.bitesItself()¦', help: 'blocks.hitsSelf' },
  game_over: { code: 'game.over();¦', help: 'blocks.gameOver' },
  speed_up: { code: 'game.faster();¦', help: 'blocks.speedUp' },
  snake_color: { code: "snake.setColour('blue');¦", help: 'code.help.colour' },
};

/** The commands for a lesson: its event functions first, then its toolbox. */
export function commandsFor(lesson, world) {
  const names = [];
  if (lesson.mode !== 'play') names.push('event_start');
  if (world === 'snake') names.push('event_tick');
  for (const name of lesson.toolbox) if (!names.includes(name)) names.push(name);
  return names
    .filter((name) => SNIPPETS[name])
    .map((name) => {
      const { code, help } = SNIPPETS[name];
      const label = code.replace('(¦)', '(…)').replace('¦', '').split('\n')[0].replace(/ \{$/, ' { … }');
      return { name, code, label, help: t(help).replace(/%\d/g, '…') };
    });
}

// "bit.move" → the help text key for it, for the explain bar.
const MEMBER_HELP = { 'console.log': 'code.help.log' };
for (const { code, help } of Object.values(SNIPPETS)) {
  const m = code.match(/^(\w+)\.(\w+)\(/);
  if (m) MEMBER_HELP[`${m[1]}.${m[2]}`] = help;
}

export function memberHelpKey(obj, name) {
  return MEMBER_HELP[`${obj}.${name}`] || null;
}

// The symbols list under the commands: what each symbol means.
export const SYMBOLS = [
  ['{ }', 'glossary.braces'],
  ['( )', 'glossary.parens'],
  ["' '", 'glossary.quotes'],
  [';', 'glossary.semicolon'],
  ['.', 'glossary.dot'],
  ['=', 'glossary.assign'],
  ['<  >', 'glossary.compare'],
  ['===', 'glossary.equals'],
  ['i++', 'glossary.plusPlus'],
  ['//', 'glossary.comment'],
];
