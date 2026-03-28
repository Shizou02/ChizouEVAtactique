/*  StratHub — board.js
    Point d'entrée : init, setupStage, setupUI, loadBackground, switchFloor.
    Chargé en dernier par board.html.
    Dépend de : globals.js, raycasting.js, tokens.js, loadout.js, serialize.js, history.js, training.js
*/

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
  const mapId = qs("map");

  let maps;
  try {
    const res = await fetch("maps.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    maps = await res.json();
  } catch (e) {
    console.error("Impossible de charger maps.json :", e);
    alert("Erreur : impossible de charger la liste des maps (maps.json).");
    return;
  }

  if (!Array.isArray(maps) || maps.length === 0) {
    alert("Erreur : maps.json est vide ou invalide.");
    return;
  }

  currentMap = maps.find((m) => m.id === mapId) || maps[0];

  const mapTitle = $("mapTitle");
  if (mapTitle) mapTitle.textContent = `Board — ${currentMap?.name ?? "Map"}`;

  if (currentMap?.naturalWidth) loadout.mapNaturalWidth = currentMap.naturalWidth;

  setupStage();
  if (currentMap?.wallmap) await loadWallMap(currentMap.wallmap);
  await loadBackground(currentMap.file);

  const floorSection = $("floorSection");
  if (floorSection) floorSection.style.display = currentMap?.upper ? "block" : "none";

  setupUI();
  resetHistoryToCurrent();
  fitStageToContainer();
  window.addEventListener("resize", fitStageToContainer);
}

// ─── Floor switch ────────────────────────────────────────────────────────────

async function switchFloor() {
  if (!currentMap?.upper) return;
  currentFloor = currentFloor === 'ground' ? 'upper' : 'ground';
  const src = currentFloor === 'upper' ? currentMap.upper : currentMap.file;
  const btn = $("floorToggle");
  if (btn) btn.textContent = currentFloor === 'upper' ? "↓ Ground Floor" : "↑ Upper Floor";
  wallPixels = null;
  const wallSrc = currentFloor === 'upper'
    ? (currentMap.wallmap_upper || currentMap.wallmap)
    : currentMap.wallmap;
  if (wallSrc) await loadWallMap(wallSrc);
  await loadBackground(src);
  drawRangesForAllPlayers();
}

// ─── Stage setup ─────────────────────────────────────────────────────────────

function setupStage() {
  const parent = $("stageParent");
  const w = parent.clientWidth;
  const h = parent.clientHeight;

  stage = new Konva.Stage({ container: "stageParent", width: w, height: h });

  stage.container().addEventListener("contextmenu", (e) => e.preventDefault());

  // Clic droit → menu contextuel pion
  stage.container().addEventListener("contextmenu", (e) => {
    e.preventDefault();

    const containerRect = stage.container().getBoundingClientRect();
    const pos = { x: e.clientX - containerRect.left, y: e.clientY - containerRect.top };

    const tokens = layerMain.find(".token");
    let closest = null;
    let closestDist = Infinity;

    for (const token of tokens) {
      const kind = token.getAttr("tokenKind");
      if (!isSoldier(kind)) continue;
      const absPos = token.getAbsolutePosition();
      const dist = Math.hypot(absPos.x - pos.x, absPos.y - pos.y);
      if (dist < closestDist) { closestDist = dist; closest = token; }
    }

    if (!closest || closestDist > 40) return;

    selectNode(closest);
    showContextMenu(closest, { x: e.clientX, y: e.clientY });
  });

  layerBg   = new Konva.Layer();
  layerMain = new Konva.Layer();
  layerFx   = new Konva.Layer();

  stage.add(layerBg);
  stage.add(layerMain);
  stage.add(layerFx);

  transformer = new Konva.Transformer({
    rotateEnabled: false,
    enabledAnchors: [],
    ignoreStroke: true,
  });
  layerMain.add(transformer);

  // Désélection sur clic vide
  stage.on("mousedown touchstart", (e) => {
    if (tool === "draw") return;
    if (e.target === stage) { selectNode(null); return; }
  });

  // Sélection flèche en mode select
  stage.on("mousedown touchstart", (e) => {
    if (tool !== "select") return;
    if (e.target && e.target.className === "Arrow") {
      selectNode(e.target);
      e.cancelBubble = true;
    }
  });

  // ── Dessin de flèches ──
  stage.on("mousedown touchstart", (e) => {
    if (tool !== "draw") return;
    if (e.target !== stage && e.target.getLayer() !== layerBg) return;

    isDrawing = true;
    const pos = getPointerPosInLayer();
    if (!pos) return;
    drawLine = new Konva.Arrow({
      points: [pos.x, pos.y, pos.x, pos.y],
      stroke: arrowColor, fill: arrowColor,
      strokeWidth: 4, pointerLength: 12, pointerWidth: 12,
      lineCap: "round", lineJoin: "round", opacity: 0.9,
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
    if (tool !== "draw" || !isDrawing) return;
    isDrawing = false;

    if (drawLine) {
      const pts = drawLine.points();
      if (Math.hypot(pts[2] - pts[0], pts[3] - pts[1]) < 3) {
        drawLine.destroy();
      } else {
        makeArrowInteractive(drawLine);
      }
    }

    drawLine = null;
    layerMain.draw();
    pushHistory();
  });

  // Supprimer via Suppr
  window.addEventListener("keydown", (e) => {
    if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
  });

  // ── Coaching : ping signal ──
  stage.on("mousedown touchstart", (e) => {
    if (currentMode !== "coach" || !coachSignalArmed) return;
    if (e.target !== stage && e.target.getLayer() !== layerBg) return;

    const pos = getPointerPosInLayer();
    if (!pos) return;

    coachSignalArmed = false;
    stage.container().style.cursor = tool === "draw" ? "crosshair" : "default";

    const ping = new Konva.Circle({
      x: pos.x, y: pos.y,
      radius: Math.round(16 * tokenScale()),
      fill: "rgba(255, 80, 80, 0.75)",
      stroke: "rgba(255, 180, 180, 0.9)",
      strokeWidth: Math.max(1.5, 2 * tokenScale()),
    });

    layerFx.add(ping);
    layerFx.draw();
    setTimeout(() => { ping.destroy(); layerFx.draw(); }, 1500);
  });

  // ── Coaching : zone rectangle ──
  stage.on("mousedown touchstart", (e) => {
    if (currentMode !== "coach" || !coachZoneArmed) return;
    if (e.target !== stage && e.target.getLayer() !== layerBg) return;

    const pos = getPointerPosInLayer();
    if (!pos) return;

    coachZoneStart = { x: pos.x, y: pos.y };
    coachZoneRect = new Konva.Rect({
      x: pos.x, y: pos.y, width: 1, height: 1,
      fill: "rgba(255, 200, 80, 0.18)",
      stroke: "rgba(255, 200, 80, 0.8)",
      strokeWidth: 2, cornerRadius: 8,
    });
    layerFx.add(coachZoneRect);
    layerFx.draw();
  });

  stage.on("mousemove touchmove", () => {
    if (currentMode !== "coach" || !coachZoneArmed) return;
    if (!coachZoneRect || !coachZoneStart) return;

    const pos = getPointerPosInLayer();
    if (!pos) return;

    const x = Math.min(coachZoneStart.x, pos.x);
    const y = Math.min(coachZoneStart.y, pos.y);
    coachZoneRect.position({ x, y });
    coachZoneRect.size({ width: Math.abs(pos.x - coachZoneStart.x), height: Math.abs(pos.y - coachZoneStart.y) });
    layerFx.batchDraw();
  });

  stage.on("mouseup touchend", () => {
    if (currentMode !== "coach" || !coachZoneArmed || !coachZoneRect) return;

    if (coachZoneRect.width() < 8 || coachZoneRect.height() < 8) {
      coachZoneRect.destroy();
      layerFx.draw();
    } else {
      const rectToRemove = coachZoneRect;
      setTimeout(() => { rectToRemove.destroy(); layerFx.draw(); }, 1500);
    }

    coachZoneRect = null;
    coachZoneStart = null;
    coachZoneArmed = false;
    stage.container().style.cursor = tool === "draw" ? "crosshair" : "default";
  });

  // ── Ennemis manuels (mode train) ──
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

// ─── Fit stage ───────────────────────────────────────────────────────────────

function fitStageToContainer() {
  const parent = $("stageParent");
  stage.width(parent.clientWidth);
  stage.height(parent.clientHeight);
  stage.draw();
}

// ─── Wallmap ─────────────────────────────────────────────────────────────────

async function loadWallMap(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(); return; }
    const img = new Image();
    img.onload = () => {
      const off = document.createElement('canvas');
      off.width = img.width; off.height = img.height;
      const ctx2 = off.getContext('2d');
      ctx2.drawImage(img, 0, 0);
      wallPixels = ctx2.getImageData(0, 0, img.width, img.height);
      wallImgW = img.width; wallImgH = img.height;
      const d = wallPixels.data;
      let hasPartialAlpha = false;
      for (let i = 3; i < Math.min(d.length, 40000); i += 4) {
        if (d[i] > 0 && d[i] < 255) { hasPartialAlpha = true; break; }
      }
      wallPixels._useAlpha = hasPartialAlpha;
      wallPixels._useWhite = !hasPartialAlpha;
      resolve();
    };
    img.onerror = () => { console.warn('loadWallMap: impossible de charger', src); resolve(); };
    img.src = src;
  });
}

// ─── Background ──────────────────────────────────────────────────────────────

async function loadBackground(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      layerBg.destroyChildren();

      const offscreen = document.createElement('canvas');
      offscreen.width = img.width; offscreen.height = img.height;
      const offCtx = offscreen.getContext('2d');
      offCtx.drawImage(img, 0, 0);
      wallPixels = offCtx.getImageData(0, 0, img.width, img.height);
      wallImgW = img.width; wallImgH = img.height;

      bgNode = new Konva.Image({ image: img, x: 0, y: 0 });
      layerBg.add(bgNode);

      function resizeBg() {
        const sw = stage.width(), sh = stage.height();
        const iw = img.width, ih = img.height;
        const scale = Math.min(sw / iw, sh / ih);
        const nw = iw * scale, nh = ih * scale;

        bgNode.width(nw); bgNode.height(nh);
        bgNode.x((sw - nw) / 2); bgNode.y((sh - nh) / 2);
        layerBg.draw();

        layerMain.position({ x: bgNode.x(), y: bgNode.y() });
        layerMain.scale({ x: scale, y: scale });
        layerMain.draw();
        layerFx.position({ x: bgNode.x(), y: bgNode.y() });
        layerFx.scale({ x: scale, y: scale });
        layerFx.draw();

        loadout.mapNaturalWidth = iw;
        loadout.mapCurrentScale = scale;
        loadout.meterToPx = pxPerMeter() * scale;
        drawRangesForAllPlayers();
      }

      resizeBg();
      window.addEventListener("resize", resizeBg);
      resolve();
    };
    img.onerror = reject;
    img.src = src;
  });
}

// ─── Tool switch ─────────────────────────────────────────────────────────────

function setTool(next) {
  tool = next;
  const btnSelect = $("toolSelect");
  const btnDraw   = $("toolDraw");

  if (tool === "select") {
    if (btnSelect) btnSelect.classList.add("primary");
    if (btnDraw)   btnDraw.classList.remove("primary");
    stage.container().style.cursor = "default";
  } else {
    if (btnDraw)   btnDraw.classList.add("primary");
    if (btnSelect) btnSelect.classList.remove("primary");
    selectNode(null);
    stage.container().style.cursor = "crosshair";
  }
}

// ─── Setup UI ────────────────────────────────────────────────────────────────

function setupUI() {
  bindClick("toolSelect", () => setTool("select"));
  bindClick("toolDraw",   () => setTool("draw"));

  bindClick("addP1",    () => addToken("p1"));
  bindClick("addP2",    () => addToken("p2"));
  bindClick("addP3",    () => addToken("p3"));
  bindClick("addP4",    () => addToken("p4"));
  bindClick("addEnemy", () => addToken("enemy"));
  bindClick("addObj",   () => addToken("obj"));
  bindClick("addSmoke", () => addToken("smoke"));

  bindClick("rotateLeft",     () => rotateSelected(-15));
  bindClick("rotateRight",    () => rotateSelected(15));
  bindClick("deleteSelected", () => deleteSelected());

  bindClick("saveJson",  () => saveStrategy());
  bindClick("exportPng", () => exportPNG());
  bind("loadJson", "change", (e) => loadStrategyFile(e.target.files?.[0]));

  const zoom = $("zoom");
  if (zoom) {
    zoom.addEventListener("input", () => {
      const s = Number(zoom.value) / 100;
      stage.scale({ x: s, y: s });
      stage.position({ x: 0, y: 0 });
      stage.batchDraw();
    });
  }

  bind("arrowColorPicker", "input", (e) => { arrowColor = e.target.value; });

  const btnSolid  = $("arrowSolid");
  const btnDashed = $("arrowDashed");

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

  bindClick("undoBtn", undo);
  bindClick("redoBtn", redo);

  bindClick("setSolution",        captureSolution);
  bindClick("startTraining",      () => startTraining(20));
  bindClick("showSolution",       showSolution);
  bindClick("stopTraining",       stopTraining);
  bindClick("validatePlanA",      validatePlanA);
  bindClick("restorePlanA",       restorePlanA);
  bindClick("trainEnemiesManual", toggleTrainingEnemiesManual);
  bindClick("trainEnemiesAuto",   () => autoPlaceEnemies(4));

  uiSetTrainingLabel("off");
  uiSetTrainingTimer(20);

  const modeSelect = $("modeSelect");
  const trainBlock = $("modeTrainBlock");
  const coachBlock = $("modeCoachBlock");

  function applyModeUI(mode) {
    if (trainBlock) trainBlock.style.display = mode === "train" ? "block" : "none";
    if (coachBlock) coachBlock.style.display = mode === "coach" ? "block" : "none";
  }

  if (modeSelect) {
    currentMode = modeSelect.value;
    modeSelect.addEventListener("change", () => {
      currentMode = modeSelect.value;
      coachSignalArmed = false;
      stage.container().style.cursor = tool === "draw" ? "crosshair" : "default";
      applyModeUI(modeSelect.value);
    });
    applyModeUI(modeSelect.value);
  }

  const coachSignalBtn = $("coachSignal");
  if (coachSignalBtn) {
    coachSignalBtn.onclick = () => {
      if (currentMode !== "coach") return;
      coachSignalArmed = !coachSignalArmed;
      stage.container().style.cursor = coachSignalArmed ? "crosshair" : (tool === "draw" ? "crosshair" : "default");
    };
  }

  const coachZoneBtn = $("coachZone");
  if (coachZoneBtn) {
    coachZoneBtn.onclick = () => {
      if (currentMode !== "coach") return;
      coachZoneArmed = true;
      coachSignalArmed = false;
      stage.container().style.cursor = "crosshair";
    };
  }

  const panel   = $("loadoutPanel");
  const openBtn = $("openLoadout");
  const closeBtn = $("closeLoadout");

  if (openBtn && panel) {
    openBtn.addEventListener("click", () => {
      panel.classList.add("open");
      document.body.classList.add("loadout-open");
    });
  }
  if (closeBtn && panel) {
    closeBtn.addEventListener("click", () => {
      panel.classList.remove("open");
      document.body.classList.remove("loadout-open");
    });
  }

  loadoutList = $("loadoutWeapons");
  if (!loadoutList) return;

  fetch("armes.json")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((weapons) => {
      allWeapons = weapons;
      loadout.weapons = weapons;

      const groups = {};
      weapons.forEach((w) => { const g = w.group || "Autres"; (groups[g] ||= []).push(w); });

      const order = ["Fusils d'assaut", "Longue portée", "Armes rapprochées", "Spéciales", "Accessoires"];
      const groupNames = [
        ...order.filter((g) => groups[g]),
        ...Object.keys(groups).filter((g) => !order.includes(g)).sort(),
      ];

      loadoutList.innerHTML = groupNames.map((groupName) => {
        const buttons = groups[groupName]
          .map((w) => `<button class="weapon-item" type="button" data-id="${w.id}">${w.name}</button>`)
          .join("");
        return `<div class="loadout-group"><div class="loadout-group-title">${groupName}</div><div class="loadout-group-weapons">${buttons}</div></div>`;
      }).join("");
    });

  const selectedLabel = $("loadoutSelected");

  loadoutList.addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") return;

    const weaponId = e.target.dataset.id;

    if (selectedWeapons.includes(weaponId)) {
      selectedWeapons = selectedWeapons.filter((id) => id !== weaponId);
      e.target.classList.remove("selected");
    } else {
      if (selectedWeapons.length === 2) {
        const removed = selectedWeapons.shift();
        const oldBtn = loadoutList.querySelector(`button[data-id="${removed}"]`);
        if (oldBtn) oldBtn.classList.remove("selected");
      }
      selectedWeapons.push(weaponId);
      e.target.classList.add("selected");
    }

    if (selectedLabel) {
      const lines = selectedWeapons.map((id) => {
        const w = allWeapons.find((x) => x.id === id);
        return w ? `${w.name} → ${w.stats["Portée"]}` : id;
      });
      selectedLabel.textContent = lines.length ? lines.join(" | ") : "Aucune arme sélectionnée";
      loadout.selectedWeaponIds = [...selectedWeapons];
      drawRangesForSelection();
    }

    if (activePlayerKind) playerLoadouts[activePlayerKind] = [...selectedWeapons];
    drawRangesForAllPlayers();
  });

  setTool("select");
}

// ─── Lancement ───────────────────────────────────────────────────────────────

init().catch((err) => {
  console.error(err);
  alert("Erreur de chargement (maps.json / images).");
});
