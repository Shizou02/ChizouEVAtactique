/*StratHub — Konva
Auteur: Shizou
Année: 2026
Description: Outil de planification tactique pour EVA
*/

let stage, layerBg, layerMain, layerFx, transformer;
let currentMap = null;
let tool = "select"; // "select" | "draw"
let isDrawing = false;
let drawLine = null;
let arrowColor = "#ffffff";
let arrowStyle = "solid";
let undoStack = [];
let redoStack = [];
let isRestoring = false;
let historyTimer = null;
let bgNode = null;
let currentMode = "strat"; // "strat" | "train" | "coach"
let coachSignalArmed = false; // quand true, le prochain clic pose un ping
let coachZoneArmed = false; // ✅ quand true, on trace une zone au drag
let coachZoneRect = null; // ✅ le rectangle en cours
let coachZoneStart = null; // ✅ point de départ du drag
let selectedPlayer = null;

const loadout = {
  weapons: [], // toutes les armes (armes.json)
  selectedWeaponIds: [], // max 2 ids d’armes
  selectedPlayerNode: null, // le joueur sélectionné sur la map
  meterToPx: 10, // conversion m → pixels (on ajustera plus tard)
};

// Loadout par joueur (persistant)
const playerLoadouts = {
  p1: [],
  p2: [],
  p3: [],
  p4: [],
};

let activePlayerKind = null; // "p1" | "p2" | "p3" | "p4"

// Globaux partagés entre setupUI et selectNode
let allWeapons = [];
let selectedWeapons = [];
let loadoutList = null;

// ─── Menu contextuel (clic droit sur pion) ───────────────────────────────────
let ctxMenuNode = null; // le pion ciblé par le menu contextuel

function showContextMenu(group, pointerPos) {
  hideContextMenu();
  ctxMenuNode = group;

  const hasCone      = !!group.findOne(".visionCone");
  const hasLine      = !!group.findOne(".sightLine");
  const hasArrow     = !!group.findOne(".tokenArrow");
  const arrowDashed  = group.findOne(".tokenArrow")?.dash()?.length > 0;

  const menu = document.createElement("div");
  menu.id = "ctxMenu";
  menu.style.cssText = `
    position:fixed; z-index:9999;
    left:${pointerPos.x}px; top:${pointerPos.y}px;
    background:rgba(15,20,30,0.97);
    border:1px solid rgba(255,255,255,0.15);
    border-radius:12px; padding:6px;
    display:flex; flex-direction:column; gap:4px;
    box-shadow:0 8px 32px rgba(0,0,0,0.6);
    min-width:210px;
  `;

  // Séparateur titre
  const title = document.createElement("div");
  title.textContent = "Options du pion";
  title.style.cssText = "font-size:11px;font-weight:700;opacity:0.45;padding:4px 8px 2px;letter-spacing:0.08em;text-transform:uppercase;color:#e8eef6;";
  menu.appendChild(title);

  // ── Flèche pleine ──
  const btnSolid = makeCtxBtn(
    (hasArrow && !arrowDashed) ? "✅ Flèche pleine (retirer)" : "➡️ Flèche pleine",
    () => { toggleTokenArrow(group, false); hideContextMenu(); }
  );

  // ── Flèche pointillée ──
  const btnDashed = makeCtxBtn(
    (hasArrow && arrowDashed) ? "✅ Flèche pointillée (retirer)" : "➡️ Flèche pointillée",
    () => { toggleTokenArrow(group, true); hideContextMenu(); }
  );

  // ── Cône de vision ──
  const btnCone = makeCtxBtn(
    hasCone ? "✅ Cône de vision (retirer)" : "🔶 Cône de vision",
    () => { toggleCone(group); hideContextMenu(); }
  );

  // ── Ligne de visée ──
  const btnLine = makeCtxBtn(
    hasLine ? "✅ Ligne de visée (retirer)" : "🔴 Ligne de visée",
    () => { toggleSightLine(group); hideContextMenu(); }
  );

  menu.appendChild(btnSolid);
  menu.appendChild(btnDashed);
  menu.appendChild(btnCone);
  menu.appendChild(btnLine);
  document.body.appendChild(menu);

  setTimeout(() => {
    document.addEventListener("mousedown", hideContextMenu, { once: true });
  }, 0);
}

function hideContextMenu() {
  const el = document.getElementById("ctxMenu");
  if (el) el.remove();
  ctxMenuNode = null;
}

function makeCtxBtn(label, onClick) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.style.cssText = `
    background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.12);
    color:#e8eef6; padding:9px 14px; border-radius:9px; cursor:pointer;
    font-size:13px; font-weight:600; text-align:left; width:100%;
  `;
  btn.onmouseenter = () => btn.style.background = "rgba(255,255,255,0.14)";
  btn.onmouseleave = () => btn.style.background = "rgba(255,255,255,0.07)";
  btn.addEventListener("mousedown", (e) => { e.stopPropagation(); onClick(); });
  return btn;
}

// ─── Cône de vision ──────────────────────────────────────────────────────────
function toggleCone(group) {
  const existing = group.findOne(".visionCone");
  if (existing) {
    existing.destroy();
    layerMain.draw();
    pushHistory();
    return;
  }

  // Le cône pointe vers la droite (direction du fusil dans le token)
  // angle de 60°, longueur 120px (en coordonnées locales du groupe)
  const angleRad = (60 / 2) * (Math.PI / 180);
  const length = 120;

  const cone = new Konva.Shape({
    name: "visionCone",
    sceneFunc: (ctx, shape) => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length * Math.cos(-angleRad), length * Math.sin(-angleRad));
      ctx.arc(0, 0, length, -angleRad, angleRad);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStrokeShape(shape);
    },
    fill: "rgba(255, 220, 80, 0.18)",
    stroke: "rgba(255, 220, 80, 0.75)",
    strokeWidth: 1.5,
    listening: false,
  });

  // Insérer AVANT les autres enfants pour qu'il soit derrière le pion
  group.add(cone);
  cone.moveToBottom();
  layerMain.draw();
  pushHistory();
}

// ─── Ligne de visée ──────────────────────────────────────────────────────────
function toggleSightLine(group) {
  const existing = group.findOne(".sightLine");
  if (existing) {
    existing.destroy();
    layerMain.draw();
    pushHistory();
    return;
  }

  const line = new Konva.Line({
    name: "sightLine",
    points: [0, 0, 220, 0], // vers la droite (direction du fusil)
    stroke: "rgba(255, 60, 60, 0.85)",
    strokeWidth: 1.5,
    dash: [8, 5],
    listening: false,
  });

  group.add(line);
  line.moveToBottom();
  layerMain.draw();
  pushHistory();
}

// ─── Flèche attachée au pion ─────────────────────────────────────────────────
function toggleTokenArrow(group, dashed) {
  const existing = group.findOne(".tokenArrow");

  // Si déjà une flèche du même style → on retire
  if (existing) {
    const isDashed = existing.dash()?.length > 0;
    if (isDashed === dashed) {
      existing.destroy();
      layerMain.draw();
      pushHistory();
      return;
    }
    // Sinon on remplace par le nouveau style
    existing.destroy();
  }

  const arrow = new Konva.Arrow({
    name: "tokenArrow",
    points: [0, 0, 80, 0], // vers la droite (direction du fusil)
    stroke: arrowColor,
    fill: arrowColor,
    strokeWidth: 3,
    pointerLength: 10,
    pointerWidth: 10,
    lineCap: "round",
    dash: dashed ? [8, 5] : [],
    opacity: 0.9,
    listening: false,
  });

  group.add(arrow);
  arrow.moveToBottom();
  layerMain.draw();
  pushHistory();
}

function parseEffectiveRangeMeters(weapon) {
  // Ex: "0-25m=Max / 25-35m=83% / >35m=75%"
  const s = String(weapon?.stats?.["Portée"] ?? "");
  const m = s.match(/0\s*-\s*([0-9]+(?:\.[0-9]+)?)\s*m/i);
  return m ? Number(m[1]) : null;
}

function clearRanges() {
  // on supprime uniquement ce qu'on a dessiné pour la portée
  layerFx.find(".range").forEach((n) => n.destroy());
  layerFx.draw();
}

function drawRangesForSelection() {
  clearRanges();

  // il faut un joueur sélectionné + 1 arme mini
  if (!loadout.selectedPlayerNode) return;

  const ids = loadout.selectedWeaponIds;
  if (!ids || ids.length === 0) return;

  const center = {
    x: loadout.selectedPlayerNode.x(),
    y: loadout.selectedPlayerNode.y(),
  };

  // arme 1 = vert ; arme 2 = bleu
  const colors = ["#4ade80", "#3b82f6"];
  const dashes = [[], [10, 8]];

  ids.slice(0, 2).forEach((id, i) => {
    const w = loadout.weapons.find((x) => x.id === id);
    const meters = parseEffectiveRangeMeters(w);
    if (meters == null) return;

    const circle = new Konva.Circle({
      x: center.x,
      y: center.y,
      radius: meters * loadout.meterToPx,
      stroke: colors[i],
      strokeWidth: 3,
      dash: dashes[i],
      opacity: 0.9,
      name: "range", // <- important (pour clearRanges)
      listening: false,
    });

    layerFx.add(circle);
  });

  layerFx.draw();
}

function drawRangesForAllPlayers() {
  clearRanges();

  const kinds = ["p1", "p2", "p3", "p4"];

  for (const kind of kinds) {
    const weaponIds = playerLoadouts[kind];
    if (!weaponIds || weaponIds.length === 0) continue;

    // retrouver le node du joueur sur la map
    const playerNode = layerMain
      .find(".token")
      .find((n) => n.getAttr("tokenKind") === kind);

    if (!playerNode) continue;

    const center = { x: playerNode.x(), y: playerNode.y() };

    const w1 = loadout.weapons.find((w) => w.id === weaponIds[0]);
    const w2 = loadout.weapons.find((w) => w.id === weaponIds[1]);

    const r1m = w1 ? parseEffectiveRangeMeters(w1) : null;
    const r2m = w2 ? parseEffectiveRangeMeters(w2) : null;

    if (r1m != null) {
      layerFx.add(
        new Konva.Circle({
          x: center.x,
          y: center.y,
          radius: r1m * loadout.meterToPx,
          stroke: "#4ade80",
          strokeWidth: 3,
          dash: [],
          opacity: 0.9,
          name: "range",
          listening: false,
        }),
      );
    }

    if (r2m != null) {
      layerFx.add(
        new Konva.Circle({
          x: center.x,
          y: center.y,
          radius: r2m * loadout.meterToPx,
          stroke: "#3b82f6",
          strokeWidth: 3,
          dash: [10, 8],
          opacity: 0.9,
          name: "range",
          listening: false,
        }),
      );
    }
  }

  layerFx.draw();
}

// 🎓 Mode entraînement
let training = {
  baselineState: null,
  solutionState: null,
  active: false,
  remaining: 20,
  timerId: null,

  // ✅ nouveau
  planAState: null, // snapshot du plan A validé
  enemiesManualArmed: false, // mode placement ennemis à la souris
};

function pushHistoryDebounced() {
  clearTimeout(historyTimer);
  historyTimer = setTimeout(pushHistory, 200);
}

function pushHistory() {
  if (isRestoring) return;
  const state = serialize(true);
  const last = undoStack[undoStack.length - 1];
  if (last && JSON.stringify(last) === JSON.stringify(state)) return;
  undoStack.push(state);
  redoStack = [];
}

function resetHistoryToCurrent() {
  undoStack = [serialize(true)];
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
  smoke: { label: "G", fill: "#160d0dff" },
};

function getPointerPosInLayer() {
  const p = stage.getPointerPosition();
  if (!p) return null;

  const t = layerMain.getAbsoluteTransform().copy().invert();
  return t.point(p);
}

function qs(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

async function init() {
  const mapId = qs("map");
  const maps = await (await fetch("maps.json")).json();
  currentMap = maps.find((m) => m.id === mapId) || maps[0];

  document.getElementById("mapTitle").textContent =
    `Board — ${currentMap?.name ?? "Map"}`;

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

  // ─── Bloquer le menu natif du navigateur sur le canvas ───
  stage.container().addEventListener("contextmenu", (e) => e.preventDefault());

  // ─── Clic droit au niveau du stage : cherche le pion sous le curseur ───
  stage.container().addEventListener("contextmenu", (e) => {
    e.preventDefault();

    // Utiliser les coordonnées DOM directement (getPointerPosition = null sur contextmenu)
    const containerRect = stage.container().getBoundingClientRect();
    const pos = {
      x: e.clientX - containerRect.left,
      y: e.clientY - containerRect.top,
    };

    const tokens = layerMain.find(".token");
    let closest = null;
    let closestDist = Infinity;

    for (const token of tokens) {
      const kind = token.getAttr("tokenKind");
      if (!isSoldier(kind)) continue;

      const absPos = token.getAbsolutePosition();
      const dx = absPos.x - pos.x;
      const dy = absPos.y - pos.y;
      const dist = Math.hypot(dx, dy);

      if (dist < closestDist) {
        closestDist = dist;
        closest = token;
      }
    }

    // Seuil : 40px en coordonnées stage
    if (!closest || closestDist > 40) return;

    const menuPos = {
      x: e.clientX,
      y: e.clientY,
    };

    selectNode(closest);
    showContextMenu(closest, menuPos);
  });

  layerBg = new Konva.Layer();
  layerMain = new Konva.Layer();
  layerFx = new Konva.Layer(); // ✅ pings & effets temporaires (non sauvegardés)

  stage.add(layerBg);
  stage.add(layerMain);
  stage.add(layerFx); // ✅ au-dessus

  transformer = new Konva.Transformer({
    rotateEnabled: false,
    enabledAnchors: [], // on ne resize pas les pions (plus simple)
    ignoreStroke: true,
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

  // ✅ Backup: si on clique une flèche en mode select, on la sélectionne
  stage.on("mousedown touchstart", (e) => {
    if (tool !== "select") return;

    if (e.target && e.target.className === "Arrow") {
      selectNode(e.target);
      e.cancelBubble = true;
    }
  });

  // Dessin de flèches/lignes
  stage.on("mousedown touchstart", (e) => {
    if (tool !== "draw") return;
    if (e.target !== stage && e.target.getLayer() !== layerBg) return;

    isDrawing = true;
    const pos = getPointerPosInLayer();
    if (!pos) return;
    drawLine = new Konva.Arrow({
      points: [pos.x, pos.y, pos.x, pos.y],
      stroke: arrowColor,
      fill: arrowColor,
      strokeWidth: 4,
      pointerLength: 12,
      pointerWidth: 12,
      lineCap: "round",
      lineJoin: "round",
      opacity: 0.9,
      dash: arrowStyle === "dashed" ? [10, 6] : [],
    });
    layerMain.add(drawLine);
  });

  stage.on("mousemove touchmove", () => {
    if (!isDrawing || tool !== "draw" || !drawLine) return;
    const pos = getPointerPosInLayer();
    if (!pos) return;
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

      if (isClick) {
        drawLine.destroy();
      } else {
        makeArrowInteractive(drawLine);
      }
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
  stage.on("mousedown touchstart", (e) => {
    // ✅ Ping coaching : uniquement si armé + mode coach
    if (currentMode !== "coach" || !coachSignalArmed) return;

    // On veut cliquer sur la map/vide, pas sur un pion
    if (e.target !== stage && e.target.getLayer() !== layerBg) return;

    const pos = getPointerPosInLayer();
    if (!pos) return;

    coachSignalArmed = false;
    stage.container().style.cursor = tool === "draw" ? "crosshair" : "default";

    const ping = new Konva.Circle({
      x: pos.x,
      y: pos.y,
      radius: 16,
      fill: "rgba(255, 80, 80, 0.75)",
      stroke: "rgba(255, 180, 180, 0.9)",
      strokeWidth: 2,
    });

    layerFx.add(ping);
    layerFx.draw();

    setTimeout(() => {
      ping.destroy();
      layerFx.draw();
    }, 1500);
  });
  stage.on("mousedown touchstart", (e) => {
    if (currentMode !== "coach" || !coachZoneArmed) return;

    // On veut tracer sur la map/vide (comme pour les flèches)
    if (e.target !== stage && e.target.getLayer() !== layerBg) return;

    const pos = getPointerPosInLayer();
    if (!pos) return;

    coachZoneStart = { x: pos.x, y: pos.y };

    coachZoneRect = new Konva.Rect({
      x: pos.x,
      y: pos.y,
      width: 1,
      height: 1,
      fill: "rgba(255, 200, 80, 0.18)",
      stroke: "rgba(255, 200, 80, 0.8)",
      strokeWidth: 2,
      cornerRadius: 8,
    });

    layerFx.add(coachZoneRect);
    layerFx.draw();
  });
  stage.on("mousemove touchmove", () => {
    if (currentMode !== "coach" || !coachZoneArmed) return;
    if (!coachZoneRect || !coachZoneStart) return;

    const pos = getPointerPosInLayer();
    if (!pos) return;

    // Pour gérer drag dans toutes les directions (haut/gauche)
    const x = Math.min(coachZoneStart.x, pos.x);
    const y = Math.min(coachZoneStart.y, pos.y);
    const w = Math.abs(pos.x - coachZoneStart.x);
    const h = Math.abs(pos.y - coachZoneStart.y);

    coachZoneRect.position({ x, y });
    coachZoneRect.size({ width: w, height: h });

    layerFx.batchDraw();
  });
  stage.on("mouseup touchend", () => {
    if (currentMode !== "coach" || !coachZoneArmed) return;
    if (!coachZoneRect) return;

    // Si la zone est trop petite (clic sans drag), on supprime
    const tooSmall = coachZoneRect.width() < 8 || coachZoneRect.height() < 8;
    if (tooSmall) {
      coachZoneRect.destroy();
      layerFx.draw();
    } else {
      // Disparition automatique (1,5s)
      const rectToRemove = coachZoneRect;
      setTimeout(() => {
        rectToRemove.destroy();
        layerFx.draw();
      }, 1500);
    }

    // Reset état
    coachZoneRect = null;
    coachZoneStart = null;
    coachZoneArmed = false;

    stage.container().style.cursor = tool === "draw" ? "crosshair" : "default";
  });

  // 🎓 Placement ennemis manuel
  stage.on("mousedown touchstart", (e) => {
    if (currentMode !== "train" || !training.enemiesManualArmed) return;

    if (e.target !== stage && e.target.getLayer() !== layerBg) return;

    const pos = getPointerPosInLayer();
    if (!pos) return;

    const node = addToken("enemy");
    if (!node) return;
    node.position({ x: pos.x, y: pos.y });

    layerMain.draw();
    pushHistoryDebounced();
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

      // On place la map en "contain" (on voit toute la map, avec marges possibles)
      bgNode = new Konva.Image({ image: img, x: 0, y: 0 });
      layerBg.add(bgNode);

      // Resize cover
      function resizeBg() {
        const sw = stage.width();
        const sh = stage.height();
        const iw = img.width;
        const ih = img.height;

        const scale = Math.min(sw / iw, sh / ih);
        const nw = iw * scale;
        const nh = ih * scale;

        bgNode.width(nw);
        bgNode.height(nh);
        bgNode.x((sw - nw) / 2);
        bgNode.y((sh - nh) / 2);
        layerBg.draw();

        // ✅ IMPORTANT : pions + flèches suivent la map
        layerMain.position({ x: bgNode.x(), y: bgNode.y() });
        layerMain.scale({ x: scale, y: scale });
        layerMain.draw();
        layerFx.position({ x: bgNode.x(), y: bgNode.y() });
        layerFx.scale({ x: scale, y: scale });
        layerFx.draw();
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
  document
    .getElementById("loadJson")
    .addEventListener("change", (e) => loadStrategyFile(e.target.files?.[0]));

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
  }

  const btnSolid = document.getElementById("arrowSolid");
  const btnDashed = document.getElementById("arrowDashed");

  if (btnSolid && btnDashed) {
    btnSolid.onclick = () => {
      arrowStyle = "solid";
      btnSolid.classList.add("primary");
      btnDashed.classList.remove("primary");
    };

    btnDashed.onclick = () => {
      arrowStyle = "dashed";
      btnDashed.classList.add("primary");
      btnSolid.classList.remove("primary");
    };
  }

  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");

  if (undoBtn) undoBtn.onclick = undo;
  if (redoBtn) redoBtn.onclick = redo;

  // 🎓 Mode entraînement
  const btnSet = document.getElementById("setSolution");
  const btnStart = document.getElementById("startTraining");
  const btnShow = document.getElementById("showSolution");
  const btnStop = document.getElementById("stopTraining");
  const btnPlanA = document.getElementById("validatePlanA");
  const btnRestorePlanA = document.getElementById("restorePlanA");
  const btnEnManual = document.getElementById("trainEnemiesManual");
  const btnEnAuto = document.getElementById("trainEnemiesAuto");

  if (btnSet) btnSet.onclick = captureSolution;
  if (btnStart) btnStart.onclick = () => startTraining(20);
  if (btnShow) btnShow.onclick = showSolution;
  if (btnStop) btnStop.onclick = stopTraining;
  if (btnPlanA) btnPlanA.onclick = validatePlanA;
  if (btnRestorePlanA) btnRestorePlanA.onclick = restorePlanA;
  if (btnEnManual) btnEnManual.onclick = toggleTrainingEnemiesManual;
  if (btnEnAuto) btnEnAuto.onclick = () => autoPlaceEnemies(4);

  uiSetTrainingLabel("off");
  uiSetTrainingTimer(20);

  const modeSelect = document.getElementById("modeSelect");
  const trainBlock = document.getElementById("modeTrainBlock");
  const coachBlock = document.getElementById("modeCoachBlock");

  function applyModeUI(mode) {
    if (trainBlock)
      trainBlock.style.display = mode === "train" ? "block" : "none";
    if (coachBlock)
      coachBlock.style.display = mode === "coach" ? "block" : "none";
  }

  if (modeSelect) {
    currentMode = modeSelect.value; // ✅ init
    modeSelect.addEventListener("change", () => {
      currentMode = modeSelect.value; // ✅ maj
      coachSignalArmed = false; // ✅ sécurité: on désarme
      stage.container().style.cursor =
        tool === "draw" ? "crosshair" : "default";
      applyModeUI(modeSelect.value);
    });
    applyModeUI(modeSelect.value);
  }
  const coachSignalBtn = document.getElementById("coachSignal");
  if (coachSignalBtn) {
    coachSignalBtn.onclick = () => {
      if (currentMode !== "coach") return; // sécurité

      coachSignalArmed = !coachSignalArmed; // ✅ toggle ON/OFF

      stage.container().style.cursor = coachSignalArmed
        ? "crosshair"
        : tool === "draw"
          ? "crosshair"
          : "default";
    };
  }
  const coachZoneBtn = document.getElementById("coachZone");
  if (coachZoneBtn) {
    coachZoneBtn.onclick = () => {
      if (currentMode !== "coach") return;

      // On arme la zone, et on désarme le signal (simple)
      coachZoneArmed = true;
      coachSignalArmed = false;

      stage.container().style.cursor = "crosshair";
    };
  }
  // LOADOUT (STEP 2) — ouvrir/fermer le panneau
  const panel = document.getElementById("loadoutPanel");
  const openBtn = document.getElementById("openLoadout");
  const closeBtn = document.getElementById("closeLoadout");

  openBtn.addEventListener("click", () => {
    panel.classList.add("open");
    document.body.classList.add("loadout-open");
  });

  closeBtn.addEventListener("click", () => {
    panel.classList.remove("open");
    document.body.classList.remove("loadout-open");
  });

  loadoutList = document.getElementById("loadoutWeapons");
  if (!loadoutList) return;

  fetch("armes.json")
    .then((r) => r.json())
    .then((weapons) => {
      allWeapons = weapons;
      loadout.weapons = weapons;
      // Regrouper par "group"
      const groups = {};
      weapons.forEach((w) => {
        const g = w.group || "Autres";
        (groups[g] ||= []).push(w);
      });

      // Ordre souhaité (comme ta page armes)
      const order = [
        "Fusils d’assaut",
        "Longue portée",
        "Armes rapprochées",
        "Spéciales",
        "Accessoires",
      ];

      // Construire la liste des groupes à afficher
      const groupNames = [
        ...order.filter((g) => groups[g]),
        ...Object.keys(groups)
          .filter((g) => !order.includes(g))
          .sort(),
      ];

      // HTML final
      loadoutList.innerHTML = groupNames
        .map((groupName) => {
          const buttons = groups[groupName]
            .map(
              (w) =>
                `<button class="weapon-item" type="button" data-id="${w.id}">${w.name}</button>`,
            )
            .join("");

          return `
      <div class="loadout-group">
        <div class="loadout-group-title">${groupName}</div>
        <div class="loadout-group-weapons">${buttons}</div>
      </div>
    `;
        })
        .join("");
    });

  const selectedLabel = document.getElementById("loadoutSelected");

  loadoutList.addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") return;

    const weaponId = e.target.dataset.id;
    const weaponName = e.target.textContent;

    // si déjà sélectionnée → on enlève
    if (selectedWeapons.includes(weaponId)) {
      selectedWeapons = selectedWeapons.filter((id) => id !== weaponId);
      e.target.classList.remove("selected");
    } else {
      // si déjà 2 → on enlève la plus ancienne
      if (selectedWeapons.length === 2) {
        const removed = selectedWeapons.shift();
        const oldBtn = loadoutList.querySelector(
          `button[data-id="${removed}"]`,
        );
        if (oldBtn) oldBtn.classList.remove("selected");
      }

      // on ajoute la nouvelle
      selectedWeapons.push(weaponId);
      e.target.classList.add("selected");
    }

    if (selectedLabel) {
      const lines = selectedWeapons.map((id) => {
        const w = allWeapons.find((x) => x.id === id);
        return w ? `${w.name} → ${w.stats["Portée"]}` : id;
      });

      selectedLabel.textContent = lines.length
        ? lines.join(" | ")
        : "Aucune arme sélectionnée";
      loadout.selectedWeaponIds = [...selectedWeapons];
      drawRangesForSelection();
    }

    if (activePlayerKind)
      playerLoadouts[activePlayerKind] = [...selectedWeapons];
    drawRangesForAllPlayers();
  });

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

function isSoldier(kind) {
  return (
    kind === "p1" ||
    kind === "p2" ||
    kind === "p3" ||
    kind === "p4" ||
    kind === "enemy"
  );
}

function addToken(kind, opts = {}) {
  const cfg = TOKENS[kind];
  const center = { x: stage.width() / 2, y: stage.height() / 2 };

  const group = new Konva.Group({
    x: center.x,
    y: center.y,
    draggable: true,
    name: "token",
    id: opts.id || `token_${kind}_${crypto.randomUUID()}`,
  });

  // ✅ 1) label d'abord (sinon label undefined)
  const label =
    opts.label ??
    (kind === "p1"
      ? document.getElementById("nameP1")?.value || cfg.label
      : kind === "p2"
        ? document.getElementById("nameP2")?.value || cfg.label
        : kind === "p3"
          ? document.getElementById("nameP3")?.value || cfg.label
          : kind === "p4"
            ? document.getElementById("nameP4")?.value || cfg.label
            : cfg.label);

  const r = 22;

  if (isSoldier(kind)) {
    // ennemis inversés par défaut (seulement pour soldats)
    if (opts.rotation != null) {
      group.rotation(opts.rotation);
    } else if (kind === "enemy") {
      group.rotation(180);
    }

    const ring = new Konva.Circle({
      radius: r,
      stroke: cfg.fill,
      strokeWidth: 3,
      opacity: 0.9,
    });
    ring.shadowColor("black");
    ring.shadowBlur(6);
    ring.shadowOpacity(0.35);
    ring.shadowOffset({ x: 0, y: 2 });

    const head = new Konva.Circle({
      x: -4,
      y: -8,
      radius: 5,
      fill: "#f1f5f9",
      opacity: 0.95,
    });

    const body = new Konva.Rect({
      x: -7,
      y: -2,
      width: 10,
      height: 14,
      fill: cfg.fill,
      cornerRadius: 4,
      opacity: 0.95,
    });

    const gun = new Konva.Rect({
      x: 3,
      y: -5,
      width: 16,
      height: 4,
      fill: "#0b0f14",
      cornerRadius: 2,
      opacity: 0.95,
    });

    const muzzle = new Konva.Circle({
      x: 20,
      y: -3,
      radius: 2,
      fill: "#e8eef6",
      opacity: 0.9,
    });

    const nameText = new Konva.Text({
      text: label,
      fontSize: 11,
      fontStyle: "bold",
      fill: "#ffffff",
      y: 20,
      align: "center",
    });
    nameText.shadowColor("black");
    nameText.shadowBlur(6);
    nameText.shadowOpacity(0.8);
    nameText.offsetX(nameText.width() / 2);

    group.add(ring, head, body, gun, muzzle, nameText);
  } else if (kind === "obj") {
    // Objectif : badge simple
    const badge = new Konva.Rect({
      x: -22,
      y: -14,
      width: 44,
      height: 28,
      fill: "rgba(11,15,20,0.85)",
      cornerRadius: 10,
      stroke: cfg.fill,
      strokeWidth: 2,
    });

    const txt = new Konva.Text({
      text: "OBJ",
      fontSize: 12,
      fontStyle: "bold",
      fill: cfg.fill,
    });
    txt.offsetX(txt.width() / 2);
    txt.offsetY(txt.height() / 2);

    group.add(badge, txt);
  } else if (kind === "smoke") {
    // Grenade : pastille simple
    const pin = new Konva.Circle({
      radius: 16,
      fill: "rgba(11,15,20,0.85)",
      stroke: cfg.fill,
      strokeWidth: 2,
    });

    const g = new Konva.Text({
      text: "G",
      fontSize: 14,
      fontStyle: "bold",
      fill: "#ffffff",
    });
    g.offsetX(g.width() / 2);
    g.offsetY(g.height() / 2);

    group.add(pin, g);
  }

  // interactions (inchangé)
  group.on("mousedown touchstart", (e) => {
    if (tool !== "select") return;
    selectNode(group);
    e.cancelBubble = true;
  });

  group.on("dragmove", () => layerMain.batchDraw());
  group.on("dragend", () => pushHistory());

  group.setAttr("tokenKind", kind);

  layerMain.add(group);
  selectNode(group);
  layerMain.draw();
  pushHistory();

  return group;
}

function makeArrowInteractive(arr) {
  arr.hitStrokeWidth(25); // ✅ rend la flèche beaucoup plus facile à cliquer
  arr.draggable(true);

  arr.on("mousedown touchstart", (e) => {
    if (tool !== "select") return;
    selectNode(arr);
    e.cancelBubble = true;
  });

  arr.on("dragmove", () => layerMain.batchDraw());
  arr.on("dragend", () => pushHistory());
}

function selectNode(node) {
  if (!node) {
    transformer.nodes([]);
    layerMain.draw();
    return;
  }
  transformer.nodes([node]);
  layerMain.draw();

  const loadoutPlayer = document.getElementById("loadoutPlayer");

  if (loadoutPlayer) {
    const kind = node.getAttr("tokenKind");

    if (kind === "p1" || kind === "p2" || kind === "p3" || kind === "p4") {
      activePlayerKind = kind;
      loadoutPlayer.textContent = "Joueur sélectionné : " + kind.toUpperCase();

      // 🔹 charger les armes de ce joueur dans le panneau
      selectedWeapons = [...playerLoadouts[kind]];

      // 🔹 remettre le visuel sélectionné
      loadoutList.querySelectorAll("button.weapon-item").forEach((b) => {
        const id = b.dataset.id;
        b.classList.toggle("selected", selectedWeapons.includes(id));
      });
    } else {
      loadoutPlayer.textContent = "Joueur : aucun";

      loadout.selectedPlayerNode = null; // <- NEW
      clearRanges(); // <- NEW
    }
  }
}

function getSelected() {
  return transformer.nodes()?.[0] || null;
}

function rotateSelected(deltaDeg) {
  const node = getSelected();
  if (!node) return;
  node.rotation((node.rotation() + deltaDeg) % 360);
  layerMain.draw();
  pushHistory();
}

function deleteSelected() {
  const node = getSelected();
  if (!node) return;
  node.destroy();
  transformer.nodes([]);
  layerMain.draw();
  pushHistory();
}

function serialize(forHistory = false) {
  const tokens = [];
  const drawings = [];

  layerMain.getChildren().forEach((n) => {
    if (n === transformer) return;

    if (n.hasName("token")) {
      tokens.push({
        id: n.id(),
        kind: n.getAttr("tokenKind"),
        x: n.x(),
        y: n.y(),
        rotation: n.rotation(),
        label: n.findOne("Text")?.text() || "",
        hasCone: !!n.findOne(".visionCone"),
        hasSightLine: !!n.findOne(".sightLine"),
        hasArrow: !!n.findOne(".tokenArrow"),
        arrowDashed: (n.findOne(".tokenArrow")?.dash()?.length ?? 0) > 0,
        arrowColor: n.findOne(".tokenArrow")?.stroke() ?? arrowColor,
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
        pointerWidth: n.pointerWidth(),
        dash: n.dash(),
      });
    }
  });

  const data = {
    version: 1,
    mapId: currentMap?.id ?? null,
    mapFile: currentMap?.file ?? null,
    stratName: document.getElementById("stratName")?.value || "",
    notes: document.getElementById("notes")?.value || "",
    players: {
      p1: document.getElementById("nameP1")?.value || "",
      p2: document.getElementById("nameP2")?.value || "",
      p3: document.getElementById("nameP3")?.value || "",
      p4: document.getElementById("nameP4")?.value || "",
    },
    tokens,
    drawings,
    trainingSolution: training.solutionState,
    trainingBaseline: training.baselineState,
  };

  // createdAt UNIQUEMENT hors historique
  if (!forHistory) {
    data.createdAt = new Date().toISOString();
  }

  return data;
}

function clearBoard() {
  // garde transformer mais supprime le reste
  layerMain.getChildren().forEach((n) => {
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
  for (const t of data.tokens || []) {
    const node = addToken(t.kind, {
      id: t.id,
      label: t.label,
      rotation: t.rotation,
    });
    if (!node) continue;
    node.position({ x: t.x, y: t.y });
    if (t.hasCone)      toggleCone(node);
    if (t.hasSightLine) toggleSightLine(node);
    if (t.hasArrow)     toggleTokenArrow(node, t.arrowDashed ?? false);
  }

  // dessins
  for (const d of data.drawings || []) {
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
        dash: d.dash ?? [],
        opacity: d.opacity ?? 0.9,
      });
      layerMain.add(arr);
      makeArrowInteractive(arr);
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
  const filename = `strat_${niceName}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  downloadFile(filename, JSON.stringify(data, null, 2), "application/json");
}

function loadStrategyFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      hydrate(data);
      training.baselineState = data.trainingBaseline || null;
      training.solutionState = data.trainingSolution || null;

      uiSetTrainingLabel(training.solutionState ? "solution chargée" : "off");
      uiSetTrainingTimer(20);

      resetHistoryToCurrent();
    } catch (e) {
      alert("JSON invalide.");
      console.error(e);
    }
  };
  reader.readAsText(file);
}

// ✅ Remplace entièrement ta fonction exportPNG() par celle-ci
// Objectif : l'export PNG ne doit JAMAIS affecter l'historique (undo/redo)
// et doit toujours restaurer l'état même si une erreur arrive.

function exportPNG() {
  const prevRestoring = isRestoring;
  isRestoring = true;

  // cacher le transformer
  const prev = transformer.nodes();
  transformer.nodes([]);
  layerMain.draw();

  const stratName = document.getElementById("stratName")?.value || "";
  const notesText = document.getElementById("notes")?.value || "";

  let notesGroup = null;

  try {
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
          (stratName.trim() ? stratName.trim() + "\n\n" : "") +
          "PLAN DE ROUND:\n" +
          notesText,
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
      "image/png",
    );
  } finally {
    // nettoyage garanti
    if (notesGroup) notesGroup.destroy();

    transformer.nodes(prev);
    layerMain.draw();

    isRestoring = prevRestoring;
  }
}

function dataURLToBlob(dataURL) {
  const parts = dataURL.split(",");
  const byteString = atob(parts[1]);
  const mimeString = parts[0].split(":")[1].split(";")[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type: mimeString });
}

function uiSetTrainingLabel(text) {
  const el = document.getElementById("trainingLabel");
  if (el) el.textContent = text;
}

function uiSetTrainingTimer(n) {
  const el = document.getElementById("trainingTimer");
  if (el) el.textContent = String(n);
}

function captureSolution() {
  // 1) BASELINE = ce qui reste toujours visible (ennemis + obj)
  const base = serialize();
  base.tokens = (base.tokens || []).filter(
    (t) => t.kind === "enemy" || t.kind === "obj",
  );
  base.drawings = []; // baseline ne garde pas les flèches

  // 2) SOLUTION = ce que le joueur doit refaire (joueurs + smoke + flèches)
  const sol = serialize();
  sol.tokens = (sol.tokens || []).filter(
    (t) =>
      t.kind === "p1" ||
      t.kind === "p2" ||
      t.kind === "p3" ||
      t.kind === "p4" ||
      t.kind === "smoke",
  );
  // sol.drawings garde les flèches (déjà dans serialize)

  training.baselineState = base;
  training.solutionState = sol;

  uiSetTrainingLabel("solution enregistrée (ennemis/obj gardés)");
  uiSetTrainingTimer(20);
}

function validatePlanA() {
  const state = serialize(true);

  // ✅ Plan A = uniquement nos pièces (et optionnellement OBJ)
  const keep = new Set(["p1", "p2", "p3", "p4", "smoke", "obj"]);

  if (state.tokens && Array.isArray(state.tokens)) {
    state.tokens = state.tokens.filter((t) => keep.has(t.kind));
  }

  training.planAState = state;
  uiSetTrainingLabel("Plan A validé");
}

function restorePlanA() {
  if (!training.planAState) {
    alert("Aucun Plan A validé.");
    return;
  }

  // ✅ 0) On coupe tous les "modes en cours" qui peuvent continuer à modifier l'état après le clic
  coachSignalArmed = false;
  coachZoneArmed = false;

  training.enemiesManualArmed = false;
  // (optionnel mais sûr) si tu veux que le curseur revienne normal
  stage.container().style.cursor = "default";

  // ✅ 1) On annule un éventuel dessin en cours (sinon le mouseup peut pousser un nouvel état)
  isDrawing = false;
  if (drawLine) {
    drawLine.destroy();
    drawLine = null;
  }

  // ✅ 2) Restore plan A (sans polluer l'historique)
  isRestoring = true;
  hydrate(training.planAState);
  isRestoring = false;

  console.log(
    "TOKENS APRES RESTORE:",
    layerMain.find(".token").map((n) => n.getAttr("tokenKind")),
  );

  // ✅ 3) On tue un pushHistoryDebounced en attente (ennemis manuels / actions récentes)
  clearTimeout(historyTimer);

  // ✅ 4) On repart avec un historique clean : Plan A = état 0
  resetHistoryToCurrent();

  // ✅ 5) On repasse en sélection (évite les "effets bizarres" juste après)
  setTool("select");

  uiSetTrainingLabel("Retour au Plan A");
}

function toggleTrainingEnemiesManual() {
  if (currentMode !== "train") return;

  training.enemiesManualArmed = !training.enemiesManualArmed;
  stage.container().style.cursor = training.enemiesManualArmed
    ? "crosshair"
    : "default";

  uiSetTrainingLabel(
    training.enemiesManualArmed
      ? "Place les ennemis (clic map)"
      : "Mode entraînement",
  );
}
function autoPlaceEnemies(count = 4) {
  if (!bgNode) return;

  const img = bgNode.image();
  if (!img) return;

  const w = img.width;
  const h = img.height;

  const margin = 60;

  for (let i = 0; i < count; i++) {
    const x = margin + Math.random() * (w - margin * 2);
    const y = margin + Math.random() * (h - margin * 2);

    const node = addToken("enemy");
    if (!node) continue;
    node.position({ x, y });
  }

  layerMain.draw();
  pushHistoryDebounced();
  uiSetTrainingLabel(`Ennemis auto (${count})`);
}

function setEnemiesVisible(visible) {
  layerMain.getChildren().forEach((n) => {
    if (n === transformer) return;
    if (!n.hasName || !n.hasName("token")) return;

    const kind = n.getAttr("tokenKind");
    if (kind === "enemy") {
      n.visible(visible);
      n.listening(visible);
    }
  });
  selectNode(null);
  layerMain.draw();
}

function setPlayersVisible(visible) {
  layerMain.getChildren().forEach((n) => {
    if (n === transformer) return;
    if (!n.hasName || !n.hasName("token")) return;

    const kind = n.getAttr("tokenKind");
    if (
      kind === "p1" ||
      kind === "p2" ||
      kind === "p3" ||
      kind === "p4" ||
      kind === "smoke"
    ) {
      n.visible(visible);
      n.listening(visible);
    }
  });
  selectNode(null);
  layerMain.draw();
}
function setArrowsVisible(visible) {
  layerMain.getChildren().forEach((n) => {
    if (n.className === "Arrow") {
      n.visible(visible);
      n.listening(visible);
    }
  });
  layerMain.draw();
}

function stopTrainingTimer() {
  if (training.timerId) {
    clearInterval(training.timerId);
    training.timerId = null;
  }
}

function removeAttemptPieces() {
  // enlève sélection
  transformer.nodes([]);
  selectNode(null);

  // 1) supprime TOUS les tokens sauf enemy/obj
  const tokens = layerMain.find(".token"); // Konva selector
  tokens.forEach((node) => {
    const kind = node.getAttr("tokenKind");
    if (kind !== "enemy" && kind !== "obj") {
      node.destroy();
    }
  });

  // 2) supprime TOUTES les flèches
  const arrows = layerMain.find("Arrow");
  arrows.forEach((a) => a.destroy());

  layerMain.draw();
}

function applySolutionPieces(solutionData) {
  if (!solutionData) return;

  // 1) on enlève la tentative du joueur
  removeAttemptPieces();

  // 2) on remet joueurs + smoke
  for (const t of solutionData.tokens || []) {
    const node = addToken(t.kind, { id: t.id, label: t.label });
    if (!node) continue;
    node.position({ x: t.x, y: t.y });
    node.rotation(t.rotation || 0);
    if (t.hasCone)      toggleCone(node);
    if (t.hasSightLine) toggleSightLine(node);
  }
    if (t.hasArrow)     toggleTokenArrow(node, t.arrowDashed ?? false);

  // 3) on remet les flèches
  for (const d of solutionData.drawings || []) {
    if (d.type !== "arrow") continue;

    const arr = new Konva.Arrow({
      points: d.points,
      stroke: d.stroke ?? arrowColor,
      fill: d.fill ?? arrowColor,
      strokeWidth: d.strokeWidth ?? 4,
      pointerLength: d.pointerLength ?? 12,
      pointerWidth: d.pointerWidth ?? 12,
      lineCap: "round",
      lineJoin: "round",
      dash: d.dash ?? [],
      opacity: d.opacity ?? 0.9,
    });

    layerMain.add(arr);
    makeArrowInteractive(arr);
  }

  selectNode(null);
  layerMain.draw();
}

function startTraining(seconds = 20) {
  if (!training.baselineState || !training.solutionState) {
    alert('D’abord : clique sur "Définir la solution" (ennemis + strat).');
    return;
  }

  // Remet le board baseline (ennemis + obj visibles)
  isRestoring = true;
  hydrate(training.baselineState);
  isRestoring = false;

  // Enlève ce que le joueur doit replacer (joueurs + flèches + smoke)
  removeAttemptPieces();

  training.active = true;
  training.remaining = seconds;
  uiSetTrainingLabel("entrainement (place joueurs + flèches + grenades)");
  uiSetTrainingTimer(training.remaining);

  stopTrainingTimer();
  training.timerId = setInterval(() => {
    training.remaining -= 1;
    uiSetTrainingTimer(training.remaining);

    if (training.remaining <= 0) {
      stopTrainingTimer();
      uiSetTrainingLabel("temps écoulé — affiche la solution");
    }
  }, 1000);
}

function showSolution() {
  if (!training.solutionState) {
    alert(
      'Pas de solution enregistrée. Clique sur "Définir la solution" d’abord.',
    );
    return;
  }

  stopTrainingTimer();
  training.active = false;

  isRestoring = true;

  // On remet toujours le baseline (ennemis + obj) pour repartir propre
  if (training.baselineState) {
    hydrate(training.baselineState);
  }

  // Puis on applique la solution (joueurs + smoke + flèches)
  applySolutionPieces(training.solutionState);

  isRestoring = false;

  uiSetTrainingLabel("solution affichée");
  uiSetTrainingTimer(20);
}

function stopTraining() {
  stopTrainingTimer();
  training.active = false;
  setPlayersVisible(true);
  setArrowsVisible(true);
  uiSetTrainingLabel("off");
  uiSetTrainingTimer(20);
}

init().catch((err) => {
  console.error(err);
  alert("Erreur de chargement (maps.json / images).");
});
