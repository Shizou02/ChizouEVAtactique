/*  StratHub — coaching.js
    Mode coaching : replay pas à pas.
    Chaque étape est un snapshot du board capturé manuellement.
    Dépend de : globals.js, serialize.js (serialize, hydrate), tokens.js (selectNode)
*/

// ─── État du replay ──────────────────────────────────────────────────────────

const replay = {
  steps: [],     // tableau de snapshots (serialize)
  current: -1,   // index de l'étape affichée (-1 = aucune)
};

// ─── UI ──────────────────────────────────────────────────────────────────────

function updateReplayStatus() {
  const el = $("replayStatus");
  if (!el) return;

  if (replay.steps.length === 0) {
    el.textContent = "0 / 0";
  } else {
    el.textContent = `${replay.current + 1} / ${replay.steps.length}`;
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function replayCapture() {
  // Capturer l'état actuel du board comme une étape
  const snapshot = serialize(true);
  replay.steps.push(snapshot);
  replay.current = replay.steps.length - 1;
  updateReplayStatus();
}

function replayReset() {
  if (replay.steps.length === 0) return;

  const confirmed = confirm("Supprimer toutes les étapes du replay ?");
  if (!confirmed) return;

  replay.steps = [];
  replay.current = -1;
  updateReplayStatus();
}

function replayPrev() {
  if (replay.steps.length === 0 || replay.current <= 0) return;

  replay.current--;
  isRestoring = true;
  hydrate(replay.steps[replay.current]);
  isRestoring = false;
  updateReplayStatus();
}

function replayNext() {
  if (replay.steps.length === 0 || replay.current >= replay.steps.length - 1) return;

  replay.current++;
  isRestoring = true;
  hydrate(replay.steps[replay.current]);
  isRestoring = false;
  updateReplayStatus();
}

// ─── Init (appelé par setupUI dans board.js) ─────────────────────────────────

function setupCoachingUI() {
  bindClick("replayCapture", replayCapture);
  bindClick("replayReset",   replayReset);
  bindClick("replayPrev",    replayPrev);
  bindClick("replayNext",    replayNext);
  updateReplayStatus();
}
