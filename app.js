// EVA Table Tactique — Konva
let stage, layerBg, layerMain, transformer;
let currentMap = null;
let tool = "select"; // "select" | "draw"
let isDrawing = false;
let drawLine = null;
let arrowColor = "#ffffff";
let undoStack = [];
let redoStack = [];
let isRestoring = false;
let historyTimer = null;

function pushHistoryDebounced() {
  clearTimeout(historyTimer);
  historyTimer = setTimeout(pushHistory, 200);
}

function pushHistory() {
  if (isRestoring) return;
  const state = serialize();
  const last = undoStack[undoStack.length - 1];
  if (last && JSON.stringify(last) === JSON.stringify(state)) return;
  undoStack.push(state);
  redoStack = [];
}

function resetHistoryToCurrent() {
  undoStack = [serialize()];
  redoStack = [];
}

function undo() {
  if (undoStack.length <= 1) return;
  const current = undoStack.pop();
  redoStack.push(current);
  const prev = undoStack[undoStack.length - 1];
  isRestoring = true;
  hydrate(prev);
  isRestoring = false;
}

function redo() {
  if (redoStack.length === 0) return;
  const next = redoStack.pop();
  undoStack.push(next);
  isRestoring = true;
  hydrate(next);
  isRestoring = false;
}

const TOKENS = {
  p1: { label: "1", fill: "#4da3ff" },
  p2: { label: "2", fill: "#7bd389" },
  p3: { label: "3", fill: "#ffd166" },
  p4: { label: "4", fill: "#cdb4ff" },
  enemy: { label: "E", fill: "#ff4d6d" },
  obj: { label: "OBJ", fill: "#ff9f1c" },
  smoke: { label: "G", fill: "#160d0dff" }
};

function qs(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

async function init() {
  const mapId = qs("map");
  const maps = await (await fetch("maps.json")).json();
  currentMap = maps.find(m => m.id === mapId) || maps[0];

  document.getElementById("mapTitle").textContent = `Board — ${currentMap?.name ?? "Map"}`;

  setupStage();
  await loadBackground(currentMap.file);
  setupUI();
  resetHistoryToCurrent();
  fitStageToContainer();
  window.addEventListener("resize", fitStageToContainer);
}

function setupStage() {
  const parent = document.getElementById("stageParent");
  const w = parent.clientWidth;
  const h = parent.clientHeight;

  stage = new Konva.Stage({ container: "stageParent", width: w, height: h });

  layerBg = new Konva.Layer();
  layerMain = new Konva.Layer();

  stage.add(layerBg);
  stage.add(layerMain);

  transformer = new Konva.Transformer({
    rotateEnabled: false,
    enabledAnchors: [], // on ne resize pas les pions (plus simple)
    ignoreStroke: true
  });
  layerMain.add(transformer);

  // Sélection : clique sur vide => désélection
  stage.on("mousedown touchstart", (e) => {
    if (tool === "draw") return;

    if (e.target === stage) {
      selectNode(null);
      return;
    }
  });

  // Dessin de flèches/lignes
  stage.on("mousedown touchstart", (e) => {
    if (tool !== "draw") return;
    if (e.target !== stage && e.target.getLayer() !== layerBg) return;

    isDrawing = true;
    const pos = stage.getPointerPosition();
    drawLine = new Konva.Arrow({
      points: [pos.x, pos.y, pos.x, pos.y],
      stroke: arrowColor,
      fill: arrowColor,
      strokeWidth: 4,
      pointerLength: 12,
      pointerWidth: 12,
      lineCap: "round",
      lineJoin: "round",
      opacity: 0.9
    });
    layerMain.add(drawLine);
  });

  stage.on("mousemove touchmove", () => {
    if (!isDrawing || tool !== "draw" || !drawLine) return;
    const pos = stage.getPointerPosition();
    const pts = drawLine.points();
    drawLine.points([pts[0], pts[1], pos.x, pos.y]);
    layerMain.batchDraw();
  });

  stage.on("mouseup touchend", () => {
    if (tool !== "draw") return;
    if (!isDrawing) return;

    isDrawing = false;

  // si l'utilisateur a juste cliqué sans tirer, on supprime la "flèche point"
  if (drawLine) {
    const pts = drawLine.points();
    const isClick = Math.hypot(pts[2] - pts[0], pts[3] - pts[1]) < 3;
    if (isClick) drawLine.destroy();
  }

  drawLine = null;
  layerMain.draw();
  pushHistory(); // ✅ maintenant Undo/Redo marche pour les flèches
});

  // Supprimer via touche Suppr
  window.addEventListener("keydown", (e) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      deleteSelected();
    }
  });
}

function fitStageToContainer() {
  const parent = document.getElementById("stageParent");
  stage.width(parent.clientWidth);
  stage.height(parent.clientHeight);
  stage.draw();
}

async function loadBackground(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      layerBg.destroyChildren();

      // On place la map en "cover" (remplit le stage)
      const bg = new Konva.Image({ image: img, x: 0, y: 0 });
      layerBg.add(bg);

      // Resize cover
      function resizeBg() {
        const sw = stage.width();
        const sh = stage.height();
        const iw = img.width;
        const ih = img.height;

        const scale = Math.max(sw / iw, sh / ih);
        const nw = iw * scale;
        const nh = ih * scale;

        bg.width(nw);
        bg.height(nh);
        bg.x((sw - nw) / 2);
        bg.y((sh - nh) / 2);
        layerBg.draw();
      }

      resizeBg();
      window.addEventListener("resize", resizeBg);

      resolve();
    };
    img.onerror = reject;
    img.src = src;
  });
}

function setupUI() {
  // Outils
  const btnSelect = document.getElementById("toolSelect");
  const btnDraw = document.getElementById("toolDraw");

  btnSelect.onclick = () => setTool("select");
  btnDraw.onclick = () => setTool("draw");

  // Ajout pions
  document.getElementById("addP1").onclick = () => addToken("p1");
  document.getElementById("addP2").onclick = () => addToken("p2");
  document.getElementById("addP3").onclick = () => addToken("p3");
  document.getElementById("addP4").onclick = () => addToken("p4");
  document.getElementById("addEnemy").onclick = () => addToken("enemy");
  document.getElementById("addObj").onclick = () => addToken("obj");
document.getElementById("addSmoke").onclick = () => addToken("smoke");

  // Rotation / Delete
  document.getElementById("rotateLeft").onclick = () => rotateSelected(-15);
  document.getElementById("rotateRight").onclick = () => rotateSelected(15);
  document.getElementById("deleteSelected").onclick = () => deleteSelected();

  // Save/Load/Export
  document.getElementById("saveJson").onclick = () => saveStrategy();
  document.getElementById("exportPng").onclick = () => exportPNG();
  document.getElementById("loadJson").addEventListener("change", (e) => loadStrategyFile(e.target.files?.[0]));

  // Zoom (simple scale visuel)
  const zoom = document.getElementById("zoom");
  zoom.addEventListener("input", () => {
    const s = Number(zoom.value) / 100;
    stage.scale({ x: s, y: s });

    // Important : recentrer un peu pour éviter que ça parte en haut à gauche
    stage.position({ x: 0, y: 0 });
    stage.batchDraw();
  });

  // Sélecteur de couleur des flèches
  const arrowPicker = document.getElementById("arrowColorPicker");
  if (arrowPicker) {
  arrowPicker.addEventListener("input", () => {
    arrowColor = arrowPicker.value;
  });
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");

  if (undoBtn) undoBtn.onclick = undo;
  if (redoBtn) redoBtn.onclick = redo;
}

  setTool("select");
}

function setTool(next) {
  tool = next;
  const btnSelect = document.getElementById("toolSelect");
  const btnDraw = document.getElementById("toolDraw");

  if (tool === "select") {
    btnSelect.classList.add("primary");
    btnDraw.classList.remove("primary");
    stage.container().style.cursor = "default";
  } else {
    btnDraw.classList.add("primary");
    btnSelect.classList.remove("primary");
    selectNode(null);
    stage.container().style.cursor = "crosshair";
  }
}

function addToken(kind) {
  const cfg = TOKENS[kind];
  const center = { x: stage.width() / 2, y: stage.height() / 2 };

  const group = new Konva.Group({
    x: center.x,
    y: center.y,
    draggable: true,
    name: "token",
    id: `token_${kind}_${crypto.randomUUID()}`
  });

  const r = 22;
  const circle = new Konva.Circle({
    radius: r,
    fill: cfg.fill,
    opacity: 0.92,
    stroke: "rgba(255,255,255,0.35)",
    strokeWidth: 2
  });

  const text = new Konva.Text({
   text: (
  kind === "p1" ? (document.getElementById("nameP1")?.value || cfg.label) :
  kind === "p2" ? (document.getElementById("nameP2")?.value || cfg.label) :
  kind === "p3" ? (document.getElementById("nameP3")?.value || cfg.label) :
  kind === "p4" ? (document.getElementById("nameP4")?.value || cfg.label) :
  cfg.label
),
    fontSize: kind === "obj" ? 14 : 18,
    fontStyle: "bold",
    fill: "#0b0f14",
    align: "center",
    verticalAlign: "middle"
  });

  // Centrage du texte
  text.offsetX(text.width() / 2);
  text.offsetY(text.height() / 2);

  group.add(circle);
  group.add(text);

  group.on("mousedown touchstart", (e) => {
    if (tool !== "select") return;
    selectNode(group);
    e.cancelBubble = true;
  });

  // Remettre texte centré si Konva recalcule width/height après ajout
  group.on("dragmove", () => layerMain.batchDraw());
  group.on("dragend", () => pushHistory());

  group.setAttr("tokenKind", kind);

  layerMain.add(group);
  selectNode(group);
  layerMain.draw();
  pushHistory();
}

function selectNode(node) {
  if (!node) {
    transformer.nodes([]);
    layerMain.draw();
    return;
  }
  transformer.nodes([node]);
  layerMain.draw();
}

function getSelected() {
  return transformer.nodes()?.[0] || null;
}

function rotateSelected(deltaDeg) {
  const node = getSelected();
  if (!node) return;
  node.rotation((node.rotation() + deltaDeg) % 360);
  layerMain.draw();
}

function deleteSelected() {
  const node = getSelected();
  if (!node) return;
  node.destroy();
  transformer.nodes([]);
  layerMain.draw();
}

function serialize() {
  const tokens = [];
  const drawings = [];

  layerMain.getChildren().forEach(n => {
    if (n === transformer) return;

    if (n.hasName("token")) {
      tokens.push({
        kind: n.getAttr("tokenKind"),
        x: n.x(),
        y: n.y(),
        rotation: n.rotation()
      });
    } else if (n.className === "Arrow") {
    drawings.push({
      type: "arrow",
      points: n.points(),
      stroke: n.stroke(),
      fill: n.fill(),
      strokeWidth: n.strokeWidth(),
      opacity: n.opacity(),
      pointerLength: n.pointerLength(),
      pointerWidth: n.pointerWidth()
    });
  }
  });

  return {
    version: 1,
    mapId: currentMap?.id ?? null,
    mapFile: currentMap?.file ?? null,
    createdAt: new Date().toISOString(),
    stratName: document.getElementById("stratName")?.value || "",
    notes: document.getElementById("notes")?.value || "",
    players: {
      p1: document.getElementById("nameP1")?.value || "",
      p2: document.getElementById("nameP2")?.value || "",
      p3: document.getElementById("nameP3")?.value || "",
      p4: document.getElementById("nameP4")?.value || ""
},
    tokens,
    drawings
  };
}

function clearBoard() {
  // garde transformer mais supprime le reste
  layerMain.getChildren().forEach(n => {
    if (n !== transformer) n.destroy();
  });
  transformer.nodes([]);
  layerMain.draw();
}

function hydrate(data) {
  clearBoard();

  const stratEl = document.getElementById("stratName");
  if (stratEl) stratEl.value = data.stratName || "";

  const notesEl = document.getElementById("notes");
  if (notesEl) notesEl.value = data.notes || "";
  const p = data.players || {};
  const n1 = document.getElementById("nameP1");
  const n2 = document.getElementById("nameP2");
  const n3 = document.getElementById("nameP3");
  const n4 = document.getElementById("nameP4");

  if (n1) n1.value = p.p1 || "";
  if (n2) n2.value = p.p2 || "";
  if (n3) n3.value = p.p3 || "";
  if (n4) n4.value = p.p4 || "";

  // tokens
  for (const t of (data.tokens || [])) {
    addToken(t.kind);
    const node = getSelected();
    if (!node) continue;
    node.position({ x: t.x, y: t.y });
    node.rotation(t.rotation || 0);
  }

  // dessins
  for (const d of (data.drawings || [])) {
   if (d.type === "arrow") {
    const arr = new Konva.Arrow({
      points: d.points,
      stroke: d.stroke ?? arrowColor,
      fill: d.fill ?? arrowColor,
      strokeWidth: d.strokeWidth ?? 4,
      pointerLength: d.pointerLength ?? 12,
      pointerWidth: d.pointerWidth ?? 12,
      lineCap: "round",
      lineJoin: "round",
      opacity: d.opacity ?? 0.9
    });
    layerMain.add(arr)
    }
  }

  selectNode(null);
  layerMain.draw();
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function saveStrategy() {
  const data = serialize();
  const niceName = (currentMap?.name || "map").replace(/\s+/g, "_");
  const filename = `strat_${niceName}_${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.json`;
  downloadFile(filename, JSON.stringify(data, null, 2), "application/json");
}

function loadStrategyFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      hydrate(data);
    } catch (e) {
      alert("JSON invalide.");
      console.error(e);
    }
  };
  reader.readAsText(file);
}

function exportPNG() {
  // cacher le transformer
  const prev = transformer.nodes();
  transformer.nodes([]);
  layerMain.draw();

  const stratName = document.getElementById("stratName")?.value || "";

  // récupérer les notes
  const notesText = document.getElementById("notes")?.value || "";

  let notesGroup = null;

  if (notesText.trim() !== "") {
    const padding = 12;
    const width = stage.width();
    const height = 90;

    notesGroup = new Konva.Group({
      x: 0,
      y: stage.height() - height,
    });

    const bg = new Konva.Rect({
      width,
      height,
      fill: "rgba(0,0,0,0.7)",
    });

    const txt = new Konva.Text({
      x: padding,
      y: padding,
      width: width - padding * 2,
      text:      
       (stratName.trim() ? (stratName.trim() + "\n\n") : "") +
       "PLAN DE ROUND:\n" + notesText,
      fill: "#ffffff",
      fontSize: 14,
      lineHeight: 1.3,
    });

    notesGroup.add(bg);
    notesGroup.add(txt);
    layerMain.add(notesGroup);
    layerMain.draw();
  }

  // export
  const url = stage.toDataURL({ pixelRatio: 2 });
  downloadFile(
    `export_${currentMap?.id || "map"}.png`,
    dataURLToBlob(url),
    "image/png"
  );

  // nettoyage
  if (notesGroup) {
    notesGroup.destroy();
  }

  transformer.nodes(prev);
  layerMain.draw();
}

function dataURLToBlob(dataURL) {
  const parts = dataURL.split(',');
  const byteString = atob(parts[1]);
  const mimeString = parts[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type: mimeString });
}

init().catch(err => {
  console.error(err);
  alert("Erreur de chargement (maps.json / images).");
});
