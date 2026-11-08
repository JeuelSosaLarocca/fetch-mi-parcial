// HTML mínimo que reproduce la estructura observada en altillo.com/examenes/utn/index.asp
export const UNI_PAGE = `<html><body>
<p><font size="6"><b>Regional Buenos Aires</b></font></p>
<ul><li><b><a name="algegeoana">Algebra y Geometría Analítica</a></b><ul>
<li><font size="2">Primer Parcial</font><ul>
<li><font size="2">2016: <a href="algegeoana/algygean_1pa_2016.asp">Parcial A</a></font></li>
<li><font size="2">2008: <a href="algegeoana/algegeoana2008p1a.asp">Parcial A</a> | <a href="algegeoana/algegeoana2008p1b.asp">Parcial B</a></font></li>
</ul></li>
<li><font size="2">Segundo Parcial</font><ul>
<li><font size="2">2023: <a href="algegeoana/algygean_2pa_2023.asp">Parcial A</a> (Recuperatorio)</font></li>
<li><font size="2">2022: <a href="algegeoana/algygean_2pa_2022.asp">Parcial A</a></font></li>
</ul></li>
<li><font size="2">Final</font><ul>
<li><font size="2">2023: <a href="algegeoana/algygean_fina_2023.asp">Final A</a> | <a href="algegeoana/1b_compressed.pdf">Final B</a></font></li>
</ul></li></ul></li>
<li><b><a name="analisis1">Análisis Matemático I</a></b><ul>
<li><font size="2">Primer Parcial</font><ul>
<li><font size="2">2019: <a href="analisis1/anal_2019_1pa.asp">Parcial A</a></font></li>
</ul></li></ul></li></ul>
<p><font size="6"><b>Regional Avellaneda</b></font></p>
<ul><li><b><a name="algeygeo">Álgebra y Geometría Analítica</a></b><ul>
<li><font size="2">Primer Parcial</font><ul>
<li><font size="2">2013: <a href="utn-avellaneda/algeygeo/algeygeo2013p1a.asp">Parcial A</a></font></li>
</ul></li></ul></li></ul>
<a href="pedirlibre.asp">Parcial C</a></body></html>`;

// Patrón de UBA Exactas: ancla vacía junto al título y varios años en un mismo <li> con <br>.
export const EXACTAS_PAGE = `<html><body>
<table><tr><td><a href="#algebra">ÁLGEBRA</a></td></tr></table>
<p><font size="6"><b>Ciencias Exactas</b></font></p>
<font size="5"><a name="algebra"></a><b>Álgebra I</b> (Computación y Matemática)</font>
<ul><li><b><font size="4">Primer Parcial</font></b>
<ul><li><b><font size="2">Cátedra Única:<br>
<span>2017: <a href="algebra/alg_2017_1pa.asp">Parcial A</a><br></span>
2016: <a href="algebra/alg_2016_1pa.asp">Parcial A</a> | <a href="algebra/alg_2016_1pb.asp">Parcial B</a></font></b></li></ul></li></ul>
<a href="/examenes/colaboraciones.asp">cómo colaborar</a> <a href="/terms.asp">PRIVACIDAD Y TERMINOS</a>
</body></html>`;

// Patrón del CBC: la página principal es un hub con un índice por materia.
export const CBC_HUB = `<html><body>
<a href="/examenes/uba/cbc/algebra/index.asp">ALGEBRA (EXAC)</a>
<a href="analisis/index.asp">ANÁLISIS</a>
<a href="quimica/index.asp">QUÍMICA</a>
<a href="/examenes/index.asp">Examenes</a></body></html>`;

export const CBC_ANALISIS = `<html><body>
<a href="/examenes/uba/cbc/index.asp">CBC (UBA)</a> <a href="/examenes/uba/cbc/quimica/index.asp">QUÍMICA</a>
<ul><li><b><font size="4"><a name="Primer_Parcial">Primeros Parciales</a></font></b><ul>
<li><b><font size="2">Cátedra única (Gutiérrez): <br>
2026: <a href="anali_2026_p1a.asp">Parcial A</a> | <a href="recuperatorio_1erparcial_compressed.pdf">Parcial B</a> (Recuperatorio)<br>
2025: <a href="anali_2025_p1a.asp">Parcial A</a></font></b></li></ul></li>
<li><b><font size="4"><a name="Segundo_Parcial">Segundos Parciales</a></font></b><ul>
<li><b><font size="2">2026: <a href="anal_2026_p2a.asp">Parcial A</a></font></b></li></ul></li>
<li><b><font size="4"><a name="Libres">Libres</a></font></b><ul>
<li><b><font size="2">2024: <a href="anal_2024_libre.asp">Libre A</a></font></b></li></ul></li></ul>
</body></html>`;

export const INDEX_PAGE = `<html><body>
<a href="https://www.altillo.com/examenes/uba/cbc/index.asp">CBC</a>
<a href="https://www.altillo.com/index.asp">Inicio</a><a href="https://www.altillo.com/examenes/index.asp">Examenes</a>
<a href="https://www.altillo.com/examenes/colabpro.asp">info</a>
<a href="https://www.altillo.com/examenes/utn/index.asp">UTN (TECNOLÓGICA)</a>
<a href="https://www.altillo.com/examenes/uba/exactas/index.asp">EXACTAS</a>
<a href="https://www.altillo.com/examenes/unc/index.asp">UNC</a><a href="https://www.altillo.com/examenes/unc/index.asp">(CÓRDOBA)</a>
<a href="https://www.altillo.com/examenes/espana/index.asp">ESPAÑA</a></body></html>`;

export const EXAM_PAGE = `<html><head><title>1º Parcial A | Algebra y Geometría Analítica (2016) | UTN</title></head><body>
<span class="exam_info">1º Parcial A | Algebra y Geometría Analítica (2016) | UTN</span>
<div class="exam_text"><p><img src="algygedfsg4s11.gif"></p></div></body></html>`;
