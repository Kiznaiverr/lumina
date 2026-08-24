/* ── Lumina Canvas — Stage & Render ── */
var L = window.Lumina;

/**
 * Canvas render module.
 * Single Konva stage inside #canvas-container.
 * Shows either originalImage or cleanedImage based on _viewMode.
 */
(function () {
  var _stage = null;
  var _layer = null;
  var _bgImage = null;   // Konva.Image for background

  var TEXT_COLOR = "#00ff88";
  var BUBBLE_COLOR = "#00bfff";

  /** Get/create the Konva stage */
  function _getOrCreateStage() {
    var container = document.getElementById("canvas-container");
    if (!container) return null;
    var w = container.clientWidth;
    var h = container.clientHeight;
    if (w === 0 || h === 0) return null;

    if (_stage) {
      _stage.setSize({ width: w, height: h });
      return _stage;
    }

    _stage = new Konva.Stage({ container: "canvas-container", width: w, height: h });
    _layer = new Konva.Layer();
    _stage.add(_layer);

    return _stage;
  }

  /** Scale ratio to fit image in container, capped at 1x */
  function _getScaleRatio() {
    var container = document.getElementById("canvas-container");
    var page = L.state.getActivePage();
    if (!container || !page) return 1;
    return Math.min(
      container.clientWidth / page.naturalWidth,
      container.clientHeight / page.naturalHeight,
      1
    );
  }

  /** Offset to center image in container */
  function _getOffset() {
    var container = document.getElementById("canvas-container");
    var page = L.state.getActivePage();
    if (!container || !page) return { x: 0, y: 0 };
    var sr = _getScaleRatio();
    return {
      x: (container.clientWidth - page.naturalWidth * sr) / 2,
      y: (container.clientHeight - page.naturalHeight * sr) / 2,
    };
  }

  /** The main render — draws background + detection overlays */
  function _render() {
    var container = document.getElementById("canvas-container");
    if (!container) return;

    var page = L.state.getActivePage();
    var w = container.clientWidth;
    var h = container.clientHeight;
    if (w === 0 || h === 0) return;

    // Clear old groups before rebuilding
    if (L.canvas._clearGroups) L.canvas._clearGroups();

    _getOrCreateStage();
    if (!_stage || !_layer) return;

    // Wire deselect click once after stage exists
    if (L.canvas._initDeselectClick) L.canvas._initDeselectClick();

    _stage.setSize({ width: w, height: h });
    _layer.removeChildren();

    // Background rect
    _layer.add(new Konva.Rect({ width: w, height: h, fill: "#000" }));

    if (!page || !page.image) {
      _layer.draw();
      return;
    }

    var sr = _getScaleRatio();
    var off = _getOffset();

    // Choose image based on viewMode
    var img = page.image;
    if (L.state._viewMode === "cleaned" && page.cleanedImage) {
      img = page.cleanedImage;
    }

    _bgImage = new Konva.Image({
      image: img,
      x: off.x, y: off.y,
      width: page.naturalWidth * sr,
      height: page.naturalHeight * sr,
    });
    _layer.add(_bgImage);

    // Draw bubble detections (behind text)
    if (page.bubbleDetections && page.bubbleDetections.length > 0) {
      page.bubbleDetections.forEach(function (det, i) {
        var g = L.canvas._createBubbleGroup(det, i, sr, off);
        _layer.add(g);
      });

      var bTransformer = new Konva.Transformer({
        nodes: [], rotateEnabled: false,
        enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
        anchorStroke: BUBBLE_COLOR, anchorFill: "#fff", anchorSize: 8,
        borderStroke: BUBBLE_COLOR, borderStrokeWidth: 1, padding: 2,
      });
      _layer.add(bTransformer);
      L.canvas._setBubbleTransformer(bTransformer);
    }

    // Draw text detections (on top)
    if (page.textDetections && page.textDetections.length > 0) {
      page.textDetections.forEach(function (det, i) {
        var g = L.canvas._createTextGroup(det, i, sr, off);
        _layer.add(g);
      });

      var tTransformer = new Konva.Transformer({
        nodes: [], rotateEnabled: false,
        enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
        anchorStroke: TEXT_COLOR, anchorFill: "#fff", anchorSize: 8,
        borderStroke: TEXT_COLOR, borderStrokeWidth: 1, padding: 2,
      });
      _layer.add(tTransformer);
      L.canvas._setTextTransformer(tTransformer);
    }

    L.canvas._updateStatus();
    _layer.draw();
  }

  // ── Public API ──

  L.canvas = L.canvas || {};

  L.canvas.render = _render;
  L.canvas.getStage = function () { return _stage; };
  L.canvas.getLayer = function () { return _layer; };
  L.canvas.getScaleRatio = _getScaleRatio;
  L.canvas.getOffset = _getOffset;
  L.canvas.TEXT_COLOR = TEXT_COLOR;
  L.canvas.BUBBLE_COLOR = BUBBLE_COLOR;
})();
