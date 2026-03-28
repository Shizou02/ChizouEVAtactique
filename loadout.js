/*  StratHub — loadout.js
    Panneau weapon loadout et cercles de portée.
    Dépend de : globals.js
*/

function parseEffectiveRangeMeters(weapon) {
  if (weapon?.range_m != null && weapon.range_m > 0) return weapon.range_m;
  const s = String(weapon?.stats?.["Portée"] ?? "");
  const m = s.match(/0\s*-\s*([0-9]+(?:\.[0-9]+)?)\s*m/i);
  return m ? Number(m[1]) : null;
}

function clearRanges() {
  layerFx.find(".range").forEach((n) => n.destroy());
  layerFx.draw();
}

function drawRangesForSelection() {
  clearRanges();

  if (!loadout.selectedPlayerNode) return;

  const ids = loadout.selectedWeaponIds;
  if (!ids || ids.length === 0) return;

  const center = {
    x: loadout.selectedPlayerNode.x(),
    y: loadout.selectedPlayerNode.y(),
  };

  const colors = ["#4ade80", "#3b82f6"];
  const dashes = [[], [10, 8]];

  ids.slice(0, 2).forEach((id, i) => {
    const w = loadout.weapons.find((x) => x.id === id);
    const meters = parseEffectiveRangeMeters(w);
    if (meters == null) return;

    layerFx.add(new Konva.Circle({
      x: center.x,
      y: center.y,
      radius: meters * loadout.meterToPx,
      stroke: colors[i],
      strokeWidth: 3,
      dash: dashes[i],
      opacity: 0.9,
      name: "range",
      listening: false,
    }));
  });

  layerFx.draw();
}

function drawRangesForAllPlayers() {
  clearRanges();

  const kinds = ["p1", "p2", "p3", "p4"];

  for (const kind of kinds) {
    const weaponIds = playerLoadouts[kind];
    if (!weaponIds || weaponIds.length === 0) continue;

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
      layerFx.add(new Konva.Circle({
        x: center.x, y: center.y,
        radius: r1m * loadout.meterToPx,
        stroke: "#4ade80", strokeWidth: 3, dash: [],
        opacity: 0.9, name: "range", listening: false,
      }));
    }

    if (r2m != null) {
      layerFx.add(new Konva.Circle({
        x: center.x, y: center.y,
        radius: r2m * loadout.meterToPx,
        stroke: "#3b82f6", strokeWidth: 3, dash: [10, 8],
        opacity: 0.9, name: "range", listening: false,
      }));
    }
  }

  layerFx.draw();
}
