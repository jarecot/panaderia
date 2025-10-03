
// ==================== Firebase ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs,
  updateDoc, deleteDoc, doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
const auth = getAuth(app);

// Sign in anonymously
signInAnonymously(auth)
  .then(userCredential => {
    console.log("Signed in anonymously:", userCredential.user.uid);
  })
  .catch(error => {
    console.error("Anonymous auth error:", error);
    alert("Error al autenticar usuario");
  });

// --- Elementos del DOM ---
const recetaSelect = document.getElementById("recetaSelect");
const nombreRecetaContainer = document.getElementById("nombreRecetaContainer");
const instrAmasadoContainer = document.getElementById("instrAmasadoContainer");
const instrHorneadoContainer = document.getElementById("instrHorneadoContainer");
const pesoTotalInput = document.getElementById("pesoTotal");

const btnAgregarIngrediente = document.getElementById("btnAgregarIngrediente");
const btnGuardar = document.getElementById("btnGuardar");
const btnEliminar = document.getElementById("btnEliminar");
const btnEditar = document.getElementById("btnEditar");
const btnExportar = document.getElementById("btnExportar");
const btnLimpiar = document.getElementById("btnLimpiar");
const btnRecalcular = document.getElementById("btnRecalcular");
const btnCancelarEdicion = document.getElementById("btnCancelarEdicion");
const ingredientesSection = document.getElementById("ingredientesSection");

const ingredientesDiv = document.getElementById("ingredientes");
const tablaIngredientes = document.getElementById("tablaIngredientes");
const sumGramsEl = document.getElementById("sumGrams");

let ingredientes = [];
let recetaIdActual = null;
let isEditMode = true; // Inicia en edición para nuevas recetas

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
  renderAll();
}

// --- Renderizar todo basado en modo ---
function renderAll() {
  console.log("Rendering all, isEditMode:", isEditMode, "recetaIdActual:", recetaIdActual);
  renderNombre();
  renderInstrucciones();
  renderIngredientes();
  toggleEditElements();
  calcularPesos();
}

// --- Renderizar nombre ---
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
    });
    nombreRecetaContainer.appendChild(input);
  } else {
    const h2 = document.createElement("h2");
    h2.textContent = nombreRecetaContainer.dataset.value || "Receta sin nombre";
    nombreRecetaContainer.appendChild(h2);
  }
  console.log("Rendered nombre:", nombreRecetaContainer.dataset.value);
}

// --- Renderizar instrucciones ---
function renderInstrucciones() {
  // Amasado
  instrAmasadoContainer.innerHTML = "<label for='instrAmasado'>Amasado / Fermentación</label>";
  if (isEditMode) {
    const textarea = document.createElement("textarea");
    textarea.id = "instrAmasado";
    textarea.rows = 3;
    textarea.value = instrAmasadoContainer.dataset.value || "";
    textarea.addEventListener("input", (e) => {
      instrAmasadoContainer.dataset.value = e.target.value;
    });
    instrAmasadoContainer.appendChild(textarea);
  } else {
    const p = document.createElement("p");
    p.textContent = instrAmasadoContainer.dataset.value || "—";
    instrAmasadoContainer.appendChild(p);
  }
  console.log("Rendered instrAmasado:", instrAmasadoContainer.dataset.value);

  // Horneado
  instrHorneadoContainer.innerHTML = "<label for='instrHorneado'>Horneado</label>";
  if (isEditMode) {
    const textarea = document.createElement("textarea");
    textarea.id = "instrHorneado";
    textarea.rows = 2;
    textarea.value = instrHorneadoContainer.dataset.value || "";
    textarea.addEventListener("input", (e) => {
      instrHorneadoContainer.dataset.value = e.target.value;
    });
    instrHorneadoContainer.appendChild(textarea);
  } else {
    const p = document.createElement("p");
    p.textContent = instrHorneadoContainer.dataset.value || "—";
    instrHorneadoContainer.appendChild(p);
  }
  console.log("Rendered instrHorneado:", instrHorneadoContainer.dataset.value);
}

// --- Renderizar ingredientes ---
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

    // Listeners para edición
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
  }
  console.log("Rendered ingredientes:", ingredientes);
}

// --- Toggle elementos de edición ---
function toggleEditElements() {
  btnGuardar.style.display = isEditMode ? "flex" : "none";
  btnCancelarEdicion.style.display = isEditMode ? "flex" : "none";
  ingredientesSection.style.display = isEditMode ? "block" : "none";
  btnEditar.style.display = (recetaIdActual && !isEditMode) ? "flex" : "none";
  btnEliminar.style.display = recetaIdActual ? "flex" : "none";
  console.log("Toggled edit elements, isEditMode:", isEditMode);
}

// --- Cancelar edición ---
async function cancelarEdicion() {
  if (recetaIdActual) {
    // Recargar la receta desde Firestore para restaurar datos originales
    await cargarReceta(recetaIdActual);
  } else {
    // Si es una receta nueva, limpiar el formulario
    limpiarFormulario();
  }
  isEditMode = false;
  renderAll();
}

// --- Guardar receta ---
async function guardarReceta() {
  const receta = {
    nombre: nombreRecetaContainer.dataset.value,
    pesoTotal: Number(pesoTotalInput.value),
    instrAmasado: instrAmasadoContainer.dataset.value,
    instrHorneado: instrHorneadoContainer.dataset.value,
    ingredientes
  };

  if (recetaIdActual) {
    if (confirm("¿Quieres actualizar la receta existente?")) {
      try {
        await setDoc(doc(db, "recetas", recetaIdActual), receta);
        alert("✅ Receta actualizada correctamente");
        isEditMode = false; // Salir del modo edición tras guardar
      } catch (error) {
        console.error("Error updating recipe:", error);
        alert("❌ Error al actualizar la receta");
      }
    } else {
      alert("❌ Operación cancelada");
      return;
    }
  } else {
    try {
      await addDoc(collection(db, "recetas"), receta);
      alert("✅ Nueva receta guardada");
      isEditMode = false; // Salir del modo edición tras guardar
    } catch (error) {
      console.error("Error saving new recipe:", error);
      alert("❌ Error al guardar la receta");
    }
  }

  await cargarRecetas();
}

// --- Cargar recetas ---
async function cargarRecetas() {
  console.log("Loading recipes...");
  recetaSelect.innerHTML = `<option value="">-- Agregar una receta o selecciona una del listado --</option>`;
  try {
    const snapshot = await getDocs(collection(db, "recetas"));
    snapshot.forEach(docSnap => {
      const opt = document.createElement("option");
      opt.value = docSnap.id;
      opt.textContent = docSnap.data().nombre || "Receta sin nombre";
      recetaSelect.appendChild(opt);
      console.log("Added recipe to dropdown:", docSnap.id, docSnap.data().nombre);
    });
    console.log("Recipes loaded successfully, count:", snapshot.size);
  } catch (error) {
    console.error("Error loading recipes:", error);
    alert("❌ Error al cargar las recetas");
  }
}

// --- Cargar receta ---
async function cargarReceta(id) {
  console.log("Attempting to load recipe with id:", id);
  if (!id) {
    console.log("No id provided, clearing form");
    limpiarFormulario();
    return;
  }
  try {
    const docSnap = await getDoc(doc(db, "recetas", id));
    if (docSnap.exists()) {
      const data = docSnap.data();
      console.log("Recipe data fetched:", data);
      nombreRecetaContainer.dataset.value = data.nombre || "";
      pesoTotalInput.value = data.pesoTotal || 1000;
      instrAmasadoContainer.dataset.value = data.instrAmasado || "";
      instrHorneadoContainer.dataset.value = data.instrHorneado || "";
      ingredientes = data.ingredientes || [];
      recetaIdActual = id;
      isEditMode = false; // Carga en modo vista
      renderAll();
      console.log("Recipe loaded successfully, id:", id);
    } else {
      console.error("No such document for id:", id);
      alert("❌ La receta no existe");
      limpiarFormulario();
    }
  } catch (error) {
    console.error("Error loading recipe:", error);
    alert("❌ Error al cargar la receta");
  }
}

// --- Eliminar receta ---
async function eliminarReceta() {
  if (!recetaIdActual) return;
  if (confirm("¿Seguro que deseas eliminar esta receta?")) {
    try {
      await deleteDoc(doc(db, "recetas", recetaIdActual));
      recetaIdActual = null;
      limpiarFormulario();
      await cargarRecetas();
      alert("🗑️ Receta eliminada");
    } catch (error) {
      console.error("Error deleting recipe:", error);
      alert("❌ Error al eliminar la receta");
    }
  }
}

// --- Limpiar formulario ---
function limpiarFormulario() {
  console.log("Clearing form");
  nombreRecetaContainer.dataset.value = "";
  pesoTotalInput.value = 1000;
  instrAmasadoContainer.dataset.value = "";
  instrHorneadoContainer.dataset.value = "";
  ingredientes = [];
  recetaIdActual = null;
  isEditMode = true; // Modo edición para nueva
  renderAll();
}

// --- Exportar PDF ---
function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // --- Título ---
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(nombreRecetaContainer.dataset.value || "Receta sin nombre", 14, 20);

  // --- Peso total ---
  if (pesoTotalInput.value) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Peso total de la masa: ${pesoTotalInput.value} g`, 14, 30);
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

  // --- Instrucciones ---
  let y = doc.lastAutoTable.finalY + 25;

  // Título de sección
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Instrucciones", 14, y);

  y += 10; // espacio después del título

  // Subtítulo Amasado/Fermentación
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Amasado / Fermentación:", 14, y);

  y += 8;
  doc.setFont("helvetica", "normal");
  const amasado = instrAmasadoContainer.dataset.value || "—";
  const lineasAmasado = doc.splitTextToSize(amasado, 180);

  lineasAmasado.forEach(linea => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.text(linea, 14, y);
    y += 7;
  });

  // Subtítulo Horneado
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Horneado:", 14, y);

  y += 8;
  doc.setFont("helvetica", "normal");
  const horneado = instrHorneadoContainer.dataset.value || "—";
  const lineasHorneado = doc.splitTextToSize(horneado, 180);

  lineasHorneado.forEach(linea => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.text(linea, 14, y);
    y += 7;
  });

  // Guardar PDF
  doc.save((nombreRecetaContainer.dataset.value || "receta") + ".pdf");
}

// --- Eventos ---
btnAgregarIngrediente.addEventListener("click", () => addIngredient());
btnGuardar.addEventListener("click", guardarReceta);
btnEliminar.addEventListener("click", eliminarReceta);
btnEditar.addEventListener("click", () => {
  isEditMode = true;
  renderAll();
});
btnExportar.addEventListener("click", exportarPDF);
btnLimpiar.addEventListener("click", limpiarFormulario);
btnRecalcular.addEventListener("click", () => {
  calcularPesos();
  tablaIngredientes.scrollIntoView({ behavior: "smooth" });
});
btnCancelarEdicion.addEventListener("click", cancelarEdicion);
pesoTotalInput.addEventListener("input", () => {
  calcularPesos();
});
recetaSelect.addEventListener("change", (e) => {
  console.log("recetaSelect changed, value:", e.target.value);
  cargarReceta(e.target.value);
});

// Inicializar
cargarRecetas();
limpiarFormulario(); // Inicia en modo edición vacía
