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

const ingredientesDiv = document.getElementById("ingredientes");
const tablaIngredientes = document.getElementById("tablaIngredientes");
const sumGramsEl = document.getElementById("sumGrams");

let ingredientes = [];
let recetaIdActual = null;

// --- Función: recalcular pesos ---
function calcularPesos() {
  const pesoTotal = Number(pesoTotalInput.value) || 0;
  let suma = 0;

  tablaIngredientes.innerHTML = "";
  ingredientes.forEach((ing, idx) => {
    const gramos = ((ing.porcentaje / 100) * pesoTotal).toFixed(1);
    suma += Number(gramos);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${ing.nombre}</td>
      <td>${ing.porcentaje}%</td>
      <td>${gramos}</td>
    `;
    tablaIngredientes.appendChild(row);
  });

  sumGramsEl.textContent = suma.toFixed(1);
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

  // Tabla de ingredientes
  const body = ingredientes.map(i => [
    i.nombre,
    i.porcentaje + "%",
    ((i.porcentaje / 100) * Number(pesoTotalInput.value)).toFixed(1) + " g"
  ]);

  doc.autoTable({
    startY: 80,
    head: [["Ingrediente", "% Panadero", "Peso (g)"]],
    body
  });

  // Total
  let total = ingredientes.reduce((acc, i) => acc + (i.porcentaje / 100) * Number(pesoTotalInput.value), 0);
  doc.setFontSize(12);
  doc.text(`Total: ${total.toFixed(1)} g`, 14, doc.lastAutoTable.finalY + 10);

  doc.save((nombreRecetaInput.value || "receta") + ".pdf");
}

// --- Eventos ---
btnAgregarIngrediente.addEventListener("click", () => addIngredient());
btnGuardar.addEventListener("click", guardarReceta);
btnEliminar.addEventListener("click", eliminarReceta);
btnExportar.addEventListener("click", exportarPDF);
btnLimpiar.addEventListener("click", limpiarFormulario);
recetaSelect.addEventListener("change", e => cargarReceta(e.target.value));

// Inicializar
cargarRecetas();