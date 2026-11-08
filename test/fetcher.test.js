import test from "node:test";
import assert from "node:assert/strict";
import { fetchHtml, getFetchInfo, resolveAsset } from "../src/fetcher.js";
import { getExam } from "../src/search.js";
import { EXAM_PAGE } from "./fixture.js";

const enc = (s) => new TextEncoder().encode(s).buffer;
const resp = (status, body, { url = "", type = "text/html" } = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  url,
  headers: { get: (h) => (h.toLowerCase() === "content-type" ? type : null) },
  arrayBuffer: async () => enc(body),
  json: async () => JSON.parse(body),
});

test("si Cloudflare bloquea, usa la copia de Wayback y registra la fecha", async () => {
  const calls = [];
  const fetchImpl = async (u) => {
    calls.push(u);
    if (u.startsWith("https://www.altillo.com/")) return resp(403, "<title>Just a moment...</title>");
    const orig = u.split("id_/")[1];
    return resp(200, "<html><title>ok</title></html>", { url: `https://web.archive.org/web/20260730203127id_/${orig}` });
  };
  const url = "https://www.altillo.com/examenes/test-a/index.asp";
  const html = await fetchHtml(url, { fetchImpl });
  assert.match(html, /ok/);
  assert.equal(calls.length, 2);
  assert.deepEqual(
    { fuente: getFetchInfo(url).fuente, snapshot: getFetchInfo(url).snapshot },
    { fuente: "wayback", snapshot: "2026-07-30" }
  );

  // Recordó el bloqueo: la siguiente página va directo a Wayback, sin volver a pegarle a Altillo.
  calls.length = 0;
  await fetchHtml("https://www.altillo.com/examenes/test-b/index.asp", { fetchImpl });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/web\.archive\.org\//);
});

test("página no archivada -> NotArchivedError", async () => {
  const fetchImpl = async () => resp(404, "not found");
  await assert.rejects(fetchHtml("https://www.altillo.com/examenes/zzz/nada.asp", { fetchImpl }), { name: "NotArchivedError" });
});

test("resolveAsset: imágenes con im_, PDFs con id_, faltantes -> null", async () => {
  const wb = { fuente: "wayback" };
  const fetchImpl = async (u) => {
    const asset = decodeURIComponent(u.split("url=")[1]);
    if (asset.includes("falta")) return resp(200, JSON.stringify({ archived_snapshots: {} }));
    return resp(200, JSON.stringify({ archived_snapshots: { closest: { available: true, status: "200", timestamp: "20250428081331" } } }));
  };
  const img = "https://www.altillo.com/examenes/x/a.gif";
  const pdf = "https://www.altillo.com/examenes/x/b.pdf";
  assert.equal(await resolveAsset(img, wb, { fetchImpl }), `https://web.archive.org/web/20250428081331im_/${img}`);
  assert.equal(await resolveAsset(pdf, wb, { fetchImpl }), `https://web.archive.org/web/20250428081331id_/${pdf}`);
  assert.equal(await resolveAsset("https://www.altillo.com/examenes/x/falta.gif", wb, { fetchImpl }), null);
  assert.equal(await resolveAsset(img, { fuente: "altillo" }, { fetchImpl }), img);
});

test("getExam separa recursos archivados de faltantes", async () => {
  const page = EXAM_PAGE.replace('<img src="algygedfsg4s11.gif">', '<img src="si.gif"><img src="falta.gif">');
  const r = await getExam("https://www.altillo.com/examenes/utn/x/y.asp", {
    fetchHtml: async () => page,
    getFetchInfo: () => ({ fuente: "wayback", snapshot: "2025-05-17" }),
    resolveAsset: async (u) => (u.includes("falta") ? null : `https://web.archive.org/web/1im_/${u}`),
  });
  assert.deepEqual(r.images, ["https://web.archive.org/web/1im_/https://www.altillo.com/examenes/utn/x/si.gif"]);
  assert.deepEqual(r.missing, ["https://www.altillo.com/examenes/utn/x/falta.gif"]);
  assert.equal(r.fuente.snapshot, "2025-05-17");
});
