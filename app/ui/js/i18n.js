// Translations. UI words come from ui/i18n/<lang>.json; lesson texts carry
// both languages inline ({ "en": ..., "no": ... }) and are picked with tr().

export const LANGS = ['no', 'en'];

let current = 'no';
let dict = {};
const cache = {};

export async function setLanguage(lang) {
  if (!LANGS.includes(lang)) lang = 'no';
  if (!cache[lang]) {
    const res = await fetch(`ui/i18n/${lang}.json`);
    cache[lang] = await res.json();
  }
  dict = cache[lang];
  current = lang;
  document.documentElement.lang = lang === 'no' ? 'nb' : 'en';
  const msgs = window.CQ_BLOCKLY_MSG?.[lang];
  if (msgs) Blockly.setLocale(msgs);
}

export function language() {
  return current;
}

/** t('lesson.run') or t('home.hello', { name: 'Ada' }) */
export function t(key, vars) {
  let value = key.split('.').reduce((obj, part) => (obj == null ? obj : obj[part]), dict);
  if (typeof value !== 'string') return key;
  if (vars) {
    for (const [name, v] of Object.entries(vars)) value = value.replaceAll(`{${name}}`, String(v));
  }
  return value;
}

/** Pick the current language out of a { en, no } object. */
export function tr(text) {
  if (text == null) return '';
  if (typeof text === 'string') return text;
  return text[current] ?? text.en ?? '';
}
