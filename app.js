// ==================== Firebase ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs,
  updateDoc, deleteDoc, doc, getDoc, setDoc,
  serverTimestamp, arrayUnion
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

// Sign in anonymously by default
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
const pesoMultiplierInput = document.getElementById("pesoMultiplier");

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

const statHydration = document.getElementById("statHydration");
const statStarterPct = document.getElementById("statStarterPct");
const statSaltPct = document.getElementById("statSaltPct");
const statPesoEfectivo = document.getElementById("statPesoEfectivo");
const compoChartEl = document.getElementById("compoChart");

const searchRecetas = document.getElementById("searchRecetas");
const sortField = document.getElementById("sortField");
const btnSortToggle = document.getElementById("btnSortToggle");
const btnDuplicar = document.getElementById("btnDuplicar");
const btnExportCSV = document.getElementById("btnExportCSV");
const btnSigninGoogle = document.getElementById("btnSigninGoogle");
const btnToggleTheme = document.getElementById("btnToggleTheme");
const btnInstallPWA = document.getElementById("btnInstallPWA");

let ingredientes = [];
let recetaIdActual = null;
let isEditMode = true; // Inicia en edición para nuevas recetas

// Data cache for recipes with metadata loaded from Firestore
let recetasCache = []; // { id, data }

// Sort order: true = ascending, false = descending
let sortAsc = true;

// Chart variable
let compoChart = null;

// ---------------- Utilities ----------------
function getEffectivePesoTotal() {
  const base = parseFloat(pesoTotalInput.value) || 0;
  const mult = parseFloat(pesoMultiplierInput.value) || 1;
  return base * mult;
}

// Heurística simple para detectar harina / agua / sal / starter por nombre (case-insensitive)
function classifyIngredientName(name = "") {
  const n = (name || "").toLowerCase();
  if (n.includes("harina") || n.includes("flour") || n.includes("integral") || n.includes("whole")) return "flour";
  if (n.includes("agua") || n.includes("water") || n.includes("agua mineral")) return "water";
  if (n.includes("sal")) return "salt";
  if (n.includes("starter") || n.includes("masa") || n.includes("sourdough") || n.includes("levain") || n.includes("masa madre")) return "starter";
  if (n.includes("levadura") || n.includes("yeast")) return "yeast";
  return "other";
}

// ------------------- CÁLCULOS Y RENDER -------------------

// --- Función: recalcular pesos ---
function calcularPesos() {
  const pesoTotalEfectivo = getEffectivePesoTotal();
  tablaIngredientes.innerHTML = "";

  if (!ingredientes.length || pesoTotalEfectivo <= 0) {
    sumGramsEl.textContent = "0 g";
    actualizarStats(); // limpiar
    return;
  }

  const sumPerc = ingredientes.reduce((acc, ing) => acc + (parseFloat(ing.porcentaje) || 0), 0);
  if (sumPerc <= 0) {
    sumGramsEl.textContent = "0 g";
    actualizarStats();
    return;
  }

  const flourWeight = (pesoTotalEfectivo * 100) / sumPerc;

  ingredientes.forEach(ing => {
    ing._raw = (parseFloat(ing.porcentaje) || 0) / 100 * flourWeight;
  });

  let totalRounded = 0;
  ingredientes.forEach(ing => {
    ing._grams = Math.round(ing._raw);
    totalRounded += ing._grams;
  });

  const delta = Math.round(pesoTotalEfectivo) - totalRounded;
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

  // actualizar estadísticas y gráfico
  actualizarStats();
}

// Actualiza las estadísticas técnicas (hidratación, starter, sal)
function actualizarStats() {
  // asegurarse de tener _grams calculados
  const totalPeso = ingredientes.reduce((s, it) => s + (it._grams || 0), 0);

  let flourW = 0, waterW = 0, starterW = 0, saltW = 0;
  ingredientes.forEach(it => {
    const cls = classifyIngredientName(it.nombre);
    const grams = it._grams || 0;
    if (cls === "flour") flourW += grams;
    else if (cls === "water") waterW += grams;
    else if (cls === "starter") starterW += grams;
    else if (cls === "salt") saltW += grams;
    else {
      // intentar nombres conteniendo agua/harina/sal etc.
      if (/agua|water/i.test(it.nombre)) waterW += grams;
      if (/harina|flour/i.test(it.nombre)) flourW += grams;
      if (/sal/i.test(it.nombre)) saltW += grams;
    }
  });

  // Hidratación: water / flour * 100
  let hydrationPct = (flourW > 0) ? (waterW / flourW) * 100 : NaN;
  statHydration.textContent = isFinite(hydrationPct) ? hydrationPct.toFixed(1) + "%" : "—";

  // Starter porcentaje respecto al total de masa efectiva
  const pesoEfectivo = getEffectivePesoTotal();
  const starterPct = pesoEfectivo > 0 ? (starterW / pesoEfectivo) * 100 : NaN;
  statStarterPct.textContent = isFinite(starterPct) ? starterPct.toFixed(2) + "%" : "—";

  // Salinidad estimada: sal / flour * 100 (como % de harina) -> convertir a % sobre total masa aproxim.
  const salSobreHarina = flourW > 0 ? (saltW / flourW) * 100 : NaN;
  statSaltPct.textContent = isFinite(salSobreHarina) ? salSobreHarina.toFixed(2) + "% (sobre harina)" : "—";

  statPesoEfectivo.textContent = Math.round(pesoEfectivo) + " g";

  // Construir datos para el gráfico: Harina / Agua / Sal / Starter / Otros (en gramos)
  const otros = Math.max(0, totalPeso - (flourW + waterW + saltW + starterW));
  const labels = ["Harina", "Agua", "Sal", "Starter", "Otros"];
  const data = [flourW, waterW, saltW, starterW, otros];

  renderCompoChart(labels, data);
}

// Renderizar gráfico (dona)
function renderCompoChart(labels, data) {
  if (compoChart) {
    compoChart.data.labels = labels;
    compoChart.data.datasets[0].data = data;
    compoChart.update();
    return;
  }
  compoChart = new Chart(compoChartEl.getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        /* dejar colores por defecto (no forzamos colores) */
      }]
    },
    options: {
      plugins: {
        legend: { position: "bottom" }
      }
    }
  });
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
// Ahora guarda createdAt/updatedAt y versiones (historial)
async function guardarReceta() {
  const receta = {
    nombre: nombreRecetaContainer.dataset.value,
    pesoTotal: Number(pesoTotalInput.value),
    pesoMultiplier: Number(pesoMultiplierInput.value) || 1,
    instrAmasado: instrAmasadoContainer.dataset.value,
    instrHorneado: instrHorneadoContainer.dataset.value,
    ingredientes,
    updatedAt: serverTimestamp()
  };

  if (recetaIdActual) {
    if (confirm("¿Quieres actualizar la receta existente?")) {
      try {
        // Antes de sobrescribir, obtenemos versión actual para guardar en historial
        const docRef = doc(db, "recetas", recetaIdActual);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          const dataPrev = snapshot.data();
          // crear un objeto de versión básico
          const versionObj = {
            savedAt: dataPrev.updatedAt || dataPrev.createdAt || serverTimestamp(),
            snapshot: {
              nombre: dataPrev.nombre,
              pesoTotal: dataPrev.pesoTotal,
              pesoMultiplier: dataPrev.pesoMultiplier || 1,
              instrAmasado: dataPrev.instrAmasado,
              instrHorneado: dataPrev.instrHorneado,
              ingredientes: dataPrev.ingredientes
            }
          };
          // agregar versión al array 'versions' usando arrayUnion
          await updateDoc(docRef, {
            versions: arrayUnion(versionObj)
          });
        }
        // ahora actualizar con nuevo contenido (setDoc sobrescribe, usamos setDoc con merge true)
        await setDoc(doc(db, "recetas", recetaIdActual), { ...receta }, { merge: true });
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
      const newRef = await addDoc(collection(db, "recetas"), {
        ...receta,
        createdAt: serverTimestamp(),
        versions: []
      });
      alert("✅ Nueva receta guardada");
      recetaIdActual = newRef.id;
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
  recetaSelect.innerHTML = `<option value="">-- Agregar una receta ➕🥐 --</option>`;
  recetasCache = [];
  try {
    const snapshot = await getDocs(collection(db, "recetas"));
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      recetasCache.push({ id: docSnap.id, data });
      const opt = document.createElement("option");
      opt.value = docSnap.id;
      opt.textContent = data.nombre || "Receta sin nombre";
      recetaSelect.appendChild(opt);
      console.log("Added recipe to dropdown:", docSnap.id, docSnap.data().nombre);
    });
    console.log("Recipes loaded successfully, count:", snapshot.size);
    applySearchSortRender();
  } catch (error) {
    console.error("Error loading recipes:", error);
    alert("❌ Error al cargar las recetas");
  }
}

// Apply search and sorting, then render the select options
function applySearchSortRender() {
  // filtrado
  const q = (searchRecetas.value || "").toLowerCase().trim();
  let results = recetasCache.filter(r => {
    if (!q) return true;
    const n = (r.data.nombre || "").toLowerCase();
    const ingreds = (r.data.ingredientes || []).map(i => (i.nombre||"").toLowerCase()).join(" ");
    return n.includes(q) || ingreds.includes(q);
  });

  // ordenar
  const field = sortField.value || "nombre";
  results.sort((a,b) => {
    let va = a.data[field];
    let vb = b.data[field];
    // si son timestamps (Firestore), van a ser objetos; convertir a número si es posible
    if (va && typeof va.toMillis === "function") va = va.toMillis();
    if (vb && typeof vb.toMillis === "function") vb = vb.toMillis();
    if (field === "nombre") {
      va = (va || "").toLowerCase();
      vb = (vb || "").toLowerCase();
    }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  // render select
  recetaSelect.innerHTML = `<option value="">-- Agregar una receta ➕🥐 --</option>`;
  results.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.data.nombre || "Receta sin nombre";
    recetaSelect.appendChild(opt);
  });
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
      pesoMultiplierInput.value = data.pesoMultiplier || 1;
      instrAmasadoContainer.dataset.value = data.instrAmasado || "";
      instrHorneadoContainer.dataset.value = data.instrHorneado || "";
      ingredientes = (data.ingredientes || []).map(it => ({ ...it })); // clone
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

// --- Duplicar receta ---
async function duplicarReceta() {
  if (!recetaIdActual) {
    alert("Selecciona una receta existente para duplicar.");
    return;
  }
  try {
    const docRef = doc(db, "recetas", recetaIdActual);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) {
      alert("La receta ya no existe.");
      return;
    }
    const data = snapshot.data();
    // Modificar nombre para indicar copia
    const nameCopy = (data.nombre || "Receta") + " (copia)";
    const newData = {
      ...data,
      nombre: nameCopy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      versions: []
    };
    // remover id si existe
    delete newData.id;
    const newRef = await addDoc(collection(db, "recetas"), newData);
    alert("✅ Receta duplicada: " + nameCopy);
    await cargarRecetas();
    // seleccionar la nueva receta
    recetaSelect.value = newRef.id;
    cargarReceta(newRef.id);
    isEditMode = true; // abrir para edición por si quieren ajustar
    renderAll();
  } catch (err) {
    console.error("Error duplicating:", err);
    alert("❌ Error al duplicar la receta");
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
  pesoMultiplierInput.value = 1;
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
    doc.text(`Peso total de la masa: ${pesoTotalInput.value} g (×${(pesoMultiplierInput.value||1)})`, 14, 30);
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

// --- Exportar CSV (simple) ---
function exportarCSV() {
  const rows = [
    ["Ingrediente", "% Panadero", "Peso (g)"],
    ...ingredientes.map(i => [i.nombre, (parseFloat(i.porcentaje)||0).toFixed(2), (i._grams||0)])
  ];
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (nombreRecetaContainer.dataset.value || "receta") + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
pesoMultiplierInput.addEventListener("input", () => {
  calcularPesos();
});
recetaSelect.addEventListener("change", (e) => {
  console.log("recetaSelect changed, value:", e.target.value);
  cargarReceta(e.target.value);
});
searchRecetas.addEventListener("input", () => applySearchSortRender());
sortField.addEventListener("change", () => applySearchSortRender());
btnSortToggle.addEventListener("click", () => {
  sortAsc = !sortAsc;
  btnSortToggle.classList.toggle("active", sortAsc);
  applySearchSortRender();
});
btnDuplicar.addEventListener("click", duplicarReceta);
btnExportCSV.addEventListener("click", exportarCSV);

// Google sign-in (opcional): sincroniza con cuenta Google
btnSigninGoogle.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    console.log("Signed in with Google:", result.user.email);
    alert("Sesión iniciada como: " + result.user.email);
  } catch (err) {
    console.error("Google sign-in error:", err);
    alert("Error al iniciar sesión con Google.");
  }
});

// Theme toggle (dark/light)
function applySavedTheme() {
  const t = localStorage.getItem("fermentapro_theme") || "light";
  if (t === "dark") document.body.classList.add("dark");
  else document.body.classList.remove("dark");
}
btnToggleTheme.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  const now = document.body.classList.contains("dark") ? "dark" : "light";
  localStorage.setItem("fermentapro_theme", now);
});
applySavedTheme();

// PWA: instalar handler (prompt)
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  btnInstallPWA.style.display = 'inline-flex';
});
btnInstallPWA.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    console.log('User choice', choice);
    deferredPrompt = null;
  } else {
    alert("La instalación PWA no está disponible en este navegador/contexto.");
  }
});

// Service Worker (se registra desde Blob para no necesitar archivo externo)
if ('serviceWorker' in navigator) {
  const swCode = `
    const CACHE_NAME = 'fermentapro-v1';
    const toCache = [ '/', '/index.html' ];
    self.addEventListener('install', (e) => {
      self.skipWaiting();
      e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(toCache))
      );
    });
    self.addEventListener('activate', (e) => {
      e.waitUntil(self.clients.claim());
    });
    self.addEventListener('fetch', (e) => {
      e.respondWith(
        caches.match(e.request).then(resp => resp || fetch(e.request))
      );
    });
  `;
  const blob = new Blob([swCode], { type: 'application/javascript' });
  const swUrl = URL.createObjectURL(blob);
  navigator.serviceWorker.register(swUrl).then(() => {
    console.log("Service worker registrado (Blob) — PWA básico listo.");
  }).catch(err => console.warn("SW registro falló:", err));
}

// Inicializar
cargarRecetas();
limpiarFormulario(); // Inicia en modo edición vacía
