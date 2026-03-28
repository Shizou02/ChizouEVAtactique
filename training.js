/*  StratHub — training.js
    Mode entraînement : capture solution, timer, plan A, ennemis auto.
    Dépend de : globals.js, tokens.js, serialize.js, history.js
*/

function uiSetTrainingLabel(text) {
  const el = $("trainingLabel");
  if (el) el.textContent = text;
}

function uiSetTrainingTimer(n) {
  const el = $("trainingTimer");
  if (el) el.textContent = String(n);
}

function captureSolution() {
  const base = serialize();
  base.tokens = (base.tokens || []).filter(
    (t) => t.kind === "enemy" || t.kind === "obj",
  );
  base.drawings = [];

  const sol = serialize();
  sol.tokens = (sol.tokens || []).filter(
    (t) => t.kind === "p1" || t.kind === "p2" || t.kind === "p3" || t.kind === "p4" || t.kind === "smoke",
  );

  training.baselineState = base;
  training.solutionState = sol;

  uiSetTrainingLabel("solution enregistrée (ennemis/obj gardés)");
  uiSetTrainingTimer(20);
}

function validatePlanA() {
  const state = serialize(true);
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

  coachSignalArmed = false;
  coachZoneArmed = false;
  training.enemiesManualArmed = false;
  stage.container().style.cursor = "default";

  isDrawing = false;
  if (drawLine) {
    drawLine.destroy();
    drawLine = null;
  }

  isRestoring = true;
  hydrate(training.planAState);
  isRestoring = false;

  clearTimeout(historyTimer);
  resetHistoryToCurrent();
  setTool("select");

  uiSetTrainingLabel("Retour au Plan A");
}

function toggleTrainingEnemiesManual() {
  if (currentMode !== "train") return;

  training.enemiesManualArmed = !training.enemiesManualArmed;
  stage.container().style.cursor = training.enemiesManualArmed ? "crosshair" : "default";

  uiSetTrainingLabel(
    training.enemiesManualArmed ? "Place les ennemis (clic map)" : "Mode entraînement",
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
    if (kind === "p1" || kind === "p2" || kind === "p3" || kind === "p4" || kind === "smoke") {
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
  transformer.nodes([]);
  selectNode(null);

  const tokens = layerMain.find(".token");
  tokens.forEach((node) => {
    const kind = node.getAttr("tokenKind");
    if (kind !== "enemy" && kind !== "obj") {
      node.destroy();
    }
  });

  const arrows = layerMain.find("Arrow");
  arrows.forEach((a) => a.destroy());

  layerMain.draw();
}

function applySolutionPieces(solutionData) {
  if (!solutionData) return;

  removeAttemptPieces();

  for (const t of solutionData.tokens || []) {
    const node = addToken(t.kind, { id: t.id, label: t.label });
    if (!node) continue;
    node.position({ x: t.x, y: t.y });
    node.rotation(t.rotation || 0);
    if (t.hasCone)      toggleCone(node);
    if (t.hasSightLine) toggleSightLine(node);
    if (t.hasArrow)     toggleTokenArrow(node, t.arrowDashed ?? false);
  }

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
    alert('D\u2019abord : clique sur "Définir la solution" (ennemis + strat).');
    return;
  }

  isRestoring = true;
  hydrate(training.baselineState);
  isRestoring = false;

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
    alert('Pas de solution enregistrée. Clique sur "Définir la solution" d\u2019abord.');
    return;
  }

  stopTrainingTimer();
  training.active = false;

  isRestoring = true;

  if (training.baselineState) {
    hydrate(training.baselineState);
  }

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
