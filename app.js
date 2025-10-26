// =====================================================
//  FermentaPro | Gestor de Recetas de Pan y Fermentados
// =====================================================

// --- Variables y referencias ---
let recetas = JSON.parse(localStorage.getItem("recetas")) || [];
let ingredientes = [];
let recetaActual = null;

const recetaSelect = document.getElementById("recetaSelect");
const tablaIngredientes = document.getElementById("tablaIngredientes");
const sumGrams = document.getElementById("sumGrams");

const statHydration = document.getElementById("statHydration");
const statStarterPct = document.getElementById("statStarterPct");
const statSaltPct = document.getElementById("statSaltPct");
const statPesoEfectivo = document.getElementById("statPesoEfectivo");

// --- Cargar recetas existentes ---
function cargarRecetas() {
  recetaSelect.innerHTML = "";
  recetas.forEach((r, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = r.nombre;
    recetaSelect.appendChild(opt);
  });
}
cargarRecetas();

// --- Clasificación de ingredientes (para análisis técnico) ---
function classifyIngredientName(nombre) {
  nombre = nombre.toLowerCase();
  if (nombre.includes("harina")) return "flour";
  if (nombre.includes("agua")) return "water";
  if (nombre.includes("masa madre") || nombre.includes("starter")) return "starter";
  if (nombre.includes("sal")) return "salt";
  return "other";
}

// --- Renderizar tabla ---
function renderTabla() {
  tablaIngredientes.innerHTML = "";
  let total = 0;
  ingredientes.forEach((ing, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" value="${ing.nombre}" data-index="${i}" class="nombre"></td>
      <td><input type="number" step="0.1" value="${ing.porcentaje}" data-index="${i}" class="porcentaje"></td>
      <td>${(ing._grams || 0).toFixed(1)}</td>
    `;
    tablaIngredientes.appendChild(tr);
    total += ing._grams || 0;
  });
  sumGrams.textContent = total.toFixed(1);
  actualizarStats();
}

// --- Recalcular pesos según % panadero ---
function recalcularPesos() {
  const pesoTotal = parseFloat(document.getElementById("pesoTotal").value);
  const mult = parseFloat(document.getElementById("pesoMultiplier").value);
  const pesoEfectivo = pesoTotal * (isNaN(mult) ? 1 : mult);
  let sumPercent = ingredientes.reduce((s, i) => s + (parseFloat(i.porcentaje) || 0), 0);

  ingredientes.forEach(i => {
    const pct = parseFloat(i.porcentaje) || 0;
    i._grams = (pct / sumPercent) * pesoEfectivo;
  });
  renderTabla();
}

// --- Calcular datos técnicos ---
function getEffectivePesoTotal() {
  return ingredientes.reduce((s, i) => s + (i._grams || 0), 0);
}

function actualizarStats() {
  const totalPeso = ingredientes.reduce((s, it) => s + (it._grams || 0), 0);

  let flourW = 0, waterW = 0, starterW = 0, saltW = 0;
  ingredientes.forEach(it => {
    const cls = classifyIngredientName(it.nombre);
    const grams = it._grams || 0;
    if (cls === "flour") flourW += grams;
    else if (cls === "water") waterW += grams;
    else if (cls === "starter") starterW += grams;
    else if (cls === "salt") saltW += grams;
  });

  const hydrationPct = (flourW > 0) ? (waterW / flourW) * 100 : NaN;
  statHydration.textContent = isFinite(hydrationPct) ? hydrationPct.toFixed(1) + "%" : "—";

  const pesoEfectivo = getEffectivePesoTotal();
  const starterPct = pesoEfectivo > 0 ? (starterW / pesoEfectivo) * 100 : NaN;
  statStarterPct.textContent = isFinite(starterPct) ? starterPct.toFixed(2) + "%" : "—";

  const salSobreHarina = flourW > 0 ? (saltW / flourW) * 100 : NaN;
  statSaltPct.textContent = isFinite(salSobreHarina) ? salSobreHarina.toFixed(2) + "% (sobre harina)" : "—";

  statPesoEfectivo.textContent = Math.round(pesoEfectivo) + " g";
}

// --- Guardar receta ---
function guardarReceta() {
  const nombre = prompt("Nombre de la receta:", recetaActual ? recetaActual.nombre : "");
  if (!nombre) return;

  const nuevaReceta = {
    nombre,
    ingredientes,
    pesoTotal: parseFloat(document.getElementById("pesoTotal").value),
    multiplier: parseFloat(document.getElementById("pesoMultiplier").value),
    createdAt: recetaActual ? recetaActual.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (recetaActual) {
    const idx = recetas.findIndex(r => r.nombre === recetaActual.nombre);
    if (idx >= 0) recetas[idx] = nuevaReceta;
  } else {
    recetas.push(nuevaReceta);
  }

  localStorage.setItem("recetas", JSON.stringify(recetas));
  cargarRecetas();
  alert("Receta guardada correctamente ✅");
}

// --- Cargar receta seleccionada ---
recetaSelect.addEventListener("change", () => {
  const idx = recetaSelect.value;
  if (idx === "" || !recetas[idx]) return;
  recetaActual = recetas[idx];
  ingredientes = recetaActual.ingredientes.map(i => ({ ...i }));
  document.getElementById("pesoTotal").value = recetaActual.pesoTotal || 1000;
  document.getElementById("pesoMultiplier").value = recetaActual.multiplier || 1;
  recalcularPesos();
});

// --- Agregar ingrediente ---
document.getElementById("btnAgregarIngrediente").addEventListener("click", () => {
  ingredientes.push({ nombre: "Ingrediente", porcentaje: 10, _grams: 0 });
  renderTabla();
});

// --- Escuchar cambios en inputs de tabla ---
tablaIngredientes.addEventListener("input", e => {
  const idx = e.target.dataset.index;
  const field = e.target.classList.contains("nombre") ? "nombre" : "porcentaje";
  ingredientes[idx][field] = e.target.value;
  recalcularPesos();
});

// --- Botones principales ---
document.getElementById("btnRecalcular").addEventListener("click", recalcularPesos);
document.getElementById("btnGuardar").addEventListener("click", guardarReceta);
document.getElementById("btnLimpiar").addEventListener("click", () => {
  if (confirm("¿Deseas limpiar todos los campos?")) {
    ingredientes = [];
    recetaActual = null;
    renderTabla();
    actualizarStats();
  }
});

// --- Exportar CSV ---
document.getElementById("btnExportCSV").addEventListener("click", () => {
  if (!ingredientes.length) return alert("No hay datos para exportar.");
  let csv = "Ingrediente,% Panadero,Peso (g)\n";
  ingredientes.forEach(i => {
    csv += `${i.nombre},${i.porcentaje},${i._grams.toFixed(1)}\n`;
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (recetaActual?.nombre || "receta") + ".csv";
  a.click();
  URL.revokeObjectURL(url);
});

// --- Exportar PDF ---
document.getElementById("btnExportar").addEventListener("click", async () => {
  if (!ingredientes.length) return alert("No hay datos para exportar.");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.text("Receta: " + (recetaActual?.nombre || "Sin nombre"), 14, 15);
  const rows = ingredientes.map(i => [i.nombre, i.porcentaje, i._grams.toFixed(1)]);
  doc.autoTable({
    head: [["Ingrediente", "% Panadero", "Peso (g)"]],
    body: rows,
    startY: 25
  });
  doc.text("Análisis técnico:", 14, doc.lastAutoTable.finalY + 10);
  doc.text(`Hidratación: ${statHydration.textContent}`, 14, doc.lastAutoTable.finalY + 20);
  doc.text(`Starter: ${statStarterPct.textContent}`, 14, doc.lastAutoTable.finalY + 26);
  doc.text(`Sal: ${statSaltPct.textContent}`, 14, doc.lastAutoTable.finalY + 32);
  doc.text(`Peso efectivo: ${statPesoEfectivo.textContent}`, 14, doc.lastAutoTable.finalY + 38);
  doc.save((recetaActual?.nombre || "receta") + ".pdf");
});

// --- Tema oscuro/claro ---
document.getElementById("btnToggleTheme").addEventListener("click", () => {
  document.body.classList.toggle("light");
  localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
});

if (localStorage.getItem("theme") === "light") {
  document.body.classList.add("light");
}

// --- Instalar como PWA ---
let deferredPrompt;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;
});

document.getElementById("btnInstallPWA").addEventListener("click", async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") deferredPrompt = null;
  } else {
    alert("Ya puedes instalar la app desde tu navegador.");
  }
});

// --- Inicializar ---
renderTabla();
actualizarStats();
