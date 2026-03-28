/*  StratHub — serialize.js
    Sérialisation, hydratation, sauvegarde, chargement, export PNG.
    Dépend de : globals.js, tokens.js (addToken, selectNode, makeArrowInteractive, toggleCone, toggleSightLine, toggleTokenArrow)
*/

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
    stratName: $("stratName")?.value || "",
    notes: $("notes")?.value || "",
    players: {
      p1: $("nameP1")?.value || "",
      p2: $("nameP2")?.value || "",
      p3: $("nameP3")?.value || "",
      p4: $("nameP4")?.value || "",
    },
    tokens,
    drawings,
    trainingSolution: training.solutionState,
    trainingBaseline: training.baselineState,
  };

  if (!forHistory) {
    data.createdAt = new Date().toISOString();
  }

  return data;
}

function clearBoard() {
  layerMain.getChildren().forEach((n) => {
    if (n !== transformer) n.destroy();
  });
  transformer.nodes([]);
  layerMain.draw();
}

function hydrate(data) {
  if (!data || typeof data !== "object") {
    console.warn("hydrate: données invalides (pas un objet)");
    return;
  }

  if (data.tokens && !Array.isArray(data.tokens)) {
    console.warn("hydrate: tokens n'est pas un tableau, ignoré");
    data.tokens = [];
  }

  if (data.drawings && !Array.isArray(data.drawings)) {
    console.warn("hydrate: drawings n'est pas un tableau, ignoré");
    data.drawings = [];
  }

  clearBoard();

  const stratEl = $("stratName");
  if (stratEl) stratEl.value = data.stratName || "";

  const notesEl = $("notes");
  if (notesEl) notesEl.value = data.notes || "";
  const p = data.players || {};
  const n1 = $("nameP1");
  const n2 = $("nameP2");
  const n3 = $("nameP3");
  const n4 = $("nameP4");

  if (n1) n1.value = p.p1 || "";
  if (n2) n2.value = p.p2 || "";
  if (n3) n3.value = p.p3 || "";
  if (n4) n4.value = p.p4 || "";

  // tokens
  for (const t of data.tokens || []) {
    if (!t.kind || !TOKENS[t.kind]) {
      console.warn("hydrate: token ignoré (kind invalide)", t.kind);
      continue;
    }
    const node = addToken(t.kind, {
      id: t.id,
      label: t.label,
      rotation: t.rotation,
    });
    if (!node) continue;
    node.position({ x: t.x ?? 0, y: t.y ?? 0 });
    if (t.hasCone)      toggleCone(node);
    if (t.hasSightLine) toggleSightLine(node);
    if (t.hasArrow)     toggleTokenArrow(node, t.arrowDashed ?? false);
  }

  // dessins
  for (const d of data.drawings || []) {
    if (d.type === "arrow" && Array.isArray(d.points) && d.points.length >= 4) {
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
  reader.onerror = () => {
    alert("Erreur : impossible de lire le fichier.");
    console.error("FileReader error:", reader.error);
  };
  reader.onload = () => {
    try {
      const raw = String(reader.result);
      if (!raw.trim()) {
        alert("Le fichier est vide.");
        return;
      }
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") {
        alert("Le fichier ne contient pas un objet JSON valide.");
        return;
      }
      hydrate(data);
      training.baselineState = data.trainingBaseline || null;
      training.solutionState = data.trainingSolution || null;

      uiSetTrainingLabel(training.solutionState ? "solution chargée" : "off");
      uiSetTrainingTimer(20);

      resetHistoryToCurrent();
    } catch (e) {
      alert("JSON invalide — le fichier n'a pas pu être chargé.\nVérifie que c'est bien un fichier .json exporté par StratHub.");
      console.error("loadStrategyFile:", e);
    }
  };
  reader.readAsText(file);
}

function exportPNG() {
  const prevRestoring = isRestoring;
  isRestoring = true;

  const prev = transformer.nodes();
  transformer.nodes([]);
  layerMain.draw();

  const stratName = $("stratName")?.value || "";
  const notesText = $("notes")?.value || "";

  let notesGroup = null;

  try {
    if (notesText.trim() !== "") {
      const padding = 12;
      const width = stage.width();
      const height = 90;

      notesGroup = new Konva.Group({ x: 0, y: stage.height() - height });

      const bg = new Konva.Rect({ width, height, fill: "rgba(0,0,0,0.7)" });

      const txt = new Konva.Text({
        x: padding, y: padding,
        width: width - padding * 2,
        text: (stratName.trim() ? stratName.trim() + "\n\n" : "") + "PLAN DE ROUND:\n" + notesText,
        fill: "#ffffff", fontSize: 14, lineHeight: 1.3,
      });

      notesGroup.add(bg);
      notesGroup.add(txt);
      layerMain.add(notesGroup);
      layerMain.draw();
    }

    const url = stage.toDataURL({ pixelRatio: 2 });
    downloadFile(`export_${currentMap?.id || "map"}.png`, dataURLToBlob(url), "image/png");
  } finally {
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
