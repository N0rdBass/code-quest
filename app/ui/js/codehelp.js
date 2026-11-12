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
  event_click: { code: 'function whenSquareClicked(x, y) {\n  ¦\n}', help: 'code.help.click' },
  event_rightclick: { code: 'function whenSquareRightClicked(x, y) {\n  ¦\n}', help: 'code.help.rightClick' },
  field_place_mines: { code: 'field.placeMines(10);¦', help: 'code.help.placeMines' },
  field_reveal: { code: 'field.reveal(x, y);¦', help: 'code.help.reveal' },
  field_reveal_n: { code: 'field.reveal(x, y, count);¦', help: 'code.help.revealN' },
  field_has_mine: { code: 'field.hasMine(x, y)¦', help: 'code.help.hasMine' },
  has_mine_square: { code: 'field.hasMine(square.x, square.y)¦', help: 'code.help.hasMineSquare' },
  field_show_mines: { code: 'field.showMines();¦', help: 'blocks.showMines' },
  field_flag: { code: 'field.toggleFlag(x, y);¦', help: 'code.help.flag' },
  field_click_around: { code: 'field.clickAround(x, y);¦', help: 'code.help.clickAround' },
  field_all_open: { code: 'field.allSafeOpen()¦', help: 'blocks.allOpen' },
  game_win: { code: 'game.win();¦', help: 'blocks.win' },
  for_neighbours: { code: 'for (const square of field.neighbours(x, y)) {\n  ¦\n}', help: 'code.help.neighbours' },
  garden_build: { code: 'garden.build(x, y);¦', help: 'code.help.build' },
  garden_fence: { code: 'garden.buildFence(x, y);¦', help: 'code.help.buildFence' },
  garden_new_bug: { code: 'garden.newBug();¦', help: 'blocks.newBug' },
  game_every: { code: 'game.every(30)¦', help: 'code.help.every' },
  map_put: { code: "map.put('grass', x, y);¦", help: 'code.help.mapPut' },
  map_for_rows: { code: 'for (let y = 0; y < 5; y++) {\n  ¦\n}', help: 'code.help.forRows' },
  map_for_columns: { code: 'for (let x = 0; x < 9; x++) {\n  ¦\n}', help: 'code.help.forColumns' },
  event_created: { code: 'function whenCreated() {\n  ¦\n}', help: 'code.help.created' },
  event_hit: { code: 'function whenHit() {\n  ¦\n}', help: 'code.help.hit' },
  me_move: { code: 'me.move();¦', help: 'code.help.meMove' },
  me_set_speed: { code: 'me.speed = 0.05;¦', help: 'code.help.meSpeed' },
  me_set_hp: { code: 'me.hp = 3;¦', help: 'code.help.meHp' },
  me_change_hp: { code: 'me.hp = me.hp - 1;¦', help: 'code.help.meChangeHp' },
  hp_gone: { code: 'me.hp <= 0¦', help: 'code.help.hpGone' },
  me_squash: { code: 'me.squash();¦', help: 'code.help.meSquash' },
  me_shoot: { code: 'me.shoot();¦', help: 'code.help.meShoot' },
  coins_change: { code: 'game.changeCoins(-10);¦', help: 'code.help.changeCoins' },
  coins_enough: { code: 'game.coins() >= 10¦', help: 'code.help.coinsEnough' },
  garden_bug_home: { code: 'garden.bugAtHouse()¦', help: 'blocks.bugAtHouse' },
  stopped_enough: { code: 'garden.stopped() >= 15¦', help: 'code.help.stoppedEnough' },
  count_set: { code: 'let count = 0;¦', help: 'code.help.countSet' },
  count_add: { code: 'count = count + 1;¦', help: 'code.help.countAdd' },
  count_is_zero: { code: 'count == 0¦', help: 'code.help.countZero' },
};

/**
 * The commands for a lesson: its event functions first, then its toolbox.
 * `events` (a script's own events, in games with several scripts) replaces the
 * world's usual ones.
 */
export function commandsFor(lesson, world, events = null) {
  const names = [];
  if (events) names.push(...events);
  else {
    if (lesson.mode !== 'play') names.push('event_start');
    if (world === 'snake') names.push('event_tick');
    if (world === 'minesweeper') names.push('event_click');
  }
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
  if (m) MEMBER_HELP[`${m[1]}.${m[2]}`] ||= help;
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
