// app.js - Gestor de Recetas Fermentos (versión final y corregida)
// Requisitos: index.html incluye jsPDF + autoTable (via <script>), y existe logo.b64.txt en la misma carpeta.
// No usa autenticación (lectura/escritura directa en Firestore).

// ---------------- FIREBASE (modular) ----------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, getDocs, getDoc,
  addDoc, setDoc, deleteDoc, doc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// ---------------- DOM references (robust: fallbacks) ----------------
const $ = id => document.getElementById(id);

const recetaSelect = $("recetaSelect");
const nombreRecetaContainer = $("nombreRecetaContainer");
const instrAmasadoContainer = $("instrAmasadoContainer");
const instrHorneadoContainer = $("instrHorneadoContainer");

const pesoTotalInput = $("pesoTotal");
const pesoMultiplierInput = $("pesoMultiplier");

// Rendimiento: dos subcampos (piezas y peso por pan)
const rendPiezasInput = $("rendPiezas") || $("rendimientoPiezas") || $("rendPiezasInput");
const rendPesoUnitInput = $("rendPesoUnit") || $("rendimientoPeso") || $("rendPesoInput");

// legacy fallback (if user still has single field)
const rendimientoTextInput = $("rendimiento") || $("rendimientoInput");

const btnAgregarIngrediente = $("btnAgregarIngrediente");
const btnGuardar = $("btnGuardar");
const btnEliminar = $("btnEliminar");
const btnEditar = $("btnEditar");
const btnDuplicar = $("btnDuplicar");
const btnExportar = $("btnExportar");
const btnPreviewPDF = $("btnPreviewPDF") || $("btnVistaPDF");
const btnExportCSV = $("btnExportCSV");
const btnLimpiar = $("btnLimpiar");
const btnRecalcular = $("btnRecalcular");
const btnCompartir = $("btnCompartir");

const ingredientesDiv = $("ingredientes");
const tablaIngredientes = $("tablaIngredientes");
const sumGramsEl = $("sumGrams");

// stats nodes (robust)
const statHydrationTotal = $("statHydrationTotal") || $("statHydration");
const statStarterPct = $("statStarterPct");
const statSaltPct = $("statSaltPct");
const statPesoEfectivo = $("statPesoEfectivo");
const statRendimiento = $("statRendimiento");

// theme toggle (if present)
const btnToggleTheme = $("btnToggleTheme");

// other optional nodes
const searchRecetas = $("searchRecetas");
const sortField = $("sortField");
const btnSortToggle = $("btnSortToggle");

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

function getEffectivePesoTotal() {
  const base = toNum(pesoTotalInput && pesoTotalInput.value);
  const mult = Math.max(0.0001, toNum(pesoMultiplierInput && pesoMultiplierInput.value) || 1);
  return base * mult;
}

function classifyIngredientName(name = "") {
  const n = (name || "").toLowerCase();
  if (/harina|flour|wheat|trigo|sémola/i.test(n)) return "flour";
  if (/agua|water/i.test(n)) return "water";
  if (/leche|milk/i.test(n)) return "milk";
  if (/huevo|egg/i.test(n)) return "egg";
  if (/mantequilla|butter/i.test(n)) return "fat";
  if (/yogur|yoghurt|yogurt/i.test(n)) return "yogurt";
  if (/masa madre|starter|levain|levadura madre/i.test(n)) return "starter";
  if (/sal/i.test(n)) return "salt";
  if (/levadura|yeast/i.test(n)) return "yeast";
  return "other";
}

// approximate water fractions for common ingredients (grams water per gram ingredient)
const WATER_FACTORS = {
  milk: 0.87,
  egg: 0.75,
  fat: 0.16, // butter ~16% water
  yogurt: 0.80
};

// ---------------- Core: calcularPesos & stats ----------------
function calcularPesos() {
  const pesoTotal = getEffectivePesoTotal();
  tablaIngredientes && (tablaIngredientes.innerHTML = "");

  if (!ingredientes.length || pesoTotal <= 0) {
    if (sumGramsEl) sumGramsEl.textContent = "0 g";
    actualizarStats();
    return;
  }

  // sum % panadero
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

  // Round correction
  let totalRounded = ingredientes.reduce((s, it) => s + (it._grams || 0), 0);
  const delta = Math.round(pesoTotal) - totalRounded;
  if (delta !== 0) {
    // prefer adjusting the flour ingredient if exists, else largest %

    let idx = ingredientes.findIndex(it => Math.abs((toNum(it.porcentaje) || 0) - 100) < 1e-6);
    if (idx === -1) {
      let max = -Infinity;
      ingredientes.forEach((it, i) => { if ((toNum(it.porcentaje) || 0) > max) { max = toNum(it.porcentaje) || 0; idx = i; }});
    }
    if (typeof idx === "number" && ingredientes[idx]) {
      ingredientes[idx]._grams = (ingredientes[idx]._grams || 0) + delta;
      totalRounded += delta;
    }
  }

  // render rows
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

function actualizarStats() {
  // compute grams
  let flourW = 0, waterW = 0, milkW = 0, eggW = 0, fatW = 0, yogurtW = 0, starterW = 0, saltW = 0, othersW = 0;
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
    else othersW += g;
  });

  // Starter hydration: assume 100% if not provided; if there is an input starterHydration use it
  const starterHydrationEl = $("starterHydration");
  const starterH = starterHydrationEl ? toNum(starterHydrationEl.value) : 100;
  // split starterW into water & flour-equivalent
  const starterWater = starterW * (starterH / (100 + starterH));
  const starterFlourEq = Math.max(0, starterW - starterWater);

  // water from other liquids
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

  // salinidad sobre harina
  const salSobreHarina = harinaTotal > 0 ? (saltW / harinaTotal) * 100 : NaN;

  // starter % sobre masa efectiva
  const pesoEfectivo = getEffectivePesoTotal();
  const starterPct = pesoEfectivo > 0 ? (starterW / pesoEfectivo) * 100 : NaN;

  if (statHydrationTotal) statHydrationTotal.textContent = isFinite(hidrTotal) ? hidrTotal.toFixed(1) + "%" : "—";
  if (statStarterPct) statStarterPct.textContent = isFinite(starterPct) ? starterPct.toFixed(2) + "%" : "—";
  if (statSaltPct) statSaltPct.textContent = isFinite(salSobreHarina) ? salSobreHarina.toFixed(2) + "% (sobre harina)" : "—";
  if (statPesoEfectivo) statPesoEfectivo.textContent = Math.round(pesoEfectivo) + " g";

  // Rendimiento: if two subfields exist compute total and update multiplier accordingly
  const piezas = rendPiezasInput ? Math.max(0, parseInt(rendPiezasInput.value) || 0) : 0;
  const pesoUnit = rendPesoUnitInput ? Math.max(0, parseFloat(rendPesoUnitInput.value) || 0) : 0;
  if (statRendimiento) {
    if (piezas > 0 && pesoUnit > 0) {
      statRendimiento.textContent = `${piezas} × ${pesoUnit} g = ${piezas * pesoUnit} g`;
    } else {
      // if legacy text field exists
      if (rendimientoTextInput && rendimientoTextInput.value) statRendimiento.textContent = rendimientoTextInput.value;
      else statRendimiento.textContent = "—";
    }
  }

  // Synchronize multiplier when rendimiento fields are set:
  if (piezas > 0 && pesoUnit > 0) {
    const totalFromRend = piezas * pesoUnit;
    // update pesoTotal and multiplier accordingly (keep base as original pesoTotalInput value if possible)
    const basePeso = parseFloat(pesoTotalInput && pesoTotalInput.dataset.base) || toNum(pesoTotalInput && pesoTotalInput.value) || 1000;
    // set the raw total into pesoTotalInput (this is the "base" mass before multiplier)
    pesoTotalInput.value = totalFromRend;
    // compute multiplier relative to previously saved dataset.base (if not present, set dataset.base=totalFromRend)
    if (!pesoTotalInput.dataset.base) pesoTotalInput.dataset.base = totalFromRend;
    // multiplier = newTotal / dataset.base
    const newMult = totalFromRend / (parseFloat(pesoTotalInput.dataset.base) || totalFromRend || 1);
    if (pesoMultiplierInput) pesoMultiplierInput.value = Number.isFinite(newMult) ? (Math.round(newMult * 100) / 100) : 1;
  } else {
    // if multiplier changed manually, attempt to update estimated rendimiento pieces
    const mult = toNum(pesoMultiplierInput && pesoMultiplierInput.value) || 1;
    const base = parseFloat(pesoTotalInput && pesoTotalInput.dataset.base) || toNum(pesoTotalInput && pesoTotalInput.value) || 0;
    const currTotal = base * mult;
    if (pesoUnit > 0 && piezas === 0) {
      const estPiezas = Math.max(0, Math.round(currTotal / pesoUnit));
      if (rendPiezasInput) rendPiezasInput.value = estPiezas || "";
    }
  }
}

// ---------------- Render helpers ----------------
function renderNombre() {
  if (!nombreRecetaContainer) return;
  // keep behavior: in edit mode it's an input; but to be simple: always show input to allow quick naming
  nombreRecetaContainer.innerHTML = "";
  const input = document.createElement("input");
  input.type = "text";
  input.id = "nombreReceta";
  input.placeholder = "Ej. Baguette clásica";
  input.value = nombreRecetaContainer.dataset.value || "";
  input.addEventListener("input", (e) => nombreRecetaContainer.dataset.value = e.target.value);
  nombreRecetaContainer.appendChild(input);
}

function renderInstrucciones() {
  if (!instrAmasadoContainer || !instrHorneadoContainer) return;
  // amasado
  instrAmasadoContainer.innerHTML = "";
  const labA = document.createElement("label"); labA.textContent = "Amasado / Fermentación";
  const taA = document.createElement("textarea"); taA.id = "instrAmasado";
  taA.rows = 3; taA.value = instrAmasadoContainer.dataset.value || "";
  taA.addEventListener("input", e => instrAmasadoContainer.dataset.value = e.target.value);
  instrAmasadoContainer.appendChild(labA); instrAmasadoContainer.appendChild(taA);

  // horneado
  instrHorneadoContainer.innerHTML = "";
  const labH = document.createElement("label"); labH.textContent = "Horneado";
  const taH = document.createElement("textarea"); taH.id = "instrHorneado";
  taH.rows = 2; taH.value = instrHorneadoContainer.dataset.value || "";
  taH.addEventListener("input", e => instrHorneadoContainer.dataset.value = e.target.value);
  instrHorneadoContainer.appendChild(labH); instrHorneadoContainer.appendChild(taH);
}

function renderIngredientesEditor() {
  if (!ingredientesDiv) return;
  ingredientesDiv.innerHTML = "";
  ingredientes.forEach((ing, idx) => {
    const row = document.createElement("div");
    row.className = "ingredient-row";
    const name = document.createElement("input"); name.type = "text"; name.value = ing.nombre || ""; name.className = "nombreIng";
    const pct = document.createElement("input"); pct.type = "number"; pct.step = "0.1"; pct.min = "0"; pct.value = toNum(ing.porcentaje); pct.className = "pctIng";
    const del = document.createElement("button"); del.type = "button"; del.className = "icon-btn danger ing-delete"; del.innerHTML = "<i class='bx bx-x'></i>";
    row.appendChild(name); row.appendChild(pct); row.appendChild(del);
    ingredientesDiv.appendChild(row);

    name.addEventListener("input", e => { ingredientes[idx].nombre = e.target.value; calcularPesos(); });
    pct.addEventListener("input", e => { ingredientes[idx].porcentaje = parseFloat(e.target.value) || 0; calcularPesos(); });
    del.addEventListener("click", () => { ingredientes.splice(idx,1); renderIngredientesEditor(); calcularPesos(); });
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
    snap.forEach(docSnap => {
      recetasCache.push({ id: docSnap.id, data: docSnap.data() });
    });
    // populate select
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
    // set inputs
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
  if (!nombre) return alert("La receta necesita un nombre");
  const recetaObj = {
    nombre,
    pesoTotal: toNum(pesoTotalInput && pesoTotalInput.value),
    pesoMultiplier: toNum(pesoMultiplierInput && pesoMultiplierInput.value),
    rendimiento: {
      piezas: rendPiezasInput ? parseInt(rendPiezasInput.value) || 0 : (rendimientoTextInput ? rendimientoTextInput.value : null),
      pesoPorPieza: rendPesoUnitInput ? parseFloat(rendPesoUnitInput.value) || 0 : null,
      raw: rendimientoTextInput ? rendimientoTextInput.value : null
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
    recetaIdActual = null;
    ingredientes = [];
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
    ...ingredientes.map(i => [i.nombre, (toNum(i.porcentaje)).toFixed(2), (i._grams||0)])
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
    if (!resp.ok) throw new Error("No logo file");
    const txt = (await resp.text()).trim();
    logoDataURI = txt.startsWith("data:") ? txt : "data:image/png;base64," + txt;
    console.log("Logo loaded", (logoDataURI || "").length);
  } catch (err) {
    console.warn("Logo not loaded:", err);
    logoDataURI = null;
  }
}

// ---------------- PDF Generation (jsPDF via window.jspdf) ----------------
function formatDateTimeForPDF(d = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function generatePDF({ preview = false } = {}) {
  if (!window.jspdf) {
    alert("jsPDF no encontrado en la página.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  let y = margin;

  // Logo (auto-scale)
  if (logoDataURI) {
    try {
      const maxW = pageW - margin * 2;
      const imgW = Math.min(80, maxW);
      const imgH = imgW * 0.68;
      const x = (pageW - imgW) / 2;
      doc.addImage(logoDataURI, x, y, imgW, imgH);
      y += imgH + 6;
    } catch (e) {
      console.warn("Error adding logo to PDF:", e);
    }
  }

  // Title - dynamic font size to fit
  const title = nombreRecetaContainer.dataset.value || "Receta sin nombre";
  doc.setFont("helvetica", "bold");
  let fontSize = 18;
  doc.setFontSize(fontSize);
  while (fontSize > 9 && doc.getTextWidth(title) * fontSize / doc.internal.scaleFactor > pageW - margin * 2) {
    fontSize -= 1;
    doc.setFontSize(fontSize);
  }
  doc.setTextColor(123, 30, 58); // vino
  doc.text(title, pageW / 2, y + fontSize / 2, { align: "center" });
  y += fontSize + 6;

  // Meta: peso total y rendimiento
  const pesoTotalText = `${Math.round(getEffectivePesoTotal())} g`;
  let rendimientoText = "—";
  const piezas = rendPiezasInput ? parseInt(rendPiezasInput.value) || 0 : 0;
  const pesoUnit = rendPesoUnitInput ? parseFloat(rendPesoUnitInput.value) || 0 : 0;
  if (piezas > 0 && pesoUnit > 0) rendimientoText = `${piezas} panes × ${pesoUnit} g = ${piezas * pesoUnit} g`;
  else if (rendimientoTextInput && rendimientoTextInput.value) rendimientoText = rendimientoTextInput.value;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text(`Peso total de la masa: ${pesoTotalText}`, margin, y);
  y += 7;
  doc.text(`Rendimiento: ${rendimientoText}`, margin, y);
  y += 9;

  // Stats (hydration, starter, salt)
  const hidr = statHydrationTotal ? statHydrationTotal.textContent : "—";
  const starterPct = statStarterPct ? statStarterPct.textContent : "—";
  const salt = statSaltPct ? statSaltPct.textContent : "—";

  doc.text(`Hidratación total: ${hidr}`, margin, y); y += 6;
  doc.text(`Starter (% masa total): ${starterPct}`, margin, y); y += 6;
  doc.text(`Salinidad: ${salt}`, margin, y); y += 10;

  // Ingredients table (autoTable)
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
    doc.text(line, margin, y);
    y += 6;
  });
  const horneadoLines = doc.splitTextToSize("Horneado: " + horneado, pageW - margin * 2);
  horneadoLines.forEach(line => {
    if (y > doc.internal.pageSize.getHeight() - margin - 30) { doc.addPage(); y = margin; }
    doc.text(line, margin, y);
    y += 6;
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

// ---------------- Sharing ----------------
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
  btnRecalcular && btnRecalcular.addEventListener("click", () => { calcularPesos(); tablaIngredientes && tablaIngredientes.scrollIntoView({ behavior: "smooth" }); });
  btnGuardar && btnGuardar.addEventListener("click", guardarReceta);
  btnDuplicar && btnDuplicar.addEventListener("click", duplicarReceta);
  btnEliminar && btnEliminar.addEventListener("click", eliminarReceta);
  btnExportCSV && btnExportCSV.addEventListener("click", exportarCSV);
  btnExportar && btnExportar.addEventListener("click", () => generatePDF({ preview: false }));
  btnPreviewPDF && btnPreviewPDF.addEventListener("click", () => generatePDF({ preview: true }));
  btnCompartir && btnCompartir.addEventListener("click", () => {
    // show small menu: copy / whatsapp
    const choice = confirm("Presiona OK para compartir por WhatsApp, Cancel para copiar el enlace.");
    if (choice) shareByWhatsApp(); else copyShareLink();
  });

  if (recetaSelect) recetaSelect.addEventListener("change", e => {
    const id = e.target.value;
    if (id) cargarReceta(id);
    else { /* new */ recetaIdActual = null; ingredientes = []; renderAll(); }
  });

  // inputs that affect calculations
  [pesoTotalInput, pesoMultiplierInput].forEach(el => {
    el && el.addEventListener("input", () => {
      // if no base dataset set, set it to current raw value on first manual edit
      if (pesoTotalInput && !pesoTotalInput.dataset.base) pesoTotalInput.dataset.base = pesoTotalInput.value || "1000";
      calcularPesos();
    });
  });

  // rendimiento fields: if both provided, set pesoTotal and multiplier; otherwise recalc estimated pieces
  if (rendPiezasInput) rendPiezasInput.addEventListener("input", () => {
    calcularPesos();
    // if both present, sync multiplier
    syncMultiplierFromRendimiento();
  });
  if (rendPesoUnitInput) rendPesoUnitInput.addEventListener("input", () => {
    calcularPesos();
    syncMultiplierFromRendimiento();
  });

  // re-render editor when ingredients change
  // debounce search & sorting if present
  searchRecetas && searchRecetas.addEventListener("input", applySearchSortRender);
  sortField && sortField.addEventListener("change", applySearchSortRender);
  btnSortToggle && btnSortToggle.addEventListener("click", () => { btnSortToggle.classList.toggle("active"); applySearchSortRender(); });

  // theme toggle (optional)
  btnToggleTheme && btnToggleTheme.addEventListener("click", () => {
    const now = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    if (now === "dark") document.documentElement.setAttribute("data-theme", "dark"); else document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("fermentapro_theme", now);
  });
}

// When rendimiento fields are used, compute multiplier and set pesoTotal accordingly
function syncMultiplierFromRendimiento() {
  const piezas = rendPiezasInput ? (parseInt(rendPiezasInput.value) || 0) : 0;
  const pesoUnit = rendPesoUnitInput ? (parseFloat(rendPesoUnitInput.value) || 0) : 0;
  if (piezas > 0 && pesoUnit > 0 && pesoTotalInput) {
    const newTotal = piezas * pesoUnit;
    const base = parseFloat(pesoTotalInput.dataset.base) || newTotal;
    // set pesoTotal to newTotal (this is the 'base' mass for calculations)
    pesoTotalInput.value = newTotal;
    pesoTotalInput.dataset.base = base; // preserve original base if not set
    // compute multiplier
    const newMult = newTotal / (base || newTotal || 1);
    if (pesoMultiplierInput) pesoMultiplierInput.value = Math.round(newMult * 100) / 100;
    calcularPesos();
  }
}

// ---------------- Search & Sort (basic) ----------------
function applySearchSortRender() {
  if (!recetaSelect) return;
  const q = (searchRecetas && searchRecetas.value || "").toLowerCase().trim();
  let results = recetasCache.filter(r => {
    if (!q) return true;
    const n = (r.data.nombre || "").toLowerCase();
    const ingreds = (r.data.ingredientes || []).map(i => (i.nombre||"").toLowerCase()).join(" ");
    return n.includes(q) || ingreds.includes(q);
  });
  // sorting by nombre by default (if sortField absent)
  const field = (sortField && sortField.value) || "nombre";
  results.sort((a,b) => {
    let va = a.data[field], vb = b.data[field];
    if (va && typeof va.toDate === "function") va = va.toDate().getTime();
    if (vb && typeof vb.toDate === "function") vb = vb.toDate().getTime();
    if (typeof va === "string") va = va.toLowerCase();
    if (typeof vb === "string") vb = vb.toLowerCase();
    if (va < vb) return -1; if (va > vb) return 1; return 0;
  });
  // re-render select
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
  const id = params.get("receta");
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
      if (rendimientoTextInput && !d.rendimiento.piezas) rendimientoTextInput.value = d.rendimiento.raw || "";
    }
    instrAmasadoContainer.dataset.value = d.instrAmasado || "";
    instrHorneadoContainer.dataset.value = d.instrHorneado || "";
    ingredientes = (d.ingredientes || []).map(it => ({ ...it }));
    renderAll();
    // If shared view, let receiver tweak numbers — do not block editing, per your request
  } catch (err) {
    console.error("Shared view load error:", err);
  }
}

// ---------------- Render all ----------------
function renderAll() {
  renderNombre();
  renderInstrucciones();
  renderIngredientesEditor();
  calcularPesos();
  // ensure stats shown
  actualizarStats();
}

// ---------------- Init ----------------
async function init() {
  await loadLogoDataURI();
  await cargarRecetas();
  wireEvents();
  // set sensible defaults
  if (pesoTotalInput && !pesoTotalInput.value) pesoTotalInput.value = 1000;
  if (pesoMultiplierInput && !pesoMultiplierInput.value) pesoMultiplierInput.value = 1;
  renderAll();
  await handleSharedView();
}

// ensure DOM ready before init
window.addEventListener("DOMContentLoaded", init);

// expose some helpers for debugging (optional)
window._fermenta = {
  calcularPesos, actualizarStats, cargarRecetas, cargarReceta, guardarReceta, generatePDF
};
