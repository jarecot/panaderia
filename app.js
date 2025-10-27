// ==================== FIREBASE ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs,
  updateDoc, deleteDoc, doc, getDoc, setDoc,
  serverTimestamp
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==================== ELEMENTOS DOM ====================
const recetaSelect = document.getElementById("recetaSelect");
const nombreRecetaContainer = document.getElementById("nombreRecetaContainer");
const instrAmasadoContainer = document.getElementById("instrAmasadoContainer");
const instrHorneadoContainer = document.getElementById("instrHorneadoContainer");

const pesoTotalInput = document.getElementById("pesoTotal");
const pesoMultiplierInput = document.getElementById("pesoMultiplier");
const rendimientoInput = document.getElementById("rendimiento");

const btnAgregarIngrediente = document.getElementById("btnAgregarIngrediente");
const btnGuardar = document.getElementById("btnGuardar");
const btnEliminar = document.getElementById("btnEliminar");
const btnExportar = document.getElementById("btnExportar");
const btnPreviewPDF = document.getElementById("btnPreviewPDF");
const btnExportCSV = document.getElementById("btnExportCSV");
const btnRecalcular = document.getElementById("btnRecalcular");
const btnDuplicar = document.getElementById("btnDuplicar");
const btnCompartir = document.getElementById("btnCompartir");

const ingredientesDiv = document.getElementById("ingredientes");
const tablaIngredientes = document.getElementById("tablaIngredientes");
const sumGramsEl = document.getElementById("sumGrams");

// Stats
const statHydrationTotal = document.getElementById("statHydrationTotal");
const statStarterPct = document.getElementById("statStarterPct");
const statSaltPct = document.getElementById("statSaltPct");
const statPesoEfectivo = document.getElementById("statPesoEfectivo");
const statRendimiento = document.getElementById("statRendimiento");

// ==================== VARIABLES ====================
let ingredientes = [];
let recetaIdActual = null;
let recetasCache = [];

// ==================== UTILIDADES ====================
function getEffectivePesoTotal() {
  const base = parseFloat(pesoTotalInput.value) || 0;
  const mult = parseFloat(pesoMultiplierInput.value) || 1;
  return base * mult;
}

function classifyIngredientName(name = "") {
  const n = name.toLowerCase();
  if (n.includes("harina")) return "flour";
  if (n.includes("agua")) return "water";
  if (n.includes("leche")) return "milk";
  if (n.includes("sal")) return "salt";
  if (n.includes("masa madre") || n.includes("starter") || n.includes("levain")) return "starter";
  return "other";
}

// ==================== CÁLCULOS ====================
function calcularPesos() {
  const pesoTotalEfectivo = getEffectivePesoTotal();
  tablaIngredientes.innerHTML = "";

  if (!ingredientes.length || pesoTotalEfectivo <= 0) {
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

  const flourWeight = (pesoTotalEfectivo * 100) / sumPerc;
  ingredientes.forEach(ing => {
    ing._grams = Math.round((parseFloat(ing.porcentaje) || 0) / 100 * flourWeight);
  });

  const total = ingredientes.reduce((a, b) => a + (b._grams || 0), 0);
  sumGramsEl.textContent = `${total} g`;
  actualizarStats();
}

function actualizarStats() {
  let flour = 0, water = 0, milk = 0, starter = 0, salt = 0;
  ingredientes.forEach(it => {
    const cls = classifyIngredientName(it.nombre);
    const g = it._grams || 0;
    if (cls === "flour") flour += g;
    else if (cls === "water") water += g;
    else if (cls === "milk") milk += g;
    else if (cls === "starter") starter += g;
    else if (cls === "salt") salt += g;
  });

  const hidrAgua = flour > 0 ? (water / flour) * 100 : 0;
  const hidrLeche = flour > 0 ? (milk / flour) * 100 : 0;
  const hidrTotal = hidrAgua + hidrLeche;

  statHydrationTotal.textContent = `${hidrTotal.toFixed(1)}%`;
  const totalPeso = getEffectivePesoTotal();
  const starterPct = totalPeso > 0 ? (starter / totalPeso) * 100 : 0;
  statStarterPct.textContent = `${starterPct.toFixed(1)}%`;

  const salPct = flour > 0 ? (salt / flour) * 100 : 0;
  statSaltPct.textContent = `${salPct.toFixed(2)}%`;

  statPesoEfectivo.textContent = `${Math.round(totalPeso)} g`;

  const rendimientoTexto = rendimientoInput.value.trim();
  statRendimiento.textContent = rendimientoTexto || "—";
}

// ==================== FIRESTORE ====================
async function guardarReceta() {
  const receta = {
    nombre: nombreRecetaContainer.textContent || "Sin nombre",
    pesoTotal: Number(pesoTotalInput.value),
    pesoMultiplier: Number(pesoMultiplierInput.value),
    rendimiento: rendimientoInput.value.trim(),
    instrAmasado: instrAmasadoContainer.textContent || "",
    instrHorneado: instrHorneadoContainer.textContent || "",
    ingredientes,
    updatedAt: serverTimestamp(),
  };

  try {
    if (recetaIdActual) {
      await setDoc(doc(db, "recetas", recetaIdActual), receta);
      alert("✅ Receta actualizada");
    } else {
      await addDoc(collection(db, "recetas"), {
        ...receta,
        createdAt: serverTimestamp(),
      });
      alert("✅ Nueva receta guardada");
    }
    await cargarRecetas();
  } catch (err) {
    console.error("Error al guardar receta:", err);
    alert("❌ Error al guardar la receta");
  }
}

async function cargarRecetas() {
  recetaSelect.innerHTML = `<option value="">-- Selecciona o crea una receta --</option>`;
  const snap = await getDocs(collection(db, "recetas"));
  recetasCache = [];
  snap.forEach(d => {
    recetasCache.push({ id: d.id, data: d.data() });
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.data().nombre || "Sin nombre";
    recetaSelect.appendChild(opt);
  });
}

async function cargarReceta(id) {
  const snap = await getDoc(doc(db, "recetas", id));
  if (snap.exists()) {
    const d = snap.data();
    nombreRecetaContainer.textContent = d.nombre || "";
    pesoTotalInput.value = d.pesoTotal || 1000;
    pesoMultiplierInput.value = d.pesoMultiplier || 1;
    rendimientoInput.value = d.rendimiento || "";
    instrAmasadoContainer.textContent = d.instrAmasado || "";
    instrHorneadoContainer.textContent = d.instrHorneado || "";
    ingredientes = d.ingredientes || [];
    recetaIdActual = id;
    renderAll();
  }
}

// ==================== PDF ====================
import { jsPDF } from "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
import "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js";
import logoB64 from './logo.b64.txt' assert { type: 'text' };

function generarPDF(preview = false) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Logo centrado
  const logoWidth = 35;
  const logoHeight = 35;
  const logoX = (pageWidth - logoWidth) / 2;
  doc.addImage(logoB64.trim(), "JPEG", logoX, 10, logoWidth, logoHeight);

  // Título con tamaño dinámico
  const titulo = nombreRecetaContainer.textContent || "Receta sin nombre";
  const fontSize = titulo.length > 25 ? 16 : titulo.length > 40 ? 14 : 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  doc.setTextColor(123, 30, 60);
  doc.text(titulo, pageWidth / 2, 55, { align: "center" });

  // Datos generales
  const pesoTotal = `${pesoTotalInput.value} g`;
  const rendimiento = rendimientoInput.value || "—";

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(`Peso total de masa: ${pesoTotal}`, 14, 68);
  doc.text(`Rendimiento: ${rendimiento}`, 14, 75);
  doc.text(`Hidratación total: ${statHydrationTotal.textContent}`, 14, 82);
  doc.text(`Starter: ${statStarterPct.textContent} | Sal: ${statSaltPct.textContent}`, 14, 89);
  doc.text(`Peso efectivo: ${statPesoEfectivo.textContent}`, 14, 96);

  // Tabla de ingredientes
  const body = ingredientes.map(i => [
    i.nombre,
    (parseFloat(i.porcentaje) || 0).toFixed(1) + "%",
    (i._grams || 0) + " g",
  ]);

  doc.autoTable({
    startY: 105,
    head: [["Ingrediente", "% Panadero", "Peso (g)"]],
    body,
    theme: "grid",
    headStyles: { fillColor: [123, 30, 60], textColor: 255 },
    styles: { fontSize: 10 },
  });

  let y = doc.lastAutoTable.finalY + 10;

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Instrucciones", 14, y);
  y += 6;

  const amasado = instrAmasadoContainer.textContent || "";
  const horneado = instrHorneadoContainer.textContent || "";

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Amasado / Fermentación:\n${amasado}`, 14, y + 5);
  y += 25;
  doc.text(`Horneado:\n${horneado}`, 14, y + 5);

  // Footer
  const fecha = new Date().toLocaleDateString();
  doc.setFontSize(9);
  doc.text("Creado en Fermentos App", 14, 285);
  doc.text(fecha, pageWidth - 20, 285, { align: "right" });

  if (preview) {
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl, "_blank");
  } else {
    doc.save(`${titulo}.pdf`);
  }
}

// ==================== EVENTOS ====================
btnAgregarIngrediente.addEventListener("click", () => {
  ingredientes.push({ nombre: "Ingrediente", porcentaje: 0 });
  renderAll();
});

btnGuardar.addEventListener("click", guardarReceta);
btnExportar.addEventListener("click", () => generarPDF(false));
btnPreviewPDF.addEventListener("click", () => generarPDF(true));
btnRecalcular.addEventListener("click", calcularPesos);
recetaSelect.addEventListener("change", e => cargarReceta(e.target.value));

// ==================== INICIO ====================
async function init() {
  await cargarRecetas();
  calcularPesos();
}
init();
