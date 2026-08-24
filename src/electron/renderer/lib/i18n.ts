/* ── Lumina i18n — localization loaded from JSON via IPC ── */

type TranslationData = Record<string, Record<string, string>>;

let _lang: string = localStorage.getItem("lumina-lang") || "en";
let _data: TranslationData = {};

function _interpolate(str: string, params?: Record<string, unknown>): string {
  if (!params) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    params[k] !== undefined ? String(params[k]) : "{{" + k + "}}",
  );
}

export function t(key: string, params?: Record<string, unknown>): string {
  let val = _data[_lang] && _data[_lang][key];
  if (val === undefined && _lang !== "en") val = _data.en && _data.en[key];
  if (val === undefined) return key;
  return _interpolate(val, params);
}

export function lang(): string {
  return _lang;
}

export function setLang(code: string): void {
  if (code === _lang) return;
  _lang = code;
  localStorage.setItem("lumina-lang", code);
  document.documentElement.lang = code;
  _renderAll();
  _updateLangBtn();
  const dd = document.getElementById("lang-dropdown");
  if (dd) dd.classList.add("hidden");
}

function _renderAll(): void {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n") as string);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    el.title = t(el.getAttribute("data-i18n-title") as string);
  });
  document.title = t("app.title");
}

function _updateLangBtn(): void {
  const label = document.getElementById("lang-current");
  if (label) label.textContent = _lang.toUpperCase();
}

/** Load all translation JSONs via IPC, then init */
export function init(): Promise<void> {
  return window.lumina
    .loadTranslations()
    .then((data) => {
      _data = data || {};
      document.documentElement.lang = _lang;
      _renderAll();
      _updateLangBtn();
    })
    .catch(() => {
      // fallback: t() returns key
    });
}
