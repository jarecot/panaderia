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
const statHydrationMilk = document.getElementById("statHydrationMilk");
const statHydrationExtra = document.getElementById("statHydrationExtra");
const statHydrationTotal = document.getElementById("statHydrationTotal");
const statStarterPct = document.getElementById("statStarterPct");
const statSaltPct = document.getElementById("statSaltPct");
const statPesoEfectivo = document.getElementById("statPesoEfectivo");

const starterHydrationInput = document.getElementById("starterHydration");

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

// ---------------- Utilities ----------------
function getEffectivePesoTotal() {
  const base = parseFloat(pesoTotalInput.value) || 0;
  const mult = parseFloat(pesoMultiplierInput.value) || 1;
  return base * mult;
}

// Heurística para detectar categorías por nombre (case-insensitive)
function classifyIngredientName(name = "") {
  const n = (name || "").toLowerCase();
  if (n.includes("harina") || n.includes("flour") || n.includes("integral") || n.includes("whole")) return "flour";
  if (n.includes("agua") || n.includes("water") || n.includes("agua mineral")) return "water";
  if (n.includes("leche") || n.includes("milk")) return "milk";
  if (n.includes("huevo") || n.includes("egg")) return "egg";
  if (n.includes("mantequilla") || n.includes("butter") || n.includes("margarina")) return "butter";
  if (n.includes("yogur") || n.includes("yoghurt") || n.includes("yogurt") || n.includes("crema")) return "yogurt";
  if (n.includes("masa madre") || n.includes("starter") || n.includes("levain") || n.includes("sourdough")) return "starter";
  if (n.includes("sal")) return "salt";
  if (n.includes("levadura") || n.includes("yeast")) return "yeast";
  return "other";
}

// Map de contenido de agua aproximado por ingrediente (fracción)
const WATER_CONTENT = {
  milk: 0.87,
  egg: 0.74,
  butter: 0.16,
  yogurt: 0.80,
};

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

  // actualizar estadísticas (sin gráfico)
  actualizarStats();
}

// Actualiza las estadísticas técnicas (hidratación, starter, sal)
function actualizarStats() {
  // asegurarse de tener _grams calculados
  const totalPeso = ingredientes.reduce((s, it) => s + (it._grams || 0), 0);

  // Sumas base
  let flourW = 0, waterDirectW = 0, milkW = 0, eggW = 0, butterW = 0, yogurtW = 0, starterW = 0, saltW = 0;
  let otrosW = 0;

  ingredientes.forEach(it => {
    const grams = it._grams || 0;
    const cls = classifyIngredientName(it.nombre);
    if (cls === "flour") flourW += grams;
    else if (cls === "water") waterDirectW += grams;
    else if (cls === "milk") milkW += grams;
    else if (cls === "egg") eggW += grams;
    else if (cls === "butter") butterW += grams;
    else if (cls === "yogurt") yogurtW += grams;
    else if (cls === "starter") starterW += grams;
    else if (cls === "salt") saltW += grams;
    else otrosW += grams;
  });

  // Leer hidratación del starter desde input; si no presente, asumir 100%
  const starterHydrationInputVal = parseFloat((starterHydrationInput && starterHydrationInput.value) || 100) || 100;

  // Calcular agua proveniente de starter según hidratación:
  const H = starterHydrationInputVal;
  const starterWater = starterW * (H / (100 + H));
  const starterFlourEquivalent = starterW - starterWater;

  // Agua de otros ingredientes usando WATER_CONTENT estimado
  const milkWater = milkW * (WATER_CONTENT.milk || 0.87);
  const eggWater = eggW * (WATER_CONTENT.egg || 0.74);
  const butterWater = butterW * (WATER_CONTENT.butter || 0.16);
  const yogurtWater = yogurtW * (WATER_CONTENT.yogurt || 0.80);

  // Harina total efectiva (incluye la parte de harina "interna" del starter)
  const harinaTotal = flourW + starterFlourEquivalent;

  // Hidrataciones:
  const aguaDirect = waterDirectW; // agua añadida directamente
  const aguaDesdeOtros = milkWater + eggWater + butterWater + yogurtWater; // aportes líquidos medidos
  const aguaDesdeStarter = starterWater;

  const hidrPrincipal = harinaTotal > 0 ? (aguaDirect / harinaTotal) * 100 : NaN;
  const hidrAdicional = harinaTotal > 0 ? ((aguaDesdeOtros + aguaDesdeStarter) / harinaTotal) * 100 : NaN;
  const hidrTotal = harinaTotal > 0 ? ((aguaDirect + aguaDesdeOtros + aguaDesdeStarter) / harinaTotal) * 100 : NaN;

  // Salinidad (sal / harina *100)
  const salSobreHarina = harinaTotal > 0 ? (saltW / harinaTotal) * 100 : NaN;

  // Starter proporción sobre masa efectiva
  const pesoEfectivo = getEffectivePesoTotal();
  const starterPct = pesoEfectivo > 0 ? (starterW / pesoEfectivo) * 100 : NaN;

  // Actualizar UI (formatos)
  statHydration.textContent = isFinite(hidrPrincipal) ? hidrPrincipal.toFixed(1) + "%" : "—";
  statHydrationMilk.textContent = isFinite((milkWater / (harinaTotal || 1)) * 100) ? ((milkWater / (harinaTotal || 1)) * 100).toFixed(1) + "%" : "—";
  statHydrationExtra.textContent = isFinite((aguaDesdeOtros / (harinaTotal || 1)) * 100) ? ((aguaDesdeOtros / (harinaTotal || 1)) * 100).toFixed(1) + "%" : "—";
  statHydrationTotal.textContent = isFinite(hidrTotal) ? hidrTotal.toFixed(1) + "%" : "—";
  statSaltPct.textContent = isFinite(salSobreHarina) ? salSobreHarina.toFixed(2) + "% (sobre harina)" : "—";
  statPesoEfectivo.textContent = Math.round(pesoEfectivo) + " g";
  statStarterPct.textContent = isFinite(starterPct) ? starterPct.toFixed(2) + "%" : "—";
}

// --- Añadir ingrediente ---
function addIngredient(nombre = "Ingrediente", porcentaje = 0) {
  ingredientes.push({ nombre, porcentaje });
  renderAll();
}

// --- Renderizar todo basado en modo ---
function renderAll() {
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
}

// --- Renderizar instrucciones ---
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
  } else {
    // Vista: mostrar lista
    const ul = document.createElement("ul");
    ul.className = "view-ingredientes-list";
    (ingredientes || []).forEach(ing => {
      const li = document.createElement("li");
      li.textContent = `${ing.nombre} — ${(parseFloat(ing.porcentaje)||0).toFixed(2)}% — ${(ing._grams||0)} g`;
      ul.appendChild(li);
    });
    ingredientesDiv.appendChild(ul);
  }
}

// --- Toggle elementos de edición ---
function toggleEditElements() {
  btnGuardar.style.display = isEditMode ? "flex" : "none";
  btnCancelarEdicion.style.display = isEditMode ? "flex" : "none";
  ingredientesSection.style.display = isEditMode ? "block" : "none";
  btnEditar.style.display = (recetaIdActual && !isEditMode) ? "flex" : "none";
  btnEliminar.style.display = recetaIdActual ? "flex" : "none";
}

// --- Cancelar edición ---
async function cancelarEdicion() {
  if (recetaIdActual) {
    await cargarReceta(recetaIdActual);
  } else {
    limpiarFormulario();
  }
  isEditMode = false;
  renderAll();
}

// --- Guardar receta ---
// Guarda createdAt/updatedAt y versiones (historial)
async function guardarReceta() {
  const receta = {
    nombre: nombreRecetaContainer.dataset.value,
    pesoTotal: Number(pesoTotalInput.value),
    pesoMultiplier: Number(pesoMultiplierInput.value) || 1,
    starterHidratacion: Number((starterHydrationInput && starterHydrationInput.value) || 100),
    instrAmasado: instrAmasadoContainer.dataset.value,
    instrHorneado: instrHorneadoContainer.dataset.value,
    ingredientes,
    updatedAt: serverTimestamp()
  };

  if (recetaIdActual) {
    if (confirm("¿Quieres actualizar la receta existente?")) {
      try {
        const docRef = doc(db, "recetas", recetaIdActual);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          const dataPrev = snapshot.data();
          const versionObj = {
            savedAt: dataPrev.updatedAt || dataPrev.createdAt || serverTimestamp(),
            snapshot: {
              nombre: dataPrev.nombre,
              pesoTotal: dataPrev.pesoTotal,
              pesoMultiplier: dataPrev.pesoMultiplier || 1,
              starterHidratacion: dataPrev.starterHidratacion || 100,
              instrAmasado: dataPrev.instrAmasado,
              instrHorneado: dataPrev.instrHorneado,
              ingredientes: dataPrev.ingredientes
            }
          };
          await updateDoc(docRef, { versions: arrayUnion(versionObj) });
        }
        await setDoc(doc(db, "recetas", recetaIdActual), { ...receta }, { merge: true });
        alert("✅ Receta actualizada correctamente");
        isEditMode = false;
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
      isEditMode = false;
    } catch (error) {
      console.error("Error saving new recipe:", error);
      alert("❌ Error al guardar la receta");
    }
  }

  await cargarRecetas();
}

// --- Cargar recetas ---
async function cargarRecetas() {
  recetaSelect.innerHTML = `<option value="">-- Agregar una receta ➕🥐 --</option>`;
  recetasCache = [];
  try {
    const snapshot = await getDocs(collection(db, "recetas"));
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      recetasCache.push({ id: docSnap.id, data });
    });
    applySearchSortRender();
  } catch (error) {
    console.error("Error loading recipes:", error);
    alert("❌ Error al cargar las recetas");
  }
}

// Apply search and sorting, then render the select options
function applySearchSortRender() {
  const q = (searchRecetas.value || "").toLowerCase().trim();
  let results = recetasCache.filter(r => {
    if (!q) return true;
    const n = (r.data.nombre || "").toLowerCase();
    const ingreds = (r.data.ingredientes || []).map(i => (i.nombre||"").toLowerCase()).join(" ");
    return n.includes(q) || ingreds.includes(q);
  });

  const field = sortField.value || "nombre";
  results.sort((a,b) => {
    let va = a.data[field];
    let vb = b.data[field];
    if (va && typeof va.toMillis === "function") va = va.toMillis();
    if (vb && typeof vb.toMillis === "function") vb = vb.toMillis();
    if (field === "nombre") { va = (va || "").toLowerCase(); vb = (vb || "").toLowerCase(); }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

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
  if (!id) { limpiarFormulario(); return; }
  try {
    const docSnap = await getDoc(doc(db, "recetas", id));
    if (docSnap.exists()) {
      const data = docSnap.data();
      nombreRecetaContainer.dataset.value = data.nombre || "";
      pesoTotalInput.value = data.pesoTotal || 1000;
      pesoMultiplierInput.value = data.pesoMultiplier || 1;
      starterHydrationInput.value = data.starterHidratacion || 100;
      instrAmasadoContainer.dataset.value = data.instrAmasado || "";
      instrHorneadoContainer.dataset.value = data.instrHorneado || "";
      ingredientes = (data.ingredientes || []).map(it => ({ ...it }));
      recetaIdActual = id;
      isEditMode = false;
      renderAll();
    } else {
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
  if (!recetaIdActual) { alert("Selecciona una receta existente para duplicar."); return; }
  try {
    const docRef = doc(db, "recetas", recetaIdActual);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) { alert("La receta ya no existe."); return; }
    const data = snapshot.data();
    const nameCopy = (data.nombre || "Receta") + " (copia)";
    const newData = { ...data, nombre: nameCopy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), versions: [] };
    delete newData.id;
    const newRef = await addDoc(collection(db, "recetas"), newData);
    alert("✅ Receta duplicada: " + nameCopy);
    await cargarRecetas();
    recetaSelect.value = newRef.id;
    cargarReceta(newRef.id);
    isEditMode = true;
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
  nombreRecetaContainer.dataset.value = "";
  pesoTotalInput.value = 1000;
  pesoMultiplierInput.value = 1;
  starterHydrationInput.value = 100;
  instrAmasadoContainer.dataset.value = "";
  instrHorneadoContainer.dataset.value = "";
  ingredientes = [];
  recetaIdActual = null;
  isEditMode = true;
  renderAll();
}

// --- Exportar PDF (jsPDF + autoTable) ---
function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  // Header
  const title = nombreRecetaContainer.dataset.value || "Receta sin nombre";
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(title, 40, 60);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const meta = [
    `Peso objetivo: ${pesoTotalInput.value || "—"} g`,
    `Multiplicador: ${pesoMultiplierInput.value || 1}×`,
    `Starter hidratación: ${starterHydrationInput.value || 100}%`
  ];
  doc.text(meta.join(" — "), 40, 80);

  // Ingredients table
  const body = ingredientes.map(i => [
    i.nombre,
    (parseFloat(i.porcentaje) || 0).toFixed(2) + "%",
    (i._grams || 0) + " g"
  ]);

  doc.autoTable({
    startY: 110,
    head: [["Ingrediente", "% Panadero", "Peso (g)"]],
    body,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [41, 128, 185] }
  });

  // Stats block
  let y = doc.lastAutoTable.finalY + 20;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Análisis técnico", 40, y);
  y += 14;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  const stats = {
    "Hidratación base": statHydration.textContent || "—",
    "Hidratación (leche)": statHydrationMilk.textContent || "—",
    "Hidratación (otros)": statHydrationExtra.textContent || "—",
    "Hidratación total": statHydrationTotal.textContent || "—",
    "Starter (%)": statStarterPct.textContent || "—",
    "Salinidad": statSaltPct.textContent || "—",
    "Peso efectivo": statPesoEfectivo.textContent || "—"
  };

  Object.entries(stats).forEach(([k, v]) => {
    if (y > 720) { doc.addPage(); y = 40; }
    doc.text(`${k}: ${v}`, 40, y);
    y += 14;
  });

  // Instrucciones
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Instrucciones", 40, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  const amasado = instrAmasadoContainer.dataset.value || "—";
  const horneado = instrHorneadoContainer.dataset.value || "—";

  const amasadoLines = doc.splitTextToSize("Amasado / Fermentación: " + amasado, 520);
  amasadoLines.forEach(line => {
    if (y > 720) { doc.addPage(); y = 40; }
    doc.text(line, 40, y);
    y += 12;
  });

  y += 6;
  const horneadoLines = doc.splitTextToSize("Horneado: " + horneado, 520);
  horneadoLines.forEach(line => {
    if (y > 720) { doc.addPage(); y = 40; }
    doc.text(line, 40, y);
    y += 12;
  });

  doc.save((title || "receta") + ".pdf");
}

// --- Exportar CSV (con estadísticas) ---
function exportarCSV() {
  const header = ["Ingrediente","% Panadero","Peso (g)"];
  const rows = ingredientes.map(i => [i.nombre, (parseFloat(i.porcentaje)||0).toFixed(2), (i._grams||0)]);
  const stats = [
    ["", ""],
    ["Estadística", "Valor"],
    ["Hidratación base", statHydration.textContent || ""],
    ["Hidratación (leche)", statHydrationMilk.textContent || ""],
    ["Hidratación (otros)", statHydrationExtra.textContent || ""],
    ["Hidratación total", statHydrationTotal.textContent || ""],
    ["Starter (%)", statStarterPct.textContent || ""],
    ["Salinidad", statSaltPct.textContent || ""],
    ["Peso efectivo", statPesoEfectivo.textContent || ""]
  ];
  const csv = [header, ...rows, ...stats].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
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
btnEditar.addEventListener("click", () => { isEditMode = true; renderAll(); });
btnExportar.addEventListener("click", exportarPDF);
btnExportCSV.addEventListener("click", exportarCSV);
btnLimpiar.addEventListener("click", limpiarFormulario);
btnRecalcular.addEventListener("click", () => { calcularPesos(); tablaIngredientes.scrollIntoView({ behavior: "smooth" }); });
btnCancelarEdicion.addEventListener("click", cancelarEdicion);
pesoTotalInput.addEventListener("input", () => { calcularPesos(); });
pesoMultiplierInput.addEventListener("input", () => { calcularPesos(); });
recetaSelect.addEventListener("change", (e) => { cargarReceta(e.target.value); });
searchRecetas.addEventListener("input", () => applySearchSortRender());
sortField.addEventListener("change", () => applySearchSortRender());
btnSortToggle.addEventListener("click", () => { sortAsc = !sortAsc; btnSortToggle.classList.toggle("active", sortAsc); applySearchSortRender(); });
btnDuplicar.addEventListener("click", duplicarReceta);

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

// Toggle theme (dark/light)
function applySavedTheme() {
  const t = localStorage.getItem("fermentapro_theme") || "light";
  if (t === "dark") document.body.classList.add("dark");
  else document.body.classList.remove("dark");
}
if (btnToggleTheme) btnToggleTheme.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  const now = document.body.classList.contains("dark") ? "dark" : "light";
  localStorage.setItem("fermentapro_theme", now);
});
applySavedTheme();

// PWA install prompt
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if (btnInstallPWA) btnInstallPWA.style.display = 'inline-flex'; });
if (btnInstallPWA) btnInstallPWA.addEventListener('click', async () => {
  if (deferredPrompt) { deferredPrompt.prompt(); const choice = await deferredPrompt.userChoice; deferredPrompt = null; } else { alert("La instalación PWA no está disponible en este navegador/contexto."); }
});

// Service Worker register via Blob (simple)
if ('serviceWorker' in navigator) {
  const swCode = `
    const CACHE_NAME = 'fermentapro-v1';
    const toCache = [ '/', '/index.html' ];
    self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(toCache))); });
    self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
    self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(resp => resp || fetch(e.request))));
  `;
  const blob = new Blob([swCode], { type: 'application/javascript' });
  const swUrl = URL.createObjectURL(blob);
  navigator.serviceWorker.register(swUrl).then(() => console.log("Service worker registrado")).catch(err => console.warn("SW registro falló:", err));
}

// Inicializar
cargarRecetas();
limpiarFormulario(); // Inicia en modo edición vacía
