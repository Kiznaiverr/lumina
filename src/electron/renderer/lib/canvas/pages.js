/* ── Lumina Canvas — Page Strip Navigation ── */
var L = window.Lumina;

(function () {
  L.canvas = L.canvas || {};

  /** Render page strip thumbnails */
  L.canvas.renderPageStrip = function () {
    var strip = document.getElementById("page-strip");
    var items = document.getElementById("page-strip-items");
    if (!strip || !items) return;

    if (L.state.pages.length <= 1) {
      strip.classList.add("hidden");
      return;
    }

    strip.classList.remove("hidden");
    items.innerHTML = "";

    L.state.pages.forEach(function (page, i) {
      var thumb = document.createElement("div");
      thumb.className = "page-thumb" + (i === L.state.activePageIdx ? " active" : "");
      thumb.title = page.fileName;
      thumb.dataset.pageIdx = i;

      // Create thumbnail image
      var img = document.createElement("img");
      if (page.image) {
        img.src = page.image.src;
      }
      thumb.appendChild(img);

      // Page number label
      var num = document.createElement("div");
      num.className = "page-num";
      num.textContent = (i + 1);
      thumb.appendChild(num);

      // Delete button (shown on hover)
      var del = document.createElement("div");
      del.className = "absolute top-0 right-0 w-3.5 h-3.5 bg-red-600 rounded-bl rounded-tr-sm cursor-pointer hidden items-center justify-center text-white text-[8px] leading-none hover:bg-red-500";
      del.textContent = "×";
      del.title = L.i18n.t("pages.remove");
      thumb.appendChild(del);
      thumb.addEventListener("mouseenter", function () { del.style.display = "flex"; });
      thumb.addEventListener("mouseleave", function () { del.style.display = "none"; });
      del.addEventListener("click", function (e) {
        e.stopPropagation();
        L.canvas.removePage(i);
      });

      // Click to switch page
      thumb.addEventListener("click", function () {
        L.canvas.switchPage(i);
      });

      items.appendChild(thumb);
    });

    // Add "+" button at the end
    var addBtn = document.createElement("div");
    addBtn.className = "page-thumb flex items-center justify-center bg-surface-3 text-text-muted hover:text-text-secondary cursor-pointer";
    addBtn.title = L.i18n.t("pages.importMore");
    addBtn.innerHTML = '<i data-lucide="plus" class="w-4 h-4"></i>';
    addBtn.addEventListener("click", function () {
      if (L.renderer && L.renderer.importImages) {
        L.renderer.importImages();
      }
    });
    items.appendChild(addBtn);

    lucide.createIcons({ nodes: [addBtn] });
  };

  /** Switch active page by index */
  L.canvas.switchPage = function (idx) {
    L.canvas._clearGroups();
    L.state.setActivePage(idx);
    L.canvas.render();
    L.canvas.renderPageStrip();
    L.ui.updatePageIndicator();
    if (L.sidebar && L.sidebar.render) L.sidebar.render();
  };

  /** Remove a page */
  L.canvas.removePage = function (idx) {
    L.state.removePage(idx);
    L.canvas._clearGroups();
    if (L.state.pages.length > 0) {
      L.state.activePageIdx = Math.min(idx, L.state.pages.length - 1);
      L.canvas.render();
    } else {
      // No pages left — show landing
      var landing = document.getElementById("landing");
      if (landing) landing.classList.remove("hidden");
      var stage = L.canvas.getStage();
      if (stage) stage.destroy();
    }
    L.canvas.renderPageStrip();
    L.ui.updatePageIndicator();
    if (L.sidebar && L.sidebar.render) L.sidebar.render();
  };

  /** Generate a thumbnail data URL from page (for export, future) */
  L.canvas.generateThumbnail = function (page, maxW, maxH) {
    maxW = maxW || 80;
    maxH = maxH || 100;
    if (!page || !page.image) return null;
    var canvas = document.createElement("canvas");
    var ratio = Math.min(maxW / page.naturalWidth, maxH / page.naturalHeight);
    canvas.width = Math.round(page.naturalWidth * ratio);
    canvas.height = Math.round(page.naturalHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.drawImage(page.image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  };
})();
