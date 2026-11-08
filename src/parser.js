import * as cheerio from "cheerio";
import { clean, norm } from "./text.js";

const ROOT = "https://www.altillo.com";
const INLINE = new Set(["span", "font", "b", "i", "u", "strong", "em"]);

function resolve(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/** Texto propio de un <li>, sin las listas anidadas. */
function ownText($, li) {
  const c = $(li).clone();
  c.find("ul, ol").remove();
  return clean(c.text());
}

/** Texto que sigue a un enlace hasta el próximo enlace (p. ej. "(Recuperatorio)"). */
function trailingText($, a) {
  let out = "";
  let node = a;
  for (let depth = 0; node && depth < 4; depth++) {
    for (let n = node.next; n; n = n.next) {
      if (n.type === "tag" && ($(n).is("a[href]") || $(n).find("a[href]").length || /^(ul|ol|li)$/.test(n.name))) return clean(out);
      out += $(n).text?.() ?? n.data ?? "";
    }
    const p = node.parent;
    if (p && p.type === "tag" && INLINE.has(p.name)) node = p;
    else break;
  }
  return clean(out);
}

// ---------- Universidades (índice general) ----------

export function parseUniversities(html, baseUrl = `${ROOT}/examenes/index.asp`) {
  const $ = cheerio.load(html);
  const byUrl = new Map();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const url = resolve(href, baseUrl);
    if (!url) return;
    const u = new URL(url);
    if (!/(^|\.)altillo\.com$/.test(u.hostname)) return;
    const m = /^\/examenes\/([^/]+(?:\/[^/]+)?)\/(?:index\.asp)?$/i.exec(u.pathname) || /^\/examenes\/([^/]+)\/?$/i.exec(u.pathname);
    if (!m) return;
    const slug = m[1];
    if (/^(index\.asp|colab|espana)/i.test(slug) || /colabpro|colaboraciones/i.test(u.pathname)) return;
    if (/espana/i.test(slug)) return;
    const text = clean($(el).text());
    const key = u.origin + u.pathname.toLowerCase();
    const e = byUrl.get(key) ?? { id: slug.toLowerCase(), url, names: [] };
    if (text && !e.names.includes(text)) e.names.push(text);
    byUrl.set(key, e);
  });
  return [...byUrl.values()].map((e) => {
    const isUba = e.id.startsWith("uba/");
    const base = e.names.join(" ").replace(/\s+/g, " ").trim() || e.id;
    return { id: e.id, name: isUba ? `UBA ${base}` : base, url: e.url };
  });
}

// ---------- Página de una universidad: materias y exámenes ----------

const YEAR_RE = /\b(19[5-9]\d|20[0-4]\d)\b/g;
const CATEGORY_RE = /^(primer|segund|tercer|final|libre|recuperator|parcial|trabajo|resumen|examen)/;

function classify(category, linkText, trailing, href) {
  const cat = norm(category);
  const lt = norm(linkText);
  const all = norm(`${category} ${linkText} ${trailing}`);
  let kind = "otro";
  if (/\bfinal/.test(cat) || /\blibre/.test(cat) || /\bfinal/.test(lt)) kind = "final";
  else if (/(primer|\b1\b|1er|1o)/.test(cat) && /parcial/.test(cat)) kind = "primer_parcial";
  else if (/(segund|\b2\b|2do|2o)/.test(cat) && /parcial/.test(cat)) kind = "segundo_parcial";
  else if (/parcial|recuperat/.test(cat) || /parcial/.test(lt)) kind = "parcial";
  const file = href.split("/").pop().toLowerCase();
  const recuperatorio = /recup/.test(all) || /recup/.test(file);
  const libre = /\blibre/.test(cat) || /\blibre/.test(lt);
  return { kind, recuperatorio, libre };
}

/**
 * Recorre un <li> en orden de documento y, para cada enlace, recuerda el último año
 * ("2016:") y la última cátedra ("Cátedra Única:") vistos antes de él. Así funcionan
 * los <li> que agrupan varios años separados por <br>.
 */
function annotateLi(li) {
  const out = new Map();
  let year = null;
  let catedra = null;
  const walk = (node) => {
    for (const n of node.children ?? []) {
      if (n.type === "text") {
        const ys = [...n.data.matchAll(YEAR_RE)];
        if (ys.length) year = Number(ys.at(-1)[1]);
        const c = /(c[aá]tedra[^:]{0,80}):/i.exec(n.data);
        if (c) catedra = clean(c[1]);
      } else if (n.type === "tag") {
        if (n.name === "ul" || n.name === "ol") continue;
        if (n.name === "a" && n.attribs?.href) out.set(n, { year, catedra });
        else walk(n);
      }
    }
  };
  walk(li);
  return out;
}

/**
 * Extrae los exámenes de la página índice de una universidad/facultad/materia.
 * Devuelve también `subIndexes`: páginas índice hijas (p. ej. el CBC tiene un índice por materia).
 */
export function parseUniversityPage(html, baseUrl, { defaultSubject = null } = {}) {
  const $ = cheerio.load(html);
  const pageDir = new URL(".", baseUrl).pathname.toLowerCase();
  let subject = defaultSubject ? { id: null, name: defaultSubject } : null;
  let headingCategory = null;
  let section = null;
  const exams = [];
  const subIndexes = new Map();
  const seen = new Set();
  const liCache = new Map();

  $('a, font[size="6"]').each((_, el) => {
    const $el = $(el);
    if (el.name === "font") {
      const t = clean($el.text());
      if (t) section = t;
      return;
    }
    const href = $el.attr("href");
    if (!href) {
      const nm = $el.attr("name");
      if (!nm) return;
      // Ancla vacía + título al lado: <font><a name="algebra"></a><b>Álgebra I</b> (...)</font>
      const t = clean($el.text()) || clean($el.parent().text()).slice(0, 120);
      if (!t) return;
      if (CATEGORY_RE.test(norm(t))) headingCategory = t;
      else {
        subject = { id: nm, name: t };
        headingCategory = null;
      }
      return;
    }
    if (href.startsWith("#") || /^(mailto|javascript):/i.test(href)) return;
    const url = resolve(href, baseUrl);
    if (!url) return;
    const u = new URL(url);
    if (!/(^|\.)altillo\.com$/.test(u.hostname)) return;

    if (/\/index\.asp$/i.test(u.pathname)) {
      const p = u.pathname.toLowerCase();
      const name = clean($el.text());
      if (p.startsWith(pageDir) && p !== new URL(baseUrl).pathname.toLowerCase() && name && !subIndexes.has(url)) {
        subIndexes.set(url, { name, url });
      }
      return;
    }
    if (/pedirlibre\.asp$/i.test(href)) return;
    if (!/\.(asp|pdf|html?|docx?|jpe?g|png|gif)$/i.test(u.pathname)) return;
    if (seen.has(url)) return;

    const linkText = clean($el.text());
    const li = $el.closest("li");
    // Fuera de listas sólo hay navegación/pie (colaborar, términos, contacto).
    if (!li.length) return;

    let category = "";
    li.parents("li").each((_, p) => {
      const t = ownText($, p);
      if (!category && /parcial|final|recuperat|libre/i.test(norm(t)) && !/^\s*(19|20)\d{2}/.test(t)) category = t.slice(0, 80);
    });
    const liText = ownText($, li[0]);
    if (!category && /parcial|final|recuperat|libre/i.test(norm(liText.split(/\b(19|20)\d{2}\b/)[0]))) {
      category = liText.split(/\b(19|20)\d{2}\b/)[0].replace(/:\s*$/, "").slice(0, 80);
    }
    if (!category && headingCategory) category = headingCategory;

    if (!liCache.has(li[0])) liCache.set(li[0], annotateLi(li[0]));
    const ann = liCache.get(li[0]).get(el) ?? {};
    const hrefYear = /(19[5-9]\d|20[0-4]\d)/.exec(href);
    const year = ann.year ?? (hrefYear ? Number(hrefYear[1]) : null);

    let subj = subject?.name ?? null;
    if (!subj) {
      const top = li.parents("li").last();
      subj = clean(ownText($, (top.length ? top : li)[0]).split(/\b(19|20)\d{2}\b/)[0]).slice(0, 80) || null;
    }

    const trailing = trailingText($, el);
    const { kind, recuperatorio, libre } = classify(category, linkText, trailing, href);
    seen.add(url);
    exams.push({
      subject: subj,
      section,
      kind,
      recuperatorio,
      libre,
      year,
      catedra: ann.catedra ?? null,
      variant: linkText,
      note: trailing || null,
      category: category || null,
      format: /\.pdf$/i.test(u.pathname) ? "pdf" : "pagina",
      url,
    });
  });
  return { exams, subIndexes: [...subIndexes.values()] };
}

// ---------- Página de un examen ----------

export function parseExamPage(html, url) {
  const $ = cheerio.load(html);
  const box = $(".exam_text").first();
  const scope = box.length ? box : $("body");
  const images = [];
  const files = [];
  scope.find("img[src]").each((_, e) => {
    const u = resolve($(e).attr("src"), url);
    if (u && !images.includes(u)) images.push(u);
  });
  scope.find("a[href], iframe[src], embed[src], object[data]").each((_, e) => {
    const raw = $(e).attr("href") || $(e).attr("src") || $(e).attr("data");
    const u = resolve(raw, url);
    if (u && /\.(pdf|docx?|zip|rar)(\?|$)/i.test(u) && !files.includes(u)) files.push(u);
  });
  const info = clean($(".exam_info").first().text()).replace(/\s*\|\s*/g, " | ");
  const text = clean(scope.clone().find("script,style").remove().end().text());
  return { url, title: clean($("title").first().text()), info, images, files, text: text || null };
}
