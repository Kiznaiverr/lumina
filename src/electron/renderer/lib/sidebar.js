/* ── Lumina Sidebar ── */
var L = window.Lumina;

function _esc(s) {
  if (!s) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

L.sidebar = {
  render: function () {
    var scroll = document.getElementById("sidebar-scroll");
    if (!scroll) return;
    scroll.innerHTML = "";

    var page = L.state.getActivePage();
    var tIdx = page ? (page._selectedTextIdx !== undefined ? page._selectedTextIdx : null) : null;
    var bIdx = page ? (page._selectedBubbleIdx !== undefined ? page._selectedBubbleIdx : null) : null;
    var tDet = tIdx !== null && page ? page.textDetections[tIdx] : null;
    var bDet = bIdx !== null && page ? page.bubbleDetections[bIdx] : null;

    // Group: IMAGE INFO
    var gImg = this._group(L.i18n.t("sidebar.image"), true);
    gImg.querySelector(".panel-group-body").innerHTML = this._imageHTML(page);
    scroll.appendChild(gImg);

    // Group: TEXT DETECTIONS
    var tCount = page ? (page.textDetections || []).length : 0;
    var gText = this._group(L.i18n.t("sidebar.textDetections", { count: tCount }), tDet !== null);
    gText.querySelector(".panel-group-body").innerHTML = this._textDetHTML(tDet);
    scroll.appendChild(gText);

    // Group: BUBBLE DETECTIONS
    var bCount = page ? (page.bubbleDetections || []).length : 0;
    var gBubble = this._group(L.i18n.t("sidebar.bubbleDetections", { count: bCount }), bDet !== null);
    gBubble.querySelector(".panel-group-body").innerHTML = this._bubbleDetHTML(bDet);
    scroll.appendChild(gBubble);

    // Group: ALL DETECTIONS
    var gList = this._group(L.i18n.t("sidebar.allDetections"), true);
    gList.querySelector(".panel-group-body").innerHTML = this._detectionListHTML(page);
    scroll.appendChild(gList);

    this._wireEvents();
    lucide.createIcons();
  },

  _group: function (title, expanded) {
    var div = document.createElement("div");
    div.className = "panel-group border-b border-surface-3" + (expanded ? "" : " collapsed");
    var iconName = expanded ? "chevron-down" : "chevron-right";
    div.innerHTML =
      '<div class="panel-group-header">' +
      '<i data-lucide="' + iconName + '" class="arrow-icon"></i>' +
      "<span>" + title + "</span>" +
      "</div>" +
      '<div class="panel-group-body p-2.5"></div>';

    var header = div.querySelector(".panel-group-header");
    header.addEventListener("click", function () {
      div.classList.toggle("collapsed");
      var icon = div.querySelector(".arrow-icon");
      var isCollapsed = div.classList.contains("collapsed");
      icon.setAttribute("data-lucide", isCollapsed ? "chevron-right" : "chevron-down");
      lucide.createIcons({ nodes: [icon] });
    });
    return div;
  },

  _imageHTML: function (page) {
    if (!page) return '<div class="field-readonly">' + L.i18n.t("sidebar.image.noImage") + '</div>';
    return (
      '<div class="field-row">' +
      '<div class="field"><div class="field-label">' + L.i18n.t("sidebar.image.width") + '</div><div>' + page.naturalWidth + 'px</div></div>' +
      '<div class="field"><div class="field-label">' + L.i18n.t("sidebar.image.height") + '</div><div>' + page.naturalHeight + 'px</div></div>' +
      '</div>' +
      '<div class="field"><div class="field-label">' + L.i18n.t("sidebar.image.file") + '</div><div class="text-[0.65rem] text-text-muted break-all">' +
      _esc(page.fileName) + '</div></div>'
    );
  },

  _textDetHTML: function (det) {
    if (!det) return '<div class="field-readonly">' + L.i18n.t("sidebar.text.clickInspect") + '</div>';
    var statusColors = { auto: "#00ff88", adjusted: "#ffa500", rejected: "#ff4444" };
    return (
      '<div class="field-row">' +
      '<div class="field"><div class="field-label">' + L.i18n.t("sidebar.text.type") + '</div><div>' + _esc(det.type) + '</div></div>' +
      '<div class="field"><div class="field-label">' + L.i18n.t("sidebar.text.confidence") + '</div><div>' + Math.round(det.confidence * 100) + '%</div></div>' +
      '</div>' +
      '<div class="field"><div class="field-label">' + L.i18n.t("sidebar.text.bbox") + '</div><div class="text-[0.65rem] text-text-muted">' +
      Math.round(det.bbox.x) + ', ' + Math.round(det.bbox.y) + ' · ' + Math.round(det.bbox.w) + '×' + Math.round(det.bbox.h) + '</div></div>' +
      '<div class="field"><div class="field-label">' + L.i18n.t("sidebar.text.status") + '</div><div>' +
      '<span class="status-dot" style="background:' + (statusColors[det.status] || '#00ff88') + '"></span>' +
      det.status + '</div></div>'
    );
  },

  _bubbleDetHTML: function (det) {
    if (!det) return '<div class="field-readonly">' + L.i18n.t("sidebar.bubble.clickInspect") + '</div>';
    var statusColors = { auto: "#00bfff", adjusted: "#ffa500", rejected: "#ff4444" };
    return (
      '<div class="field"><div class="field-label">' + L.i18n.t("sidebar.bubble.confidence") + '</div><div>' + Math.round(det.confidence * 100) + '%</div></div>' +
      '<div class="field"><div class="field-label">' + L.i18n.t("sidebar.bubble.bbox") + '</div><div class="text-[0.65rem] text-text-muted">' +
      Math.round(det.bbox.x) + ', ' + Math.round(det.bbox.y) + ' · ' + Math.round(det.bbox.w) + '×' + Math.round(det.bbox.h) + '</div></div>' +
      '<div class="field"><div class="field-label">' + L.i18n.t("sidebar.bubble.status") + '</div><div>' +
      '<span class="status-dot" style="background:' + (statusColors[det.status] || '#00bfff') + '"></span>' +
      det.status + '</div></div>'
    );
  },

  _detectionListHTML: function (page) {
    if (!page) return '<div class="field-readonly">' + L.i18n.t("sidebar.noDetections") + '</div>';
    var texts = page.textDetections || [];
    var bubbles = page.bubbleDetections || [];
    if (!texts.length && !bubbles.length) return '<div class="field-readonly">' + L.i18n.t("sidebar.noDetections") + '</div>';

    var html = '<div class="max-h-[300px] overflow-y-auto">';
    var tSel = page._selectedTextIdx;
    var bSel = page._selectedBubbleIdx;

    texts.forEach(function (d, i) {
      var isSelected = i === tSel;
      var statusColors = { auto: "#00ff88", adjusted: "#ffa500", rejected: "#ff4444" };
      html +=
        '<div class="detection-item' + (isSelected ? " selected" : "") + '" data-type="text" data-idx="' + i + '">' +
        '<div class="detection-badge" style="background:' + (statusColors[d.status] || "#00ff88") + '">T</div>' +
        '<div class="detection-label">T' + (i + 1) + ' · ' + _esc(d.type) + '</div>' +
        '<div class="detection-conf">' + Math.round(d.confidence * 100) + '%</div>' +
        '</div>';
    });

    bubbles.forEach(function (d, i) {
      var isSelected = i === bSel;
      var statusColors = { auto: "#00bfff", adjusted: "#ffa500", rejected: "#ff4444" };
      html +=
        '<div class="detection-item' + (isSelected ? " selected" : "") + '" data-type="bubble" data-idx="' + i + '">' +
        '<div class="detection-badge" style="background:' + (statusColors[d.status] || "#00bfff") + '">B</div>' +
        '<div class="detection-label">B' + (i + 1) + ' · bubble</div>' +
        '<div class="detection-conf">' + Math.round(d.confidence * 100) + '%</div>' +
        '</div>';
    });

    html += "</div>";
    return html;
  },

  _wireEvents: function () {
    var items = document.querySelectorAll(".detection-item[data-type]");
    items.forEach(function (el) {
      el.addEventListener("click", function () {
        var type = el.getAttribute("data-type");
        var idx = parseInt(el.getAttribute("data-idx"), 10);
        if (type === "text") {
          L.canvas.selectTextDetection(idx);
        } else {
          L.canvas.selectBubbleDetection(idx);
        }
      });
    });
  },
};
