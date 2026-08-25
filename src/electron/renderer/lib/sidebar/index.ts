/* ── Lumina Sidebar (entry) ── */
import { state } from "../state";
import * as i18n from "../i18n";
import { createIcons } from "../icons";
import type { Page } from "../../types";
import { group } from "./group";
import { imageHTML } from "./imageInfo";
import { textDetHTML, bubbleDetHTML } from "./detectionDetails";
import { detectionListHTML, wireEvents } from "./detectionList";

export const sidebar = {
  render(): void {
    const scroll = document.getElementById("sidebar-scroll");
    if (!scroll) return;
    scroll.innerHTML = "";

    const page: Page | null = state.getActivePage();
    const tIdx =
      page && page._selectedTextIdx !== undefined
        ? page._selectedTextIdx
        : null;
    const bIdx =
      page && page._selectedBubbleIdx !== undefined
        ? page._selectedBubbleIdx
        : null;
    const tDet = tIdx !== null && page ? page.textDetections[tIdx] : null;
    const bDet = bIdx !== null && page ? page.bubbleDetections[bIdx] : null;

    // Group: IMAGE INFO
    const gImg = group(i18n.t("sidebar.image"), true);
    gImg.querySelector(".panel-group-body")!.innerHTML = imageHTML(page);
    scroll.appendChild(gImg);

    // Group: TEXT DETECTIONS
    const tCount = page ? (page.textDetections || []).length : 0;
    const gText = group(
      i18n.t("sidebar.textDetections", { count: tCount }),
      tDet !== null,
    );
    gText.querySelector(".panel-group-body")!.innerHTML = textDetHTML(tDet);
    scroll.appendChild(gText);

    // Group: BUBBLE DETECTIONS
    const bCount = page ? (page.bubbleDetections || []).length : 0;
    const gBubble = group(
      i18n.t("sidebar.bubbleDetections", { count: bCount }),
      bDet !== null,
    );
    gBubble.querySelector(".panel-group-body")!.innerHTML = bubbleDetHTML(bDet);
    scroll.appendChild(gBubble);

    // Group: ALL DETECTIONS
    const gList = group(i18n.t("sidebar.allDetections"), true);
    gList.querySelector(".panel-group-body")!.innerHTML =
      detectionListHTML(page);
    scroll.appendChild(gList);

    wireEvents();
    createIcons();
  },
};
