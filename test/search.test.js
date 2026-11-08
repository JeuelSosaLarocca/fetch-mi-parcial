import test from "node:test";
import assert from "node:assert/strict";
import { parseUniversities, parseUniversityPage, parseExamPage } from "../src/parser.js";
import { filterExams, findExam, resolveUniversity, getUniversityExams, listSubjects } from "../src/search.js";
import { UNI_PAGE, INDEX_PAGE, EXAM_PAGE, EXACTAS_PAGE, CBC_HUB, CBC_ANALISIS } from "./fixture.js";

const ROOT = "https://www.altillo.com/examenes";
const base = `${ROOT}/utn/index.asp`;

test("universidades", () => {
  const u = parseUniversities(INDEX_PAGE);
  assert.deepEqual(u.map((x) => x.id), ["uba/cbc", "utn", "uba/exactas", "unc"]);
  assert.equal(u[2].name, "UBA EXACTAS");
  assert.equal(u[3].name, "UNC (CÓRDOBA)");
});

test("parser UTN: categorías, recuperatorio, regional", () => {
  const { exams: ex } = parseUniversityPage(UNI_PAGE, base);
  assert.equal(ex.length, 9);
  const rec = ex.find((e) => e.url.endsWith("algygean_2pa_2023.asp"));
  assert.equal(rec.kind, "segundo_parcial");
  assert.equal(rec.recuperatorio, true);
  assert.equal(rec.year, 2023);
  assert.equal(rec.section, "Regional Buenos Aires");
  const b = ex.find((e) => e.url.endsWith("algegeoana2008p1b.asp"));
  assert.equal(b.recuperatorio, false);
  assert.equal(b.kind, "primer_parcial");
  assert.equal(b.year, 2008);
  const pdf = ex.find((e) => e.url.endsWith("1b_compressed.pdf"));
  assert.equal(pdf.kind, "final");
  assert.equal(pdf.format, "pdf");
  assert.equal(ex.at(-1).section, "Regional Avellaneda");
});

test("parser Exactas: ancla vacía, varios años por <li>, sin pie de página", () => {
  const { exams } = parseUniversityPage(EXACTAS_PAGE, `${ROOT}/uba/exactas/index.asp`);
  assert.equal(exams.length, 3);
  assert.ok(exams.every((e) => e.subject === "Álgebra I (Computación y Matemática)"));
  assert.deepEqual(exams.map((e) => e.year), [2017, 2016, 2016]);
  assert.equal(exams[0].catedra, "Cátedra Única");
  assert.ok(exams.every((e) => e.kind === "primer_parcial"));
});

test("parser CBC: hub con sub-índices y página de materia", () => {
  const hub = parseUniversityPage(CBC_HUB, `${ROOT}/uba/cbc/index.asp`);
  assert.equal(hub.exams.length, 0);
  assert.deepEqual(hub.subIndexes.map((s) => s.name), ["ALGEBRA (EXAC)", "ANÁLISIS", "QUÍMICA"]);

  const { exams, subIndexes } = parseUniversityPage(CBC_ANALISIS, `${ROOT}/uba/cbc/analisis/index.asp`, { defaultSubject: "ANÁLISIS" });
  assert.equal(subIndexes.length, 0); // los hermanos en la navegación no son sub-índices
  assert.equal(exams.length, 5);
  assert.ok(exams.every((e) => e.subject === "ANÁLISIS"));
  const recup = exams.find((e) => e.variant === "Parcial B");
  assert.equal(recup.recuperatorio, true);
  assert.equal(recup.year, 2026);
  assert.equal(exams.find((e) => e.url.endsWith("anali_2025_p1a.asp")).year, 2025);
  assert.equal(exams.find((e) => e.url.endsWith("anali_2026_p1a.asp")).recuperatorio, false);
  assert.equal(exams.find((e) => e.url.endsWith("anal_2026_p2a.asp")).kind, "segundo_parcial");
  const libre = exams.find((e) => e.variant === "Libre A");
  assert.equal(libre.kind, "final");
  assert.equal(libre.libre, true);
});

test("filtros", () => {
  const { exams: ex } = parseUniversityPage(UNI_PAGE, base);
  assert.equal(filterExams(ex, { subject: "algebra y geometria analitica", tipo: "primer_parcial" }).exams[0].year, 2016);
  assert.equal(filterExams(ex, { subject: "analisis matematico 1", tipo: "primer_parcial" }).exams.length, 1);
  assert.equal(filterExams(ex, { subject: "analisis I" }).exams[0].subject, "Análisis Matemático I");
  assert.equal(filterExams(ex, { subject: "algebra", tipo: "recuperatorio" }).exams.length, 1);
  assert.equal(filterExams(ex, { subject: "fisica" }).exams.length, 0);
});

test("examen", () => {
  const e = parseExamPage(EXAM_PAGE, `${ROOT}/utn/algegeoana/x.asp`);
  assert.deepEqual(e.images, [`${ROOT}/utn/algegeoana/algygedfsg4s11.gif`]);
});

const pages = {
  [`${ROOT}/index.asp`]: INDEX_PAGE,
  [`${ROOT}/utn/index.asp`]: UNI_PAGE,
  [`${ROOT}/uba/cbc/index.asp`]: CBC_HUB,
  [`${ROOT}/uba/cbc/analisis/index.asp`]: CBC_ANALISIS,
};
const deps = { fetchHtml: async (u) => pages[u] ?? EXAM_PAGE };

test("findExam UTN: prefiere el original sobre el recuperatorio", async () => {
  assert.equal((await resolveUniversity("utn", deps)).best.id, "utn");
  const r = await findExam({ university: "UTN", subject: "algebra y geometria analitica", tipo: "segundo_parcial" }, deps);
  assert.equal(r.ok, true);
  assert.equal(r.exam.year, 2022);
  assert.equal(r.content.images.length, 1);
});

test("findExam CBC: entra al sub-índice de la materia", async () => {
  assert.equal((await resolveUniversity("cbc", deps)).best.id, "uba/cbc");
  const r = await findExam({ university: "CBC", subject: "analisis", tipo: "recuperatorio" }, deps);
  assert.equal(r.ok, true);
  assert.equal(r.exam.variant, "Parcial B");
  assert.deepEqual(r.content.files, [`${ROOT}/uba/cbc/analisis/recuperatorio_1erparcial_compressed.pdf`]);
  const p1 = await findExam({ university: "CBC", subject: "análisis", tipo: "primer_parcial" }, deps);
  assert.equal(p1.exam.url, `${ROOT}/uba/cbc/analisis/anali_2026_p1a.asp`);
});

test("listar materias de un hub", async () => {
  const { exams, subIndexes } = await getUniversityExams({ url: `${ROOT}/uba/cbc/index.asp` }, deps);
  assert.equal(listSubjects(exams, subIndexes).length, 3);
});
