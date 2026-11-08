export const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\uFFFD/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const ROMAN = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6" };
const STOP = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "a", "en", "para", "universidad", "facultad"]);

// Tokens comparables: sin acentos, números romanos -> arábigos, sin stopwords.
export function tokens(s) {
  return norm(s)
    .split(" ")
    .filter(Boolean)
    .map((t) => ROMAN[t] ?? t)
    .filter((t) => !STOP.has(t));
}

// Puntaje 0..1: fracción de tokens de la consulta que aparecen (exacto o prefijo) en el candidato.
export function score(query, candidate) {
  const q = tokens(query);
  const c = tokens(candidate);
  if (!q.length || !c.length) return 0;
  let hit = 0;
  for (const t of q) {
    if (c.includes(t)) hit += 1;
    else if (t.length >= 4 && c.some((x) => x.startsWith(t) || t.startsWith(x))) hit += 0.7;
  }
  const coverage = hit / q.length;
  const precision = hit / c.length;
  // La precisión pesa bastante para que "Administración I" no arrastre "Administración Empresarial I".
  return coverage * 0.6 + Math.min(1, precision) * 0.4;
}

export const clean = (s) => String(s ?? "").replace(/\uFFFD/g, "").replace(/\s+/g, " ").trim();
