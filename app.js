// app.js - Gestor de Recetas Fermentos
// - Uses Firestore (no auth).
// - Expects logo.b64.txt in same folder for PDF logo.
// - Requires jsPDF and autoTable included in index.html (we included CDN).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, getDocs, getDoc,
  addDoc, setDoc, deleteDoc, doc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ---------- FIREBASE CONFIG ----------
const firebaseConfig = {
  apiKey: "AIzaSyAhzdmVFlvtoqMSfIQ6OCbiYdg6s6c95iY",
  authDomain: "recetaspanaderia-b31f2.firebaseapp.com",
  projectId: "recetaspanaderia-b31f2",
  storageBucket: "recetaspanaderia-b31f2.firebasestorage.app",
  messagingSenderId: "979143269695",
  appId: "1:979143269695:web:678dc20bf48fc71700078a"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const COLL = "recetas";

// ---------- DOM ----------
const $ = id => document.getElementById(id);

const recetaSelect = $("recetaSelect");
const nombreRecetaContainer = $("nombreRecetaContainer");
const instrAmasadoContainer = $("instrAmasadoContainer");
const instrHorneadoContainer = $("instrHorneadoContainer");

const pesoTotalInput = $("pesoTotal");
const pesoMultiplierInput = $("pesoMultiplier");
const rendPiezasInput = $("rendPiezas");
const rendPesoUnitInput = $("rendPesoUnit");
const rendimientoPreview = $("rendimientoPreview");

const btnAgregarIngrediente = $("btnAgregarIngrediente");
const btnGuardar = $("btnGuardar");
const btnEliminar = $("btnEliminar");
const btnEditarRecetaView = $("btnEditarRecetaView");
const btnCancelarEdicionView = $("btnCancelarEdicionView");
const btnEditar = $("btnEditar");
const btnCancelarEdicion = $("btnCancelarEdicion");
const btnRecalcular = $("btnRecalcular");
const btnDuplicar = $("btnDuplicar");
const btnExportar = $("btnExportar");
const btnPreviewPDF = $("btnPreviewPDF");
const btnExportCSV = $("btnExportCSV");
const btnCompartir = $("btnCompartir");

const ingredientesDiv = $("ingredientes");
const tablaIngredientes = $("tablaIngredientes");
const sumGramsEl = $("sumGrams");

const statHydrationTotal = $("statHydrationTotal");
const statStarterPct = $("statStarterPct");
const statSaltPct = $("statSaltPct");
const statPesoEfectivo = $("statPesoEfectivo");

const uiLogo = $("uiLogo");
const btnToggleTheme = $("btnToggleTheme");

let ingredientes = [];
let recetaIdActual = null;
let recetasCache = [];
let logoDataURI = null;

let isEditMode = true; // start in editing for new recipe by default

// ---------- Utilities ----------
const toNum = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

function setEditing(flag) {
  isEditMode = !!flag;
  document.body.classList.toggle("editing", isEditMode);

  // toggle visibility/disabled state of editors
  // nombre (input) rendered accordingly
  renderNombre();

  // render instructions (textarea if editing else p)
  renderInstrucciones();

  // ingredients: in edit mode show inputs; in view mode hide inputs
  renderIngredientes();

  // show/hide top edit buttons (we keep both available but manage disable)
  // save button enabled only in edit mode
  btnGuardar.disabled = !isEditMode;
}

// classify ingredient (simple heuristics)
function classifyIngredientName(name = "") {
  const n = (name || "").toLowerCase();
  if (/harina|flour|trigo|wheat|semola/i.test(n)) return "flour";
  if (/agua|water/i.test(n)) return "water";
  if (/leche|milk/i.test(n)) return "milk";
  if (/huevo|egg/i.test(n)) return "egg";
  if (/mantequilla|butter/i.test(n)) return "fat";
  if (/yogur|yoghurt|yogurt/i.test(n)) return "yogurt";
  if (/masa madre|starter|levain|masa madre/i.test(n)) return "starter";
  if (/sal/i.test(n)) return "salt";
  if (/levadura|yeast/i.test(n)) return "yeast";
  return "other";
}
const WATER_FACTORS = { milk: 0.87, egg: 0.75, fat: 0.16, yogurt: 0.80 };

// ---------- Render helpers ----------
function renderNombre() {
  nombreRecetaContainer.innerHTML = "";
  if (isEditMode) {
    const input = document.createElement("input");
    input.id = "nombreReceta";
    input.type = "text";
    input.placeholder = "Ej. Baguette clásica";
    input.value = nombreRecetaContainer.dataset.value || "";
    input.addEventListener("input", e => nombreRecetaContainer.dataset.value = e.target.value);
    nombreRecetaContainer.appendChild(input);
  } else {
    const h2 = document.createElement("h2");
    h2.textContent = nombreRecetaContainer.dataset.value || "Receta sin nombre";
    nombreRecetaContainer.appendChild(h2);
  }
}

function renderInstrucciones() {
  instrAmasadoContainer.innerHTML = "";
  instrHorneadoContainer.innerHTML = "";

  if (isEditMode) {
    const la = document.createElement("label"); la.textContent = "Amasado / Fermentación";
    const ta = document.createElement("textarea"); ta.id = "instrAmasado"; ta.rows = 3;
    ta.value = instrAmasadoContainer.dataset.value || "";
    ta.addEventListener("input", e => instrAmasadoContainer.dataset.value = e.target.value);
    instrAmasadoContainer.appendChild(la); instrAmasadoContainer.appendChild(ta);

    const lh = document.createElement("label"); lh.textContent = "Horneado";
    const tb = document.createElement("textarea"); tb.id = "instrHorneado"; tb.rows = 2;
    tb.value = instrHorneadoContainer.dataset.value || "";
    tb.addEventListener("input", e => instrHorneadoContainer.dataset.value = e.target.value);
    instrHorneadoContainer.appendChild(lh); instrHorneadoContainer.appendChild(tb);
  } else {
    const pa = document.createElement("p"); pa.textContent = instrAmasadoContainer.dataset.value || "—";
    const pb = document.createElement("p"); pb.textContent = instrHorneadoContainer.dataset.value || "—";
    instrAmasadoContainer.appendChild(pa);
    instrHorneadoContainer.appendChild(pb);
  }
}

function renderIngredientes() {
  ingredientesDiv.innerHTML = "";
  if (!ingredientes) ingredientes = [];

  ingredientes.forEach((ing, idx) => {
    const row = document.createElement("div");
    row.className = "ingredient-row";

    if (isEditMode) {
      const name = document.createElement("input");
      name.type = "text"; name.value = ing.nombre || ""; name.placeholder = "Nombre";
      name.addEventListener("input", e => { ingredientes[idx].nombre = e.target.value; calcularPesos(); });

      const pct = document.createElement("input");
      pct.type = "number"; pct.step = "0.1"; pct.min = 0; pct.value = toNum(ing.porcentaje);
      pct.addEventListener("input", e => { ingredientes[idx].porcentaje = parseFloat(e.target.value) || 0; calcularPesos(); });

      const del = document.createElement("button"); del.type = "button"; del.className = "icon-btn danger";
      del.innerHTML = "<i class='bx bx-x'></i>";
      del.addEventListener("click", () => { ingredientes.splice(idx,1); renderIngredientes(); calcularPesos(); });

      row.appendChild(name); row.appendChild(pct); row.appendChild(del);
    } else {
      const tdName = document.createElement("div"); tdName.textContent = ing.nombre;
      const tdPct = document.createElement("div"); tdPct.textContent = (toNum(ing.porcentaje)).toFixed(2) + "%";
      const tdGram = document.createElement("div"); tdGram.textContent = (ing._grams || 0) + " g";
      tdName.style.flex = "1"; tdPct.style.width = "110px"; tdGram.style.width = "110px";
      row.appendChild(tdName); row.appendChild(tdPct); row.appendChild(tdGram);
    }

    ingredientesDiv.appendChild(row);
  });
}

// ---------- Calculations ----------
function getEffectivePesoTotal() {
  const base = toNum(pesoTotalInput && pesoTotalInput.value);
  const mult = Math.max(0.0001, toNum(pesoMultiplierInput && pesoMultiplierInput.value) || 1);
  return base * mult;
}

function calcularPesos() {
  const pesoTotal = getEffectivePesoTotal();
  if (tablaIngredientes) tablaIngredientes.innerHTML = "";

  if (!ingredientes.length || pesoTotal <= 0) {
    if (sumGramsEl) sumGramsEl.textContent = "0 g";
    actualizarStats();
    return;
  }

  const sumPerc = ingredientes.reduce((acc, ing) => acc + (toNum(ing.porcentaje) || 0), 0);
  if (sumPerc <= 0) {
    if (sumGramsEl) sumGramsEl.textContent = "0 g";
    actualizarStats();
    return;
  }

  const flourWeight = (pesoTotal * 100) / sumPerc;

  ingredientes.forEach(ing => {
    const pct = toNum(ing.porcentaje);
    ing._raw = (pct / 100) * flourWeight;
    ing._grams = Math.round(ing._raw || 0);
  });

  let totalRounded = ingredientes.reduce((s, it) => s + (it._grams || 0), 0);
  const delta = Math.round(pesoTotal) - totalRounded;
  if (delta !== 0) {
    let idx = ingredientes.findIndex(it => Math.abs(toNum(it.porcentaje) - 100) < 1e-6);
    if (idx === -1) {
      let max = -Infinity; ingredientes.forEach((it,i)=>{ if (toNum(it.porcentaje) > max){ max=toNum(it.porcentaje); idx = i; }});
    }
    if (typeof idx === "number" && ingredientes[idx]) {
      ingredientes[idx]._grams = (ingredientes[idx]._grams || 0) + delta;
      totalRounded += delta;
    }
  }

  if (tablaIngredientes) {
    ingredientes.forEach(ing => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${ing.nombre}</td><td>${(toNum(ing.porcentaje)).toFixed(2)}%</td><td>${ing._grams||0} g</td>`;
      tablaIngredientes.appendChild(tr);
    });
  }
  if (sumGramsEl) sumGramsEl.textContent = totalRounded + " g";

  actualizarStats();
}

// improved hydration calculation
function actualizarStats() {
  let flourW = 0, waterW = 0, milkW = 0, eggW = 0, fatW = 0, yogurtW = 0, starterW = 0, saltW = 0, otherW = 0;
  ingredientes.forEach(it => {
    const g = toNum(it._grams || it._raw);
    const cls = classifyIngredientName(it.nombre);
    if (cls === "flour") flourW += g;
    else if (cls === "water") waterW += g;
    else if (cls === "milk") milkW += g;
    else if (cls === "egg") eggW += g;
    else if (cls === "fat") fatW += g;
    else if (cls === "yogurt") yogurtW += g;
    else if (cls === "starter") starterW += g;
    else if (cls === "salt") saltW += g;
    else otherW += g;
  });

  const starterHydrationEl = $("starterHydration");
  const starterH = starterHydrationEl ? toNum(starterHydrationEl.value) : 100;
  const starterWater = starterW * (starterH / (100 + starterH));
  const starterFlourEq = Math.max(0, starterW - starterWater);

  const milkWater = milkW * (WATER_FACTORS.milk || 0.87);
  const eggWater = eggW * (WATER_FACTORS.egg || 0.75);
  const fatWater = fatW * (WATER_FACTORS.fat || 0.16);
  const yogurtWater = yogurtW * (WATER_FACTORS.yogurt || 0.80);

  const harinaTotal = flourW + starterFlourEq;
  const aguaDirecta = waterW;
  const aguaDesdeOtros = milkWater + eggWater + fatWater + yogurtWater;
  const aguaDesdeStarter = starterWater;

  const hidrTotal = harinaTotal > 0 ? ((aguaDirecta + aguaDesdeOtros + aguaDesdeStarter) / harinaTotal) * 100 : NaN;
  const salSobreHarina = harinaTotal > 0 ? (saltW / harinaTotal) * 100 : NaN;
  const pesoEfectivo = getEffectivePesoTotal();
  const starterPct = pesoEfectivo > 0 ? (starterW / pesoEfectivo) * 100 : NaN;

  if (statHydrationTotal) statHydrationTotal.textContent = isFinite(hidrTotal) ? hidrTotal.toFixed(1) + "%" : "—";
  if (statStarterPct) statStarterPct.textContent = isFinite(starterPct) ? starterPct.toFixed(2) + "%" : "—";
  if (statSaltPct) statSaltPct.textContent = isFinite(salSobreHarina) ? salSobreHarina.toFixed(2) + "% (sobre harina)" : "—";
  if (statPesoEfectivo) statPesoEfectivo.textContent = Math.round(pesoEfectivo) + " g";

  // rendimiento preview and auto-sync multiplier
  const piezas = rendPiezasInput ? Math.max(0, parseInt(rendPiezasInput.value) || 0) : 0;
  const pesoUnit = rendPesoUnitInput ? Math.max(0, parseFloat(rendPesoUnitInput.value) || 0) : 0;
  if (rendimientoPreview) {
    if (piezas > 0 && pesoUnit > 0) rendimientoPreview.textContent = `${piezas} × ${pesoUnit} g = ${piezas * pesoUnit} g`;
    else rendimientoPreview.textContent = "—";
  }
  if (piezas > 0 && pesoUnit > 0 && pesoTotalInput) {
    const newTotal = piezas * pesoUnit;
    if (!pesoTotalInput.dataset.base) pesoTotalInput.dataset.base = String(newTotal);
    const base = parseFloat(pesoTotalInput.dataset.base) || newTotal || 1;
    pesoTotalInput.value = newTotal;
    if (pesoMultiplierInput) pesoMultiplierInput.value = Math.round((newTotal / base) * 100) / 100;
    calcularPesos();
  }
}

// ---------- Firestore CRUD ----------
async function cargarRecetas() {
  if (!recetaSelect) return;
  recetaSelect.innerHTML = `<option value="">-- Agregar una receta ➕ --</option>`;
  recetasCache = [];
  try {
    const q = query(collection(db, COLL), orderBy("nombre", "asc"));
    const snap = await getDocs(q);
    snap.forEach(d => recetasCache.push({ id: d.id, data: d.data() }));
    recetasCache.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.data.nombre || "Receta sin nombre";
      recetaSelect.appendChild(opt);
    });
  } catch (err) {
    console.error("Error cargarRecetas:", err);
    alert("Error cargando recetas (ver consola). Revisa reglas de Firestore si hay permisos)");
  }
}

async function cargarReceta(id) {
  if (!id) return limpiarFormulario();
  try {
    const snap = await getDoc(doc(db, COLL, id));
    if (!snap.exists()) { alert("La receta no existe"); return; }
    const d = snap.data();
    recetaIdActual = id;
    nombreRecetaContainer.dataset.value = d.nombre || "";
    if (pesoTotalInput) pesoTotalInput.value = d.pesoTotal || 1000;
    if (pesoMultiplierInput) pesoMultiplierInput.value = d.pesoMultiplier != null ? d.pesoMultiplier : 1;
    if (rendPiezasInput && d.rendimiento) rendPiezasInput.value = d.rendimiento.piezas || "";
    if (rendPesoUnitInput && d.rendimiento) rendPesoUnitInput.value = d.rendimiento.pesoPorPieza || "";
    if (instrAmasadoContainer) instrAmasadoContainer.dataset.value = d.instrAmasado || "";
    if (instrHorneadoContainer) instrHorneadoContainer.dataset.value = d.instrHorneado || "";
    ingredientes = (d.ingredientes || []).map(it => ({ ...it }));
    setEditing(false); // view mode after loading
    calcularPesos();
    renderIngredientes();
  } catch (err) {
    console.error("Error cargarReceta:", err);
    alert("Error al cargar la receta (ver consola)");
  }
}

async function guardarReceta() {
  const nombre = (nombreRecetaContainer.dataset.value || "").trim();
  if (!nombre) return alert("La receta necesita un nombre");

  const recetaObj = {
    nombre,
    pesoTotal: toNum(pesoTotalInput && pesoTotalInput.value),
    pesoMultiplier: toNum(pesoMultiplierInput && pesoMultiplierInput.value),
    rendimiento: {
      piezas: rendPiezasInput ? (parseInt(rendPiezasInput.value) || 0) : 0,
      pesoPorPieza: rendPesoUnitInput ? (parseFloat(rendPesoUnitInput.value) || 0) : 0
    },
    instrAmasado: instrAmasadoContainer.dataset.value || "",
    instrHorneado: instrHorneadoContainer.dataset.value || "",
    ingredientes,
    updatedAt: serverTimestamp()
  };

  const doSave = confirm("¿Quieres guardar/actualizar la receta?");
  if (!doSave) return;

  try {
    if (recetaIdActual) {
      await setDoc(doc(db, COLL, recetaIdActual), recetaObj);
      alert("Receta actualizada ✅");
    } else {
      const ref = await addDoc(collection(db, COLL), { ...recetaObj, createdAt: serverTimestamp() });
      recetaIdActual = ref.id;
      alert("Nueva receta guardada ✅");
    }
    await cargarRecetas();
    setEditing(false);
  } catch (err) {
    console.error("Error guardarReceta:", err);
    alert("Error al guardar (ver consola)");
  }
}

async function duplicarReceta() {
  if (!recetaIdActual) return alert("Selecciona una receta para duplicar");
  try {
    const snap = await getDoc(doc(db, COLL, recetaIdActual));
    if (!snap.exists()) return alert("No existe la receta");
    const data = snap.data();
    const copy = { ...data, nombre: (data.nombre || "Receta") + " (copia)", createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    delete copy.id;
    const newRef = await addDoc(collection(db, COLL), copy);
    await cargarRecetas();
    recetaSelect.value = newRef.id;
    await cargarReceta(newRef.id);
    setEditing(true);
  } catch (err) {
    console.error("Error duplicarReceta:", err);
    alert("Error duplicando (ver consola)");
  }
}

async function eliminarReceta() {
  if (!recetaIdActual) return;
  if (!confirm("¿Seguro que deseas eliminar esta receta?")) return;
  try {
    await deleteDoc(doc(db, COLL, recetaIdActual));
    recetaIdActual = null;
    limpiarFormulario();
    await cargarRecetas();
    alert("Receta eliminada");
  } catch (err) {
    console.error("Error eliminarReceta:", err);
    alert("Error al eliminar (ver consola)");
  }
}

function limpiarFormulario() {
  nombreRecetaContainer.dataset.value = "";
  if (pesoTotalInput) pesoTotalInput.value = 1000;
  if (pesoMultiplierInput) pesoMultiplierInput.value = 1;
  if (rendPiezasInput) rendPiezasInput.value = "";
  if (rendPesoUnitInput) rendPesoUnitInput.value = "";
  instrAmasadoContainer.dataset.value = "";
  instrHorneadoContainer.dataset.value = "";
  ingredientes = [];
  recetaIdActual = null;
  setEditing(true);
  renderIngredientes();
  calcularPesos();
}

// ---------- Logo base64 loader ----------
async function loadLogo() {
  try {
    const r = await fetch("./logo.b64.txt");
    if (!r.ok) throw new Error("logo not found");
    const txt = (await r.text()).trim();
    logoDataURI = txt.startsWith("data:") ? txt : "data:image/png;base64," + txt;
    // show small UI logo (auto scale) if exists
    if (uiLogo) uiLogo.src = logoDataURI;
  } catch (err) {
    console.warn("logo not loaded", err);
    logoDataURI = null;
  }
}

// ---------- PDF generation ----------
function formatDateTime(d = new Date()) {
  const p = n => String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function generatePDF({ preview=false } = {}) {
  if (!window.jspdf) { alert("jsPDF no cargado."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:"mm", format:"a4", orientation:"portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  let y = margin;

  // logo center
  if (logoDataURI) {
    try {
      const maxW = pageW - margin*2;
      const imgW = Math.min(80, maxW);
      const imgH = imgW * 0.68;
      const x = (pageW - imgW) / 2;
      doc.addImage(logoDataURI, x, y, imgW, imgH);
      y += imgH + 6;
    } catch(e) { console.warn("pdf logo error", e); }
  }

  // title - dynamic font size
  const title = nombreRecetaContainer.dataset.value || "Receta sin nombre";
  doc.setFont("helvetica", "bold");
  let fs = 18;
  doc.setFontSize(fs);
  while (fs > 10 && doc.getTextWidth(title) * fs / doc.internal.scaleFactor > pageW - margin*2) {
    fs -= 1; doc.setFontSize(fs);
  }
  doc.setTextColor(139,30,63);
  doc.text(title, pageW/2, y + fs/2, { align: "center" });
  y += fs + 6;

  // meta
  const pesoE = Math.round(getEffectivePesoTotal());
  const piezas = rendPiezasInput ? parseInt(rendPiezasInput.value) || 0 : 0;
  const pesoUnit = rendPesoUnitInput ? parseFloat(rendPesoUnitInput.value) || 0 : 0;
  const rendText = (piezas>0 && pesoUnit>0) ? `${piezas} × ${pesoUnit} g = ${piezas*pesoUnit} g` : "—";

  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(30);
  doc.text(`Peso total de la masa: ${pesoE} g`, margin, y); y += 7;
  doc.text(`Rendimiento: ${rendText}`, margin, y); y += 9;

  // stats
  const hidr = statHydrationTotal ? statHydrationTotal.textContent : "—";
  const starter = statStarterPct ? statStarterPct.textContent : "—";
  const salt = statSaltPct ? statSaltPct.textContent : "—";
  doc.text(`Hidratación total: ${hidr}`, margin, y); y+=6;
  doc.text(`Starter (% masa): ${starter}`, margin, y); y+=6;
  doc.text(`Salinidad: ${salt}`, margin, y); y+=10;

  // ingredients table via autoTable
  const body = ingredientes.map(i => [i.nombre, (toNum(i.porcentaje)).toFixed(2)+"%", (i._grams||0)+" g"]);
  doc.autoTable({
    startY: y, margin:{left:margin,right:margin},
    head:[["Ingrediente","% Panadero","Peso (g)"]],
    body,
    theme:"grid",
    headStyles:{fillColor:[139,30,63], textColor:255, fontStyle:"bold"},
    styles:{fontSize:10}
  });
  y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : y + 8;

  // instrucciones
  doc.setFont("helvetica","bold"); doc.setFontSize(12);
  doc.text("Instrucciones", margin, y); y += 6;
  doc.setFont("helvetica","normal"); doc.setFontSize(10);
  const amas = instrAmasadoContainer.dataset.value || "—";
  const horn = instrHorneadoContainer.dataset.value || "—";
  const amasLines = doc.splitTextToSize("Amasado / Fermentación: " + amas, pageW - margin*2);
  amasLines.forEach(line => { if (y > doc.internal.pageSize.getHeight()-margin-30){ doc.addPage(); y=margin; } doc.text(line, margin, y); y+=6; });
  const hornLines = doc.splitTextToSize("Horneado: " + horn, pageW - margin*2);
  hornLines.forEach(line => { if (y > doc.internal.pageSize.getHeight()-margin-30){ doc.addPage(); y=margin; } doc.text(line, margin, y); y+=6; });

  // footer date
  const fecha = formatDateTime(new Date());
  const footerY = doc.internal.pageSize.getHeight() - 12;
  doc.setFontSize(9); doc.setTextColor(110);
  doc.text("Creado en Fermentos App", margin, footerY);
  doc.text(fecha, pageW - margin, footerY, { align: "right" });

  if (preview) {
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl, "_blank");
  } else {
    const safe = (nombreRecetaContainer.dataset.value || "receta").replace(/[^\w\- ]+/g,'');
    doc.save(safe + ".pdf");
  }
}

// ---------- CSV export ----------
function exportarCSV() {
  const rows = [["Ingrediente","% Panadero","Peso (g)"], ...ingredientes.map(i=>[i.nombre,(toNum(i.porcentaje)).toFixed(2),(i._grams||0)])];
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url;
  a.download = (nombreRecetaContainer.dataset.value || "receta") + ".csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// ---------- Sharing ----------
function makeShareLink(id) {
  const mult = toNum(pesoMultiplierInput && pesoMultiplierInput.value) || 1;
  return `${location.origin}${location.pathname}?receta=${encodeURIComponent(id)}&mult=${encodeURIComponent(mult)}`;
}
function shareByWhatsApp() {
  if (!recetaIdActual) return alert("Selecciona una receta primero");
  const link = makeShareLink(recetaIdActual);
  window.open(`https://wa.me/?text=${encodeURIComponent("Te comparto esta receta: " + link)}`, "_blank");
}
function copyShareLink() {
  if (!recetaIdActual) return alert("Selecciona una receta primero");
  const link = makeShareLink(recetaIdActual);
  navigator.clipboard?.writeText(link).then(()=> alert("Enlace copiado al portapapeles"), ()=> prompt("Copia el enlace:", link));
}

// ---------- Events wiring ----------
function wireEvents() {
  btnAgregarIngrediente && btnAgregarIngrediente.addEventListener("click", () => {
    ingredientes.push({ nombre: "Ingrediente", porcentaje: 0 });
    renderIngredientes();
  });

  btnRecalcular && btnRecalcular.addEventListener("click", () => { calcularPesos(); tablaIngredientes && tablaIngredientes.scrollIntoView({ behavior: "smooth" }); });

  btnGuardar && btnGuardar.addEventListener("click", guardarReceta);
  btnDuplicar && btnDuplicar.addEventListener("click", duplicarReceta);
  btnEliminar && btnEliminar.addEventListener("click", eliminarReceta);
  btnExportCSV && btnExportCSV.addEventListener("click", exportarCSV);
  btnExportar && btnExportar.addEventListener("click", () => generatePDF({ preview:false }));
  btnPreviewPDF && btnPreviewPDF.addEventListener("click", () => generatePDF({ preview:true }));
  btnCompartir && btnCompartir.addEventListener("click", () => {
    const c = confirm("Compartir por WhatsApp? OK=WhatsApp, Cancel=Copiar enlace");
    if (c) shareByWhatsApp(); else copyShareLink();
  });

  recetaSelect && recetaSelect.addEventListener("change", e => { const id = e.target.value; if (id) cargarReceta(id); else limpiarFormulario(); });

  [pesoTotalInput, pesoMultiplierInput].forEach(el => el && el.addEventListener("input", () => { if (pesoTotalInput && !pesoTotalInput.dataset.base) pesoTotalInput.dataset.base = pesoTotalInput.value || "1000"; calcularPesos(); }));

  if (rendPiezasInput) rendPiezasInput.addEventListener("input", () => { calcularPesos(); });
  if (rendPesoUnitInput) rendPesoUnitInput.addEventListener("input", () => { calcularPesos(); });

  btnEditarRecetaView && btnEditarRecetaView.addEventListener("click", () => setEditing(true));
  btnCancelarEdicionView && btnCancelarEdicionView.addEventListener("click", () => { if (recetaIdActual) cargarReceta(recetaIdActual); else limpiarFormulario(); });

  btnEditar && btnEditar.addEventListener("click", () => setEditing(true));
  btnCancelarEdicion && btnCancelarEdicion.addEventListener("click", () => { if (recetaIdActual) cargarReceta(recetaIdActual); else limpiarFormulario(); });

  // theme toggle
  btnToggleTheme && btnToggleTheme.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("fermentapro_theme", next);
  });

  btnEditar && (btnEditar.style.display = "none");
  btnCancelarEdicion && (btnCancelarEdicion.style.display = "none");
}

// ---------- Theme handling ----------
function applyTheme(pref) {
  // pref: 'dark'|'light'
  if (pref === "dark") document.body.classList.add("dark");
  else document.body.classList.remove("dark");
  // change icon in btn
  if (btnToggleTheme) {
    const icon = btnToggleTheme.querySelector("i");
    if (document.body.classList.contains("dark")) { icon.className = "bx bx-sun"; }
    else { icon.className = "bx bx-moon"; }
  }
  document.documentElement.setAttribute("data-theme", pref);
}

function initTheme() {
  const saved = localStorage.getItem("fermentapro_theme");
  if (saved) return applyTheme(saved);
  // no saved: detect prefers-color-scheme but default to light if not available
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}

// ---------- Shared view (URL) ----------
async function handleSharedView() {
  const params = new URLSearchParams(location.search);
  const id = params.get("receta") || params.get("id");
  const mult = params.get("mult");
  if (!id) return;
  try {
    const snap = await getDoc(doc(db, COLL, id));
    if (!snap.exists()) return;
    const d = snap.data();
    recetaIdActual = id;
    nombreRecetaContainer.dataset.value = d.nombre || "";
    if (pesoTotalInput) pesoTotalInput.value = d.pesoTotal || 1000;
    if (pesoMultiplierInput && mult) pesoMultiplierInput.value = parseFloat(mult);
    if (d.rendimiento) {
      if (rendPiezasInput) rendPiezasInput.value = d.rendimiento.piezas || "";
      if (rendPesoUnitInput) rendPesoUnitInput.value = d.rendimiento.pesoPorPieza || "";
    }
    instrAmasadoContainer.dataset.value = d.instrAmasado || "";
    instrHorneadoContainer.dataset.value = d.instrHorneado || "";
    ingredientes = (d.ingredientes || []).map(it => ({ ...it }));
    setEditing(false);
    calcularPesos();
    renderIngredientes();
  } catch (err) {
    console.error("shared load error", err);
  }
}

// ---------- Init ----------
async function init() {
  await loadLogo();
  initTheme();
  wireEvents();
  await cargarRecetas();
  limpiarFormulario();
  // start in edit to create new; but if URL shares recipe, load it in view
  await handleSharedView();
  // set UI logo placeholder if logoDataURI available
  if (logoDataURI && uiLogo) uiLogo.src = logoDataURI;
  // default editing state set by limpiarFormulario (isEditMode true)
  setEditing(isEditMode);
}

window.addEventListener("DOMContentLoaded", init);

// expose for debugging
window._fermenta = { calcularPesos, actualizarStats, cargarRecetas, cargarReceta, guardarReceta, generatePDF, loadLogo };
