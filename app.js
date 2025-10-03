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
const btnRecalcular = document.getElementById("btnRecalcular");

const ingredientesDiv = document.getElementById("ingredientes");
const tablaIngredientes = document.getElementById("tablaIngredientes");
const sumGramsEl = document.getElementById("sumGrams");

let ingredientes = [];
let recetaIdActual = null;

// --- Función: recalcular pesos ---
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

  const flourWeight = (pesoTotal * 100) / sumPerc;

  ingredientes.forEach(ing => {
    ing._raw = (parseFloat(ing.porcentaje) || 0) / 100 * flourWeight;
  });

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
      ingredientes.forEach((it, i) => {
        if (it.porcentaje > maxPerc) { maxPerc = it.porcentaje; idx = i; }
      });
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
}

// --- Añadir ingrediente ---
function addIngredient(nombre = "Ingrediente", porcentaje = 0) {
  ingredientes.push({ nombre, porcentaje });
  renderIngredientes();
}

// --- Renderizar ingredientes ---
function renderIngredientes() {
  ingredientesDiv.innerHTML = "";
  ingredientes.forEach((ing, idx) => {
    const div = document.createElement("div");
    div.className = "row";
    div.innerHTML = `
      <input type="text" value="${ing.nombre}" data-idx="${idx}" class="nombreIng">
      <input type="number" value="${ing.porcentaje}" data-idx="${idx}" class="pctIng">
      <button class="btnEliminarIng" data-idx="${idx}">❌</button>
    `;
    ingredientesDiv.appendChild(div);
  });

  // --- Listeners ---
  document.querySelectorAll(".nombreIng").forEach(inp => {
    inp.addEventListener("input", e => {
      const idx = e.target.dataset.idx;
      ingredientes[idx].nombre = e.target.value;
      calcularPesos();
    });
  });

  document.querySelectorAll(".pctIng").forEach(inp => {
    inp.addEventListener("input", e => {
      const idx = e.target.dataset.idx;
      ingredientes[idx].porcentaje = parseFloat(e.target.value) || 0;
      calcularPesos();
    });
  });

  document.querySelectorAll(".btnEliminarIng").forEach(btn => {
    btn.addEventListener("click", e => {
      const idx = e.target.dataset.idx;
      ingredientes.splice(idx, 1);
      renderIngredientes();
    });
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
    if (confirm("¿Quieres actualizar la receta existente?")) {
      await setDoc(doc(db, "recetas", recetaIdActual), receta);
      alert("✅ Receta actualizada correctamente");
    } else {
      alert("❌ Operación cancelada");
      return;
    }
  } else {
    await addDoc(collection(db, "recetas"), receta);
    alert("✅ Nueva receta guardada");
  }

  await cargarRecetas();
}

// --- Cargar recetas ---
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
  if (confirm("¿Seguro que deseas eliminar esta receta?")) {
    await deleteDoc(doc(db, "recetas", recetaIdActual));
    recetaIdActual = null;
    limpiarFormulario();
    await cargarRecetas();
    alert("🗑️ Receta eliminada");
  }
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

  // --- Título ---
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(nombreRecetaInput.value || "Receta sin nombre", 14, 20);

  // --- Peso total ---
  if (pesoTotalInput.value) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Peso total: ${pesoTotalInput.value} g`, 14, 30);
  }

  // --- Tabla ingredientes ---
  const body = ingredientes.map(i => [
    i.nombre,
    (parseFloat(i.porcentaje) || 0).toFixed(2) + "%",
    (i._grams || 0) + " g"
  ]);

  doc.autoTable({
    startY: 40,
    head: [["Ingrediente", "% Panadero", "Peso (g)"]],
    body,
    theme: "grid",
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: "bold" },
    bodyStyles: { fontSize: 11 }
  });

  const total = ingredientes.reduce((acc, i) => acc + (i._grams || 0), 0);
  doc.setFontSize(12);
  doc.text(`Total: ${total} g`, 14, doc.lastAutoTable.finalY + 10);

  // --- Instrucciones ---
  let y = doc.lastAutoTable.finalY + 25;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Instrucciones:\n", 14, y);

  doc.setFont("helvetica", "normal");
  const instrucciones =
    `Amasado / Fermentación:\n${instrAmasadoInput.value || "—"}\n\n` +
    `Horneado:\n${instrHorneadoInput.value || "—"}`;

  const lineas = doc.splitTextToSize(instrucciones, 180);

  lineas.forEach(linea => {
    if (y > 270) { // salto de página si se pasa
      doc.addPage();
      y = 20;
    }
    doc.text(linea, 14, y);
    y += 7;
  });

  doc.save((nombreRecetaInput.value || "receta") + ".pdf");
}

// --- Eventos ---
btnAgregarIngrediente.addEventListener("click", () => addIngredient());
btnGuardar.addEventListener("click", guardarReceta);
btnEliminar.addEventListener("click", eliminarReceta);
btnExportar.addEventListener("click", exportarPDF);
btnLimpiar.addEventListener("click", limpiarFormulario);
recetaSelect.addEventListener("change", e => cargarReceta(e.target.value));
btnRecalcular.addEventListener("click", calcularPesos);

// Inicializar
cargarRecetas();
