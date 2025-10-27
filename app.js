// app.js - Gestor de Recetas Fermentos (versión final, sin autenticación)
// Requiere: index.html carga jsPDF + autoTable y Poppins (ya incluido en HTML).

// ---------------- Firebase (modular) ----------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  addDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// === CONFIG FIREBASE - tu proyecto
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
const FIRESTORE_COLLECTION = "recetas";

// ---------------- DOM references ----------------
const recetaSelect = document.getElementById("recetaSelect");
const nombreRecetaContainer = document.getElementById("nombreRecetaContainer");
const instrAmasadoContainer = document.getElementById("instrAmasadoContainer");
const instrHorneadoContainer = document.getElementById("instrHorneadoContainer");
const pesoTotalInput = document.getElementById("pesoTotal");
const pesoMultiplierInput = document.getElementById("pesoMultiplier");
const btnAgregarIngrediente = document.getElementById("btnAgregarIngrediente");
const btnGuardar = document.getElementById("btnGuardar");
const btnEliminar = document.getElementById("btnEliminar");
const btnEditar = document.getElementById("btnEditar");
const btnExportar = document.getElementById("btnExportar");
const btnPreviewPDF = document.getElementById("btnPreviewPDF");
const btnExportCSV = document.getElementById("btnExportCSV");
const btnLimpiar = document.getElementById("btnLimpiar");
const btnRecalcular = document.getElementById("btnRecalcular");
const btnDuplicar = document.getElementById("btnDuplicar");
const btnCompartir = document.getElementById("btnCompartir");

const ingredientesDiv = document.getElementById("ingredientes");
const tablaIngredientes = document.getElementById("tablaIngredientes");
const sumGramsEl = document.getElementById("sumGrams");

const statHydrationTotal = document.getElementById("statHydrationTotal");
const statStarterPct = document.getElementById("statStarterPct");
const statSaltPct = document.getElementById("statSaltPct");
const statPesoEfectivo = document.getElementById("statPesoEfectivo");
const statRendimiento = document.getElementById("statRendimiento");

const starterHydrationInput = document.getElementById("starterHydration"); // may be null in older markup
const rendimientoInput = document.getElementById("rendimiento");

const searchRecetas = document.getElementById("searchRecetas");
const sortField = document.getElementById("sortField");
const btnSortToggle = document.getElementById("btnSortToggle");

const btnToggleTheme = document.getElementById("btnToggleTheme");
const listaRecetasEl = document.getElementById("listaRecetas");
const metaPesoTotal = document.getElementById("metaPesoTotal");
const recipeTitleDisplay = document.getElementById("recipeTitleDisplay");

// ---------------- State ----------------
let ingredientes = [];
let recetaIdActual = null;
let isEditMode = true;
let recetasCache = [];
let sortAsc = true;
let logoDataURI = null; // will be loaded from file logo.b64.txt

// ---------------- Helpers ----------------
function getEffectivePesoTotal() {
  const base = parseFloat(pesoTotalInput.value) || 0;
  const mult = parseFloat(pesoMultiplierInput.value) || 1;
  return base * mult;
}

function classifyIngredientName(name = "") {
  const n = (name || "").toLowerCase();
  if (n.includes("harina") || n.includes("flour") || n.includes("integral") || n.includes("whole")) return "flour";
  if (n.includes("agua") || n.includes("water")) return "water";
  if (n.includes("leche") || n.includes("milk")) return "milk";
  if (n.includes("huevo") || n.includes("egg")) return "egg";
  if (n.includes("mantequilla") || n.includes("butter")) return "butter";
  if (n.includes("yogur") || n.includes("yoghurt") || n.includes("yogurt")) return "yogurt";
  if (n.includes("masa madre") || n.includes("starter") || n.includes("levain") || n.includes("masa")) return "starter";
  if (n.includes("sal")) return "salt";
  if (n.includes("levadura") || n.includes("yeast")) return "yeast";
  return "other";
}

const WATER_CONTENT = {
  milk: 0.87,
  egg: 0.74,
  butter: 0.16,
  yogurt: 0.80
};

// ---------------- Calculations & Rendering ----------------
function calcularPesos() {
  const pesoTotal = getEffectivePesoTotal();
  tablaIngredientes.innerHTML = "";

  if (!ingredientes.length || pesoTotal <= 0) {
    sumGramsEl.textContent = "0 g";
    actualizarStats();
    return;
  }

  const sumPerc = ingredientes.reduce((acc, ing) => acc + (parseFloat(ing.porcentaje) || 0), 0);
  if (sumPerc <= 0) {
    sumGramsEl.textContent = "0 g";
    actualizarStats();
    return;
  }

  const flourWeight = (pesoTotal * 100) / sumPerc;

  ingredientes.forEach(ing => {
    ing._raw = (parseFloat(ing.porcentaje) || 0) / 100 * flourWeight;
  });

  let totalRounded = 0;
  ingredientes.forEach(ing => {
    ing._grams = Math.round(ing._raw || 0);
    totalRounded += ing._grams;
  });

  const delta = Math.round(pesoTotal) - totalRounded;
  if (delta !== 0) {
    let flourIdx = ingredientes.findIndex(it => Math.abs((it.porcentaje || 0) - 100) < 1e-6);
    if (flourIdx === -1) {
      let maxPerc = -Infinity, idx = 0;
      ingredientes.forEach((it, i) => { if ((it.porcentaje || 0) > maxPerc) { maxPerc = it.porcentaje; idx = i; }});
      flourIdx = idx;
    }
    ingredientes[flourIdx]._grams += delta;
    totalRounded += delta;
  }

  ingredientes.forEach(ing => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${ing.nombre}</td>
      <td>${(parseFloat(ing.porcentaje) || 0).toFixed(2)}%</td>
      <td>${ing._grams} g</td>
    `;
    tablaIngredientes.appendChild(row);
  });

  sumGramsEl.textContent = totalRounded + " g";
  actualizarStats();
}

function actualizarStats() {
  // compute grams from ingredientes
  let flourW = 0, waterDirectW = 0, milkW = 0, eggW = 0, butterW = 0, yogurtW = 0, starterW = 0, saltW = 0, othersW = 0;
  ingredientes.forEach(it => {
    const cls = classifyIngredientName(it.nombre);
    const g = it._grams || 0;
    if (cls === "flour") flourW += g;
    else if (cls === "water") waterDirectW += g;
    else if (cls === "milk") milkW += g;
    else if (cls === "egg") eggW += g;
    else if (cls === "butter") butterW += g;
    else if (cls === "yogurt") yogurtW += g;
    else if (cls === "starter") starterW += g;
    else if (cls === "salt") saltW += g;
    else othersW += g;
  });

  const H = parseFloat((starterHydrationInput && starterHydrationInput.value) || 100) || 100;

  // starter split into flour-equiv and water
  // if starterW = total grams of starter, then:
  // starterWater = starterW * (H / (100 + H))
  // starterFlourEquiv = starterW - starterWater
  const starterWater = starterW * (H / (100 + H));
  const starterFlourEquiv = Math.max(0, starterW - starterWater);

  const milkWater = milkW * (WATER_CONTENT.milk || 0.87);
  const eggWater = eggW * (WATER_CONTENT.egg || 0.74);
  const butterWater = butterW * (WATER_CONTENT.butter || 0.16);
  const yogurtWater = yogurtW * (WATER_CONTENT.yogurt || 0.80);

  const harinaTotal = flourW + starterFlourEquiv;
  const aguaDirect = waterDirectW;
  const aguaDesdeOtros = milkWater + eggWater + butterWater + yogurtWater;
  const aguaDesdeStarter = starterWater;

  const hidrPrincipal = harinaTotal > 0 ? (aguaDirect / harinaTotal) * 100 : NaN;
  const hidrAdicional = harinaTotal > 0 ? ((aguaDesdeOtros + aguaDesdeStarter) / harinaTotal) * 100 : NaN;
  const hidrTotal = harinaTotal > 0 ? ((aguaDirect + aguaDesdeOtros + aguaDesdeStarter) / harinaTotal) * 100 : NaN;

  const salSobreHarina = harinaTotal > 0 ? (saltW / harinaTotal) * 100 : NaN;
  const pesoEfectivo = getEffectivePesoTotal();
  const starterPct = pesoEfectivo > 0 ? (starterW / pesoEfectivo) * 100 : NaN;

  statHydrationTotal.textContent = isFinite(hidrTotal) ? hidrTotal.toFixed(1) + "%" : "—";
  statStarterPct.textContent = isFinite(starterPct) ? starterPct.toFixed(2) + "%" : "—";
  statSaltPct.textContent = isFinite(salSobreHarina) ? salSobreHarina.toFixed(2) + "% (sobre harina)" : "—";
  statPesoEfectivo.textContent = Math.round(pesoEfectivo) + " g";

  // rendimiento display parse from rendimiento input
  statRendimiento.textContent = rendimientoInput && rendimientoInput.value ? rendimientoInput.value : "—";
}

// ---------------- Render UI ----------------
function renderNombre() {
  nombreRecetaContainer.innerHTML = "";
  if (isEditMode) {
    const input = document.createElement("input");
    input.id = "nombreReceta";
    input.type = "text";
    input.placeholder = "Ej. Baguette clásica";
    input.value = nombreRecetaContainer.dataset.value || "";
    input.addEventListener("input", (e) => {
      nombreRecetaContainer.dataset.value = e.target.value;
      recipeTitleDisplay && (recipeTitleDisplay.textContent = e.target.value || "—");
    });
    nombreRecetaContainer.appendChild(input);
  } else {
    const h2 = document.createElement("h2");
    h2.textContent = nombreRecetaContainer.dataset.value || "Receta sin nombre";
    nombreRecetaContainer.appendChild(h2);
    recipeTitleDisplay && (recipeTitleDisplay.textContent = nombreRecetaContainer.dataset.value || "—");
  }
}

function renderInstrucciones() {
  instrAmasadoContainer.innerHTML = "<label for='instrAmasado'>Amasado / Fermentación</label>";
  if (isEditMode) {
    const textarea = document.createElement("textarea");
    textarea.id = "instrAmasado";
    textarea.rows = 3;
    textarea.value = instrAmasadoContainer.dataset.value || "";
    textarea.addEventListener("input", (e) => { instrAmasadoContainer.dataset.value = e.target.value; });
    instrAmasadoContainer.appendChild(textarea);
  } else {
    const p = document.createElement("p");
    p.textContent = instrAmasadoContainer.dataset.value || "—";
    instrAmasadoContainer.appendChild(p);
  }

  instrHorneadoContainer.innerHTML = "<label for='instrHorneado'>Horneado</label>";
  if (isEditMode) {
    const textarea = document.createElement("textarea");
    textarea.id = "instrHorneado";
    textarea.rows = 2;
    textarea.value = instrHorneadoContainer.dataset.value || "";
    textarea.addEventListener("input", (e) => { instrHorneadoContainer.dataset.value = e.target.value; });
    instrHorneadoContainer.appendChild(textarea);
  } else {
    const p = document.createElement("p");
    p.textContent = instrHorneadoContainer.dataset.value || "—";
    instrHorneadoContainer.appendChild(p);
  }
}

function renderIngredientes() {
  ingredientesDiv.innerHTML = "";
  if (isEditMode) {
    ingredientes.forEach((ing, idx) => {
      const div = document.createElement("div");
      div.className = "ingredient-row";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = ing.nombre || "";
      nameInput.className = "nombreIng";
      nameInput.dataset.idx = idx;

      const pctInput = document.createElement("input");
      pctInput.type = "number";
      pctInput.value = (ing.porcentaje != null) ? ing.porcentaje : "";
      pctInput.className = "pctIng";
      pctInput.step = "0.1";
      pctInput.min = "0";
      pctInput.dataset.idx = idx;

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-btn danger btnEliminarIng ing-delete";
      delBtn.dataset.idx = idx;
      delBtn.innerHTML = "<i class='bx bx-x'></i>";

      div.appendChild(nameInput);
      div.appendChild(pctInput);
      div.appendChild(delBtn);
      ingredientesDiv.appendChild(div);
    });

    ingredientesDiv.querySelectorAll(".nombreIng").forEach(inp => {
      inp.addEventListener("input", (e) => {
        const i = Number(e.currentTarget.dataset.idx);
        ingredientes[i].nombre = e.currentTarget.value;
        calcularPesos();
      });
    });

    ingredientesDiv.querySelectorAll(".pctIng").forEach(inp => {
      inp.addEventListener("input", (e) => {
        const i = Number(e.currentTarget.dataset.idx);
        ingredientes[i].porcentaje = parseFloat(e.currentTarget.value) || 0;
        calcularPesos();
      });
    });

    ingredientesDiv.querySelectorAll(".btnEliminarIng").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const i = Number(e.currentTarget.dataset.idx);
        if (Number.isFinite(i)) {
          ingredientes.splice(i, 1);
          renderAll();
        }
      });
    });

  } else {
    const ul = document.createElement("ul");
    ul.className = "view-ingredientes-list";
    (ingredientes || []).forEach(it => {
      const li = document.createElement("li");
      li.textContent = `${it.nombre} — ${(parseFloat(it.porcentaje) || 0).toFixed(2)}% — ${(it._grams || 0)} g`;
      ul.appendChild(li);
    });
    ingredientesDiv.appendChild(ul);
  }
}

function toggleEditElements() {
  btnGuardar.style.display = isEditMode ? "inline-flex" : "none";
  btnLimpiar.style.display = isEditMode ? "inline-flex" : "none";
  btnEditar.style.display = (recetaIdActual && !isEditMode) ? "inline-flex" : "none";
  btnEliminar.style.display = recetaIdActual ? "inline-flex" : "none";
}

function renderYieldUI() {
  const pcs = parseInt((rendimientoInput && rendimientoInput.value) || 0) || 0;
  const w = parseFloat((document.getElementById("yieldWeight") && document.getElementById("yieldWeight").value) || 0) || 0;
  if (pcs > 0 && w > 0) {
    statRendimiento.textContent = `${pcs} × ${w} g = ${pcs * w} g`;
  } else {
    statRendimiento.textContent = rendimientoInput && rendimientoInput.value ? rendimientoInput.value : "—";
  }
}

function renderAll() {
  renderNombre();
  renderInstrucciones();
  renderIngredientes();
  toggleEditElements();
  calcularPesos();
  renderYieldUI();
  if (metaPesoTotal) metaPesoTotal.textContent = `Peso objetivo: ${pesoTotalInput.value} g`;
}

// ---------------- Firestore operations ----------------
async function cargarRecetas() {
  recetaSelect.innerHTML = `<option value="">-- Agregar una receta ➕🥐 --</option>`;
  recetasCache = [];
  try {
    const q = query(collection(db, FIRESTORE_COLLECTION), orderBy("nombre", "asc"));
    const snap = await getDocs(q);
    snap.forEach(docSnap => {
      recetasCache.push({ id: docSnap.id, data: docSnap.data() });
    });
    applySearchSortRender();
  } catch (err) {
    console.error("Error cargando recetas:", err);
    alert("❌ Error al cargar las recetas (ver consola)");
  }
}

function applySearchSortRender() {
  const q = (searchRecetas && searchRecetas.value || "").toLowerCase().trim();
  let results = recetasCache.filter(r => {
    if (!q) return true;
    const n = (r.data.nombre || "").toLowerCase();
    const ingreds = (r.data.ingredientes || []).map(i => (i.nombre || "").toLowerCase()).join(" ");
    return n.includes(q) || ingreds.includes(q);
  });

  const field = sortField && sortField.value || "nombre";
  results.sort((a, b) => {
    let va = a.data[field];
    let vb = b.data[field];
    if (va && typeof va.toDate === "function") va = va.toDate().getTime();
    if (vb && typeof vb.toDate === "function") vb = vb.toDate().getTime();
    if (field === "nombre") {
      va = (va || "").toLowerCase();
      vb = (vb || "").toLowerCase();
    }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  recetaSelect.innerHTML = `<option value="">-- Agregar una receta ➕🥐 --</option>`;
  recipesToSelect(results);
}

function recipesToSelect(list) {
  recetaSelect.innerHTML = `<option value="">-- Agregar una receta ➕🥐 --</option>`;
  listaRecetasEl && (listaRecetasEl.innerHTML = "");
  list.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.data.nombre || "Receta sin nombre";
    recetaSelect.appendChild(opt);

    // also build compact list (hidden by design)
    if (listaRecetasEl) {
      const card = document.createElement("div");
      card.className = "recipe-card panel";
      const title = document.createElement("h4");
      title.textContent = r.data.nombre || "Sin nombre";
      card.appendChild(title);
      listaRecetasEl.appendChild(card);
    }
  });
}

async function cargarReceta(id) {
  if (!id) {
    limpiarFormulario();
    return;
  }
  try {
    const docRef = doc(db, FIRESTORE_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      alert("❌ La receta no existe");
      limpiarFormulario();
      return;
    }
    const data = docSnap.data();
    nombreRecetaContainer.dataset.value = data.nombre || "";
    pesoTotalInput.value = data.pesoTotal || 1000;
    pesoMultiplierInput.value = data.pesoMultiplier || 1;
    if (starterHydrationInput) starterHydrationInput.value = data.starterHidratacion || 100;
    instrAmasadoContainer.dataset.value = data.instrAmasado || "";
    instrHorneadoContainer.dataset.value = data.instrHorneado || "";
    ingredientes = (data.ingredientes || []).map(it => ({ ...it }));
    recetaIdActual = id;
    isEditMode = false;
    if (rendimientoInput) rendimientoInput.value = (data.rendimiento && data.rendimiento.piezas) ? `${data.rendimiento.piezas} × ${data.rendimiento.pesoPorPieza} g` : (data.rendimiento && `${data.rendimiento.piezas} × ${data.rendimiento.pesoPorPieza} g`) || "";
    renderAll();
  } catch (err) {
    console.error("Error cargar receta:", err);
    alert("❌ Error al cargar la receta (ver consola)");
  }
}

async function guardarReceta() {
  const nombre = nombreRecetaContainer.dataset.value;
  if (!nombre || !nombre.trim()) return alert("Ponle un nombre a la receta antes de guardar.");
  const receta = {
    nombre,
    pesoTotal: Number(pesoTotalInput.value) || 1000,
    pesoMultiplier: Number(pesoMultiplierInput.value) || 1,
    instrAmasado: instrAmasadoContainer.dataset.value,
    instrHorneado: instrHorneadoContainer.dataset.value,
    starterHidratacion: Number((starterHydrationInput && starterHydrationInput.value) || 100),
    ingredientes,
    rendimiento: parseRendimientoFromInput(rendimientoInput && rendimientoInput.value),
    updatedAt: serverTimestamp()
  };
  try {
    if (recetaIdActual) {
      if (!confirm("¿Quieres actualizar la receta existente?")) return;
      await setDoc(doc(db, FIRESTORE_COLLECTION, recetaIdActual), receta, { merge: true });
      alert("✅ Receta actualizada correctamente");
      isEditMode = false;
    } else {
      await addDoc(collection(db, FIRESTORE_COLLECTION), { ...receta, createdAt: serverTimestamp(), versions: [] });
      alert("✅ Nueva receta guardada");
      isEditMode = false;
    }
    await cargarRecetas();
  } catch (err) {
    console.error("Error al guardar receta:", err);
    alert("❌ Error al guardar la receta (ver consola)");
  }
}

function parseRendimientoFromInput(str) {
  // allow formats: "10 panes de 90 g" or "10x90" or "10 × 90"
  if (!str) return null;
  const s = String(str);
  const m = s.match(/(\d+)\s*[x×]?\s*(\d+)/);
  if (m) return { piezas: parseInt(m[1]), pesoPorPieza: parseFloat(m[2]) };
  const m2 = s.match(/(\d+)\s*pan/i);
  if (m2) return { piezas: parseInt(m2[1]), pesoPorPieza: null };
  return { raw: s };
}

async function duplicarReceta() {
  if (!recetaIdActual) return alert("Selecciona una receta para duplicar");
  try {
    const src = await getDoc(doc(db, FIRESTORE_COLLECTION, recetaIdActual));
    if (!src.exists()) return alert("La receta original ya no existe");
    const data = src.data();
    const copy = { ...data, nombre: (data.nombre || "Receta") + " (copia)", createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    delete copy.id;
    const newRef = await addDoc(collection(db, FIRESTORE_COLLECTION), copy);
    await cargarRecetas();
    recetaSelect.value = newRef.id;
    cargarReceta(newRef.id);
    isEditMode = true;
  } catch (err) {
    console.error("Error duplicar:", err);
    alert("❌ Error al duplicar la receta (ver consola)");
  }
}

async function eliminarReceta() {
  if (!recetaIdActual) return;
  if (!confirm("¿Seguro que deseas eliminar esta receta?")) return;
  try {
    await deleteDoc(doc(db, FIRESTORE_COLLECTION, recetaIdActual));
    recetaIdActual = null;
    limpiarFormulario();
    await cargarRecetas();
    alert("🗑️ Receta eliminada");
  } catch (err) {
    console.error("Error eliminar:", err);
    alert("❌ Error al eliminar la receta (ver consola)");
  }
}

function limpiarFormulario() {
  nombreRecetaContainer.dataset.value = "";
  pesoTotalInput.value = 1000;
  pesoMultiplierInput.value = 1;
  instrAmasadoContainer.dataset.value = "";
  instrHorneadoContainer.dataset.value = "";
  if (starterHydrationInput) starterHydrationInput.value = 100;
  ingredientes = [];
  recetaIdActual = null;
  isEditMode = true;
  renderAll();
}

// ---------------- Export CSV & PDF ----------------
function exportarCSV() {
  const rows = [
    ["Ingrediente", "% Panadero", "Peso (g)"],
    ...ingredientes.map(i => [i.nombre, (parseFloat(i.porcentaje) || 0).toFixed(2), (i._grams || 0)])
  ];
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (nombreRecetaContainer.dataset.value || "receta") + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatDateTimeForPDF(d = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function generatePDFDocument({ preview = false } = {}) {
  // uses window.jspdf
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  // Logo: scale automatically to available width (max 180pt) while preserving aspect ratio
  if (logoDataURI && typeof logoDataURI === "string" && logoDataURI.startsWith("data:")) {
    try {
      // we don't know image original size, but we can set a target width
      const imgMaxWidth = Math.min(360, pageW - margin * 2);
      // addImage will scale automatically; use width imgMaxWidth and height auto-estimate by passing undefined height is not allowed,
      // so set a reasonable height (we'll use 0.25*width to keep portrait-like ratio; if image is taller, jsPDF will crop minimally)
      const imgW = imgMaxWidth;
      const imgH = imgW * 0.45; // reasonable ratio
      const x = (pageW - imgW) / 2;
      doc.addImage(logoDataURI, x, y, imgW, imgH);
      y += imgH + 12;
    } catch (err) {
      console.warn("logo addImage error, fallback text", err);
      doc.setFontSize(18);
      doc.text("GESTOR DE RECETAS FERMENTOS", pageW / 2, y, { align: "center" });
      y += 24;
    }
  }

  // Title: only recipe name
  doc.setFontSize(20);
  doc.setTextColor(123, 30, 58); // wine
  doc.setFont("helvetica", "bold");
  doc.text(nombreRecetaContainer.dataset.value || "Receta sin nombre", pageW / 2, y + 4, { align: "center" });
  y += 28;

  // Date small
  doc.setFontSize(10);
  doc.setTextColor(80);
  const dateStr = formatDateTimeForPDF(new Date());
  doc.text(`Fecha: ${dateStr}`, pageW / 2, y, { align: "center" });
  y += 18;

  // Ingredients table (autoTable)
  const body = ingredientes.map(i => [i.nombre, (parseFloat(i.porcentaje) || 0).toFixed(2) + "%", (i._grams || 0) + " g"]);
  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Ingrediente", "% Panadero", "Peso (g)"]],
    body,
    didDrawPage: function (data) {},
    styles: { font: "helvetica", fontSize: 10 },
    headStyles: { fillColor: [123, 30, 58], textColor: 255, fontStyle: "bold" }
  });

  y = doc.lastAutoTable.finalY + 12;

  // Stats
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("Análisis técnico", margin, y);
  y += 12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const statsToPrint = [
    `Hidratación total: ${statHydrationTotal.textContent || "—"}`,
    `Starter (% masa total): ${statStarterPct.textContent || "—"}`,
    `Salinidad: ${statSaltPct.textContent || "—"}`,
    `Peso efectivo: ${statPesoEfectivo.textContent || "—"}`,
    `Rendimiento: ${statRendimiento.textContent || "—"}`
  ];
  statsToPrint.forEach(line => {
    if (y > doc.internal.pageSize.getHeight() - margin - 50) { doc.addPage(); y = margin; }
    doc.text(line, margin, y);
    y += 14;
  });

  // Instrucciones
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Instrucciones", margin, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  const amasado = instrAmasadoContainer.dataset.value || "—";
  const horneado = instrHorneadoContainer.dataset.value || "—";
  const amasadoLines = doc.splitTextToSize("Amasado / Fermentación: " + amasado, pageW - margin * 2);
  amasadoLines.forEach(line => {
    if (y > doc.internal.pageSize.getHeight() - margin - 30) { doc.addPage(); y = margin; }
    doc.text(line, margin, y);
    y += 12;
  });
  y += 6;
  const horneadoLines = doc.splitTextToSize("Horneado: " + horneado, pageW - margin * 2);
  horneadoLines.forEach(line => {
    if (y > doc.internal.pageSize.getHeight() - margin - 30) { doc.addPage(); y = margin; }
    doc.text(line, margin, y);
    y += 12;
  });

  // Footer: left "Creado en Fermentos App", right date
  const footerY = doc.internal.pageSize.getHeight() - 28;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("Creado en Fermentos App", margin, footerY);
  doc.text(`Exportado: ${dateStr}`, pageW - margin, footerY, { align: "right" });

  if (preview) {
    // open preview in new tab via blob URL
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl, "_blank");
  } else {
    doc.save((nombreRecetaContainer.dataset.value || "receta") + ".pdf");
  }
}

// ---------------- Load logo dataURI from logo.b64.txt ----------------
async function loadLogoDataURI() {
  try {
    // try to fetch local file logo.b64.txt (must be in same folder)
    const resp = await fetch("./logo.b64.txt");
    if (!resp.ok) throw new Error("logo.b64.txt not found");
    const text = await resp.text();
    // the file might already contain the full data URI (data:image/...), or just base64.
    let s = text.trim();
    if (s.startsWith("data:")) {
      logoDataURI = s;
    } else {
      // assume jpeg
      logoDataURI = "data:image/jpeg;base64," + s;
    }
    console.log("Logo dataURI loaded (" + Math.round(logoDataURI.length/1024) + " KB)");
  } catch (err) {
    console.warn("No se pudo cargar logo.b64.txt. PDF seguirá funcionando sin logo.", err);
    logoDataURI = null;
  }
}

// ---------------- Sharing ----------------
function makeShareLink(id) {
  const mult = parseFloat(pesoMultiplierInput.value) || 1;
  return `https://jarecot.github.io/panaderia/?receta=${encodeURIComponent(id)}&mult=${encodeURIComponent(mult)}`;
}

function shareRecipeLink() {
  if (!recetaIdActual) return alert("Selecciona una receta para compartir");
  const link = makeShareLink(recetaIdActual);
  try {
    navigator.clipboard.writeText(link);
    alert("Enlace copiado al portapapeles:\n" + link);
  } catch (e) {
    prompt("Copia este enlace:", link);
  }
}

// ---------------- Events ----------------
btnAgregarIngrediente && btnAgregarIngrediente.addEventListener("click", () => {
  ingredientes.push({ nombre: "Ingrediente", porcentaje: 0 });
  renderAll();
});

btnRecalcular && btnRecalcular.addEventListener("click", () => {
  calcularPesos();
  tablaIngredientes.scrollIntoView({ behavior: "smooth" });
});

btnGuardar && btnGuardar.addEventListener("click", guardarReceta);
btnEliminar && btnEliminar.addEventListener("click", eliminarReceta);
btnEditar && btnEditar.addEventListener("click", () => { isEditMode = true; renderAll(); });
btnDuplicar && btnDuplicar.addEventListener("click", duplicarReceta);
btnExportCSV && btnExportCSV.addEventListener("click", exportarCSV);
btnExportar && btnExportar.addEventListener("click", () => generatePDFDocument({ preview: false }));
btnPreviewPDF && btnPreviewPDF.addEventListener("click", () => generatePDFDocument({ preview: true }));
btnLimpiar && btnLimpiar.addEventListener("click", limpiarFormulario);
btnCompartir && btnCompartir.addEventListener("click", shareRecipeLink);

pesoTotalInput && pesoTotalInput.addEventListener("input", () => calcularPesos());
pesoMultiplierInput && pesoMultiplierInput.addEventListener("input", () => calcularPesos());
if (starterHydrationInput) starterHydrationInput.addEventListener("input", () => actualizarStats());
searchRecetas && searchRecetas.addEventListener("input", () => applySearchSortRender());
sortField && sortField.addEventListener("change", () => applySearchSortRender());
btnSortToggle && btnSortToggle.addEventListener("click", () => { sortAsc = !sortAsc; btnSortToggle.classList.toggle("active", sortAsc); applySearchSortRender(); });

recetaSelect && recetaSelect.addEventListener("change", (e) => { cargarReceta(e.target.value); });

// theme toggle
(function initTheme() {
  const saved = localStorage.getItem("fermentapro_theme");
  if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else if (saved === "light") document.documentElement.removeAttribute("data-theme");
  else {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) document.documentElement.setAttribute("data-theme", "dark");
  }
})();
btnToggleTheme && btnToggleTheme.addEventListener("click", () => {
  const now = document.documentElement.getAttribute("data-theme");
  if (now === "dark") { document.documentElement.removeAttribute("data-theme"); localStorage.setItem("fermentapro_theme", "light"); btnToggleTheme.innerHTML = '<i class="bx bx-moon"></i>'; }
  else { document.documentElement.setAttribute("data-theme", "dark"); localStorage.setItem("fermentapro_theme", "dark"); btnToggleTheme.innerHTML = '<i class="bx bx-sun"></i>'; }
});

// ---------------- Shared view handling from URL ----------------
async function handleSharedView() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("receta");
  const mult = parseFloat(params.get("mult")) || 1;
  if (id) {
    try {
      const docSnap = await getDoc(doc(db, FIRESTORE_COLLECTION, id));
      if (!docSnap.exists()) return alert("Receta compartida no encontrada");
      const data = docSnap.data();
      nombreRecetaContainer.dataset.value = data.nombre || "";
      pesoTotalInput.value = (data.pesoTotal || 1000) * mult;
      pesoMultiplierInput.value = mult;
      if (starterHydrationInput) starterHydrationInput.value = data.starterHidratacion || 100;
      instrAmasadoContainer.dataset.value = data.instrAmasado || "";
      instrHorneadoContainer.dataset.value = data.instrHorneado || "";
      ingredientes = (data.ingredientes || []).map(it => ({ ...it }));
      rendimientoInput && (rendimientoInput.value = (data.rendimiento && data.rendimiento.piezas) ? `${data.rendimiento.piezas} × ${data.rendimiento.pesoPorPieza} g` : (data.rendimiento && `${data.rendimiento.piezas} × ${data.rendimiento.pesoPorPieza} g`) || "");
      recetaIdActual = id;
      isEditMode = false;
      // disable editing for shared view
      document.querySelectorAll(".icon-btn").forEach(b => b.style.display = "none");
      document.querySelectorAll("input, textarea, select, .ing-delete").forEach(el => el.disabled = true);
      renderAll();
    } catch (err) {
      console.error("Shared view error:", err);
    }
  }
}

// ---------------- Init ----------------
(async function init() {
  await loadLogoDataURI(); // try to load logo.b64.txt (optional)
  await cargarRecetas();
  limpiarFormulario();
  await handleSharedView();
  console.log("Gestor de Recetas Fermentos inicializado");
})();
