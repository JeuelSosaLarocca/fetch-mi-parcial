# fetch-mi-parcial

Servidor MCP que navega [Altillo.com](https://www.altillo.com/examenes/index.asp) para encontrar
parciales, recuperatorios y finales según **universidad**, **materia** y **tipo de examen**.

## Herramientas

| Herramienta | Qué hace |
|---|---|
| `encontrar_examen` | Hace toda la navegación: universidad → materia → tipo, y devuelve el examen más útil ya abierto (imágenes / PDF / texto) junto con otros candidatos. |
| `buscar_examenes` | Lista exámenes que cumplen los filtros (materia, tipo, año), los más recientes primero. |
| `obtener_examen` | Abre la URL de un examen y devuelve sus imágenes, archivos y texto. |
| `listar_materias` | Materias con exámenes cargados para una universidad. |
| `listar_universidades` | Universidades y facultades disponibles (con filtro opcional). |

`tipo` acepta: `primer_parcial`, `segundo_parcial`, `recuperatorio`, `final`.

Ejemplo de pedido al asistente: *"Buscame el último primer parcial de Análisis del CBC"* →
`encontrar_examen({ universidad: "CBC", materia: "Análisis", tipo: "primer_parcial" })`.

### Cómo interpreta Altillo

- **Universidades**: salen del índice general. La búsqueda es aproximada (sin acentos y con
  "UBA Exactas", "UTN", "UNLP", etc.). También se puede pasar la URL de un índice de Altillo.
- **Materias**: en cada índice, las anclas `<a name>` marcan la materia, y las listas anidadas
  marcan el tipo ("Primer Parcial", "Segundos Parciales", "Finales", "Libres"). Cuando un `<li>`
  junta varios años separados con `<br>`, cada examen toma el año más cercano anterior.
  Se ignoran números romanos y acentos al comparar ("analisis 2" = "Análisis II").
- **Hubs** (CBC, Económicas UBA, ...): si el índice tiene un sub-índice por materia, se entra al
  que coincide con la materia pedida.
- **Recuperatorios**: se detectan por la etiqueta "(Recuperatorio)" o por el nombre del archivo.
  Si se pide `primer_parcial`, `segundo_parcial` o `final`, los originales aparecen antes que los
  recuperatorios. Los exámenes "Libres" se clasifican como `final` con `libre: true`.
- **Contenido**: Altillo publica la mayoría de los exámenes como imágenes `.gif` dentro de
  `.exam_text`, y algunos como PDF. Se devuelven las URLs absolutas.

## Instalación

```bash
npm install
```

```bash
npm test
```

### Registrarlo en Claude Code

```bash
claude mcp add fetch-mi-parcial -- node "/ruta/a/fetch-mi-parcial/src/server.js"
```

O en el `claude_desktop_config.json` / `.mcp.json`:

```json
{
  "mcpServers": {
    "fetch-mi-parcial": {
      "command": "node",
      "args": ["/ruta/a/fetch-mi-parcial/src/server.js"]
    }
  }
}
```

Variables opcionales:

| Variable | Valores | Por defecto |
|---|---|---|
| `ALTILLO_SOURCE` | `auto` · `directo` · `wayback` | `auto` |
| `ALTILLO_DELAY_MS` | pausa entre requests a un mismo host | `400` |
| `ALTILLO_USER_AGENT` | user-agent honesto que identifica la herramienta | `fetch-mi-parcial-mcp/0.1 …` |

## Fuentes: Altillo directo y Wayback Machine

Altillo está detrás de Cloudflare y responde **403 / "Just a moment…"** a los clientes que no son
navegadores. El servidor **no intenta evadir ese control** (ni con user-agents falsos ni con
navegadores headless).

Con `ALTILLO_SOURCE=auto`, si Altillo bloquea la petición, se usa la **copia más reciente en la
[Wayback Machine](https://web.archive.org/)**, que es un archivo público y admite acceso automatizado. El
bloqueo se recuerda 30 minutos para no volver a pedirle a Altillo en cada request.

Qué implica:

- Cada resultado trae `fuente` (`altillo` o `wayback`) y, si es Wayback, la fecha del `snapshot`.
- **Puede estar desactualizado.** Por ejemplo, la copia del índice de Análisis del CBC llega hasta
  2024 aunque el sitio ya tiene 2025 y 2026.
- **La cobertura de imágenes y PDFs es parcial.** Cada recurso se verifica con la API de
  disponibilidad de Wayback. Los que no están archivados aparecen en `missing`, y
  `encontrar_examen` pasa al siguiente candidato (hasta 8) si un examen no tiene nada usable.
- Las URLs devueltas (`…/web/<fecha>im_/…` o `id_/…`) son el archivo original, sin la barra de
  Wayback.
- **Save Page Now no sirve para actualizarlo**: Cloudflare también bloquea al robot de archive.org,
  así que una captura nueva guarda la página "Just a moment…" (en blanco). El servidor ignora esas
  capturas y usa la última con contenido real (vía el índice CDX, sólo respuestas HTTP 200).

Resultados de una prueba real (noviembre 2026):

| Pedido | Resultado |
|---|---|
| CBC · Análisis · primer parcial | ✅ PDF de 2024 |
| UBA Exactas · Álgebra I · final | ✅ 2013, 2 de 5 imágenes (los finales más nuevos no están archivados) |
| UADE · Administración I · primer parcial | ✅ 2023, imagen completa |
| UTN · Análisis Matemático I · primer parcial | ❌ las imágenes de los 8 candidatos no están archivadas |

Para tener datos completos y al día, lo correcto es pedirle acceso a Altillo
(material@altillo.com). La descarga está aislada en `src/fetcher.js`, y todas las funciones de
`src/search.js` aceptan `deps.fetchHtml`, así que se puede conectar una fuente autorizada sin
tocar el parser.
