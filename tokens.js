/*  StratHub — tokens.js
    Création et manipulation des pions (joueurs, ennemis, objectifs, grenades).
    Menu contextuel (clic droit).
    Dépend de : globals.js, raycasting.js, history.js
*/

// ─── Menu contextuel ─────────────────────────────────────────────────────────

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

  const title = document.createElement("div");
  title.textContent = "Options du pion";
  title.style.cssText = "font-size:11px;font-weight:700;opacity:0.45;padding:4px 8px 2px;letter-spacing:0.08em;text-transform:uppercase;color:#e8eef6;";
  menu.appendChild(title);

  const btnSolid = makeCtxBtn(
    (hasArrow && !arrowDashed) ? "✅ Flèche pleine (retirer)" : "➡️ Flèche pleine",
    () => { toggleTokenArrow(group, false); hideContextMenu(); }
  );

  const btnDashed = makeCtxBtn(
    (hasArrow && arrowDashed) ? "✅ Flèche pointillée (retirer)" : "➡️ Flèche pointillée",
    () => { toggleTokenArrow(group, true); hideContextMenu(); }
  );

  const btnCone = makeCtxBtn(
    hasCone ? "✅ Cône de vision (retirer)" : "🔶 Cône de vision",
    () => { toggleCone(group); hideContextMenu(); }
  );

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
  const el = $("ctxMenu");
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
  addRaycastCone(group);
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

  const _sl = tokenScale();
  const line = new Konva.Line({
    name: "sightLine",
    points: [0, 0, Math.round(220 * _sl), 0],
    stroke: "rgba(255, 60, 60, 0.85)",
    strokeWidth: Math.max(1, 1.5 * _sl),
    dash: [Math.round(8 * _sl), Math.round(5 * _sl)],
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

  if (existing) {
    const isDashed = existing.dash()?.length > 0;
    if (isDashed === dashed) {
      existing.destroy();
      layerMain.draw();
      pushHistory();
      return;
    }
    existing.destroy();
  }

  const _as = tokenScale();
  const arrow = new Konva.Arrow({
    name: "tokenArrow",
    points: [0, 0, Math.round(80 * _as), 0],
    stroke: arrowColor,
    fill: arrowColor,
    strokeWidth: Math.max(2, 3 * _as),
    pointerLength: Math.round(10 * _as),
    pointerWidth: Math.round(10 * _as),
    lineCap: "round",
    dash: dashed ? [Math.round(8 * _as), Math.round(5 * _as)] : [],
    opacity: 0.9,
    listening: false,
  });

  group.add(arrow);
  arrow.moveToBottom();
  layerMain.draw();
  pushHistory();
}

// ─── Création de pion ────────────────────────────────────────────────────────

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

  const label =
    opts.label ??
    (kind === "p1"
      ? $("nameP1")?.value || cfg.label
      : kind === "p2"
        ? $("nameP2")?.value || cfg.label
        : kind === "p3"
          ? $("nameP3")?.value || cfg.label
          : kind === "p4"
            ? $("nameP4")?.value || cfg.label
            : cfg.label);

  const r = Math.round(22 * tokenScale());

  if (isSoldier(kind)) {
    if (opts.rotation != null) {
      group.rotation(opts.rotation);
    } else if (kind === "enemy") {
      group.rotation(180);
    }

    const s = tokenScale();

    const ring = new Konva.Circle({
      radius: r,
      stroke: cfg.fill,
      strokeWidth: Math.max(2, 3 * s),
      opacity: 0.9,
    });
    ring.shadowColor("black");
    ring.shadowBlur(6 * s);
    ring.shadowOpacity(0.35);
    ring.shadowOffset({ x: 0, y: 2 * s });

    const head = new Konva.Circle({
      x: -4 * s, y: -8 * s,
      radius: 5 * s,
      fill: "#f1f5f9", opacity: 0.95,
    });

    const body = new Konva.Rect({
      x: -7 * s, y: -2 * s,
      width: 10 * s, height: 14 * s,
      fill: cfg.fill, cornerRadius: 4 * s, opacity: 0.95,
    });

    const gun = new Konva.Rect({
      x: 3 * s, y: -5 * s,
      width: 16 * s, height: 4 * s,
      fill: "#0b0f14", cornerRadius: 2 * s, opacity: 0.95,
    });

    const muzzle = new Konva.Circle({
      x: 20 * s, y: -3 * s,
      radius: 2 * s,
      fill: "#e8eef6", opacity: 0.9,
    });

    const nameText = new Konva.Text({
      text: label,
      fontSize: Math.round(11 * s),
      fontStyle: "bold",
      fill: "#ffffff",
      y: 22 * s,
      align: "center",
    });
    nameText.shadowColor("black");
    nameText.shadowBlur(6 * s);
    nameText.shadowOpacity(0.8);
    nameText.offsetX(nameText.width() / 2);

    group.add(ring, head, body, gun, muzzle, nameText);
  } else if (kind === "obj") {
    const so = tokenScale();
    const badge = new Konva.Rect({
      x: -22 * so, y: -14 * so,
      width: 44 * so, height: 28 * so,
      fill: "rgba(11,15,20,0.85)",
      cornerRadius: 10 * so,
      stroke: cfg.fill, strokeWidth: 2 * so,
    });

    const txt = new Konva.Text({
      text: "OBJ",
      fontSize: Math.round(12 * so),
      fontStyle: "bold",
      fill: cfg.fill,
    });
    txt.offsetX(txt.width() / 2);
    txt.offsetY(txt.height() / 2);

    group.add(badge, txt);
  } else if (kind === "smoke") {
    const sg = tokenScale();
    const pin = new Konva.Circle({
      radius: 16 * sg,
      fill: "rgba(11,15,20,0.85)",
      stroke: cfg.fill, strokeWidth: 2 * sg,
    });

    const g = new Konva.Text({
      text: "G",
      fontSize: Math.round(14 * sg),
      fontStyle: "bold",
      fill: "#ffffff",
    });
    g.offsetX(g.width() / 2);
    g.offsetY(g.height() / 2);

    group.add(pin, g);
  }

  // interactions
  group.on("mousedown touchstart", (e) => {
    if (tool !== "select") return;
    selectNode(group);
    e.cancelBubble = true;
  });

  group.on("dragmove", () => {
    if (group.findOne(".visionCone")) addRaycastCone(group);
    layerMain.batchDraw();
  });
  group.on("dragend", () => {
    if (group.findOne(".visionCone")) addRaycastCone(group);
    pushHistory();
  });

  group.setAttr("tokenKind", kind);

  layerMain.add(group);
  selectNode(group);
  layerMain.draw();
  pushHistory();

  return group;
}

// ─── Sélection ───────────────────────────────────────────────────────────────

function selectNode(node) {
  if (!node) {
    transformer.nodes([]);
    layerMain.draw();
    return;
  }
  transformer.nodes([node]);
  layerMain.draw();

  const loadoutPlayer = $("loadoutPlayer");

  if (loadoutPlayer) {
    const kind = node.getAttr("tokenKind");

    if (kind === "p1" || kind === "p2" || kind === "p3" || kind === "p4") {
      activePlayerKind = kind;
      loadoutPlayer.textContent = "Joueur sélectionné : " + kind.toUpperCase();

      selectedWeapons = [...playerLoadouts[kind]];

      if (loadoutList) {
        loadoutList.querySelectorAll("button.weapon-item").forEach((b) => {
          const id = b.dataset.id;
          b.classList.toggle("selected", selectedWeapons.includes(id));
        });
      }
    } else {
      loadoutPlayer.textContent = "Joueur : aucun";
      loadout.selectedPlayerNode = null;
      clearRanges();
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
  if (node.findOne && node.findOne(".visionCone")) {
    addRaycastCone(node);
  }
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

function makeArrowInteractive(arr) {
  arr.hitStrokeWidth(25);
  arr.draggable(true);

  arr.on("mousedown touchstart", (e) => {
    if (tool !== "select") return;
    selectNode(arr);
    e.cancelBubble = true;
  });

  arr.on("dragmove", () => layerMain.batchDraw());
  arr.on("dragend", () => pushHistory());
}
