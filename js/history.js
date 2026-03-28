/*  StratHub — history.js
    Système undo / redo.
    Dépend de : globals.js, serialize.js (serialize, hydrate)
*/

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
