// app.js - Gestor de Recetas Fermentos (COMPLETO, corregido y funcional) - PARTE 1/3
// Incluye: sincronización panes↔peso↔multiplicador, tema, PDF, CSV, compartir, CRUD Firestore.

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

// ---------- DOM SHORTCUTS ----------
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
const btnLimpiarReceta = document.getElementById("btnLimpiarReceta");
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
const btnToggleTheme = $("btnToggleTheme");

// --- Agregar nueva receta ---
const btnAgregarReceta = document.getElementById("btnAgregarReceta");

btnAgregarReceta.addEventListener("click", () => {
  if (confirm("¿Deseas crear una nueva receta? Se perderán los cambios no guardados.")) {
    limpiarFormulario(); // ya existente en tu código
    recetaIdActual = null; // asegura que se cree como nueva
    isEditMode = true;
    renderAll();
    alert("🆕 Modo nueva receta activado");
  }
});

const ingredientesDiv = $("ingredientes");
const tablaIngredientes = $("tablaIngredientes");
const sumGramsEl = $("sumGrams");

const statHydrationTotal = $("statHydrationTotal");
const statStarterPct = $("statStarterPct");
const statSaltPct = $("statSaltPct");
const statPesoEfectivo = $("statPesoEfectivo");

const uiLogo = $("uiLogo");

let ingredientes = [];
let recetaIdActual = null;
let logoDataURI = null;
let isEditMode = false;

// ---------- UTIL ----------
const toNum = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// ---------- RENDER HELPERS ----------
function renderNombre() {
  nombreRecetaContainer.innerHTML = "";
  if (isEditMode) {
    const input = document.createElement("input");
    input.id = "nombreReceta";
    input.type = "text";
    input.placeholder = "Nombre de receta nueva";
    input.value = nombreRecetaContainer.dataset.value || "";
    input.addEventListener("input", e => nombreRecetaContainer.dataset.value = e.target.value);
    input.className = "nombre-input";
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
    const lh = document.createElement("label"); lh.textContent = "Horneado";
    const tb = document.createElement("textarea"); tb.id = "instrHorneado"; tb.rows = 2;
    tb.value = instrHorneadoContainer.dataset.value || "";
    tb.addEventListener("input", e => instrHorneadoContainer.dataset.value = e.target.value);
    instrAmasadoContainer.append(la, ta);
    instrHorneadoContainer.append(lh, tb);
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
      const name = document.createElement("input"); name.type = "text"; name.value = ing.nombre || ""; name.placeholder = "Ingrediente";
      name.addEventListener("input", e => { ingredientes[idx].nombre = e.target.value; calcularPesos(); });
      const pct = document.createElement("input"); pct.type = "number"; pct.step = "0.1"; pct.min = 0; pct.value = toNum(ing.porcentaje);
      pct.addEventListener("input", e => { ingredientes[idx].porcentaje = parseFloat(e.target.value) || 0; calcularPesos(); });
      const del = document.createElement("button"); del.type = "button"; del.className = "icon-btn danger"; del.innerHTML = "<i class='bx bx-x'></i>";
      del.addEventListener("click", () => { ingredientes.splice(idx, 1); renderIngredientes(); calcularPesos(); });
      row.append(name, pct, del);
    } else {
      const tdName = document.createElement("div"); tdName.textContent = ing.nombre || "";
      const tdPct = document.createElement("div"); tdPct.textContent = (toNum(ing.porcentaje)).toFixed(2) + "%";
      const tdGram = document.createElement("div"); tdGram.textContent = (ing._grams || 0) + " g";
      tdName.style.flex = "1"; tdPct.style.width = "110px"; tdGram.style.width = "110px";
      row.append(tdName, tdPct, tdGram);
    }
    ingredientesDiv.appendChild(row);
  });
}

// ---------- EDIT MODE ----------
function setEditing(flag) {
  isEditMode = !!flag;
  document.body.classList.toggle("editing", isEditMode);
  renderNombre();
  renderInstrucciones();
  renderIngredientes();

  btnGuardar.disabled = !isEditMode;
  btnAgregarIngrediente.disabled = !isEditMode;

  // smooth scroll to inputs when entering edit
  if (isEditMode) {
    const el = document.getElementById("ingredientes");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }
}
// app.js - PARTE 2/3
// ---------- CÁLCULOS, SINCRONIZACIÓN, STATS ----------

// classify ingredient simple heuristic
function classifyIngredientName(name = "") {
  const n = (name || "").toLowerCase();
  if (/harina|flour|trigo|wheat|semola/i.test(n)) return "flour";
  if (/agua|water/i.test(n)) return "water";
  if (/leche|milk/i.test(n)) return "milk";
  if (/huevo|egg/i.test(n)) return "egg";
  if (/mantequilla|butter|aceite|oil/i.test(n)) return "fat";
  if (/yogur|yoghurt|yogurt/i.test(n)) return "yogurt";
  if (/masa madre|starter|levain/i.test(n)) return "starter";
  if (/sal/i.test(n)) return "salt";
  if (/levadura|yeast/i.test(n)) return "yeast";
  return "other";
}
const WATER_FACTORS = { milk: 0.87, egg: 0.75, fat: 0.16, yogurt: 0.8 };

// base = peso "original" guardado; se mantiene en dataset.base
function getBase() {
  const b = parseFloat(pesoTotalInput.dataset.base);
  if (Number.isFinite(b) && b > 0) return b;
  const cur = toNum(pesoTotalInput.value) || 1000;
  pesoTotalInput.dataset.base = String(cur);
  return cur;
}

// effective peso = base * multiplier
function getEffectivePesoTotal() {
  const base = getBase();
  const mult = Math.max(0.0001, toNum(pesoMultiplierInput.value) || 1);
  return base * mult;
}

// sincroniza cambios: origen puede ser "rend" (piezas/peso unit), "mult", "pesoTotalManual"
function syncRendimientoYMultiplicador(origen) {
  const base = getBase();
  const piezas = parseInt(rendPiezasInput?.value) || 0;
  const pesoUnit = parseFloat(rendPesoUnitInput?.value) || 0;

  if (origen === "rend") {
    if (piezas > 0 && pesoUnit > 0) {
      const newTotal = piezas * pesoUnit;
      const newMult = newTotal / base;
      pesoTotalInput.value = Math.round(newTotal);
      pesoMultiplierInput.value = Math.round(newMult * 100) / 100;
      calcularPesos();
    } else {
      // si falta información, solo actualizar preview
      calcularPesos();
    }
  } else if (origen === "mult") {
    const mult = Math.max(0.0001, parseFloat(pesoMultiplierInput.value) || 1);
    const newTotal = Math.round(base * mult);
    pesoTotalInput.value = newTotal;
    if (pesoUnit > 0) {
      rendPiezasInput.value = Math.max(0, Math.round(newTotal / pesoUnit));
    }
    calcularPesos();
  } else if (origen === "pesoTotalManual") {
    const manual = Math.max(0, parseFloat(pesoTotalInput.value) || 0);
    const newMult = manual / base;
    pesoMultiplierInput.value = Math.round(newMult * 100) / 100;
    if (pesoUnit > 0) rendPiezasInput.value = Math.max(0, Math.round(manual / pesoUnit));
    calcularPesos();
  }
}

function calcularPesos() {
  const piezas = parseInt(rendPiezasInput?.value) || 0;
  const pesoUnit = parseFloat(rendPesoUnitInput?.value) || 0;
  const pesoTotal = Math.round(getEffectivePesoTotal());

  // actualizar preview
  if (piezas > 0 && pesoUnit > 0) rendimientoPreview.textContent = `${piezas} × ${pesoUnit} g = ${piezas * pesoUnit} g`;
  else rendimientoPreview.textContent = "—";

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
    ing._grams = Math.round(ing._raw);
  });

  // ajustar delta para que suma de gramos == pesoTotal
  let totalRounded = ingredientes.reduce((s, it) => s + (it._grams || 0), 0);
  const delta = Math.round(pesoTotal) - totalRounded;
  if (delta !== 0 && ingredientes.length > 0) {
    let idx = ingredientes.findIndex(it => /harina|flour|trigo/i.test((it.nombre || "").toLowerCase()));
    if (idx === -1) {
      // ajustar el mayor %
      let max = -Infinity;
      ingredientes.forEach((it, i) => { if (toNum(it.porcentaje) > max) { max = toNum(it.porcentaje); idx = i; }});
    }
    if (idx >= 0) {
      ingredientes[idx]._grams = (ingredientes[idx]._grams || 0) + delta;
      totalRounded += delta;
    }
  }

  // render tabla
  ingredientes.forEach(ing => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${ing.nombre}</td><td>${(toNum(ing.porcentaje)).toFixed(2)}%</td><td>${ing._grams || 0} g</td>`;
    tablaIngredientes.appendChild(tr);
  });

  if (sumGramsEl) sumGramsEl.textContent = totalRounded + " g";
  actualizarStats();
}

function actualizarStats() {
  let flourW = 0, waterW = 0, milkW = 0, eggW = 0, fatW = 0, yogurtW = 0, starterW = 0, saltW = 0;
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
  });

  const starterH = 100;
  const starterWater = starterW * (starterH / (100 + starterH));
  const starterFlourEq = Math.max(0, starterW - starterWater);

  const milkWater = milkW * WATER_FACTORS.milk;
  const eggWater = eggW * WATER_FACTORS.egg;
  const fatWater = fatW * WATER_FACTORS.fat;
  const yogurtWater = yogurtW * WATER_FACTORS.yogurt;

  const harinaTotal = flourW + starterFlourEq;
  const aguaTotal = waterW + milkWater + eggWater + fatWater + yogurtWater + starterWater;

  const hidrTotal = harinaTotal > 0 ? ((aguaTotal) / harinaTotal) * 100 : NaN;
  const salSobreHarina = harinaTotal > 0 ? (saltW / harinaTotal) * 100 : NaN;
  const pesoEfectivo = Math.round(getEffectivePesoTotal());
  const starterPct = pesoEfectivo > 0 ? (starterW / pesoEfectivo) * 100 : NaN;

  if (statHydrationTotal) statHydrationTotal.textContent = isFinite(hidrTotal) ? hidrTotal.toFixed(1) + "%" : "—";
  if (statStarterPct) statStarterPct.textContent = isFinite(starterPct) ? starterPct.toFixed(2) + "%" : "—";
  if (statSaltPct) statSaltPct.textContent = isFinite(salSobreHarina) ? salSobreHarina.toFixed(2) + "% (sobre harina)" : "—";
  if (statPesoEfectivo) statPesoEfectivo.textContent = pesoEfectivo + " g";
}
// app.js - PARTE 3/3
// ---------- FIRESTORE CRUD, EXPORTS, THEME, EVENTS, INIT ----------

// Cargar lista de recetas
async function cargarRecetas() {
  if (!recetaSelect) return;
  recetaSelect.innerHTML = `<option value="">🥐🥖🍞</option>`;
  try {
    const q = query(collection(db, COLL), orderBy("nombre", "asc"));
    const snap = await getDocs(q);
    snap.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.data().nombre || "Receta sin nombre";
      recetaSelect.appendChild(opt);
    });
  } catch (err) {
    console.error("Error cargarRecetas:", err);
    // no bloquear la UI; el usuario verá opciones si después carga
  }
}

recetaSelect.addEventListener("change", (e) => {
  const selectedId = e.target.value;
  if (selectedId) {
    cargarReceta(selectedId);
  } else {
    limpiarFormulario();
  }
});

// Permite recargar si se elige la misma receta nuevamente
recetaSelect.addEventListener("click", (e) => {
  const selectedId = e.target.value;
  if (selectedId) {
    cargarReceta(selectedId);
  }
});

// Cargar receta seleccionada
async function cargarReceta(id) {
  if (!id) { limpiarFormulario(); return; }
  try {
    const snap = await getDoc(doc(db, COLL, id));
    if (!snap.exists()) { alert("La receta no existe"); return; }
    const d = snap.data();
    recetaIdActual = id;
    nombreRecetaContainer.dataset.value = d.nombre || "";

    // Guardar base (peso original) en dataset.base
    const base = d.pesoTotal ? Number(d.pesoTotal) : 1000;
    pesoTotalInput.dataset.base = String(base);

    // multiplicador guardado o 1
    const storedMult = (d.pesoMultiplier != null) ? Number(d.pesoMultiplier) : 1;
    pesoMultiplierInput.value = storedMult;
    // mostrar peso efectivo
    pesoTotalInput.value = Math.round(base * storedMult);

    if (d.rendimiento) {
      rendPiezasInput.value = d.rendimiento.piezas || "";
      rendPesoUnitInput.value = d.rendimiento.pesoPorPieza || "";
    } else {
      rendPiezasInput.value = "";
      rendPesoUnitInput.value = "";
    }

    instrAmasadoContainer.dataset.value = d.instrAmasado || "";
    instrHorneadoContainer.dataset.value = d.instrHorneado || "";
    ingredientes = (d.ingredientes || []).map(it => ({ ...it }));

    setEditing(false);
    calcularPesos();
    renderIngredientes();
  } catch (err) {
    console.error("Error cargarReceta:", err);
    alert("Error al cargar la receta (ver consola)");
  }
}

// Guardar o actualizar receta
async function guardarReceta() {
  const nombre = (nombreRecetaContainer.dataset.value || "").trim();
  if (!nombre) return alert("La receta necesita un nombre");

  // base (peso original que guardamos) -> si user creó nueva y no definió base, usamos current effective as base
  const base = getBase();

  const recetaObj = {
    nombre,
    pesoTotal: base,
    pesoMultiplier: toNum(pesoMultiplierInput.value),
    rendimiento: {
      piezas: rendPiezasInput ? (parseInt(rendPiezasInput.value) || 0) : 0,
      pesoPorPieza: rendPesoUnitInput ? (parseFloat(rendPesoUnitInput.value) || 0) : 0
    },
    instrAmasado: instrAmasadoContainer.dataset.value || "",
    instrHorneado: instrHorneadoContainer.dataset.value || "",
    ingredientes: ingredientes.map(it => ({ nombre: it.nombre || "", porcentaje: toNum(it.porcentaje) })),
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
    alert("Error al guardar (ver consola). Revisa permisos de Firestore.");
  }
}

// Duplicar receta
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

// Eliminar receta
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

// Limpiar formulario para nueva receta
function limpiarFormulario() {
  nombreRecetaContainer.dataset.value = "";
  // mantener base por defecto = 1000 para nuevas recetas
  pesoTotalInput.dataset.base = pesoTotalInput.dataset.base || "1000";
  pesoMultiplierInput.value = 1;
  pesoTotalInput.value = Math.round(getBase() * toNum(pesoMultiplierInput.value));
  rendPiezasInput.value = "";
  rendPesoUnitInput.value = "";
  instrAmasadoContainer.dataset.value = "";
  instrHorneadoContainer.dataset.value = "";
  ingredientes = [];
  recetaIdActual = null;
  setEditing(true);
  renderIngredientes();
  calcularPesos();
}

function limpiarSoloCampos() {
  console.log("Limpiando campos sin alterar la receta actual");
  nombreRecetaContainer.dataset.value = "";
  pesoTotalInput.value = 1000;
  pesoMultiplierInput.value = 1;
  instrAmasadoContainer.dataset.value = "";
  instrHorneadoContainer.dataset.value = "";
  ingredientes = [];
  isEditMode = true; // para permitir edición inmediata
  renderAll();
}

btnLimpiarReceta.addEventListener("click", () => {
  if (confirm("¿Seguro que deseas limpiar la receta actual? Se borrarán los datos no guardados.")) {
    limpiarFormulario();
  }
});

// ---------- LOGO LOADER ----------
async function loadLogo() {
  try {
    const r = await fetch("./logo.b64.txt");
    if (!r.ok) throw new Error("logo not found");
    const txt = (await r.text()).trim();
    logoDataURI = txt.startsWith("data:") ? txt : "data:image/png;base64," + txt;
    if (uiLogo) uiLogo.src = logoDataURI;
  } catch (e) {
    logoDataURI = null;
  }
}

// ---------- PDF (jsPDF + autoTable required in index.html) ----------
function formatDateTime(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function generatePDF({ preview = false } = {}) {
  if (!window.jspdf) { alert("jsPDF no cargado."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  let y = margin;

  if (logoDataURI) {
    try {
      const imgW = 60, imgH = imgW * 0.68;
      doc.addImage(logoDataURI, (pageW - imgW) / 2, y, imgW, imgH);
      y += imgH + 6;
    } catch (e) { /* ignore */ }
  }

  const title = nombreRecetaContainer.dataset.value || "Receta sin nombre";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(139, 30, 63);
  doc.text(title, pageW / 2, y, { align: "center" });
  y += 10;

  const pesoE = Math.round(getEffectivePesoTotal());
  const piezas = parseInt(rendPiezasInput.value) || 0;
  const pesoUnit = parseFloat(rendPesoUnitInput.value) || 0;
  const rendText = piezas > 0 && pesoUnit > 0 ? `${piezas} × ${pesoUnit} g = ${piezas * pesoUnit} g` : "—";

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Peso total de la masa: ${pesoE} g`, margin, y); y += 6;
  doc.text(`Rendimiento: ${rendText}`, margin, y); y += 8;

  const hidr = statHydrationTotal.textContent;
  const starter = statStarterPct.textContent;
  const salt = statSaltPct.textContent;
  doc.text(`Hidratación total: ${hidr}`, margin, y); y += 5;
  doc.text(`Starter (% masa): ${starter}`, margin, y); y += 5;
  doc.text(`Salinidad: ${salt}`, margin, y); y += 10;

  const body = ingredientes.map(i => [i.nombre, (toNum(i.porcentaje)).toFixed(2) + "%", (i._grams || 0) + " g"]);
  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Ingrediente", "% Panadero", "Peso (g)"]],
    body,
    theme: "grid",
    headStyles: { fillColor: [139, 30, 63], textColor: 255 },
    styles: { fontSize: 10 }
  });

  const fecha = formatDateTime(new Date());
  const footerY = doc.internal.pageSize.getHeight() - 12;
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text("Creado en Fermentos App", margin, footerY);
  doc.text(fecha, pageW - margin, footerY, { align: "right" });

  if (preview) {
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl, "_blank");
  } else {
    const safe = (nombreRecetaContainer.dataset.value || "receta").replace(/[^\w\- ]+/g, '');
    doc.save(safe + ".pdf");
  }
}

// ---------- CSV ----------
function exportarCSV() {
  const rows = [["Ingrediente", "% Panadero", "Peso (g)"], ...ingredientes.map(i => [i.nombre, (toNum(i.porcentaje)).toFixed(2), (i._grams || 0)])];
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = (nombreRecetaContainer.dataset.value || "receta") + ".csv";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// ---------- SHARING ----------
function makeShareLink(id) {
  const mult = toNum(pesoMultiplierInput.value) || 1;
  return `${location.origin}${location.pathname}?receta=${encodeURIComponent(id)}&mult=${encodeURIComponent(mult)}`;
}
function shareByWhatsApp() {
  if (!recetaIdActual) return alert("Selecciona una receta primero");
  const link = makeShareLink(recetaIdActual);
  window.open(`https://wa.me/?text=${encodeURIComponent("Te comparto esta receta: " + link)}`, "_blank");
}
// ---------- SHARING (REEMPLAZO SEGURO) ----------
function copyShareLink() {
  if (!recetaIdActual) {
    alert("Selecciona una receta primero");
    return;
  }
  const link = makeShareLink(recetaIdActual);

  // Intento moderno: navigator.clipboard (solo en contexto seguro - https)
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(link)
      .then(() => {
        // Mensaje no bloqueante
        try { showToast && showToast("Enlace copiado ✅"); } catch(e) { /* noop */ }
        alert("✅ Enlace copiado al portapapeles");
      })
      .catch((err) => {
        console.warn("navigator.clipboard fallo:", err);
        fallbackCopyTextToClipboard(link);
      });
  } else {
    // Fallback robusto (execCommand)
    fallbackCopyTextToClipboard(link);
  }
}

function fallbackCopyTextToClipboard(text) {
  // Crea textarea temporal
  const textArea = document.createElement("textarea");
  textArea.value = text;

  // Evitar scroll y estilos visibles
  textArea.style.position = "fixed";
  textArea.style.top = "-9999px";
  textArea.style.left = "-9999px";
  textArea.setAttribute("readonly", "");

  document.body.appendChild(textArea);
  textArea.select();

  try {
    const ok = document.execCommand('copy');
    if (ok) {
      try { showToast && showToast("Enlace copiado ✅"); } catch(e){/*noop*/ }
      alert("✅ Enlace copiado al portapapeles");
    } else {
      // Si execCommand falla, ofrecer prompt para copia manual
      prompt("Copia este enlace:", text);
    }
  } catch (err) {
    console.warn("fallback copy failed:", err);
    prompt("Copia este enlace:", text);
  }

  // limpiar
  document.body.removeChild(textArea);
}

// ---------- THEME ----------
function applyTheme(pref) {
  document.documentElement.setAttribute("data-theme", pref);
  if (pref === "dark") document.body.classList.add("dark"); else document.body.classList.remove("dark");
  if (btnToggleTheme) {
    const icon = btnToggleTheme.querySelector("i");
    if (icon) icon.className = document.body.classList.contains("dark") ? "bx bx-sun" : "bx bx-moon";
  }
  localStorage.setItem("fermentapro_theme", pref);
}
function initTheme() {
  const saved = localStorage.getItem("fermentapro_theme");
  if (saved) applyTheme(saved);
  else {
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
  }
  // ensure button listener
  btnToggleTheme?.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    applyTheme(next);
  });
}

// ---------- EVENTS WIRING ----------
function wireEvents() {
  btnAgregarIngrediente?.addEventListener("click", () => {
    ingredientes.push({ nombre: "Ingrediente", porcentaje: 0 });
    renderIngredientes(); calcularPesos();
  });

  btnGuardar?.addEventListener("click", guardarReceta);
  btnDuplicar?.addEventListener("click", duplicarReceta);
  btnEliminar?.addEventListener("click", eliminarReceta);

  btnExportar?.addEventListener("click", () => generatePDF({ preview: false }));
  btnPreviewPDF?.addEventListener("click", () => generatePDF({ preview: true }));
  btnExportCSV?.addEventListener("click", exportarCSV);
  btnCompartir?.addEventListener("click", () => {
    const c = confirm("Compartir por WhatsApp? OK=WhatsApp, Cancelar=Copiar enlace");
    if (c) shareByWhatsApp(); else copyShareLink();
  });

  btnEditarRecetaView?.addEventListener("click", () => {
    setEditing(true);
    // focus first ingredient input if exists
    setTimeout(() => {
      const input = ingredientesDiv.querySelector("input[type='text']");
      if (input) input.focus();
    }, 300);
  });

  btnCancelarEdicionView?.addEventListener("click", () => {
    if (recetaIdActual) cargarReceta(recetaIdActual);
    else limpiarFormulario();
  });

  recetaSelect?.addEventListener("change", e => {
    const id = e.target.value;
    if (id) cargarReceta(id);
    else limpiarFormulario();
  });

  pesoTotalInput?.addEventListener("input", () => syncRendimientoYMultiplicador("pesoTotalManual"));
  pesoMultiplierInput?.addEventListener("input", () => syncRendimientoYMultiplicador("mult"));
  rendPiezasInput?.addEventListener("input", () => syncRendimientoYMultiplicador("rend"));
  rendPesoUnitInput?.addEventListener("input", () => syncRendimientoYMultiplicador("rend"));

  btnRecalcular?.addEventListener("click", () => calcularPesos());
}

// ---------- INIT ----------
async function init() {
  await loadLogo();
  initTheme();
  wireEvents();
  await cargarRecetas();
  limpiarFormulario();
  setEditing(false);
  // if shared link provides receta id in URL, try to load it
  const params = new URLSearchParams(location.search);
  const rid = params.get("receta");
  const mult = params.get("mult");
  if (rid) {
    try {
      await cargarReceta(rid);
      if (mult && pesoMultiplierInput) {
        pesoMultiplierInput.value = parseFloat(mult);
        pesoTotalInput.value = Math.round(getBase() * toNum(pesoMultiplierInput.value));
        calcularPesos();
      }
      setEditing(false);
    } catch (e) { /* ignore */ }
  }
}

window.addEventListener("DOMContentLoaded", init);
