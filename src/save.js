// Save local versionado. Ao mudar o formato, suba VERSION e trate a migração em load().
const KEY = 'valebrisa.save';
const VERSION = 1;

export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (!s || typeof s !== 'object' || !s.char) return null;
    if (s.v > VERSION) return null; // save de versão mais nova que o app
    return s;
  } catch {
    return null;
  }
}
export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...data }));
  } catch {
    /* armazenamento indisponível: o jogo continua, só não salva */
  }
}

const SKEY = 'valebrisa.settings';
export function loadSettings() {
  try {
    return { quality: 1, ...JSON.parse(localStorage.getItem(SKEY) || '{}') };
  } catch {
    return { quality: 1 };
  }
}
export function writeSettings(s) {
  try {
    localStorage.setItem(SKEY, JSON.stringify(s));
  } catch {
    /* ignora */
  }
}
