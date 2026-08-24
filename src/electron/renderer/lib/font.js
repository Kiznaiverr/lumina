/* ── Lumina Font Auto-Fit (Section 4.2) ── */
var L = window.Lumina;

// Hidden canvas for text measurement
var _measureCanvas = document.createElement("canvas");
var _measureCtx = _measureCanvas.getContext("2d");

/**
 * Auto-fit text into a bounding box.
 * Returns { fontSize, text, needsManualFit }.
 */
L.fontAutoFit = function (text, bboxW, bboxH) {
  var C = L.CONST;
  var usableW = bboxW * C.BUBBLE_PADDING;
  var usableH = bboxH * C.BUBBLE_PADDING;

  var fontSize = C.DEFAULT_FONT_SIZE;

  while (fontSize >= C.MIN_FONT_SIZE) {
    _measureCtx.font = fontSize + "px " + C.FONT_FAMILY;
    var lines = L.wrapText(_measureCtx, text, usableW);
    var lineHeight = fontSize * 1.2;
    var totalH = lines.length * lineHeight;

    if (totalH <= usableH) {
      return {
        fontSize: fontSize,
        text: lines.join("\n"),
        needsManualFit: false,
      };
    }
    fontSize -= C.FONT_STEP;
  }

  // At min size — still overflow
  _measureCtx.font = C.MIN_FONT_SIZE + "px " + C.FONT_FAMILY;
  var lines = L.wrapText(_measureCtx, text, usableW);
  return {
    fontSize: C.MIN_FONT_SIZE,
    text: lines.join("\n"),
    needsManualFit: true,
  };
};

/** Word-wrap text to fit within maxWidth pixels */
L.wrapText = function (ctx, text, maxWidth) {
  if (!text) return [""];
  var paragraphs = text.split("\n");
  var allLines = [];

  for (var p = 0; p < paragraphs.length; p++) {
    var para = paragraphs[p];
    if (para === "") {
      allLines.push("");
      continue;
    }
    var words = para.split(/\s+/);
    var currentLine = "";

    for (var w = 0; w < words.length; w++) {
      var word = words[w];
      var test = currentLine ? currentLine + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && currentLine) {
        allLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = test;
      }
    }
    if (currentLine) allLines.push(currentLine);
  }

  return allLines.length ? allLines : [""];
};
