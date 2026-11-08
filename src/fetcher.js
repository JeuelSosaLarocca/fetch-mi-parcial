// Descarga páginas de Altillo con caché, espaciado entre requests y errores claros.
//
// Fuentes (variable ALTILLO_SOURCE):
//   auto    (por defecto) intenta Altillo directo; si Cloudflare lo bloquea, usa la última
//           copia archivada en la Wayback Machine (web.archive.org).
//   directo sólo Altillo.
//   wayback sólo Wayback Machine.
// El bloqueo de Cloudflare NO se intenta evadir: si aparece, se pasa al archivo público.

const UA = process.env.ALTILLO_USER_AGENT || "fetch-mi-parcial-mcp/0.1 (herramienta personal de estudio)";
const SOURCE = (process.env.ALTILLO_SOURCE || "auto").toLowerCase();
const MIN_DELAY_MS = Number(process.env.ALTILLO_DELAY_MS ?? 400);
const TTL_MS = 30 * 60 * 1000;
const BLOCK_MEMORY_MS = 30 * 60 * 1000;
const WAYBACK = "https://web.archive.org/web";

const cache = new Map(); // url -> { t, html, info }
const lastRequest = new Map(); // host -> timestamp
let blockedAt = 0;

export class BlockedError extends Error {
  constructor(url, status) {
    super(
      `Altillo bloqueó la petición a ${url} (HTTP ${status}, desafío de Cloudflare). ` +
        `No se intenta evadir el bloqueo. Usá ALTILLO_SOURCE=auto o wayback para leer la copia archivada.`
    );
    this.name = "BlockedError";
  }
}

export class NotArchivedError extends Error {
  constructor(url) {
    super(`La Wayback Machine no tiene una copia archivada de ${url}.`);
    this.name = "NotArchivedError";
  }
}

const headers = { "User-Agent": UA, Accept: "text/html,*/*", "Accept-Language": "es-AR,es;q=0.9" };

async function pace(host) {
  const wait = (lastRequest.get(host) ?? 0) + MIN_DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest.set(host, Date.now());
}

export function decode(buf, contentType = "") {
  let cs = /charset=([\w-]+)/i.exec(contentType)?.[1];
  if (!cs) {
    const head = new TextDecoder("latin1").decode(buf.slice(0, 2048));
    cs = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  cs = (cs || "windows-1252").toLowerCase();
  if (cs === "iso-8859-1" || cs === "latin1") cs = "windows-1252";
  try {
    return new TextDecoder(cs).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

const isChallenge = (status, html) =>
  status === 403 || status === 429 || status === 503 || /<title>\s*(Just a moment|Attention Required)/i.test(html);

async function fetchDirect(url, fetchImpl) {
  await pace("altillo");
  const res = await fetchImpl(url, { headers, redirect: "follow" });
  const html = decode(await res.arrayBuffer(), res.headers.get("content-type") || "");
  if (isChallenge(res.status, html)) throw new BlockedError(url, res.status);
  if (!res.ok) throw new Error(`HTTP ${res.status} al pedir ${url}`);
  return { html, info: { fuente: "altillo", url } };
}

/** Timestamp YYYYMMDDhhmmss -> "YYYY-MM-DD". */
const tsToDate = (ts) => (ts ? `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}` : null);

/** Timestamps de las últimas capturas con HTTP 200 (más nuevas primero), según el índice CDX. */
async function cdxTimestamps(url, fetchImpl, limit = 6) {
  await pace("wayback-cdx");
  const q = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&filter=statuscode:200&fl=timestamp&limit=-${limit}`;
  const res = await fetchImpl(q, { headers });
  if (!res.ok) return [];
  const rows = await res.json().catch(() => []);
  return rows.slice(1).map((r) => r[0]).reverse();
}

async function getSnapshot(url, ts, fetchImpl) {
  await pace("wayback");
  // El modificador id_ devuelve el contenido original, sin la barra de Wayback.
  const res = await fetchImpl(`${WAYBACK}/${ts}id_/${url}`, { headers, redirect: "follow" });
  const html = decode(await res.arrayBuffer(), res.headers.get("content-type") || "");
  const realTs = /\/web\/(\d{14})/.exec(res.url || "")?.[1] ?? ts;
  return { res, html, ts: realTs };
}

async function fetchWayback(url, fetchImpl) {
  // Camino rápido: un timestamp futuro redirige a la captura más reciente.
  const latest = await getSnapshot(url, "29991231000000", fetchImpl);
  if (latest.res.status === 404) throw new NotArchivedError(url);
  let good = latest.res.ok && !isChallenge(latest.res.status, latest.html) ? latest : null;

  // Si la más reciente es un desafío de Cloudflare (el robot de archive.org también fue
  // bloqueado), se busca en el índice la última captura con contenido real.
  if (!good) {
    for (const ts of await cdxTimestamps(url, fetchImpl)) {
      if (ts === latest.ts) continue;
      const snap = await getSnapshot(url, ts, fetchImpl);
      if (snap.res.ok && !isChallenge(snap.res.status, snap.html)) {
        good = snap;
        break;
      }
    }
  }
  if (!good) throw new NotArchivedError(url);
  const archivoUrl = `${WAYBACK}/${good.ts}id_/${url}`;
  return { html: good.html, info: { fuente: "wayback", url, snapshot: tsToDate(good.ts), archivoUrl } };
}

const NET_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"]);

/** Devuelve el HTML de `url` (string). La procedencia queda disponible en getFetchInfo(url). */
export async function fetchHtml(url, opts = {}) {
  try {
    return await fetchHtmlInner(url, opts);
  } catch (err) {
    const code = err.cause?.code;
    if (NET_CODES.has(code)) {
      const e = new Error(`Sin conexión (${code} al intentar ${err.cause?.hostname ?? "el servidor"}). Revisá la conexión a internet.`);
      e.name = "NetworkError";
      throw e;
    }
    throw err;
  }
}

async function fetchHtmlInner(url, { fetchImpl = fetch } = {}) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.html;

  let result;
  const directBlockedRecently = Date.now() - blockedAt < BLOCK_MEMORY_MS;
  if (SOURCE === "wayback" || (SOURCE === "auto" && directBlockedRecently)) {
    result = await fetchWayback(url, fetchImpl);
  } else {
    try {
      result = await fetchDirect(url, fetchImpl);
    } catch (err) {
      if (SOURCE === "directo") throw err;
      // Bloqueo de Cloudflare o falla de red (DNS, timeout): se recuerda y se pasa a Wayback.
      // Un error HTTP común (p. ej. 404) también prueba Wayback, pero no marca a Altillo como caído.
      const unreachable = err.name === "BlockedError" || err.name === "TypeError" || err.cause?.code;
      if (unreachable) blockedAt = Date.now();
      result = await fetchWayback(url, fetchImpl);
    }
  }
  cache.set(url, { t: Date.now(), ...result });
  return result.html;
}

export function getFetchInfo(url) {
  return cache.get(url)?.info ?? null;
}

/**
 * Hace utilizable un recurso (imagen/PDF) de un examen.
 * Si la página vino de Wayback, busca la copia archivada del recurso
 * (`im_` para imágenes, `id_` para archivos). Devuelve null si no hay copia.
 */
export async function resolveAsset(assetUrl, pageInfo, { fetchImpl = fetch } = {}) {
  if (!pageInfo || pageInfo.fuente !== "wayback") return assetUrl;
  // Sólo capturas con HTTP 200: una captura nueva bloqueada por Cloudflare no tapa a las buenas.
  const [ts] = await cdxTimestamps(assetUrl, fetchImpl, 1);
  if (!ts) return null;
  const mod = /\.(gif|jpe?g|png|webp|bmp)(\?|$)/i.test(assetUrl) ? "im_" : "id_";
  return `${WAYBACK}/${ts}${mod}/${assetUrl}`;
}
