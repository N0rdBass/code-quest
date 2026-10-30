// Progress storage. In the desktop app, the Rust side saves one JSON file in
// "code-quest-data" next to the app (portable mode, so it travels on a USB stick).
// Opened in a plain browser for testing, it falls back to localStorage.

const tauri = window.__TAURI__?.core;
const LOCAL_KEY = 'code-quest-progress';
const SAVE_DELAY_MS = 600;

function emptyData() {
  return { version: 1, lang: 'no', lastProfile: null, profiles: {} };
}

let data = emptyData();
let saveTimer = null;

export async function load() {
  let text = '';
  try {
    text = tauri ? await tauri.invoke('load_progress') : localStorage.getItem(LOCAL_KEY) || '';
  } catch (e) {
    console.error('Could not load progress', e);
  }
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && parsed.profiles) data = { ...emptyData(), ...parsed };
    } catch (e) {
      console.error('Progress file is damaged, starting fresh', e);
    }
  }
  return data;
}

export function get() {
  return data;
}

/** Save soon. Many small changes (dragging blocks) become one write. */
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
}

export async function saveNow() {
  clearTimeout(saveTimer);
  const text = JSON.stringify(data);
  try {
    if (tauri) await tauri.invoke('save_progress', { json: text });
    else localStorage.setItem(LOCAL_KEY, text);
  } catch (e) {
    console.error('Could not save progress', e);
  }
}

export async function location() {
  if (!tauri) return null;
  try {
    return await tauri.invoke('data_location');
  } catch {
    return null;
  }
}

// ---- profiles ----

export function profiles() {
  return Object.values(data.profiles).sort((a, b) => a.name.localeCompare(b.name));
}

export function createProfile(name) {
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  data.profiles[id] = { id, name, created: new Date().toISOString(), lessons: {} };
  data.lastProfile = id;
  save();
  return data.profiles[id];
}

export function removeProfile(id) {
  delete data.profiles[id];
  if (data.lastProfile === id) data.lastProfile = null;
  save();
}

export function profile(id) {
  return data.profiles[id] || null;
}

export function lessonState(profileId, lessonId) {
  const p = data.profiles[profileId];
  if (!p) return {};
  return (p.lessons[lessonId] ||= {});
}

export function setLanguagePref(lang) {
  data.lang = lang;
  save();
}
