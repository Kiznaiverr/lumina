/* ── Lumina Canvas — Detection Groups & Selection ── */
var L = window.Lumina;

(function () {
  var _textGroups = [];
  var _bubbleGroups = [];
  var _textTransformer = null;
  var _bubbleTransformer = null;

  L.canvas = L.canvas || {};

  // ── Transformer accessors (called from render.js) ──

  L.canvas._setTextTransformer = function (t) {
    _textTransformer = t;
  };
  L.canvas._setBubbleTransformer = function (b) {
    _bubbleTransformer = b;
  };

  // ── Helpers ──

  function _syncTextBboxFromGroup(idx, sr, off) {
    var page = L.state.getActivePage();
    if (!page) return;
    var det = page.textDetections[idx];
    var group = _textGroups[idx];
    if (!group || !det) return;
    det.bbox.x = Math.round((group.x() - off.x) / sr);
    det.bbox.y = Math.round((group.y() - off.y) / sr);
    det.bbox.w = Math.round((group.width() * group.scaleX()) / sr);
    det.bbox.h = Math.round((group.height() * group.scaleY()) / sr);
  }

  function _syncBubbleBboxFromGroup(idx, sr, off) {
    var page = L.state.getActivePage();
    if (!page) return;
    var det = page.bubbleDetections[idx];
    var group = _bubbleGroups[idx];
    if (!group || !det) return;
    det.bbox.x = Math.round((group.x() - off.x) / sr);
    det.bbox.y = Math.round((group.y() - off.y) / sr);
    det.bbox.w = Math.round((group.width() * group.scaleX()) / sr);
    det.bbox.h = Math.round((group.height() * group.scaleY()) / sr);
  }

  // ── Group factories ──

  L.canvas._createTextGroup = function (det, idx, sr, off) {
    // Clamp dims — model can emit degenerate boxes with negative w/h after scaling
    var x = off.x + det.bbox.x * sr;
    var y = off.y + det.bbox.y * sr;
    var w = Math.max(1, det.bbox.w * sr);
    var h = Math.max(1, det.bbox.h * sr);

    var group = new Konva.Group({
      x: x,
      y: y,
      width: w,
      height: h,
      draggable: L.state.activeTool === "select",
    });

    group.add(
      new Konva.Rect({
        width: w,
        height: h,
        stroke: L.canvas.TEXT_COLOR,
        strokeWidth: 2,
        cornerRadius: 3,
        fill: "rgba(0,255,136,0.08)",
        name: "rect",
      }),
    );

    // Badge "T{n}"
    var bg = new Konva.Group({ x: 2, y: -10 });
    bg.add(
      new Konva.Rect({
        width: 28,
        height: 16,
        cornerRadius: 8,
        fill: L.canvas.TEXT_COLOR,
        shadowColor: "rgba(0,0,0,0.4)",
        shadowBlur: 3,
        shadowOffsetY: 1,
      }),
    );
    bg.add(
      new Konva.Text({
        text: "T" + (idx + 1),
        fontSize: 10,
        fontFamily: L.CONST.FONT_FAMILY,
        fontStyle: "bold",
        fill: "#000",
        width: 28,
        align: "center",
        y: 2,
      }),
    );
    group.add(bg);

    // Type label
    var typeLabel = det.type === "text_bubble" ? "bubble" : "free";
    group.add(
      new Konva.Text({
        text: typeLabel,
        fontSize: 9 * sr,
        fontFamily: L.CONST.FONT_FAMILY,
        fill: "#888",
        x: 32,
        y: 2,
        width: w - 34,
        wrap: "none",
      }),
    );

    group.on("click", function (e) {
      e.cancelBubble = true;
      L.canvas.selectTextDetection(idx);
    });
    group.on("dblclick dbltap", function (e) {
      e.cancelBubble = true;
      var page = L.state.getActivePage();
      if (!page) return;
      var d = page.textDetections[idx];
      d.status =
        d.status === "auto"
          ? "rejected"
          : d.status === "rejected"
            ? "adjusted"
            : "auto";
      L.canvas._refreshTextGroup(idx);
      L.history.snapshot();
    });
    group.on("dragmove", function () {
      _syncTextBboxFromGroup(idx, sr, off);
    });
    group.on("dragend", function () {
      L.history.snapshot();
    });
    group.on("transformend", function () {
      _syncTextBboxFromGroup(idx, sr, off);
      group.scaleX(1);
      group.scaleY(1);
      var page = L.state.getActivePage();
      if (
        page &&
        page.textDetections[idx] &&
        page.textDetections[idx].status === "auto"
      ) {
        page.textDetections[idx].status = "adjusted";
      }
      L.canvas._refreshTextGroup(idx);
      L.history.snapshot();
    });

    _textGroups.push(group);
    return group;
  };

  L.canvas._createBubbleGroup = function (det, idx, sr, off) {
    // Clamp dims — model can emit degenerate boxes with negative w/h after scaling
    var x = off.x + det.bbox.x * sr;
    var y = off.y + det.bbox.y * sr;
    var w = Math.max(1, det.bbox.w * sr);
    var h = Math.max(1, det.bbox.h * sr);

    var group = new Konva.Group({
      x: x,
      y: y,
      width: w,
      height: h,
      draggable: L.state.activeTool === "select",
    });

    group.add(
      new Konva.Rect({
        width: w,
        height: h,
        stroke: L.canvas.BUBBLE_COLOR,
        strokeWidth: 2,
        cornerRadius: 4,
        fill: "rgba(0,191,255,0.08)",
        dash: [6, 3],
        name: "rect",
      }),
    );

    // Badge "B{n}"
    var bg = new Konva.Group({ x: w - 30, y: -10 });
    bg.add(
      new Konva.Rect({
        width: 28,
        height: 16,
        cornerRadius: 8,
        fill: L.canvas.BUBBLE_COLOR,
        shadowColor: "rgba(0,0,0,0.4)",
        shadowBlur: 3,
        shadowOffsetY: 1,
      }),
    );
    bg.add(
      new Konva.Text({
        text: "B" + (idx + 1),
        fontSize: 10,
        fontFamily: L.CONST.FONT_FAMILY,
        fontStyle: "bold",
        fill: "#000",
        width: 28,
        align: "center",
        y: 2,
      }),
    );
    group.add(bg);

    group.on("click", function (e) {
      e.cancelBubble = true;
      L.canvas.selectBubbleDetection(idx);
    });
    group.on("dblclick dbltap", function (e) {
      e.cancelBubble = true;
      var page = L.state.getActivePage();
      if (!page) return;
      var d = page.bubbleDetections[idx];
      d.status =
        d.status === "auto"
          ? "rejected"
          : d.status === "rejected"
            ? "adjusted"
            : "auto";
      L.canvas._refreshBubbleGroup(idx);
      L.history.snapshot();
    });
    group.on("dragmove", function () {
      _syncBubbleBboxFromGroup(idx, sr, off);
    });
    group.on("dragend", function () {
      L.history.snapshot();
    });
    group.on("transformend", function () {
      _syncBubbleBboxFromGroup(idx, sr, off);
      group.scaleX(1);
      group.scaleY(1);
      var page = L.state.getActivePage();
      if (
        page &&
        page.bubbleDetections[idx] &&
        page.bubbleDetections[idx].status === "auto"
      ) {
        page.bubbleDetections[idx].status = "adjusted";
      }
      L.canvas._refreshBubbleGroup(idx);
      L.history.snapshot();
    });

    _bubbleGroups.push(group);
    return group;
  };

  // ── Clear groups (called before re-render) ──

  L.canvas._clearGroups = function () {
    _textGroups = [];
    _bubbleGroups = [];
    _textTransformer = null;
    _bubbleTransformer = null;
  };

  // ── Selection ──

  L.canvas.selectTextDetection = function (idx) {
    var page = L.state.getActivePage();
    if (!page) return;

    page._selectedTextIdx = idx;
    page._selectedBubbleIdx = null;

    _textGroups.forEach(function (g, i) {
      var rect = g.findOne("rect");
      if (!rect) return;
      rect.stroke(i === idx ? "#00ff88" : L.canvas.TEXT_COLOR);
      rect.strokeWidth(i === idx ? 3 : 2);
    });
    _bubbleGroups.forEach(function (g) {
      var rect = g.findOne("rect");
      if (rect) {
        rect.stroke(L.canvas.BUBBLE_COLOR);
        rect.strokeWidth(2);
      }
    });

    if (_textTransformer) {
      if (idx !== null && _textGroups[idx]) {
        _textTransformer.nodes([_textGroups[idx]]);
        _textGroups[idx].draggable(true);
      } else {
        _textTransformer.nodes([]);
      }
    }
    // Deselect the other type's transformer too
    _bubbleGroups.forEach(function (g) {
      g.draggable(false);
    });
    if (_bubbleTransformer) _bubbleTransformer.nodes([]);
    L.canvas._updateStatus();
    if (L.canvas.getLayer()) L.canvas.getLayer().draw();
    if (L.sidebar && L.sidebar.render) L.sidebar.render();
  };

  L.canvas.selectBubbleDetection = function (idx) {
    var page = L.state.getActivePage();
    if (!page) return;

    page._selectedBubbleIdx = idx;
    page._selectedTextIdx = null;

    _bubbleGroups.forEach(function (g, i) {
      var rect = g.findOne("rect");
      if (!rect) return;
      rect.stroke(i === idx ? "#00bfff" : L.canvas.BUBBLE_COLOR);
      rect.strokeWidth(i === idx ? 3 : 2);
    });
    _textGroups.forEach(function (g) {
      var rect = g.findOne("rect");
      if (rect) {
        rect.stroke(L.canvas.TEXT_COLOR);
        rect.strokeWidth(2);
      }
    });

    if (_bubbleTransformer) {
      if (idx !== null && _bubbleGroups[idx]) {
        _bubbleTransformer.nodes([_bubbleGroups[idx]]);
        _bubbleGroups[idx].draggable(true);
      } else {
        _bubbleTransformer.nodes([]);
      }
    }
    // Deselect the other type's transformer too
    _textGroups.forEach(function (g) {
      g.draggable(false);
    });
    if (_textTransformer) _textTransformer.nodes([]);
    L.canvas._updateStatus();
    if (L.canvas.getLayer()) L.canvas.getLayer().draw();
    if (L.sidebar && L.sidebar.render) L.sidebar.render();
  };

  // ── Refresh individual groups ──

  L.canvas._refreshTextGroup = function (idx) {
    var page = L.state.getActivePage();
    if (!page) return;
    var det = page.textDetections[idx];
    var group = _textGroups[idx];
    if (!group || !det) return;
    var sr = L.canvas.getScaleRatio();
    var off = L.canvas.getOffset();
    group.position({ x: off.x + det.bbox.x * sr, y: off.y + det.bbox.y * sr });
    var rect = group.findOne("rect");
    if (rect) {
      var isSelected = idx === (page._selectedTextIdx || null);
      var colors = {
        auto: L.canvas.TEXT_COLOR,
        adjusted: "#ffa500",
        rejected: "#ff4444",
      };
      rect.stroke(
        isSelected ? "#00ff88" : colors[det.status] || L.canvas.TEXT_COLOR,
      );
      rect.strokeWidth(isSelected ? 3 : 2);
    }
    if (L.canvas.getLayer()) L.canvas.getLayer().draw();
    if (L.sidebar && L.sidebar.render) L.sidebar.render();
  };

  L.canvas._refreshBubbleGroup = function (idx) {
    var page = L.state.getActivePage();
    if (!page) return;
    var det = page.bubbleDetections[idx];
    var group = _bubbleGroups[idx];
    if (!group || !det) return;
    var sr = L.canvas.getScaleRatio();
    var off = L.canvas.getOffset();
    group.position({ x: off.x + det.bbox.x * sr, y: off.y + det.bbox.y * sr });
    var rect = group.findOne("rect");
    if (rect) {
      var isSelected = idx === (page._selectedBubbleIdx || null);
      var colors = {
        auto: L.canvas.BUBBLE_COLOR,
        adjusted: "#ffa500",
        rejected: "#ff4444",
      };
      rect.stroke(
        isSelected ? "#00bfff" : colors[det.status] || L.canvas.BUBBLE_COLOR,
      );
      rect.strokeWidth(isSelected ? 3 : 2);
      rect.dash(det.status === "rejected" ? [5, 3] : [6, 3]);
    }
    if (L.canvas.getLayer()) L.canvas.getLayer().draw();
    if (L.sidebar && L.sidebar.render) L.sidebar.render();
  };

  // ── Status bar update ──

  L.canvas._updateStatus = function () {
    var page = L.state.getActivePage();
    var tCount = page ? (page.textDetections || []).length : 0;
    var bCount = page ? (page.bubbleDetections || []).length : 0;
    var parts = [];
    parts.push(L.i18n.t("status.textCount", { count: tCount }));
    parts.push(L.i18n.t("status.bubbleCount", { count: bCount }));
    if (
      page &&
      page._selectedTextIdx !== null &&
      page._selectedTextIdx !== undefined
    ) {
      parts.push(
        L.i18n.t("status.selected", {
          type: "T",
          index: page._selectedTextIdx + 1,
        }),
      );
    }
    if (
      page &&
      page._selectedBubbleIdx !== null &&
      page._selectedBubbleIdx !== undefined
    ) {
      parts.push(
        L.i18n.t("status.selected", {
          type: "B",
          index: page._selectedBubbleIdx + 1,
        }),
      );
    }
    var el = document.getElementById("status-detections");
    if (el) el.textContent = parts.join(" · ");
  };

  // ── Tool change ──

  L.canvas.onToolChange = function (tool) {
    if (tool !== "select") {
      L.canvas.selectTextDetection(null);
      L.canvas.selectBubbleDetection(null);
    }
    _textGroups.forEach(function (g) {
      g.draggable(tool === "select");
    });
    _bubbleGroups.forEach(function (g) {
      g.draggable(tool === "select");
    });
    if (_textTransformer && tool !== "select") _textTransformer.nodes([]);
    if (_bubbleTransformer && tool !== "select") _bubbleTransformer.nodes([]);
    if (L.canvas.getLayer()) L.canvas.getLayer().draw();
  };
})();
