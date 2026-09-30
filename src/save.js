import { SAVE_SLOTS } from './constants.js';

// Spielstand im Browser (im Original ein lokales SharedObject 'miniclipxgenml'): ein einziger Platz,
// jedes Speichern überschreibt den vorherigen Stand.
const KEY = 'ml3d.savegame';

// Liefert { data, savedAt } oder null, wenn nichts (Gültiges) gespeichert ist
export function readSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(s?.data) && s.data.length === SAVE_SLOTS ? s : null;
  } catch {
    return null;
  }
}

// Schreibt den Stand; liefert, ob ein älterer überschrieben wurde. Wirft, wenn der Browser nichts speichern darf.
export function writeSave(data) {
  const prior = !!readSave();
  localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), data }));
  return { prior };
}
