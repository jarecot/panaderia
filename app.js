// app.js - Gestor de Recetas Fermentos (versión final entregada)
// Requisitos: index.html incluye jsPDF + autoTable via <script> (como acordado).
// logo.b64.txt debe estar en la misma carpeta (contiene dataURI o solo base64).

// ---------------- FIREBASE (modular) ----------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, getDocs, getDoc,
  addDoc, setDoc, deleteDoc, doc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ----- Configuración Firebase (tu proyecto) -----
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

// ---------------- DOM helpers ----------------
const $ = (id) => document.getElementById(id);

// Expected IDs in index.html (as provided earlier)
const recetaSelect = $("recetaSelect");
const nombreRecetaContainer = $("nombreRecetaContainer");
const instrAmasadoContainer = $("instrAmasadoContainer");
const instrHorneadoContainer = $("instrHorneadoContainer");

const pesoTotalInput = $("pesoTotal");
const pesoMultiplierInput = $("pesoMultiplier");
const rendPiezasInput = $("rendPiezas");
const rendPesoUnitInput = $("rendPesoUnit");

const btnAgregarIngrediente = $("btnAgregarIngrediente");
const btnGuardar = $("btnGuardar");
const btnEliminar = $("btnEliminar");
const btnEditar = $("btnEditar");
const btnDuplicar = $("btnDuplicar");
const btnExportar = $("btnExportar");
const btnPreviewPDF = $("btnPreviewPDF");
const btnExportCSV = $("btnExportCSV");
const btnLimpiar = $("btnLimpiar");
const btnRecalcular = $("btnRecalcular");
const btnCompartir = $("btnCompartir");
const searchRecetas = $("searchRecetas");
const sortField = $("sortField");
const btnSortToggle = $("btnSortToggle");
const btnToggleTheme = $("btnToggleTheme");

const ingredientesDiv = $("ingredientes");
const tablaIngredientes = $("tablaIngredientes");
const sumGramsEl = $("sumGrams");

const statHydrationTotal = $("statHydrationTotal");
const statStarterPct = $("statStarterPct");
const statSaltPct = $("statSaltPct");
const statPesoEfectivo = $("statPesoEfectivo");
const statRendimiento = $("statRendimiento");

// ---------------- State ----------------
let ingredientes = [];
let recetaIdActual = null;
let recetasCache = [];
let logoDataURI = null;

// ---------------- Utilities ----------------
const toNum = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// Classify ingredient by name to estimate water contributions
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

// Approximate water content per ingredient (g water per g ingredient)
const WATER_FACTORS = {
  milk: 0.87,
  egg: 0.75,
  fat: 0.16,
  yogurt: 0.80
};

// ---------------- Calculations ----------------
function getEffectivePesoTotal() {
  const base = toNum(pesoTotalInput && pesoTotalInput.value);
  const mult = Math.max(0.0001, toNum(pesoMultiplierInput && pesoMultiplierInput.value) || 1);
  return base * mult;
}

// Calculate ingredient grams from baker's percentages using effective weight
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

  // rounding correction
  let totalRounded = ingredientes.reduce((s, it) => s + (it._grams || 0), 0);
  const delta = Math.round(pesoTotal) - totalRounded;
  if (delta !== 0) {
    // prefer flour if exists
    let idx = ingredientes.findIndex(it => Math.abs(toNum(it.porcentaje) - 100) < 1e-6);
    if (idx === -1) {
      let max = -Infinity;
      ingredientes.forEach((it, i) => {
        if (toNum(it.porcentaje) > max) { max = toNum(it.porcentaje); idx = i; }
      });
    }
    if (typeof idx === "number" && ingredientes[idx]) {
      ingredientes[idx]._grams = (ingredientes[idx]._grams || 0) + delta;
      totalRounded += delta;
    }
  }

  // render table
  if (tablaIngredientes) {
    ingredientes.forEach(ing => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${ing.nombre}</td><td>${(toNum(ing.porcentaje)).toFixed(2)}%</td><td>${(ing._grams||0)} g</td>`;
      tablaIngredientes.appendChild(tr);
    });
  }

  if (sumGramsEl) sumGramsEl.textContent = totalRounded + " g";

  actualizarStats();
}

// Update technical stats: hydration, starter %, salt
function actualizarStats() {
  let flourW = 0, waterW = 0, milkW = 0, eggW = 0, fatW = 0, yogurtW = 0, starterW = 0, saltW = 0, othersW = 0;
  ingredientes.forEach(it => {
    const grams = toNum(it._grams || it._raw);
    const cls = classifyIngredientName(it.nombre);
    if (cls === "flour") flourW += grams;
    else if (cls === "water") waterW += grams;
    else if (cls === "milk") milkW += grams;
    else if (cls === "egg") eggW += grams;
    else if (cls === "fat") fatW += grams;
    else if (cls === "yogurt") yogurtW += grams;
    else if (cls === "starter") starterW += grams;
    else if (cls === "salt") saltW += grams;
    else othersW += grams;
  });

  // starter hydration: allows input #starterHydration (optional)
  const starterHydrationEl = $("starterHydration");
  const starterH = starterHydrationEl ? toNum(starterHydrationEl.value) : 100;

  // decompose starter grams into water and flour-equivalent
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

  const hidrPrincipal = harinaTotal > 0 ? (aguaDirecta / harinaTotal) * 100 : NaN;
  const hidrAdicional = harinaTotal > 0 ? ((aguaDesdeOtros + aguaDesdeStarter) / harinaTotal) * 100 : NaN;
  const hidrTotal = harinaTotal > 0 ? ((aguaDirecta + aguaDesdeOtros + aguaDesdeStarter) / harinaTotal) * 100 : NaN;

  const salSobreHarina = harinaTotal > 0 ? (saltW / harinaTotal) * 100 : NaN;
  const pesoEfectivo = getEffectivePesoTotal();
  const starterPct = pesoEfectivo > 0 ? (starterW / pesoEfectivo) * 100 : NaN;

  if (statHydrationTotal) statHydrationTotal.textContent = isFinite(hidrTotal) ? hidrTotal.toFixed(1) + "%" : "—";
  if (statStarterPct) statStarterPct.textContent = isFinite(starterPct) ? starterPct.toFixed(2) + "%" : "—";
  if (statSaltPct) statSaltPct.textContent = isFinite(salSobreHarina) ? salSobreHarina.toFixed(2) + "% (sobre harina)" : "—";
  if (statPesoEfectivo) statPesoEfectivo.textContent = Math.round(pesoEfectivo) + " g";

  // Rendimiento display and automatic multiplier sync
  const piezas = rendPiezasInput ? Math.max(0, parseInt(rendPiezasInput.value) || 0) : 0;
  const pesoUnit = rendPesoUnitInput ? Math.max(0, parseFloat(rendPesoUnitInput.value) || 0) : 0;
  if (statRendimiento) {
    if (piezas > 0 && pesoUnit > 0) statRendimiento.textContent = `${piezas} × ${pesoUnit} g = ${piezas * pesoUnit} g`;
    else statRendimiento.textContent = "—";
  }

  // Sync multiplier from rendimiento if both present:
  if (piezas > 0 && pesoUnit > 0 && pesoTotalInput) {
    const newTotal = piezas * pesoUnit;
    // If dataset.base set, use it as original 'base' mass; otherwise set base to newTotal
    if (!pesoTotalInput.dataset.base) pesoTotalInput.dataset.base = String(newTotal);
    const base = parseFloat(pesoTotalInput.dataset.base) || newTotal || 1;
    pesoTotalInput.value = newTotal;
    if (pesoMultiplierInput) pesoMultiplierInput.value = Math.round((newTotal / base) * 100) / 100;
  }
}

// ---------------- Render UI helpers ----------------
function renderNombreEditor() {
  if (!nombreRecetaContainer) return;
  nombreRecetaContainer.innerHTML = "";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Ej. Baguette clásica";
  input.value = nombreRecetaContainer.dataset.value || "";
  input.addEventListener("input", (e) => nombreRecetaContainer.dataset.value = e.target.value);
  nombreRecetaContainer.appendChild(input);
}

function renderInstruccionesEditor() {
  if (!instrAmasadoContainer || !instrHorneadoContainer) return;
  instrAmasadoContainer.innerHTML = "";
  const labA = document.createElement("label"); labA.textContent = "Amasado / Fermentación";
  const taA = document.createElement("textarea"); taA.id = "instrAmasado"; taA.rows = 3;
  taA.value = instrAmasadoContainer.dataset.value || "";
  taA.addEventListener("input", e => instrAmasadoContainer.dataset.value = e.target.value);
  instrAmasadoContainer.appendChild(labA); instrAmasadoContainer.appendChild(taA);

  instrHorneadoContainer.innerHTML = "";
  const labH = document.createElement("label"); labH.textContent = "Horneado";
  const taH = document.createElement("textarea"); taH.id = "instrHorneado"; taH.rows = 2;
  taH.value = instrHorneadoContainer.dataset.value || "";
  taH.addEventListener("input", e => instrHorneadoContainer.dataset.value = e.target.value);
  instrHorneadoContainer.appendChild(labH); instrHorneadoContainer.appendChild(taH);
}

function renderIngredientesEditor() {
  if (!ingredientesDiv) return;
  ingredientesDiv.innerHTML = "";
  ingredientes.forEach((ing, idx) => {
    const row = document.createElement("div");
    row.className = "ingredient-row";

    const name = document.createElement("input");
    name.type = "text";
    name.value = ing.nombre || "";
    name.className = "nombreIng";
    name.placeholder = "Nombre";

    const pct = document.createElement("input");
    pct.type = "number";
    pct.value = toNum(ing.porcentaje);
    pct.step = "0.1";
    pct.min = 0;
    pct.className = "pctIng";
    pct.placeholder = "% panadero";

    const del = document.createElement("button");
    del.type = "button";
    del.className = "icon-btn danger ing-delete";
    del.innerHTML = "<i class='bx bx-x'></i>";
    del.addEventListener("click", () => { ingredientes.splice(idx, 1); renderIngredientesEditor(); calcularPesos(); });

    name.addEventListener("input", (e) => { ingredientes[idx].nombre = e.target.value; calcularPesos(); });
    pct.addEventListener("input", (e) => { ingredientes[idx].porcentaje = parseFloat(e.target.value) || 0; calcularPesos(); });

    row.appendChild(name); row.appendChild(pct); row.appendChild(del);
    ingredientesDiv.appendChild(row);
  });
}

// ---------------- Firestore CRUD ----------------
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
    alert("Error al cargar recetas (ver consola)");
  }
}

async function cargarReceta(id) {
  if (!id) return;
  try {
    const snap = await getDoc(doc(db, COLL, id));
    if (!snap.exists()) { alert("La receta no existe"); return; }
    const d = snap.data();
    recetaIdActual = id;
    nombreRecetaContainer.dataset.value = d.nombre || "";
    if (pesoTotalInput) pesoTotalInput.value = d.pesoTotal || 1000;
    if (pesoMultiplierInput) pesoMultiplierInput.value = (d.pesoMultiplier != null) ? d.pesoMultiplier : 1;
    if (rendPiezasInput && d.rendimiento && d.rendimiento.piezas) rendPiezasInput.value = d.rendimiento.piezas;
    if (rendPesoUnitInput && d.rendimiento && d.rendimiento.pesoPorPieza) rendPesoUnitInput.value = d.rendimiento.pesoPorPieza;
    if (instrAmasadoContainer) instrAmasadoContainer.dataset.value = d.instrAmasado || "";
    if (instrHorneadoContainer) instrHorneadoContainer.dataset.value = d.instrHorneado || "";
    ingredientes = (d.ingredientes || []).map(it => ({ ...it }));
    renderAll();
  } catch (err) {
    console.error("Error cargarReceta:", err);
    alert("Error al cargar la receta (ver consola)");
  }
}

async function guardarReceta() {
  const nombre = (nombreRecetaContainer.dataset.value || "").trim();
  if (!nombre) return alert("Asigna un nombre a la receta");
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

  try {
    if (recetaIdActual) {
      await setDoc(doc(db, COLL, recetaIdActual), recetaObj);
      alert("Receta actualizada ✅");
    } else {
      await addDoc(collection(db, COLL), { ...recetaObj, createdAt: serverTimestamp() });
      alert("Nueva receta guardada ✅");
    }
    await cargarRecetas();
  } catch (err) {
    console.error("Error guardarReceta:", err);
    alert("Error al guardar (ver consola)");
  }
}

async function duplicarReceta() {
  if (!recetaIdActual) return alert("Selecciona una receta para duplicar");
  try {
    const snap = await getDoc(doc(db, COLL, recetaIdActual));
    if (!snap.exists()) return alert("La receta ya no existe");
    const data = snap.data();
    const copy = { ...data, nombre: (data.nombre || "Receta") + " (copia)", createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    delete copy.id;
    const ref = await addDoc(collection(db, COLL), copy);
    await cargarRecetas();
    recetaSelect.value = ref.id;
    await cargarReceta(ref.id);
    alert("Receta duplicada ✅");
  } catch (err) {
    console.error("Error duplicarReceta:", err);
    alert("Error al duplicar (ver consola)");
  }
}

async function eliminarReceta() {
  if (!recetaIdActual) return;
  if (!confirm("¿Seguro que deseas eliminar esta receta?")) return;
  try {
    await deleteDoc(doc(db, COLL, recetaIdActual));
    recetaIdActual = null; ingredientes = [];
    renderAll();
    await cargarRecetas();
    alert("Receta eliminada 🗑️");
  } catch (err) {
    console.error("Error eliminarReceta:", err);
    alert("Error al eliminar (ver consola)");
  }
}

// ---------------- Export CSV ----------------
function exportarCSV() {
  const rows = [
    ["Ingrediente", "% Panadero", "Peso (g)"],
    ...ingredientes.map(i => [i.nombre, (toNum(i.porcentaje)).toFixed(2), (i._grams || 0)])
  ];
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = (nombreRecetaContainer.dataset.value || "receta") + ".csv";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// ---------------- Load logo base64 ----------------
async function loadLogoDataURI() {
  try {
    const resp = await fetch("./logo.b64.txt");
    if (!resp.ok) throw new Error("logo.b64.txt not found");
    const txt = (await resp.text()).trim();
    logoDataURI = txt.startsWith("data:") ? txt : "data:image/png;base64," + txt;
  } catch (err) {
    console.warn("logo not loaded:", err);
    logoDataURI = null;
  }
}

// ---------------- PDF Generation ----------------
function formatDateTimeForPDF(d = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function generatePDF({ preview = false } = {}) {
  if (!window.jspdf) {
    alert("jsPDF no está cargado en la página.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  let y = margin;

  // Logo (auto-scale, maintain proportion)
  if (logoDataURI) {
    try {
      const maxW = pageW - margin * 2;
      const imgW = Math.min(80, maxW);
      const imgH = imgW * 0.68;
      const x = (pageW - imgW) / 2;
      doc.addImage(logoDataURI, x, y, imgW, imgH);
      y += imgH + 6;
    } catch (e) {
      console.warn("Error add logo:", e);
    }
  }

  // Title with dynamic font-size to avoid overflow
  const title = nombreRecetaContainer.dataset.value || "Receta sin nombre";
  doc.setFont("helvetica", "bold");
  let fontSize = 18;
  doc.setFontSize(fontSize);
  while (fontSize > 9 && doc.getTextWidth(title) * fontSize / doc.internal.scaleFactor > pageW - margin * 2) {
    fontSize -= 1;
    doc.setFontSize(fontSize);
  }
  doc.setTextColor(123, 30, 58);
  doc.text(title, pageW / 2, y + fontSize / 2, { align: "center" });
  y += fontSize + 6;

  // Meta info: peso total y rendimiento
  const pesoTotalText = `${Math.round(getEffectivePesoTotal())} g`;
  let rendimientoText = "—";
  const piezas = rendPiezasInput ? parseInt(rendPiezasInput.value) || 0 : 0;
  const pesoUnit = rendPesoUnitInput ? parseFloat(rendPesoUnitInput.value) || 0 : 0;
  if (piezas > 0 && pesoUnit > 0) rendimientoText = `${piezas} panes × ${pesoUnit} g = ${piezas * pesoUnit} g`;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text(`Peso total de la masa: ${pesoTotalText}`, margin, y);
  y += 7;
  doc.text(`Rendimiento: ${rendimientoText}`, margin, y);
  y += 9;

  // Stats
  const hidr = statHydrationTotal ? statHydrationTotal.textContent : "—";
  const starter = statStarterPct ? statStarterPct.textContent : "—";
  const salt = statSaltPct ? statSaltPct.textContent : "—";

  doc.text(`Hidratación total: ${hidr}`, margin, y); y += 6;
  doc.text(`Starter (% masa total): ${starter}`, margin, y); y += 6;
  doc.text(`Salinidad: ${salt}`, margin, y); y += 10;

  // Ingredients table
  const body = ingredientes.map(i => [i.nombre, (toNum(i.porcentaje)).toFixed(2) + "%", (i._grams || 0) + " g"]);

  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Ingrediente", "% Panadero", "Peso (g)"]],
    body,
    theme: "grid",
    headStyles: { fillColor: [123, 30, 58], textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 10, cellPadding: 3 }
  });

  y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : y + 8;

  // Instrucciones
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Instrucciones", margin, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const amasado = (instrAmasadoContainer.dataset.value || "").trim() || "—";
  const horneado = (instrHorneadoContainer.dataset.value || "").trim() || "—";

  const amasadoLines = doc.splitTextToSize("Amasado / Fermentación: " + amasado, pageW - margin * 2);
  amasadoLines.forEach(line => {
    if (y > doc.internal.pageSize.getHeight() - margin - 30) { doc.addPage(); y = margin; }
    doc.text(line, margin, y); y += 6;
  });

  const horneadoLines = doc.splitTextToSize("Horneado: " + horneado, pageW - margin * 2);
  horneadoLines.forEach(line => {
    if (y > doc.internal.pageSize.getHeight() - margin - 30) { doc.addPage(); y = margin; }
    doc.text(line, margin, y); y += 6;
  });

  // Footer
  const fechaStr = formatDateTimeForPDF(new Date());
  const footerY = doc.internal.pageSize.getHeight() - 12;
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text("Creado en Fermentos App", margin, footerY);
  doc.text(fechaStr, pageW - margin, footerY, { align: "right" });

  if (preview) {
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl, "_blank");
  } else {
    const safeName = (nombreRecetaContainer.dataset.value || "receta").replace(/[^\w\- ]+/g, "");
    doc.save(`${safeName}.pdf`);
  }
}

// ---------------- Sharing helpers ----------------
function makeShareLink(id) {
  const mult = toNum(pesoMultiplierInput && pesoMultiplierInput.value) || 1;
  return `${location.origin}${location.pathname}?receta=${encodeURIComponent(id)}&mult=${encodeURIComponent(mult)}`;
}

function shareByWhatsApp() {
  if (!recetaIdActual) return alert("Selecciona una receta primero");
  const link = makeShareLink(recetaIdActual);
  const wa = `https://wa.me/?text=${encodeURIComponent("Te comparto esta receta: " + link)}`;
  window.open(wa, "_blank");
}

function copyShareLink() {
  if (!recetaIdActual) return alert("Selecciona una receta primero");
  const link = makeShareLink(recetaIdActual);
  navigator.clipboard?.writeText(link).then(() => alert("Enlace copiado al portapapeles"), () => prompt("Copia el enlace:", link));
}

// ---------------- Event wiring ----------------
function wireEvents() {
  btnAgregarIngrediente && btnAgregarIngrediente.addEventListener("click", () => {
    ingredientes.push({ nombre: "Ingrediente", porcentaje: 0 });
    renderIngredientesEditor();
  });

  btnGuardar && btnGuardar.addEventListener("click", guardarReceta);
  btnDuplicar && btnDuplicar.addEventListener("click", duplicarReceta);
  btnEliminar && btnEliminar.addEventListener("click", eliminarReceta);
  btnExportCSV && btnExportCSV.addEventListener("click", exportarCSV);
  btnExportar && btnExportar.addEventListener("click", () => generatePDF({ preview: false }));
  btnPreviewPDF && btnPreviewPDF.addEventListener("click", () => generatePDF({ preview: true }));
  btnRecalcular && btnRecalcular.addEventListener("click", () => { calcularPesos(); tablaIngredientes && tablaIngredientes.scrollIntoView({ behavior: "smooth" }); });

  btnCompartir && btnCompartir.addEventListener("click", () => {
    const choice = confirm("Presiona OK para compartir por WhatsApp, Cancel para copiar enlace.");
    if (choice) shareByWhatsApp(); else copyShareLink();
  });

  if (recetaSelect) recetaSelect.addEventListener("change", e => {
    const id = e.target.value;
    if (id) cargarReceta(id);
    else { recetaIdActual = null; ingredientes = []; renderAll(); }
  });

  [pesoTotalInput, pesoMultiplierInput].forEach(el => {
    el && el.addEventListener("input", () => {
      if (pesoTotalInput && !pesoTotalInput.dataset.base) pesoTotalInput.dataset.base = pesoTotalInput.value || "1000";
      calcularPesos();
    });
  });

  if (rendPiezasInput) rendPiezasInput.addEventListener("input", () => { calcularPesos(); syncMultiplierFromRendimiento(); });
  if (rendPesoUnitInput) rendPesoUnitInput.addEventListener("input", () => { calcularPesos(); syncMultiplierFromRendimiento(); });

  searchRecetas && searchRecetas.addEventListener("input", applySearchSortRender);
  sortField && sortField.addEventListener("change", applySearchSortRender);
  btnSortToggle && btnSortToggle.addEventListener("click", () => { btnSortToggle.classList.toggle("active"); applySearchSortRender(); });

  btnToggleTheme && btnToggleTheme.addEventListener("click", () => {
    const now = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    if (now === "dark") document.documentElement.setAttribute("data-theme", "dark"); else document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("fermentapro_theme", now);
  });
}

// Update multiplier & pesoTotal when rendimiento fields set
function syncMultiplierFromRendimiento() {
  const piezas = rendPiezasInput ? (parseInt(rendPiezasInput.value) || 0) : 0;
  const pesoUnit = rendPesoUnitInput ? (parseFloat(rendPesoUnitInput.value) || 0) : 0;
  if (piezas > 0 && pesoUnit > 0 && pesoTotalInput) {
    const newTotal = piezas * pesoUnit;
    if (!pesoTotalInput.dataset.base) pesoTotalInput.dataset.base = String(newTotal);
    const base = parseFloat(pesoTotalInput.dataset.base) || newTotal || 1;
    pesoTotalInput.value = newTotal;
    if (pesoMultiplierInput) pesoMultiplierInput.value = Math.round((newTotal / base) * 100) / 100;
    calcularPesos();
  }
}

// ---------------- Search & Sort ----------------
function applySearchSortRender() {
  if (!recetaSelect) return;
  const q = (searchRecetas && searchRecetas.value || "").toLowerCase().trim();
  let results = recetasCache.filter(r => {
    if (!q) return true;
    const n = (r.data.nombre || "").toLowerCase();
    const ingreds = (r.data.ingredientes || []).map(i => (i.nombre||"").toLowerCase()).join(" ");
    return n.includes(q) || ingreds.includes(q);
  });

  const field = (sortField && sortField.value) || "nombre";
  results.sort((a,b) => {
    let va = a.data[field], vb = b.data[field];
    if (va && typeof va.toDate === "function") va = va.toDate().getTime();
    if (vb && typeof vb.toDate === "function") vb = vb.toDate().getTime();
    if (typeof va === "string") va = va.toLowerCase();
    if (typeof vb === "string") vb = vb.toLowerCase();
    if (va < vb) return -1; if (va > vb) return 1; return 0;
  });

  recetaSelect.innerHTML = `<option value="">-- Agregar una receta ➕ --</option>`;
  results.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.data.nombre || "Receta sin nombre";
    recetaSelect.appendChild(opt);
  });
}

// ---------------- Shared view via URL ----------------
async function handleSharedView() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("receta") || params.get("id");
  const mult = parseFloat(params.get("mult")) || null;
  if (!id) return;
  try {
    const snap = await getDoc(doc(db, COLL, id));
    if (!snap.exists()) return;
    const d = snap.data();
    recetaIdActual = id;
    nombreRecetaContainer.dataset.value = d.nombre || "";
    if (pesoTotalInput) pesoTotalInput.value = d.pesoTotal || 1000;
    if (pesoMultiplierInput && mult) pesoMultiplierInput.value = mult;
    if (d.rendimiento) {
      if (rendPiezasInput && d.rendimiento.piezas) rendPiezasInput.value = d.rendimiento.piezas;
      if (rendPesoUnitInput && d.rendimiento.pesoPorPieza) rendPesoUnitInput.value = d.rendimiento.pesoPorPieza;
    }
    instrAmasadoContainer.dataset.value = d.instrAmasado || "";
    instrHorneadoContainer.dataset.value = d.instrHorneado || "";
    ingredientes = (d.ingredientes || []).map(it => ({ ...it }));
    renderAll();
    // leave editing enabled so receiver can recalc
  } catch (err) {
    console.error("Shared view load error:", err);
  }
}

// ---------------- Render all ----------------
function renderAll() {
  renderNombreEditor();
  renderInstruccionesEditor();
  renderIngredientesEditor();
  calcularPesos();
  actualizarStats();
}

// ---------------- Init ----------------
async function init() {
  await loadLogoDataURI();
  await cargarRecetas();
  wireEvents();
  // defaults
  if (pesoTotalInput && !pesoTotalInput.value) pesoTotalInput.value = 1000;
  if (pesoMultiplierInput && !pesoMultiplierInput.value) pesoMultiplierInput.value = 1;
  renderAll();
  await handleSharedView();
  console.log("Gestor de Recetas Fermentos inicializado");
}

// ensure DOM ready before init
window.addEventListener("DOMContentLoaded", init);

// expose small API for debugging
window._fermenta = {
  calcularPesos,
  actualizarStats,
  cargarRecetas,
  cargarReceta,
  guardarReceta,
  generatePDF
};
