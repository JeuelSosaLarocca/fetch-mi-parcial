import { fetchHtml, getFetchInfo, resolveAsset } from "./fetcher.js";
import { parseUniversities, parseUniversityPage, parseExamPage } from "./parser.js";
import { score } from "./text.js";

const INDEX_URL = "https://www.altillo.com/examenes/index.asp";

export const TIPOS = ["primer_parcial", "segundo_parcial", "recuperatorio", "final"];

export async function listUniversities(deps = {}) {
  const f = deps.fetchHtml ?? fetchHtml;
  return parseUniversities(await f(INDEX_URL), INDEX_URL);
}

export async function resolveUniversity(query, deps = {}) {
  if (/^https?:\/\//i.test(query)) return { best: { id: query, name: query, url: query }, alternatives: [] };
  const all = await listUniversities(deps);
  const ranked = all
    .map((u) => ({ u, s: Math.max(score(query, u.name), score(query, u.id.replace(/\//g, " "))) }))
    .filter((x) => x.s > 0.3)
    .sort((a, b) => b.s - a.s);
  if (!ranked.length) return { best: null, alternatives: [] };
  return { best: ranked[0].u, alternatives: ranked.slice(1, 5).map((x) => x.u) };
}

/**
 * Exámenes de una universidad. Si la página es un "hub" con un índice por materia
 * (CBC, Económicas UBA, ...), entra a los sub-índices que coinciden con `subject`.
 */
export async function getUniversityExams(uni, deps = {}, subject = null) {
  const f = deps.fetchHtml ?? fetchHtml;
  const { exams, subIndexes } = parseUniversityPage(await f(uni.url), uni.url);
  if (!subIndexes.length || !subject) return { exams, subIndexes };
  const ranked = subIndexes.map((s) => ({ s, sc: score(subject, s.name) })).filter((x) => x.sc >= 0.5).sort((a, b) => b.sc - a.sc);
  const picked = ranked.filter((x) => x.sc >= (ranked[0]?.sc ?? 1) - 0.1).slice(0, 3);
  const all = [...exams];
  for (const { s } of picked) {
    const sub = parseUniversityPage(await f(s.url), s.url, { defaultSubject: s.name });
    all.push(...sub.exams);
  }
  return { exams: all, subIndexes };
}

export function listSubjects(exams, subIndexes = []) {
  const m = new Map();
  for (const e of exams) if (e.subject) m.set(e.subject, (m.get(e.subject) ?? 0) + 1);
  const list = [...m].map(([name, exams]) => ({ name, exams }));
  for (const s of subIndexes) if (!m.has(s.name)) list.push({ name: s.name, exams: null, url: s.url });
  return list.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function matchesTipo(e, tipo, loose) {
  switch (tipo) {
    case "recuperatorio":
      return e.recuperatorio;
    case "final":
      return e.kind === "final";
    case "primer_parcial":
      return e.kind === "primer_parcial" || (loose && e.kind === "parcial");
    case "segundo_parcial":
      return e.kind === "segundo_parcial" || (loose && e.kind === "parcial");
    default:
      return true;
  }
}

/** Filtra y ordena (más recientes primero) los exámenes de una universidad. */
export function filterExams(exams, { subject, tipo, year }) {
  let pool = exams;
  let subjectMatches = [];
  if (subject) {
    const names = [...new Set(exams.map((e) => e.subject).filter(Boolean))];
    const ranked = names.map((n) => ({ n, s: score(subject, n) })).filter((x) => x.s >= 0.5).sort((a, b) => b.s - a.s);
    if (!ranked.length) return { exams: [], subjectMatches: [], note: "Ninguna materia coincide con la búsqueda." };
    const top = ranked[0].s;
    subjectMatches = ranked.filter((x) => x.s >= top - 0.1).map((x) => x.n);
    pool = exams.filter((e) => subjectMatches.includes(e.subject));
  }
  if (year) pool = pool.filter((e) => e.year === year);
  let note = null;
  if (tipo) {
    let r = pool.filter((e) => matchesTipo(e, tipo, false));
    if (!r.length && (tipo === "primer_parcial" || tipo === "segundo_parcial")) {
      r = pool.filter((e) => matchesTipo(e, tipo, true));
      if (r.length) note = "No hay exámenes con el número explícito; se muestran parciales sin numerar.";
    }
    pool = r;
  }
  // Si se pidió primer/segundo parcial o final, los originales van antes que los recuperatorios.
  const preferOriginal = tipo && tipo !== "recuperatorio";
  pool = [...pool].sort(
    (a, b) =>
      (preferOriginal ? Number(a.recuperatorio) - Number(b.recuperatorio) : 0) ||
      (b.year ?? 0) - (a.year ?? 0) ||
      String(a.variant).localeCompare(String(b.variant))
  );
  return { exams: pool, subjectMatches, note };
}

/** Resuelve recursos en paralelo (de a 3) y separa los disponibles de los faltantes. */
async function resolveAll(urls, pageInfo, resolve) {
  const ok = [];
  const missing = [];
  const out = new Array(urls.length);
  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const k = i++;
      out[k] = await resolve(urls[k], pageInfo).catch(() => null);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  urls.forEach((u, k) => (out[k] ? ok.push(out[k]) : missing.push(u)));
  return { ok, missing };
}

export async function getExam(url, deps = {}) {
  const f = deps.fetchHtml ?? fetchHtml;
  const info = deps.getFetchInfo ?? getFetchInfo;
  const resolve = deps.resolveAsset ?? resolveAsset;
  if (!/^https?:\/\/(www\.)?altillo\.com\//i.test(url)) throw new Error("Sólo se aceptan URLs de altillo.com");

  if (/\.pdf(\?|$)/i.test(url)) {
    // Para saber la fuente sin bajar el PDF, se usa la del índice ya visitado.
    const pageInfo = deps.sourceHint ?? null;
    const { ok, missing } = await resolveAll([url], pageInfo, resolve);
    return { url, title: null, info: null, images: [], files: ok, missing, text: null, fuente: pageInfo };
  }

  const page = parseExamPage(await f(url), url);
  const pageInfo = info(url);
  const imgs = await resolveAll(page.images, pageInfo, resolve);
  const files = await resolveAll(page.files, pageInfo, resolve);
  return { ...page, images: imgs.ok, files: files.ok, missing: [...imgs.missing, ...files.missing], fuente: pageInfo };
}

/**
 * Navega universidad -> materia -> tipo y devuelve el mejor examen con su contenido.
 * Prueba candidatos en orden hasta encontrar uno con imágenes, archivo o texto.
 */
export async function findExam({ university, subject, tipo, year, maxTries = 8 }, deps = {}) {
  const { best, alternatives } = await resolveUniversity(university, deps);
  if (!best) return { ok: false, reason: `No encontré la universidad "${university}".` };
  const { exams: all, subIndexes } = await getUniversityExams(best, deps, subject);
  const { exams, subjectMatches, note } = filterExams(all, { subject, tipo, year });
  if (!exams.length) {
    return {
      ok: false,
      university: best,
      alternatives,
      reason: note ?? "No hay exámenes que cumplan los filtros.",
      subjectsAvailable: listSubjects(all, subIndexes).map((s) => s.name),
    };
  }
  const tried = [];
  const sourceHint = (deps.getFetchInfo ?? getFetchInfo)(best.url);
  for (const cand of exams.slice(0, maxTries)) {
    try {
      const content = await getExam(cand.url, { ...deps, sourceHint });
      if (content.images.length || content.files.length) {
        return {
          ok: true,
          university: best,
          subjectMatches,
          note,
          fuente: sourceHint,
          exam: cand,
          content,
          descartados: tried.length ? tried : undefined,
          otherCandidates: exams.filter((e) => e !== cand).slice(0, 10),
        };
      }
      tried.push({ url: cand.url, problem: content.missing?.length ? "imágenes/archivos no archivados" : "sin contenido" });
    } catch (err) {
      if (err.name === "BlockedError") throw err;
      tried.push({ url: cand.url, problem: err.message });
    }
  }
  return { ok: false, university: best, reason: "Ningún candidato tenía contenido utilizable.", tried, candidates: exams.slice(0, 10) };
}
