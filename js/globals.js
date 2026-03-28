/*  StratHub — globals.js
    Variables globales, helpers DOM, constantes.
    Chargé en premier par board.html.
*/

// ─── Helpers DOM sécurisés ───────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function bind(id, event, fn) {
  const el = $(id);
  if (el) el.addEventListener(event, fn);
  return el;
}

function bindClick(id, fn) {
  const el = $(id);
  if (el) el.onclick = fn;
  return el;
}

function qs(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

// ─── Konva layers ────────────────────────────────────────────────────────────
let stage, layerBg, layerMain, layerFx, transformer;

// ─── État global ─────────────────────────────────────────────────────────────
let currentMap = null;
let tool = "select";
let isDrawing = false;
let drawLine = null;
let arrowColor = "#ffffff";
let arrowStyle = "solid";
let undoStack = [];
let redoStack = [];
let isRestoring = false;
let historyTimer = null;
let bgNode = null;
let wallPixels = null;
let wallImgW = 0;
let wallImgH = 0;
let currentMode = "strat";
let coachSignalArmed = false;
let coachZoneArmed = false;
let coachZoneRect = null;
let coachZoneStart = null;
let selectedPlayer = null;
let currentFloor = 'ground';

// ─── Loadout ─────────────────────────────────────────────────────────────────
const loadout = {
  weapons: [],
  selectedWeaponIds: [],
  selectedPlayerNode: null,
  meterToPx: 30,
  mapNaturalWidth: 1464,
  mapCurrentScale: 1,
};

const playerLoadouts = { p1: [], p2: [], p3: [], p4: [] };

let activePlayerKind = null;
let allWeapons = [];
let selectedWeapons = [];
let loadoutList = null;

// ─── Menu contextuel ─────────────────────────────────────────────────────────
let ctxMenuNode = null;

// ─── Constantes tokens ───────────────────────────────────────────────────────
const TOKENS = {
  p1:    { label: "1",   fill: "#4da3ff" },
  p2:    { label: "2",   fill: "#7bd389" },
  p3:    { label: "3",   fill: "#ffd166" },
  p4:    { label: "4",   fill: "#cdb4ff" },
  enemy: { label: "E",   fill: "#ff4d6d" },
  obj:   { label: "OBJ", fill: "#ff9f1c" },
  smoke: { label: "G",   fill: "#160d0dff" },
};

// ─── Training ────────────────────────────────────────────────────────────────
let training = {
  baselineState: null,
  solutionState: null,
  active: false,
  remaining: 20,
  timerId: null,
  planAState: null,
  enemiesManualArmed: false,
};

// ─── Helpers d'échelle ───────────────────────────────────────────────────────
const MAP_REF_WIDTH = 1464;

function tokenScale() {
  const w = loadout.mapNaturalWidth || MAP_REF_WIDTH;
  return w / MAP_REF_WIDTH;
}

function pxPerMeter() {
  const w = loadout.mapNaturalWidth || MAP_REF_WIDTH;
  return 30 * (w / MAP_REF_WIDTH);
}

function isSoldier(kind) {
  return kind === "p1" || kind === "p2" || kind === "p3" || kind === "p4" || kind === "enemy";
}

function getPointerPosInLayer() {
  const p = stage.getPointerPosition();
  if (!p) return null;
  const t = layerMain.getAbsoluteTransform().copy().invert();
  return t.point(p);
}
