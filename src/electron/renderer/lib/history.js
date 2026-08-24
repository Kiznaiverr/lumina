/* ── Lumina History — Undo/Redo (snapshot-based) ── */
var L = window.Lumina;

/**
 * Tracks detection state (bboxes, statuses, selection) per snapshot.
 * Stack-based with moving index: mutations truncate redo tail.
 * Page add/remove is NOT tracked (basic scope).
 */
L.history = {
  _stack: [],
  _idx: -1,
  _max: 50,
  _restoring: false,

  /** Serialize current pages' detection state */
  _serialize: function () {
    return JSON.stringify(
      L.state.pages.map(function (p) {
        return {
          textDetections: p.textDetections,
          bubbleDetections: p.bubbleDetections,
          _selectedTextIdx: p._selectedTextIdx,
          _selectedBubbleIdx: p._selectedBubbleIdx,
        };
      })
    );
  },

  /** Start fresh history with current state as baseline */
  reset: function () {
    this._stack = [this._serialize()];
    this._idx = 0;
    this._updateButtons();
  },

  /** Push snapshot after a mutation */
  snapshot: function () {
    if (this._restoring) return;
    var data = this._serialize();
    if (this._stack[this._idx] === data) return; // no change
    this._stack.length = this._idx + 1; // drop redo tail
    this._stack.push(data);
    if (this._stack.length > this._max) this._stack.shift();
    this._idx = this._stack.length - 1;
    this._updateButtons();
  },

  undo: function () {
    if (this._idx <= 0) return;
    this._idx--;
    this._apply(this._stack[this._idx]);
    this._updateButtons();
  },

  redo: function () {
    if (this._idx >= this._stack.length - 1) return;
    this._idx++;
    this._apply(this._stack[this._idx]);
    this._updateButtons();
  },

  canUndo: function () { return this._idx > 0; },
  canRedo: function () { return this._idx < this._stack.length - 1; },

  /** Restore a serialized snapshot into live state */
  _apply: function (data) {
    var snap = JSON.parse(data);
    this._restoring = true;
    L.state.pages.forEach(function (page, i) {
      if (!snap[i]) return;
      page.textDetections = snap[i].textDetections;
      page.bubbleDetections = snap[i].bubbleDetections;
      page._selectedTextIdx = snap[i]._selectedTextIdx;
      page._selectedBubbleIdx = snap[i]._selectedBubbleIdx;
    });
    L.canvas._clearGroups();
    L.canvas.render();
    if (L.sidebar && L.sidebar.render) L.sidebar.render();
    this._restoring = false;
  },

  _updateButtons: function () {
    var u = document.getElementById("btn-undo");
    var r = document.getElementById("btn-redo");
    if (u) u.disabled = !this.canUndo();
    if (r) r.disabled = !this.canRedo();
  },
};
