#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getFetchInfo } from "./fetcher.js";
import { TIPOS, listUniversities, resolveUniversity, getUniversityExams, listSubjects, filterExams, getExam, findExam } from "./search.js";

const server = new McpServer({ name: "fetch-mi-parcial", version: "0.1.0" });

const ok = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const wrap = (fn) => async (args) => {
  try {
    return ok(await fn(args));
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: `${err.name}: ${err.message}` }] };
  }
};

const uniArg = z.string().describe('Universidad o facultad, ej. "UTN", "UBA Exactas", "UNLP", o una URL de altillo.com');
const tipoArg = z.enum(TIPOS).optional().describe("primer_parcial | segundo_parcial | recuperatorio | final");

server.tool(
  "listar_universidades",
  "Lista las universidades/facultades disponibles en Altillo (id, nombre, url).",
  { filtro: z.string().optional().describe("Texto para filtrar por nombre") },
  wrap(async ({ filtro }) => {
    if (!filtro) return listUniversities();
    const { best, alternatives } = await resolveUniversity(filtro);
    return best ? [best, ...alternatives] : [];
  })
);

server.tool(
  "listar_materias",
  "Lista las materias que tienen exámenes cargados para una universidad.",
  { universidad: uniArg, filtro: z.string().optional() },
  wrap(async ({ universidad, filtro }) => {
    const { best, alternatives } = await resolveUniversity(universidad);
    if (!best) return { error: `No encontré "${universidad}"` };
    const { exams, subIndexes } = await getUniversityExams(best);
    const subjects = listSubjects(exams, subIndexes);
    const f = filtro?.toLowerCase();
    return { universidad: best, alternativas: alternatives, materias: f ? subjects.filter((s) => s.name.toLowerCase().includes(f)) : subjects };
  })
);

server.tool(
  "buscar_examenes",
  "Lista exámenes (año, variante, URL) de una universidad filtrando por materia, tipo y año. Más recientes primero.",
  {
    universidad: uniArg,
    materia: z.string().optional(),
    tipo: tipoArg,
    anio: z.number().int().optional(),
    limite: z.number().int().min(1).max(100).default(20),
  },
  wrap(async ({ universidad, materia, tipo, anio, limite }) => {
    const { best, alternatives } = await resolveUniversity(universidad);
    if (!best) return { error: `No encontré "${universidad}"` };
    const { exams } = await getUniversityExams(best, {}, materia);
    const r = filterExams(exams, { subject: materia, tipo, year: anio });
    return {
      universidad: best,
      fuente: getFetchInfo(best.url),
      alternativas: alternatives,
      materiasCoincidentes: r.subjectMatches,
      nota: r.note,
      total: r.exams.length,
      examenes: r.exams.slice(0, limite),
    };
  })
);

server.tool(
  "obtener_examen",
  "Abre la página de un examen de Altillo y devuelve sus imágenes, archivos (PDF) y texto.",
  { url: z.string().url() },
  wrap(({ url }) => getExam(url))
);

server.tool(
  "encontrar_examen",
  "Navega Altillo (universidad -> materia -> tipo) y devuelve el examen más útil ya abierto, con sus imágenes/PDF. Ideal para pedidos como 'dame el último primer parcial de Análisis I de la UTN'.",
  { universidad: uniArg, materia: z.string(), tipo: tipoArg, anio: z.number().int().optional() },
  wrap(({ universidad, materia, tipo, anio }) => findExam({ university: universidad, subject: materia, tipo, year: anio }))
);

await server.connect(new StdioServerTransport());
