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

async function fetchWayback(url, fetchImpl) {
  await pace("wayback");
  // Un timestamp en el futuro hace que Wayback redirija a la copia más reciente.
  // El modificador id_ devuelve el HTML original, sin la barra de Wayback.
  const res = await fetchImpl(`${WAYBACK}/29991231000000id_/${url}`, { headers, redirect: "follow" });
  if (res.status === 404) throw new NotArchivedError(url);
  if (!res.ok) throw new Error(`Wayback respondió HTTP ${res.status} para ${url}`);
  const html = decode(await res.arrayBuffer(), res.headers.get("content-type") || "");
  const ts = /\/web\/(\d{14})/.exec(res.url || "")?.[1] ?? null;
  return { html, info: { fuente: "wayback", url, snapshot: tsToDate(ts), archivoUrl: res.url } };
}

/** Devuelve el HTML de `url` (string). La procedencia queda disponible en getFetchInfo(url). */
export async function fetchHtml(url, { fetchImpl = fetch } = {}) {
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
      if (err.name !== "BlockedError" || SOURCE === "directo") throw err;
      blockedAt = Date.now();
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
  await pace("wayback-api");
  const res = await fetchImpl(`https://archive.org/wayback/available?url=${encodeURIComponent(assetUrl)}`, { headers });
  if (!res.ok) return null;
  const closest = (await res.json())?.archived_snapshots?.closest;
  if (!closest?.available || String(closest.status) !== "200") return null;
  const mod = /\.(gif|jpe?g|png|webp|bmp)(\?|$)/i.test(assetUrl) ? "im_" : "id_";
  return `${WAYBACK}/${closest.timestamp}${mod}/${assetUrl}`;
}
