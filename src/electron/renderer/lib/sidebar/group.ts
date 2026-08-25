/* ── Sidebar: collapsible panel group ── */
import { createIcons } from "../icons";

export function group(title: string, expanded: boolean): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "panel-group" + (expanded ? "" : " collapsed");
  const iconName = expanded ? "chevron-down" : "chevron-right";
  div.innerHTML =
    '<div class="panel-group-header">' +
    '<i data-lucide="' +
    iconName +
    '" class="arrow-icon"></i>' +
    "<span>" +
    title +
    "</span>" +
    "</div>" +
    '<div class="panel-group-body p-2.5"></div>';

  const header = div.querySelector(".panel-group-header") as HTMLElement;
  header.addEventListener("click", function () {
    div.classList.toggle("collapsed");
    const icon = div.querySelector(".arrow-icon") as HTMLElement;
    const isCollapsed = div.classList.contains("collapsed");
    icon.setAttribute(
      "data-lucide",
      isCollapsed ? "chevron-right" : "chevron-down",
    );
    createIcons({
      nameAttr: "data-lucide",
      attrs: {},
      root: icon.parentElement as HTMLElement,
    });
  });
  return div;
}
