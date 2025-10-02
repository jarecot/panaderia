// --- Firebase inicialización ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// ================== CONFIG FIREBASE ==================
const firebaseConfig = {
  apiKey: "AIzaSyAhzdmVFlvtoqMSfIQ6OCbiYdg6s6c95iY",
  authDomain: "recetaspanaderia-b31f2.firebaseapp.com",
  projectId: "recetaspanaderia-b31f2",
  storageBucket: "recetaspanaderia-b31f2.firebasestorage.app",
  messagingSenderId: "979143269695",
  appId: "1:979143269695:web:678dc20bf48fc71700078a"
};
// =====================================================

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- Elementos del DOM ---
const recetaSelect = document.getElementById("recetaSelect");
const nombreRecetaInput = document.getElementById("nombreReceta");
const instrAmasadoInput = document.getElementById("instrAmasado");
const instrHorneadoInput = document.getElementById("instrHorneado");
const pesoTotalInput = document.getElementById("pesoTotal");

const btnAgregarIngrediente = document.getElementById("btnAgregarIngrediente");
const btnGuardar = document.getElementById("btnGuardar");
const btnEliminar = document.getElementById("btnEliminar");
const btnExportar = document.getElementById("btnExportar");
const btnLimpiar = document.getElementById("btnLimpiar");
const btnRecalcular = document.getElementById("btnRecalcular"); // 🔹 asegúrate de tener este botón en tu HTML

const ingredientesDiv = document.getElementById("ingredientes");
const tablaIngredientes = document.getElementById("tablaIngredientes");
const sumGramsEl = document.getElementById("sumGrams");

let ingredientes = [];
let recetaIdActual = null;

// --- Función: recalcular pesos (panadería real) ---
function calcularPesos() {
  const pesoTotal = parseFloat(pesoTotalInput.value) || 0;
  tablaIngredientes.innerHTML = "";

  if (!ingredientes.length || pesoTotal <= 0) {
    sumGramsEl.textContent = "0 g";
    return;
  }

  const sumPerc = ingredientes.reduce((acc, ing) => acc + (parseFloat(ing.porcentaje) || 0), 0);
  if (sumPerc <= 0) {
    sumGramsEl.textContent = "0 g";
    return;
  }

  // Harina base proporcional
  const flourWeight = (pesoTotal * 100) / sumPerc;

  // Calcular gramos crudos
  ingredientes.forEach(ing => {
    ing._raw = (parseFloat(ing.porcentaje) || 0) / 100 * flourWeight;
  });

  // Redondear y ajustar
  let totalRounded = 0;
  ingredientes.forEach(ing => {
    ing._grams = Math.round(ing._raw);
    totalRounded += ing._grams;
  });

  const delta = Math.round(pesoTotal) - totalRounded;
  if (delta !== 0) {
    let flourIdx = ingredientes.findIndex(it => Math.abs(it.porcentaje - 100) < 1e-6);
    if (flourIdx === -1) {
      let maxPerc = -Infinity, idx = 0;
      ingredientes.forEach((it,i) => {
        if (it.porcentaje > maxPerc) { maxPerc = it.porcentaje; idx=i; }
      });
      flourIdx = idx;
    }
    ingredientes[flourIdx]._grams += delta;
    totalRounded += delta;
  }

  // Render tabla
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
}

// --- Añadir ingrediente ---
function addIngredient(nombre = "Ingrediente", porcentaje = 0) {
  ingredientes.push({ nombre, porcentaje });
  renderIngredientes();
}

// --- Renderizar ingredientes en inputs ---
function renderIngredientes() {
  ingredientesDiv.innerHTML = "";
  ingredientes.forEach((ing, idx) => {
    const div = document.createElement("div");
    div.className = "row";
    div.innerHTML = `
      <input type="text" value="${ing.nombre}" data-idx="${idx}" class="nombreIng">
      <input type="number" value="${ing.porcentaje}" data-idx="${idx}" class="pctIng">
    `;
    ingredientesDiv.appendChild(div);
  });
  calcularPesos();
}

// --- Guardar receta ---
async function guardarReceta() {
  const receta = {
    nombre: nombreRecetaInput.value,
    pesoTotal: Number(pesoTotalInput.value),
    instrAmasado: instrAmasadoInput.value,
    instrHorneado: instrHorneadoInput.value,
    ingredientes
  };

  if (recetaIdActual) {
    await setDoc(doc(db, "recetas", recetaIdActual), receta);
  } else {
    await addDoc(collection(db, "recetas"), receta);
  }

  await cargarRecetas();
}

// --- Cargar lista de recetas ---
async function cargarRecetas() {
  recetaSelect.innerHTML = `<option value="">-- Selecciona una receta --</option>`;
  const snapshot = await getDocs(collection(db, "recetas"));
  snapshot.forEach(docSnap => {
    const opt = document.createElement("option");
    opt.value = docSnap.id;
    opt.textContent = docSnap.data().nombre;
    recetaSelect.appendChild(opt);
  });
}

// --- Cargar receta ---
async function cargarReceta(id) {
  if (!id) return;
  const docSnap = await getDoc(doc(db, "recetas", id));
  if (docSnap.exists()) {
    const data = docSnap.data();
    nombreRecetaInput.value = data.nombre;
    pesoTotalInput.value = data.pesoTotal;
    instrAmasadoInput.value = data.instrAmasado || "";
    instrHorneadoInput.value = data.instrHorneado || "";
    ingredientes = data.ingredientes || [];
    recetaIdActual = id;
    renderIngredientes();
  }
}

// --- Eliminar receta ---
async function eliminarReceta() {
  if (!recetaIdActual) return;
  await deleteDoc(doc(db, "recetas", recetaIdActual));
  recetaIdActual = null;
  limpiarFormulario();
  await cargarRecetas();
}

// --- Limpiar formulario ---
function limpiarFormulario() {
  nombreRecetaInput.value = "";
  pesoTotalInput.value = 1000;
  instrAmasadoInput.value = "";
  instrHorneadoInput.value = "";
  ingredientes = [];
  recetaIdActual = null;
  renderIngredientes();
}

// --- Exportar PDF ---
function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text(nombreRecetaInput.value || "Receta sin nombre", 14, 20);

  doc.setFontSize(12);
  doc.text("Instrucciones:", 14, 35);
  doc.setFontSize(10);

  const instrucciones = 
    `Amasado / Fermentación:\n${instrAmasadoInput.value || "—"}\n\n` +
    `Horneado:\n${instrHorneadoInput.value || "—"}`;
  doc.text(instrucciones, 14, 42, { maxWidth: 180 });

  // 🔹 Usar los mismos gramos que la tabla en pantalla
  const body = ingredientes.map(i => [
    i.nombre,
    (parseFloat(i.porcentaje) || 0).toFixed(2) + "%",
    (i._grams || 0) + " g"
  ]);

  doc.autoTable({
    startY: 80,
    head: [["Ingrediente", "% Panadero", "Peso (g)"]],
    body
  });

  // 🔹 Total igual a la tabla
  const total = ingredientes.reduce((acc, i) => acc + (i._grams || 0), 0);
  doc.setFontSize(12);
  doc.text(`Total: ${total} g`, 14, doc.lastAutoTable.finalY + 10);

  doc.save((nombreRecetaInput.value || "receta") + ".pdf");
}

// --- Eventos ---
btnAgregarIngrediente.addEventListener("click", () => addIngredient());
btnGuardar.addEventListener("click", guardarReceta);
btnEliminar.addEventListener("click", eliminarReceta);
btnExportar.addEventListener("click", exportarPDF);
btnLimpiar.addEventListener("click", limpiarFormulario);
recetaSelect.addEventListener("change", e => cargarReceta(e.target.value));
btnRecalcular.addEventListener("click", calcularPesos); // 🔹 FIX del botón

// Inicializar
cargarRecetas();
