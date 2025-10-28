// app.js - Gestor de Recetas Fermentos
// Usa Firestore (sin auth) y jsPDF + autoTable.

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
let isEditMode = true;

// ---------- Utilities ----------
const toNum = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

function setEditing(flag) {
  isEditMode = !!flag;
  document.body.classList.toggle("editing", isEditMode);
  renderNombre();
  renderInstrucciones();
  renderIngredientes();
  btnGuardar.disabled = !isEditMode;

  // 👇 desplazamiento suave hacia el formulario cuando se entra en edición
  if (isEditMode) {
    setTimeout(() => {
      nombreRecetaContainer.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
  }
}

// ---------- Render helpers ----------
function renderNombre() {
  nombreRecetaContainer.innerHTML = "";
  const value = nombreRecetaContainer.dataset.value || "";
  if (isEditMode) {
    const input = document.createElement("input");
    input.id = "nombreReceta";
    input.type = "text";
    input.placeholder = "Nombre de receta";
    input.value = value;
    input.style.border = "2px solid var(--color-accent)";
    input.style.borderRadius = "8px";
    input.style.padding = "0.5rem";
    input.style.width = "100%";
    input.style.fontSize = "1.1rem";
    input.addEventListener("input", e => nombreRecetaContainer.dataset.value = e.target.value);
    nombreRecetaContainer.appendChild(input);
  } else {
    const h2 = document.createElement("h2");
    h2.textContent = value || "Receta sin nombre";
    nombreRecetaContainer.appendChild(h2);
  }
}

function renderInstrucciones() {
  instrAmasadoContainer.innerHTML = "";
  instrHorneadoContainer.innerHTML = "";
  if (isEditMode) {
    const la = document.createElement("label"); la.textContent = "Amasado / Fermentación";
    const ta = document.createElement("textarea");
    ta.id = "instrAmasado"; ta.rows = 3;
    ta.value = instrAmasadoContainer.dataset.value || "";
    ta.addEventListener("input", e => instrAmasadoContainer.dataset.value = e.target.value);
    instrAmasadoContainer.appendChild(la);
    instrAmasadoContainer.appendChild(ta);

    const lh = document.createElement("label"); lh.textContent = "Horneado";
    const tb = document.createElement("textarea");
    tb.id = "instrHorneado"; tb.rows = 2;
    tb.value = instrHorneadoContainer.dataset.value || "";
    tb.addEventListener("input", e => instrHorneadoContainer.dataset.value = e.target.value);
    instrHorneadoContainer.appendChild(lh);
    instrHorneadoContainer.appendChild(tb);
  } else {
    const pa = document.createElement("p");
    pa.textContent = instrAmasadoContainer.dataset.value || "—";
    const pb = document.createElement("p");
    pb.textContent = instrHorneadoContainer.dataset.value || "—";
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
      name.type = "text";
      name.value = ing.nombre || "";
      name.placeholder = "Nombre";
      name.addEventListener("input", e => { ingredientes[idx].nombre = e.target.value; calcularPesos(); });

      const pct = document.createElement("input");
      pct.type = "number";
      pct.step = "0.1"; pct.min = 0;
      pct.value = toNum(ing.porcentaje);
      pct.addEventListener("input", e => { ingredientes[idx].porcentaje = parseFloat(e.target.value) || 0; calcularPesos(); });

      const del = document.createElement("button");
      del.type = "button"; del.className = "icon-btn danger";
      del.innerHTML = "<i class='bx bx-x'></i>";
      del.addEventListener("click", () => { ingredientes.splice(idx, 1); renderIngredientes(); calcularPesos(); });

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

// ---------- Calculations (sin cambios excepto ajuste rendimiento) ----------
function getEffectivePesoTotal() {
  const base = toNum(pesoTotalInput.value);
  const mult = Math.max(0.0001, toNum(pesoMultiplierInput.value) || 1);
  return base * mult;
}

function calcularPesos() {
  const pesoTotal = getEffectivePesoTotal();
  if (!ingredientes.length || pesoTotal <= 0) {
    if (sumGramsEl) sumGramsEl.textContent = "0 g";
    return;
  }

  const sumPerc = ingredientes.reduce((a, i) => a + (toNum(i.porcentaje) || 0), 0);
  if (sumPerc <= 0) {
    if (sumGramsEl) sumGramsEl.textContent = "0 g";
    return;
  }

  const flourWeight = (pesoTotal * 100) / sumPerc;
  ingredientes.forEach(i => {
    const pct = toNum(i.porcentaje);
    i._grams = Math.round((pct / 100) * flourWeight);
  });

  const totalRounded = ingredientes.reduce((s, i) => s + (i._grams || 0), 0);
  if (sumGramsEl) sumGramsEl.textContent = totalRounded + " g";
}

// ---------- Firestore CRUD ----------
async function cargarRecetas() {
  recetaSelect.innerHTML = `<option value="">Selecciona o agrega una receta</option>`;
  const q = query(collection(db, COLL), orderBy("nombre", "asc"));
  const snap = await getDocs(q);
  recetasCache = [];
  snap.forEach(d => recetasCache.push({ id: d.id, data: d.data() }));
  recetasCache.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.data.nombre || "Receta sin nombre";
    recetaSelect.appendChild(opt);
  });
}

async function cargarReceta(id) {
  if (!id) return limpiarFormulario();
  const snap = await getDoc(doc(db, COLL, id));
  if (!snap.exists()) return alert("La receta no existe");
  const d = snap.data();
  recetaIdActual = id;
  nombreRecetaContainer.dataset.value = d.nombre || "";
  pesoTotalInput.value = d.pesoTotal || 1000;
  pesoMultiplierInput.value = d.pesoMultiplier || 1;
  rendPiezasInput.value = d.rendimiento?.piezas || "";
  rendPesoUnitInput.value = d.rendimiento?.pesoPorPieza || "";
  instrAmasadoContainer.dataset.value = d.instrAmasado || "";
  instrHorneadoContainer.dataset.value = d.instrHorneado || "";
  ingredientes = (d.ingredientes || []).map(x => ({ ...x }));
  setEditing(false);
  calcularPesos();
}

async function guardarReceta() {
  const nombre = (nombreRecetaContainer.dataset.value || "").trim();
  if (!nombre) return alert("La receta necesita un nombre");

  const recetaObj = {
    nombre,
    pesoTotal: toNum(pesoTotalInput.value),
    pesoMultiplier: toNum(pesoMultiplierInput.value),
    rendimiento: {
      piezas: parseInt(rendPiezasInput.value) || 0,
      pesoPorPieza: parseFloat(rendPesoUnitInput.value) || 0
    },
    instrAmasado: instrAmasadoContainer.dataset.value || "",
    instrHorneado: instrHorneadoContainer.dataset.value || "",
    ingredientes,
    updatedAt: serverTimestamp()
  };

  if (!confirm("¿Guardar o actualizar esta receta?")) return;

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
}

async function eliminarReceta() {
  if (!recetaIdActual) return;
  if (!confirm("¿Seguro que deseas eliminar esta receta?")) return;
  await deleteDoc(doc(db, COLL, recetaIdActual));
  recetaIdActual = null;
  limpiarFormulario();
  await cargarRecetas();
  alert("Receta eliminada");
}

function limpiarFormulario() {
  nombreRecetaContainer.dataset.value = "";
  pesoTotalInput.value = 1000;
  pesoMultiplierInput.value = 1;
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

// ---------- Events ----------
function wireEvents() {
  btnAgregarIngrediente.addEventListener("click", () => {
    ingredientes.push({ nombre: "Ingrediente", porcentaje: 0 });
    renderIngredientes();
  });

  btnGuardar.addEventListener("click", guardarReceta);
  btnEliminar.addEventListener("click", eliminarReceta);
  btnDuplicar.addEventListener("click", async () => {
    if (!recetaIdActual) return alert("Selecciona una receta primero");
    const snap = await getDoc(doc(db, COLL, recetaIdActual));
    if (!snap.exists()) return alert("No existe la receta");
    const data = snap.data();
    const ref = await addDoc(collection(db, COLL), {
      ...data,
      nombre: data.nombre + " (copia)",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await cargarRecetas();
    recetaSelect.value = ref.id;
    await cargarReceta(ref.id);
    setEditing(true);
  });

  btnEditar.addEventListener("click", () => setEditing(true));
  btnCancelarEdicion.addEventListener("click", () => {
    if (recetaIdActual) cargarReceta(recetaIdActual);
    else limpiarFormulario();
  });

  recetaSelect.addEventListener("change", e => {
    const id = e.target.value;
    if (id) cargarReceta(id);
    else limpiarFormulario();
  });
}

// ---------- Init ----------
async function init() {
  wireEvents();
  await cargarRecetas();
  limpiarFormulario();
  setEditing(true);
}

window.addEventListener("DOMContentLoaded", init);
