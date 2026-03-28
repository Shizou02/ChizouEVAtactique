/*  StratHub — raycasting.js
    Détection de murs et construction des cônes de vision.
    Dépend de : globals.js
*/

function isWall(px, py) {
  if (!wallPixels) return false;

  // Les coordonnées du raycasting sont en pixels naturels de la map visuelle.
  // Le wallmap peut avoir une taille différente → on convertit.
  const scaleX = wallImgW / (loadout.mapNaturalWidth || wallImgW);
  const scaleY = wallImgH / (loadout.mapNaturalHeight || wallImgH);
  const x = Math.round(px * scaleX);
  const y = Math.round(py * scaleY);

  if (x < 0 || y < 0 || x >= wallImgW || y >= wallImgH) return true;

  const idx = (y * wallImgW + x) * 4;
  const r = wallPixels.data[idx];
  const g = wallPixels.data[idx + 1];
  const b = wallPixels.data[idx + 2];
  const a = wallPixels.data[idx + 3];

  // Wallmap avec alpha : pixel opaque (alpha > 128) = mur
  if (wallPixels._useAlpha) {
    return a > 128;
  }

  // Wallmap blanc/noir : pixel clair (blanc) = mur
  return r > 200 && g > 200 && b > 200;
}

function castRay(ox, oy, angleRad, maxDist) {
  const step = 1.5;
  const dx = Math.cos(angleRad) * step;
  const dy = Math.sin(angleRad) * step;
  let x = ox, y = oy;
  let dist = 0;
  while (dist < maxDist) {
    x += dx; y += dy; dist += step;
    if (isWall(x, y)) break;
  }
  return { x, y, dist };
}

function buildRaycastCone(ox, oy, facingRad, halfAngleDeg, maxDistNatural, numRays) {
  const halfAngle = halfAngleDeg * Math.PI / 180;
  const points = [{ x: ox, y: oy }];
  for (let i = 0; i <= numRays; i++) {
    const a = facingRad - halfAngle + (i / numRays) * halfAngle * 2;
    const hit = castRay(ox, oy, a, maxDistNatural);
    points.push({ x: hit.x, y: hit.y });
  }
  return points;
}

function addRaycastCone(group) {
  const existing = group.findOne(".visionCone");
  if (existing) existing.destroy();

  const HALF_ANGLE_DEG = 50;
  const NUM_RAYS       = 80;
  const CONE_METERS    = 20;

  const maxDistNatural = CONE_METERS * pxPerMeter();

  const rotDeg    = group.rotation();
  const facingRad = rotDeg * Math.PI / 180;

  // group.x() / group.y() sont déjà en coordonnées naturelles de la map
  // car layerMain est scalé via layerMain.scale({ x: scale, y: scale })
  const ox = group.x();
  const oy = group.y();

  const pts = buildRaycastCone(ox, oy, facingRad, HALF_ANGLE_DEG, maxDistNatural, NUM_RAYS);

  // Convertir en coordonnées locales du groupe (offset par rapport à l'origine)
  // Puis contre-roter pour annuler la rotation du groupe (Konva l'applique déjà)
  const counterRad = -facingRad;
  const cosR = Math.cos(counterRad);
  const sinR = Math.sin(counterRad);

  const localPts = pts.map(p => {
    const dx = p.x - ox;
    const dy = p.y - oy;
    return {
      x: dx * cosR - dy * sinR,
      y: dx * sinR + dy * cosR,
    };
  });

  const cone = new Konva.Shape({
    name: "visionCone",
    sceneFunc: (ctx, shape) => {
      ctx.beginPath();
      ctx.moveTo(localPts[0].x, localPts[0].y);
      for (let i = 1; i < localPts.length; i++) {
        ctx.lineTo(localPts[i].x, localPts[i].y);
      }
      ctx.closePath();
      ctx.fillStrokeShape(shape);
    },
    fill: "rgba(255, 220, 80, 0.18)",
    stroke: "rgba(255, 220, 80, 0.75)",
    strokeWidth: 1.5,
    listening: false,
  });

  group.add(cone);
  cone.moveToBottom();
  layerMain.draw();
}
