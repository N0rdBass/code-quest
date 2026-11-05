// Code Quest: screens and navigation.
//   players  →  map (courses + lessons)  →  lesson  →  diploma

import { setLanguage, language, LANGS, t, tr } from './i18n.js';
import * as storage from './storage.js';
import { defineGenerators } from './blocks.js';
import { openLesson } from './lesson.js';
import { h, clear, confirmBox } from './dom.js';

const root = document.getElementById('app');
const COURSE_FILES = ['basics', 'snake'];

// Games shown on the map. Only Snake is built so far.
const GAMES = [
  { id: 'snake', stars: 1, course: 'snake' },
  { id: 'minesweeper', stars: 2 },
  { id: 'garden', stars: 3 },
  { id: 'tower', stars: 4 },
];

let courses = {};
let profileId = null;
let closeCurrent = null;

async function boot() {
  const data = await storage.load();
  await setLanguage(data.lang || 'no');
  defineGenerators();
  for (const id of COURSE_FILES) {
    const res = await fetch(`lessons/${id}.json`);
    courses[id] = await res.json();
  }
  showPlayers();
}

function leaveScreen() {
  if (closeCurrent) closeCurrent();
  closeCurrent = null;
  clear(root);
}

function languageSwitch(rerender) {
  return h(
    'div',
    { class: 'lang-switch' },
    LANGS.map((lang) =>
      h(
        'button',
        {
          class: `btn small ${lang === language() ? 'active' : 'ghost'}`,
          onclick: async () => {
            await setLanguage(lang);
            storage.setLanguagePref(lang);
            rerender();
          },
        },
        lang === 'no' ? 'Norsk' : 'English',
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Players

async function showPlayers() {
  leaveScreen();
  const nameInput = h('input', {
    type: 'text',
    maxlength: 20,
    placeholder: t('profiles.nicknamePlaceholder'),
    'aria-label': t('profiles.nicknamePlaceholder'),
  });
  const create = () => {
    const name = nameInput.value.trim();
    if (!name) return nameInput.focus();
    const p = storage.createProfile(name);
    showMap(p.id);
  };
  nameInput.addEventListener('keydown', (e) => e.key === 'Enter' && create());

  const list = storage.profiles().map((p) =>
    h(
      'div',
      { class: 'player' },
      h('button', { class: 'player-name', onclick: () => showMap(p.id) }, `🙂 ${p.name}`),
      h(
        'button',
        {
          class: 'btn small ghost',
          title: t('profiles.remove'),
          onclick: async () => {
            if (await confirmBox(t('profiles.removeConfirm', { name: p.name }), t('profiles.remove'))) {
              storage.removeProfile(p.id);
              showPlayers();
            }
          },
        },
        '✕',
      ),
    ),
  );

  const where = await storage.location();
  root.append(
    h(
      'div',
      { class: 'players-screen' },
      languageSwitch(showPlayers),
      h('img', { src: 'ui/img/bit.svg', alt: '', class: 'hero' }),
      h('h1', { class: 'logo' }, 'Code Quest'),
      h('p', { class: 'tagline' }, t('profiles.welcome')),
      h(
        'div',
        { class: 'card' },
        list.length ? h('h2', {}, t('profiles.who')) : null,
        h('div', { class: 'player-list' }, list),
        h('h3', {}, t('profiles.newPlayer')),
        h('div', { class: 'new-player' }, nameInput, h('button', { class: 'btn run', onclick: create }, t('profiles.create'))),
      ),
      h('p', { class: 'saved-in' }, `${t('profiles.savedIn')} ${where || t('profiles.savedInBrowser')}`),
    ),
  );
  if (!list.length) nameInput.focus();
}

// ---------------------------------------------------------------------------
// Map

function isDone(lessonId) {
  return !!storage.profile(profileId)?.lessons[lessonId]?.done;
}

function courseDone(course) {
  return course.lessons.every((l) => isDone(l.id));
}

function lessonButtons(course, unlocked) {
  return h(
    'ol',
    { class: 'lesson-list' },
    course.lessons.map((lesson, i) => {
      const done = isDone(lesson.id);
      // A lesson opens when the one before it is done. Shift-click skips the lock (for teachers).
      const open = unlocked && (i === 0 || isDone(course.lessons[i - 1].id));
      return h(
        'li',
        {},
        h(
          'button',
          {
            class: `lesson-btn ${done ? 'done' : ''} ${open ? '' : 'locked'}`,
            onclick: (e) => {
              if (open || e.shiftKey) showLesson(course.id, i);
            },
          },
          h('span', { class: 'lesson-num' }, done ? '✓' : open ? i + 1 : '🔒'),
          tr(lesson.title),
        ),
      );
    }),
  );
}

function showMap(id) {
  leaveScreen();
  profileId = id;
  storage.get().lastProfile = id;
  storage.save();
  const p = storage.profile(id);
  if (!p) return showPlayers();

  const basics = courses.basics;
  const basicsDone = courseDone(basics);
  const doneCount = (c) => c.lessons.filter((l) => isDone(l.id)).length;

  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'btn ghost', onclick: showPlayers }, `👥 ${t('home.switchPlayer')}`),
      h('h1', {}, t('home.hello', { name: p.name })),
      languageSwitch(() => showMap(id)),
    ),
    h(
      'main',
      { class: 'map' },
      h(
        'section',
        { class: 'card course' },
        h('h2', {}, t('home.basics')),
        h('p', {}, t('home.basicsIntro')),
        h('p', { class: 'progress' }, t('home.lessons', { done: doneCount(basics), total: basics.lessons.length })),
        lessonButtons(basics, true),
      ),
      h(
        'section',
        { class: 'card course' },
        h('h2', {}, t('home.games')),
        h('p', {}, t('home.gamesIntro')),
        h(
          'div',
          { class: 'games' },
          GAMES.map((g) => {
            const course = g.course && courses[g.course];
            const stars = h('span', { class: 'stars', title: t('home.difficulty') }, '★'.repeat(g.stars) + '☆'.repeat(4 - g.stars));
            if (!course) {
              return h(
                'div',
                { class: 'game soon' },
                h('h3', {}, t(`games.${g.id}`), ' ', stars),
                h('p', {}, t('home.comingSoon')),
              );
            }
            return h(
              'div',
              { class: 'game' },
              h('h3', {}, t(`games.${g.id}`), ' ', stars),
              h('p', { class: 'progress' }, basicsDone ? t('home.lessons', { done: doneCount(course), total: course.lessons.length }) : `🔒 ${t('home.locked')}`),
              lessonButtons(course, basicsDone),
            );
          }),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Lesson + diploma

function showLesson(courseId, index) {
  leaveScreen();
  const course = courses[courseId];
  closeCurrent = openLesson(root, {
    course,
    index,
    profileId,
    onBack: () => showMap(profileId),
    onNext: () => showLesson(courseId, index + 1),
    onDiploma: () => showDiploma(course),
  });
}

function showDiploma(course) {
  const p = storage.profile(profileId);
  const date = new Date().toLocaleDateString(language() === 'no' ? 'nb-NO' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const overlay = h(
    'div',
    { class: 'diploma-backdrop' },
    h(
      'div',
      { class: 'diploma' },
      h('img', { src: 'ui/img/bit.svg', alt: '', class: 'diploma-bit' }),
      h('h1', {}, `🏆 ${t('diploma.title')}`),
      h('p', {}, t('diploma.line1')),
      h('p', { class: 'diploma-name' }, p?.name || ''),
      h('p', {}, t('diploma.line2')),
      h('p', { class: 'diploma-game' }, t(`games.${course.game}`)),
      h('p', {}, t('diploma.line3')),
      h('p', { class: 'diploma-date' }, `${t('diploma.date')}: ${date}`),
      h(
        'div',
        { class: 'diploma-buttons' },
        h('button', { class: 'btn run', onclick: () => window.print() }, `🖨 ${t('diploma.print')}`),
        h('button', { class: 'btn ghost', onclick: () => overlay.remove() }, t('diploma.close')),
      ),
    ),
  );
  document.body.append(overlay);
}

window.addEventListener('beforeunload', () => storage.saveNow());
boot().catch((e) => {
  console.error(e);
  root.textContent = `Code Quest could not start: ${e.message}`;
});
