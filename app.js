// ==================== app.js (completo) ====================
// Usa Firebase compat (index.html debe cargar los scripts compat)
(function() {
  // ==================== CONFIG FIREBASE ====================
  const firebaseConfig = {
    apiKey: "AIzaSyAhzdmVFlvtoqMSfIQ6OCbiYdg6s6c95iY",
    authDomain: "recetaspanaderia-b31f2.firebaseapp.com",
    projectId: "recetaspanaderia-b31f2",
    storageBucket: "recetaspanaderia-b31f2.firebasestorage.app",
    messagingSenderId: "979143269695",
    appId: "1:979143269695:web:678dc20bf48fc71700078a"
  };

  if (!window.firebase) {
    console.error("Firebase compat no encontrado - asegúrate de cargar firebase-compat en index.html");
  } else {
    try {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    } catch (e) {
      console.warn("Firebase ya inicializado o error al inicializar:", e);
    }
  }

  const auth = firebase.auth();
  const db = firebase.firestore();

  // ==================== LOGO BASE64 EMBEBIDO ====================
  // (Imagen JPG embebida convertida a dataURI base64)
  const logoBase64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4RIGRXhpZgAASUkqAAgAAAADABIBAwABAAAAAQAAADEBAgAHA..."; 
  // ---------- Nota: la cadena completa en tu archivo real está íntegra. ----------
  // (En esta visualización acorté con "..." para lectura. En el archivo que pegues,
  // reemplaza la línea anterior por la cadena completa 'data:image/jpeg;base64,...' que recibiste.)

  // ==================== ELEMENTOS DOM ====================
  const recetaSelect = document.getElementById("recetaSelect");
  const nombreRecetaContainer = document.getElementById("nombreRecetaContainer");
  const nombreRecetaEditContainer = document.getElementById("nombreRecetaEditContainer");
  const instrAmasadoContainer = document.getElementById("instrAmasadoContainer");
  const instrHorneadoContainer = document.getElementById("instrHorneadoContainer");
  const pesoTotalInput = document.getElementById("pesoTotal");
  const pesoMultiplierInput = document.getElementById("pesoMultiplier");
  const btnAgregarIngrediente = document.getElementById("btnAgregarIngrediente");
  const btnGuardar = document.getElementById("btnGuardar");
  const btnLimpiar = document.getElementById("btnLimpiar");
  const btnRecalcular = document.getElementById("btnRecalcular");
  const btnDuplicar = document.getElementById("btnDuplicar");
  const btnCompartir = document.getElementById("btnCompartir");
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
  const yieldCountInput = document.getElementById("yieldCount");
  const yieldWeightInput = document.getElementById("yieldWeight");
  const yieldTotalDisplay = document.getElementById("yieldTotalDisplay");
  const listaRecetasEl = document.getElementById("listaRecetas");
  const detallePanel = document.getElementById("detalleRecetaPanel");
  const bannerLectura = document.getElementById("bannerLectura");

  // Context menu elements
  const menuTrigger = document.getElementById("menuTrigger");
  const contextMenu = document.getElementById("contextMenu");
  const ctxExportPdf = document.getElementById("ctxExportPdf");
  const ctxExportCsv = document.getElementById("ctxExportCsv");
  const ctxShareWhats = document.getElementById("ctxShareWhats");
  const ctxCopyLink = document.getElementById("ctxCopyLink");
  const ctxViewStats = document.getElementById("ctxViewStats");
  const ctxToggleEdit = document.getElementById("ctxToggleEdit");
  const ctxDelete = document.getElementById("ctxDelete");

  const searchRecetas = document.getElementById("searchRecetas");
  const sortField = document.getElementById("sortField");
  const btnSortToggle = document.getElementById("btnSortToggle");

  const btnToggleTheme = document.getElementById("btnToggleTheme");
  const userLabel = document.getElementById("userLabel");
  const btnSignOut = document.getElementById("btnSignOut");

  // State
  let ingredientes = [];
  let recetaIdActual = null;
  let isEditMode = true;
  let recetasCache = [];
  let sortAsc = true;
  let sharedMode = false;

  // ==================== UTILITIES ====================
  function getEffectivePesoTotal() {
    const base = parseFloat(pesoTotalInput.value) || 0;
    const mult = parseFloat(pesoMultiplierInput.value) || 1;
    return base * mult;
  }

  function classifyIngredientName(name = "") {
    const n = (name || "").toLowerCase();
    if (n.includes("harina") || n.includes("flour") || n.includes("integral") || n.includes("whole")) return "flour";
    if (n.includes("agua") || n.includes("water")) return "water";
    if (n.includes("leche") || n.includes("milk")) return "milk";
    if (n.includes("huevo") || n.includes("egg")) return "egg";
    if (n.includes("mantequilla") || n.includes("butter")) return "butter";
    if (n.includes("yogur") || n.includes("yoghurt") || n.includes("yogurt")) return "yogurt";
    if (n.includes("masa madre") || n.includes("starter") || n.includes("levain")) return "starter";
    if (n.includes("sal")) return "salt";
    if (n.includes("levadura") || n.includes("yeast")) return "yeast";
    return "other";
  }

  const WATER_CONTENT = {
    milk: 0.87,
    egg: 0.74,
    butter: 0.16,
    yogurt: 0.80
  };

  function getQueryParam(name){
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  // ==================== CÁLCULOS Y RENDER ====================
  function calcularPesos() {
    const pesoTotal = getEffectivePesoTotal();
    tablaIngredientes.innerHTML = "";

    if (!ingredientes.length || pesoTotal <= 0) {
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
        ingredientes.forEach((it, i) => { if (it.porcentaje > maxPerc) { maxPerc = it.porcentaje; idx = i; }});
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
    actualizarStats();
  }

  function actualizarStats() {
    const totalPeso = ingredientes.reduce((s, it) => s + (it._grams || 0), 0);

    let flourW = 0, waterDirectW = 0, milkW = 0, eggW = 0, butterW = 0, yogurtW = 0, starterW = 0, saltW = 0, othersW = 0;
    ingredientes.forEach(it => {
      const cls = classifyIngredientName(it.nombre);
      const g = it._grams || 0;
      if (cls === "flour") flourW += g;
      else if (cls === "water") waterDirectW += g;
      else if (cls === "milk") milkW += g;
      else if (cls === "egg") eggW += g;
      else if (cls === "butter") butterW += g;
      else if (cls === "yogurt") yogurtW += g;
      else if (cls === "starter") starterW += g;
      else if (cls === "salt") saltW += g;
      else othersW += g;
    });

    const H = parseFloat((starterHydrationInput && starterHydrationInput.value) || 100) || 100;
    const starterWater = starterW * (H / (100 + H));
    const starterFlourEquiv = starterW - starterWater;

    const milkWater = milkW * (WATER_CONTENT.milk || 0.87);
    const eggWater = eggW * (WATER_CONTENT.egg || 0.74);
    const butterWater = butterW * (WATER_CONTENT.butter || 0.16);
    const yogurtWater = yogurtW * (WATER_CONTENT.yogurt || 0.80);

    const harinaTotal = flourW + starterFlourEquiv;

    const aguaDirect = waterDirectW;
    const aguaDesdeOtros = milkWater + eggWater + butterWater + yogurtWater;
    const aguaDesdeStarter = starterWater;

    const hidrPrincipal = harinaTotal > 0 ? (aguaDirect / harinaTotal) * 100 : NaN;
    const hidrAdicional = harinaTotal > 0 ? ((aguaDesdeOtros + aguaDesdeStarter) / harinaTotal) * 100 : NaN;
    const hidrTotal = harinaTotal > 0 ? ((aguaDirect + aguaDesdeOtros + aguaDesdeStarter) / harinaTotal) * 100 : NaN;

    const salSobreHarina = harinaTotal > 0 ? (saltW / harinaTotal) * 100 : NaN;

    const pesoEfectivo = getEffectivePesoTotal();
    const starterPct = pesoEfectivo > 0 ? (starterW / pesoEfectivo) * 100 : NaN;

    statHydration.textContent = isFinite(hidrPrincipal) ? hidrPrincipal.toFixed(1) + "%" : "—";
    statHydrationMilk.textContent = isFinite((milkWater / (harinaTotal || 1)) * 100) ? ((milkWater / (harinaTotal || 1)) * 100).toFixed(1) + "%" : "—";
    statHydrationExtra.textContent = isFinite((aguaDesdeOtros / (harinaTotal || 1)) * 100) ? ((aguaDesdeOtros / (harinaTotal || 1)) * 100).toFixed(1) + "%" : "—";
    statHydrationTotal.textContent = isFinite(hidrTotal) ? hidrTotal.toFixed(1) + "%" : "—";
    statSaltPct.textContent = isFinite(salSobreHarina) ? salSobreHarina.toFixed(2) + "% (sobre harina)" : "—";
    statPesoEfectivo.textContent = Math.round(pesoEfectivo) + " g";
    statStarterPct.textContent = isFinite(starterPct) ? starterPct.toFixed(2) + "%" : "—";
  }

  // ==================== RENDER UI ====================
  function renderNombre(){
    nombreRecetaContainer.innerHTML = "";
    if (isEditMode) {
      const input = document.createElement("input");
      input.id = "nombreReceta";
      input.type = "text";
      input.placeholder = "Ej. Baguette clásica";
      input.value = nombreRecetaContainer.dataset.value || "";
      input.addEventListener("input", (e) => { nombreRecetaContainer.dataset.value = e.target.value; });
      nombreRecetaEditContainer.innerHTML = "";
      nombreRecetaEditContainer.appendChild(input);
    } else {
      const h2 = document.createElement("h2");
      h2.textContent = nombreRecetaContainer.dataset.value || "Receta sin nombre";
      nombreRecetaContainer.appendChild(h2);
      nombreRecetaEditContainer.innerHTML = "";
    }
  }

  function renderInstrucciones(){
    instrAmasadoContainer.innerHTML = "<label>Amasado / Fermentación</label>";
    if (isEditMode) {
      const ta = document.createElement("textarea");
      ta.id = "instrAmasado";
      ta.rows = 3;
      ta.value = instrAmasadoContainer.dataset.value || "";
      ta.addEventListener("input", e => instrAmasadoContainer.dataset.value = e.target.value);
      instrAmasadoContainer.appendChild(ta);
    } else {
      const p = document.createElement("p");
      p.textContent = instrAmasadoContainer.dataset.value || "—";
      instrAmasadoContainer.appendChild(p);
    }

    instrHorneadoContainer.innerHTML = "<label>Horneado</label>";
    if (isEditMode) {
      const ta = document.createElement("textarea");
      ta.id = "instrHorneado";
      ta.rows = 2;
      ta.value = instrHorneadoContainer.dataset.value || "";
      ta.addEventListener("input", e => instrHorneadoContainer.dataset.value = e.target.value);
      instrHorneadoContainer.appendChild(ta);
    } else {
      const p = document.createElement("p");
      p.textContent = instrHorneadoContainer.dataset.value || "—";
      instrHorneadoContainer.appendChild(p);
    }
  }

  function renderIngredientes(){
    ingredientesDiv.innerHTML = "";
    if (isEditMode) {
      ingredientes.forEach((ing, idx) => {
        const div = document.createElement("div");
        div.className = "ingredient-row";
        const nameInput = document.createElement("input");
        nameInput.type = "text"; nameInput.value = ing.nombre || ""; nameInput.className = "nombreIng"; nameInput.dataset.idx = idx;
        const pctInput = document.createElement("input");
        pctInput.type = "number"; pctInput.value = (ing.porcentaje != null) ? ing.porcentaje : ""; pctInput.className = "pctIng"; pctInput.step = "0.1"; pctInput.min = "0"; pctInput.dataset.idx = idx;
        const delBtn = document.createElement("button");
        delBtn.type = "button"; delBtn.className = "icon-btn danger btnEliminarIng ing-delete"; delBtn.dataset.idx = idx; delBtn.innerHTML = "<i class='bx bx-x'></i>";
        div.appendChild(nameInput); div.appendChild(pctInput); div.appendChild(delBtn);
        ingredientesDiv.appendChild(div);
      });

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
          if (Number.isFinite(i)) { ingredientes.splice(i, 1); renderAll(); }
        });
      });
    } else {
      const ul = document.createElement("ul");
      ul.className = "view-ingredientes-list";
      (ingredientes || []).forEach(it => {
        const li = document.createElement("li");
        li.textContent = `${it.nombre} — ${(parseFloat(it.porcentaje) || 0).toFixed(2)}% — ${(it._grams || 0)} g`;
        ul.appendChild(li);
      });
      ingredientesDiv.appendChild(ul);
    }
  }

  function toggleEditElements(){
    btnGuardar.style.display = isEditMode ? "inline-flex" : "none";
    btnLimpiar.style.display = isEditMode ? "inline-flex" : "none";
    if (ctxToggleEdit) ctxToggleEdit.textContent = isEditMode ? "Ver" : "Editar";
  }

  function renderYieldUI(){
    const pcs = parseInt(yieldCountInput.value) || 0;
    const w = parseFloat(yieldWeightInput.value) || 0;
    if (pcs > 0 && w > 0) {
      const total = pcs * w;
      yieldTotalDisplay.textContent = `${pcs} × ${w} g = ${total} g`;
    } else {
      yieldTotalDisplay.textContent = "—";
    }
  }

  function renderAll(){
    renderNombre();
    renderInstrucciones();
    renderIngredientes();
    toggleEditElements();
    calcularPesos();
    renderYieldUI();
  }

  // ==================== FIRESTORE: CRUD ====================
  async function cargarRecetas(){
    recetaSelect.innerHTML = `<option value="">-- Agregar una receta ➕🥐 --</option>`;
    recetasCache = [];
    try {
      const snapshot = await db.collection("recetas").get();
      snapshot.forEach(docSnap => {
        recetasCache.push({ id: docSnap.id, data: docSnap.data() });
      });
      applySearchSortRender();
    } catch (err) {
      console.error("Error cargando recetas:", err);
      alert("❌ Error al cargar las recetas");
    }
  }

  function applySearchSortRender(){
    const q = (searchRecetas.value || "").toLowerCase().trim();
    let results = recetasCache.filter(r => {
      if (!q) return true;
      const n = (r.data.nombre || "").toLowerCase();
      const ingreds = (r.data.ingredientes || []).map(i => (i.nombre || "").toLowerCase()).join(" ");
      return n.includes(q) || ingreds.includes(q);
    });

    const field = sortField.value || "nombre";
    results.sort((a, b) => {
      let va = a.data[field]; let vb = b.data[field];
      if (va && va.toDate) va = va.toDate().getTime();
      if (vb && vb.toDate) vb = vb.toDate().getTime();
      if (field === "nombre") { va = (va || "").toLowerCase(); vb = (vb || "").toLowerCase(); }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });

    recetaSelect.innerHTML = `<option value="">-- Agregar una receta ➕🥐 --</option>`;
    listaRecetasEl.innerHTML = "";
    results.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.data.nombre || "Receta sin nombre";
      recetaSelect.appendChild(opt);

      const card = document.createElement("div");
      card.className = "recipe-card panel";
      const title = document.createElement("h4");
      title.textContent = r.data.nombre || "Sin nombre";
      const meta = document.createElement("div");
      meta.className = "muted";
      meta.textContent = `Peso objetivo: ${r.data.pesoTotal || '-' } g`;
      card.appendChild(title); card.appendChild(meta);

      const actions = document.createElement("div");
      actions.style.marginTop = "8px";
      const btnView = document.createElement("button");
      btnView.className = "icon-btn"; btnView.textContent = "Ver";
      btnView.addEventListener("click", () => cargarReceta(r.id));
      const btnShare = document.createElement("button");
      btnShare.className = "icon-btn"; btnShare.textContent = "Compartir";
      btnShare.addEventListener("click", () => shareRecipeLink(r.id));
      actions.appendChild(btnView); actions.appendChild(btnShare);
      card.appendChild(actions);

      listaRecetasEl.appendChild(card);
    });
  }

  async function cargarReceta(id){
    if (!id) { limpiarFormulario(); return; }
    try {
      const docSnap = await db.collection("recetas").doc(id).get();
      if (!docSnap.exists) { alert("❌ La receta no existe"); limpiarFormulario(); return; }
      const data = docSnap.data();
      nombreRecetaContainer.dataset.value = data.nombre || "";
      pesoTotalInput.value = data.pesoTotal || 1000;
      pesoMultiplierInput.value = data.pesoMultiplier || 1;
      starterHydrationInput.value = data.starterHidratacion || 100;
      instrAmasadoContainer.dataset.value = data.instrAmasado || "";
      instrHorneadoContainer.dataset.value = data.instrHorneado || "";
      ingredientes = data.ingredientes || [];
      recetaIdActual = id;
      isEditMode = false;
      sharedMode = false;
      bannerLectura.classList.add("hidden");
      detallePanel.classList.remove("hidden");
      yieldCountInput.value = (data.rendimiento && data.rendimiento.piezas) || "";
      yieldWeightInput.value = (data.rendimiento && data.rendimiento.pesoPorPieza) || "";
      renderAll();
      document.getElementById("metaPesoTotal").textContent = `Peso objetivo: ${pesoTotalInput.value} g`;
      updateMetaRendimiento();
    } catch (err) {
      console.error("Error cargar receta:", err);
      alert("❌ Error al cargar la receta");
    }
  }

  async function guardarReceta(){
    const receta = {
      nombre: nombreRecetaContainer.dataset.value,
      pesoTotal: Number(pesoTotalInput.value),
      pesoMultiplier: Number(pesoMultiplierInput.value) || 1,
      instrAmasado: instrAmasadoContainer.dataset.value,
      instrHorneado: instrHorneadoContainer.dataset.value,
      starterHidratacion: Number((starterHydrationInput && starterHydrationInput.value) || 100),
      ingredientes,
      rendimiento: {
        piezas: parseInt(yieldCountInput.value) || 0,
        pesoPorPieza: parseFloat(yieldWeightInput.value) || 0
      },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      if (recetaIdActual) {
        if (!confirm("¿Quieres actualizar la receta existente?")) return;
        const docRef = db.collection("recetas").doc(recetaIdActual);
        const snapshot = await docRef.get();
        if (snapshot.exists) {
          const dataPrev = snapshot.data();
          const versionObj = {
            savedAt: dataPrev.updatedAt || dataPrev.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
            snapshot: {
              nombre: dataPrev.nombre,
              pesoTotal: dataPrev.pesoTotal,
              pesoMultiplier: dataPrev.pesoMultiplier,
              instrAmasado: dataPrev.instrAmasado,
              instrHorneado: dataPrev.instrHorneado,
              starterHidratacion: dataPrev.starterHidratacion,
              ingredientes: dataPrev.ingredientes,
              rendimiento: dataPrev.rendimiento
            }
          };
          await docRef.update({ versions: firebase.firestore.FieldValue.arrayUnion(versionObj) });
        }
        await docRef.set(receta, { merge: true });
        alert("✅ Receta actualizada correctamente");
        isEditMode = false;
      } else {
        const newRef = await db.collection("recetas").add({
          ...receta,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          versions: []
        });
        recetaIdActual = newRef.id;
        alert("✅ Nueva receta guardada");
        isEditMode = false;
      }
      await cargarRecetas();
    } catch (err) {
      console.error("Error saving recipe:", err);
      alert("❌ Error al guardar la receta");
    }
  }

  async function duplicarReceta(){
    if (!recetaIdActual) { alert("Selecciona una receta existente para duplicar."); return; }
    try {
      const docRef = db.collection("recetas").doc(recetaIdActual);
      const snapshot = await docRef.get();
      if (!snapshot.exists) { alert("La receta ya no existe."); return; }
      const data = snapshot.data();
      const nameCopy = (data.nombre || "Receta") + " (copia)";
      const newData = {
        ...data,
        nombre: nameCopy,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        versions: []
      };
      delete newData.id;
      const newRef = await db.collection("recetas").add(newData);
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

  async function eliminarReceta(){
    if (!recetaIdActual) return;
    if (!confirm("¿Seguro que deseas eliminar esta receta?")) return;
    try {
      await db.collection("recetas").doc(recetaIdActual).delete();
      recetaIdActual = null;
      limpiarFormulario();
      await cargarRecetas();
      alert("🗑️ Receta eliminada");
    } catch (err) {
      console.error("Error deleting recipe:", err);
      alert("❌ Error al eliminar la receta");
    }
  }

  function limpiarFormulario(){
    nombreRecetaContainer.dataset.value = "";
    pesoTotalInput.value = 1000;
    pesoMultiplierInput.value = 1;
    instrAmasadoContainer.dataset.value = "";
    instrHorneadoContainer.dataset.value = "";
    starterHydrationInput.value = 100;
    ingredientes = [];
    recetaIdActual = null;
    isEditMode = true;
    yieldCountInput.value = "";
    yieldWeightInput.value = "";
    renderAll();
  }

  // ==================== EXPORT CSV & PDF ====================
  function exportarCSV(){
    const rows = [
      ["Ingrediente", "% Panadero", "Peso (g)"],
      ...ingredientes.map(i => [i.nombre, (parseFloat(i.porcentaje) || 0).toFixed(2), (i._grams || 0)])
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
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

  function exportarPDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const margin = 56.7; // ~2cm
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    const title = nombreRecetaContainer.dataset.value || "Receta sin nombre";
    const dateStr = new Date().toLocaleString();
    const authorText = "Creado en Fermentos App";

    if (logoBase64) {
      try {
        doc.addImage(logoBase64, margin, margin, 80, 50);
      } catch (e) {
        doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text("FERMENTOS", margin, margin + 20);
      }
    } else {
      doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text("FERMENTOS", margin, margin + 20);
    }

    doc.setFontSize(18); doc.setFont("helvetica", "bold");
    doc.setTextColor(123, 30, 58);
    doc.text(title, pageWidth - margin, margin + 20, { align: "right" });

    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 80);
    doc.text(`Fecha: ${dateStr}`, pageWidth - margin, margin + 36, { align: "right" });
    doc.text(`Fuente: ${authorText}`, pageWidth - margin, margin + 50, { align: "right" });

    const body = ingredientes.map(i => [ i.nombre, (parseFloat(i.porcentaje)||0).toFixed(2) + "%", (i._grams||0) + " g" ]);
    doc.autoTable({
      startY: margin + 80,
      margin: { left: margin, right: margin },
      head: [["Ingrediente","% Panadero","Peso (g)"]],
      body,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [123,30,58] }
    });

    let y = doc.lastAutoTable.finalY + 14;
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(0,0,0);
    doc.text("Análisis técnico", margin, y);
    y += 12;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    const stats = {
      "Hidratación base": statHydration.textContent || "—",
      "Hidratación (leche)": statHydrationMilk.textContent || "—",
      "Hidratación (otros)": statHydrationExtra.textContent || "—",
      "Hidratación total": statHydrationTotal.textContent || "—",
      "Starter (%)": statStarterPct.textContent || "—",
      "Salinidad": statSaltPct.textContent || "—",
      "Peso efectivo": statPesoEfectivo.textContent || "—"
    };
    for (const [k, v] of Object.entries(stats)) {
      if (y > doc.internal.pageSize.getHeight() - margin - 40) { doc.addPage(); y = margin; }
      doc.text(`${k}: ${v}`, margin, y); y += 12;
    }

    y += 8;
    const pcs = parseInt(yieldCountInput.value) || 0;
    const w = parseFloat(yieldWeightInput.value) || 0;
    if (pcs > 0 && w > 0) {
      doc.text(`Rendimiento: ${pcs} × ${w} g = ${pcs*w} g`, margin, y); y += 12;
    }

    y += 8;
    doc.setFont("helvetica", "bold"); doc.text("Instrucciones", margin, y); y += 12;
    doc.setFont("helvetica", "normal");
    const amasado = instrAmasadoContainer.dataset.value || "—";
    const horneado = instrHorneadoContainer.dataset.value || "—";
    const amasadoLines = doc.splitTextToSize("Amasado / Fermentación: " + amasado, pageWidth - margin * 2);
    amasadoLines.forEach(line => {
      if (y > doc.internal.pageSize.getHeight() - margin - 20) { doc.addPage(); y = margin; }
      doc.text(line, margin, y); y += 10;
    });
    y += 6;
    const horneadoLines = doc.splitTextToSize("Horneado: " + horneado, pageWidth - margin * 2);
    horneadoLines.forEach(line => {
      if (y > doc.internal.pageSize.getHeight() - margin - 20) { doc.addPage(); y = margin; }
      doc.text(line, margin, y); y += 10;
    });

    const footerY = doc.internal.pageSize.getHeight() - margin + 10;
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text("Creado en Fermentos App", margin, footerY);

    doc.save((nombreRecetaContainer.dataset.value || "receta") + ".pdf");
  }

  // ==================== SHARING ====================
  function makeShareLink(id){
    const mult = parseFloat(pesoMultiplierInput.value) || 1;
    return `https://jarecot.github.io/panaderia/?receta=${encodeURIComponent(id)}&mult=${encodeURIComponent(mult)}`;
  }

  function shareRecipeLink(id){
    const link = makeShareLink(id);
    navigator.clipboard.writeText(link).then(()=> alert("Enlace copiado al portapapeles:\n" + link)).catch(()=> prompt("Copia este enlace:", link));
  }
  function shareWhatsApp(id){
    const link = makeShareLink(id);
    const text = encodeURIComponent(`Te comparto esta receta: ${link}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  // ==================== CONTEXT MENU ====================
  menuTrigger && menuTrigger.addEventListener("click", ()=> contextMenu.classList.toggle("hidden"));
  document.addEventListener("click", (e)=> {
    if (!contextMenu) return;
    if (!contextMenu.contains(e.target) && e.target !== menuTrigger) contextMenu.classList.add("hidden");
  });
  ctxExportPdf && ctxExportPdf.addEventListener("click", ()=> { contextMenu.classList.add("hidden"); exportarPDF(); });
  ctxExportCsv && ctxExportCsv.addEventListener("click", ()=> { contextMenu.classList.add("hidden"); exportarCSV(); });
  ctxShareWhats && ctxShareWhats.addEventListener("click", ()=> { contextMenu.classList.add("hidden"); if (recetaIdActual) shareWhatsApp(recetaIdActual); });
  ctxCopyLink && ctxCopyLink.addEventListener("click", ()=> { contextMenu.classList.add("hidden"); if (recetaIdActual) { navigator.clipboard.writeText(makeShareLink(recetaIdActual)); alert("Enlace copiado"); }});
  ctxViewStats && ctxViewStats.addEventListener("click", ()=> { contextMenu.classList.add("hidden"); alert(`Hidratación base: ${statHydration.textContent}\nHidratación total: ${statHydrationTotal.textContent}`); });
  ctxToggleEdit && ctxToggleEdit.addEventListener("click", ()=> { contextMenu.classList.add("hidden"); isEditMode = !isEditMode; renderAll(); });
  ctxDelete && ctxDelete.addEventListener("click", ()=> { contextMenu.classList.add("hidden"); eliminarReceta(); });

  // ==================== EVENTOS UI ====================
  btnAgregarIngrediente && btnAgregarIngrediente.addEventListener("click", ()=> { ingredientes.push({ nombre: "Ingrediente", porcentaje: 0 }); renderAll(); });
  btnRecalcular && btnRecalcular.addEventListener("click", ()=> { calcularPesos(); tablaIngredientes.scrollIntoView({ behavior: "smooth" }); });
  btnGuardar && btnGuardar.addEventListener("click", guardarReceta);
  btnLimpiar && btnLimpiar.addEventListener("click", limpiarFormulario);
  btnDuplicar && btnDuplicar.addEventListener("click", duplicarReceta);
  btnCompartir && btnCompartir.addEventListener("click", ()=> { if (!recetaIdActual) return alert("Selecciona una receta primero"); navigator.clipboard.writeText(makeShareLink(recetaIdActual)); alert("Enlace copiado"); });

  yieldCountInput && yieldCountInput.addEventListener("input", ()=> { renderYieldUI(); updateMetaRendimiento(); });
  yieldWeightInput && yieldWeightInput.addEventListener("input", ()=> { renderYieldUI(); updateMetaRendimiento(); });

  searchRecetas && searchRecetas.addEventListener("input", applySearchSortRender);
  sortField && sortField.addEventListener("change", applySearchSortRender);
  btnSortToggle && btnSortToggle.addEventListener("click", ()=> { sortAsc = !sortAsc; btnSortToggle.classList.toggle("active", sortAsc); applySearchSortRender(); });

  recetaSelect && recetaSelect.addEventListener("change", (e)=> cargarReceta(e.target.value));
  starterHydrationInput && starterHydrationInput.addEventListener("input", ()=> actualizarStats());

  // Theme toggle persistence
  (function(){
    const saved = localStorage.getItem("fermentapro_theme");
    if (saved === "dark") document.documentElement.setAttribute("data-theme","dark");
    else if (saved === "light") document.documentElement.removeAttribute("data-theme");
    else {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) document.documentElement.setAttribute("data-theme","dark");
    }
  })();
  btnToggleTheme && btnToggleTheme.addEventListener("click", ()=>{
    const now = document.documentElement.getAttribute("data-theme");
    if (now === "dark"){ document.documentElement.removeAttribute("data-theme"); localStorage.setItem("fermentapro_theme","light"); btnToggleTheme.textContent = "🌙"; }
    else { document.documentElement.setAttribute("data-theme","dark"); localStorage.setItem("fermentapro_theme","dark"); btnToggleTheme.textContent = "🌞"; }
  });

  // ==================== AUTH (ANÓNIMA por defecto) ====================
  auth.signInAnonymously()
    .then(userCredential => {
      console.log("Signed in anonymously:", userCredential.user.uid);
    })
    .catch(error => {
      console.error("Anonymous auth error:", error);
      alert("Error al autenticar usuario");
    });

  auth.onAuthStateChanged(user => {
    if (user) {
      if (user.isAnonymous) userLabel && (userLabel.textContent = "Invitado");
      else userLabel && (userLabel.textContent = user.email || "Usuario");
      if (btnSignOut) btnSignOut.classList.toggle("hidden", user.isAnonymous);
    } else {
      userLabel && (userLabel.textContent = "Invitado");
      btnSignOut && btnSignOut.classList.add("hidden");
    }
  });

  // Optional Google sign-in button handling (if present)
  const btnSigninGoogle = document.getElementById("btnSigninGoogle");
  if (btnSigninGoogle) {
    btnSigninGoogle.addEventListener("click", async () => {
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        const result = await auth.signInWithPopup(provider);
        alert("Sesión iniciada como: " + (result.user.email || "Usuario"));
      } catch (err) {
        console.error("Google sign-in error:", err);
        alert("Error al iniciar sesión con Google.");
      }
    });
  }

  // Sign out
  btnSignOut && btnSignOut.addEventListener("click", () => {
    auth.signOut().then(()=> {
      alert("Sesión cerrada");
      auth.signInAnonymously().catch(()=> {});
    });
  });

  // ==================== VISTA COMPARTIDA (PARAM ?receta=ID) ====================
  async function handleSharedView(){
    const id = getQueryParam("receta");
    const mult = parseFloat(getQueryParam("mult")) || 1;
    if (id) {
      try {
        const snap = await db.collection("recetas").doc(id).get();
        if (!snap.exists) { alert("Receta compartida no encontrada"); return; }
        const data = snap.data();
        nombreRecetaContainer.dataset.value = data.nombre || "";
        pesoTotalInput.value = (data.pesoTotal || 1000) * mult;
        pesoMultiplierInput.value = mult;
        starterHydrationInput.value = data.starterHidratacion || 100;
        instrAmasadoContainer.dataset.value = data.instrAmasado || "";
        instrHorneadoContainer.dataset.value = data.instrHorneado || "";
        ingredientes = (data.ingredientes || []).map(it => ({ ...it }));
        yieldCountInput.value = (data.rendimiento && data.rendimiento.piezas) || "";
        yieldWeightInput.value = (data.rendimiento && data.rendimiento.pesoPorPieza) || "";
        recetaIdActual = id;
        isEditMode = false;
        sharedMode = true;
        bannerLectura.classList.remove("hidden");
        // disable editing UI
        document.querySelectorAll(".icon-btn, button").forEach(b => { if(!b.classList.contains("menu-trigger")) b.style.display = "none"; });
        document.querySelectorAll("input, textarea, select, .ing-delete").forEach(el => el.disabled = true);
        ctxToggleEdit && (ctxToggleEdit.style.display = "none");
        ctxDelete && (ctxDelete.style.display = "none");
        renderAll();
      } catch (err) {
        console.error("Shared load error:", err);
      }
    }
  }

  // ==================== INIT ====================
  (async function init(){
    await cargarRecetas();
    limpiarFormulario();
    await handleSharedView();
    console.log("App initialized");
  })();

  // Expose minimal helpers to global for debugging (optional)
  window.Fermentos = {
    calcularPesos, actualizarStats, cargarRecetas, cargarReceta, exportarPDF, exportarCSV
  };

})();
