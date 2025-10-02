// ================== Firebase ==================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  setDoc,
  doc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

import jsPDF from "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm";

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

// DOM
let recetaSelect, btnEliminar, nombreReceta, pesoTotal, instrAmasado, instrHorneado;
let ingredientesDiv, tablaIngredientes, btnAgregarIngrediente, btnGuardar, btnRecalcular, btnLimpiar, btnExportar;
let recetas = [], recetaActualId = null;

// Ejecuta cuando DOM cargado
window.addEventListener('DOMContentLoaded', () => {
  recetaSelect = document.getElementById('recetaSelect');
  btnEliminar = document.getElementById('btnEliminar');
  nombreReceta = document.getElementById('nombreReceta');
  pesoTotal = document.getElementById('pesoTotal');
  instrAmasado = document.getElementById('instrAmasado');
  instrHorneado = document.getElementById('instrHorneado');
  ingredientesDiv = document.getElementById('ingredientes');
  tablaIngredientes = document.getElementById('tablaIngredientes');
  btnAgregarIngrediente = document.getElementById('btnAgregarIngrediente');
  btnGuardar = document.getElementById('btnGuardar');
  btnRecalcular = document.getElementById('btnRecalcular');
  btnLimpiar = document.getElementById('btnLimpiar');
  btnExportar = document.getElementById('btnExportar');

  // listeners
  btnAgregarIngrediente.addEventListener('click', () => addIngredient());
  btnGuardar.addEventListener('click', guardarReceta);
  btnEliminar.addEventListener('click', eliminarReceta);
  btnRecalcular.addEventListener('click', calcularPesos);
  btnLimpiar.addEventListener('click', limpiarFormulario);
  btnExportar.addEventListener('click', exportarPDF);

  // 🚀 carga receta automáticamente al cambiar selección
  recetaSelect.addEventListener('change', cargarReceta);

  cargarRecetas().catch(e => console.error('Error init cargarRecetas:', e));
});

// ---------------- Utiles UI ----------------
function escapeHtml(s){ 
  return String(s||'').replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;'); 
}

function addIngredient(name = '', percent = '') {
  const div = document.createElement('div');
  div.className = 'ingrediente';
  div.innerHTML = `
    <input class="ing-name" type="text" placeholder="Ingrediente" value="${escapeHtml(name)}">
    <input class="ing-percent" type="number" placeholder="% Panadero" value="${percent}" step="0.1" min="0">
    <button type="button" class="smallBtn btn-remove">❌</button>
  `;
  ingredientesDiv.appendChild(div);

  const percentInput = div.querySelector('.ing-percent');
  const removeBtn = div.querySelector('.btn-remove');
  percentInput.addEventListener('input', calcularPesos);
  removeBtn.addEventListener('click', () => { div.remove(); calcularPesos(); });

  calcularPesos();
}

function limpiarFormulario() {
  recetaActualId = null;
  nombreReceta.value = '';
  pesoTotal.value = 1000;
  instrAmasado.value = '';
  instrHorneado.value = '';
  ingredientesDiv.innerHTML = '';
  tablaIngredientes.innerHTML = '';
  recetaSelect.value = '';
}

// ---------------- Lógica panadera ----------------
function calcularPesos() {
  const peso = parseFloat(pesoTotal.value) || 0;
  const rows = Array.from(ingredientesDiv.querySelectorAll('.ingrediente'));
  tablaIngredientes.innerHTML = '';

  const items = rows.map(row => {
    const nombre = row.querySelector('.ing-name').value.trim();
    const perc = parseFloat(row.querySelector('.ing-percent').value) || 0;
    return { nombre, perc, raw:0, grams:0 };
  });

  const sumPerc = items.reduce((s,it) => s + (isFinite(it.perc) ? it.perc : 0), 0);

  if (sumPerc <= 0 || peso <= 0) {
    items.forEach(it => {
      const r = document.createElement('tr');
      r.innerHTML = `<td>${escapeHtml(it.nombre)}</td><td>${(it.perc||0).toFixed(2)}%</td><td>0 g</td>`;
      tablaIngredientes.appendChild(r);
    });
    document.getElementById('sumGrams').textContent = '0 g';
    return;
  }

  // harina base proporcional al % de harina
  const flourWeight = (peso * 100) / sumPerc;
  items.forEach(it => it.raw = (it.perc/100) * flourWeight);

  let totalRounded = 0;
  items.forEach(it => { it.grams = Math.round(it.raw); totalRounded += it.grams; });

  const delta = Math.round(peso) - totalRounded;
  if (delta !== 0) {
    let flourIdx = items.findIndex(it => Math.abs(it.perc - 100) < 1e-6);
    if (flourIdx === -1) {
      let maxPerc = -Infinity, idx = 0;
      items.forEach((it,i) => { if (it.perc > maxPerc) { maxPerc = it.perc; idx=i; }});
      flourIdx = idx;
    }
    items[flourIdx].grams += delta;
    totalRounded += delta;
  }

  items.forEach(it => {
    const r = document.createElement('tr');
    r.innerHTML = `<td>${escapeHtml(it.nombre)}</td><td>${(isFinite(it.perc)?it.perc.toFixed(2):'0.00')}%</td><td>${it.grams} g</td>`;
    tablaIngredientes.appendChild(r);
  });

  // 👇 solo gramos, ya no porcentaje
  document.getElementById('sumGrams').textContent = totalRounded + ' g';
}

// ---------------- Firestore ----------------
async function cargarRecetas() {
  recetaSelect.innerHTML = '';
  recetas = [];
  try {
    const snap = await getDocs(collection(db, "recetas"));
    snap.forEach(d => {
      recetas.push({ id: d.id, ...d.data() });
    });
  } catch (err) {
    console.error('Error leyendo Firestore:', err);
    alert('Error leyendo recetas (revisa consola).');
    return;
  }

  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = '-- Selecciona una receta --';
  recetaSelect.appendChild(empty);

  recetas.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = r.nombre || '(sin nombre)';
    recetaSelect.appendChild(opt);
  });
}

async function guardarReceta() {
  const nombre = nombreReceta.value.trim();
  if (!nombre) { alert('Escribe un nombre para la receta'); return; }

  if (recetaActualId && !confirm(`¿Seguro que deseas actualizar la receta "${nombre}"?`)) return;

  const peso = parseFloat(pesoTotal.value) || 0;
  const ingredientes = Array.from(ingredientesDiv.querySelectorAll('.ingrediente')).map(div => {
    return {
      nombre: div.querySelector('.ing-name').value.trim(),
      porcentaje: parseFloat(div.querySelector('.ing-percent').value) || 0
    };
  }).filter(i => i.nombre);

  if (ingredientes.length === 0) { alert('Agrega al menos un ingrediente con nombre.'); return; }
  const instrucciones = {
    amasado: instrAmasado.value.trim(),
    horneado: instrHorneado.value.trim()
  };

  const payload = { nombre, pesoTotal: peso, ingredientes, instrucciones };

  try {
    if (recetaActualId) {
      await setDoc(doc(db, 'recetas', recetaActualId), payload);
      alert('Receta actualizada ✅');
    } else {
      const ref = await addDoc(collection(db, 'recetas'), payload);
      recetaActualId = ref.id;
      alert('Receta guardada ✅');
    }
    await cargarRecetas();
    if (recetaActualId) recetaSelect.value = recetaActualId;
    calcularPesos();
  } catch (err) {
    console.error('Error guardando en Firestore:', err);
    alert('Error guardando receta (revisa consola).');
  }
}

function cargarReceta() {
  const id = recetaSelect.value;
  if (!id) return;
  const r = recetas.find(x => x.id === id);
  if (!r) return;
  recetaActualId = r.id;
  nombreReceta.value = r.nombre || '';
  pesoTotal.value = r.pesoTotal || 1000;
  instrAmasado.value = (r.instrucciones && r.instrucciones.amasado) ? r.instrucciones.amasado : '';
  instrHorneado.value = (r.instrucciones && r.instrucciones.horneado) ? r.instrucciones.horneado : '';
  ingredientesDiv.innerHTML = '';
  (r.ingredientes || []).forEach(ing => addIngredient(ing.nombre || '', ing.porcentaje || 0));
  calcularPesos();
}

async function eliminarReceta() {
  const id = recetaSelect.value;
  if (!id) { alert('Selecciona una receta'); return; }
  const r = recetas.find(x => x.id === id);
  const nombre = r ? r.nombre : id;
  if (!confirm(`¿Seguro que deseas eliminar la receta "${nombre}"? Esta acción no se puede deshacer.`)) return;
  try {
    await deleteDoc(doc(db, 'recetas', id));
    alert(`Receta "${nombre}" eliminada.`);
    recetaActualId = null;
    limpiarFormulario();
    await cargarRecetas();
  } catch (err) {
    console.error('Error eliminando receta:', err);
    alert('Error eliminando receta (revisa consola).');
  }
}

// ---------------- Exportar PDF ----------------
function exportarPDF() {
  if (!nombreReceta.value.trim()) {
    alert("Primero guarda o carga una receta.");
    return;
  }

  const docPdf = new jsPDF();
  docPdf.setFontSize(16);
  docPdf.text(nombreReceta.value, 10, 15);

  docPdf.setFontSize(12);
  docPdf.text(`Peso total: ${pesoTotal.value} g`, 10, 25);

  let y = 35;
  docPdf.text("Ingredientes:", 10, y);
  y += 6;

  Array.from(tablaIngredientes.querySelectorAll("tr")).forEach(tr => {
    const cols = Array.from(tr.querySelectorAll("td")).map(td => td.textContent);
    if (cols.length === 3) {
      docPdf.text(`${cols[0]} - ${cols[1]} - ${cols[2]}`, 10, y);
      y += 6;
    }
  });

  y += 8;
  docPdf.text("Instrucciones:", 10, y);
  y += 6;
  docPdf.text("Amasado/Fermentación:", 10, y); y+=6;
  docPdf.text(instrAmasado.value || "-", 10, y, { maxWidth: 180 });
  y += 20;
  docPdf.text("Horneado:", 10, y); y+=6;
  docPdf.text(instrHorneado.value || "-", 10, y, { maxWidth: 180 });

  docPdf.save(`${nombreReceta.value}.pdf`);
}
