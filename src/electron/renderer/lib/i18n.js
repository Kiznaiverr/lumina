/* ── Lumina i18n — localization loaded from JSON via IPC ── */
var L = window.Lumina;

L.i18n = (function () {
  var _lang = localStorage.getItem("lumina-lang") || "en";
  var _data = {};

  function _interpolate(str, params) {
    if (!params) return str;
    return str.replace(/\{\{(\w+)\}\}/g, function (_, k) {
      return params[k] !== undefined ? params[k] : "{{" + k + "}}";
    });
  }

  function t(key, params) {
    var val = _data[_lang] && _data[_lang][key];
    if (val === undefined && _lang !== "en") val = _data.en && _data.en[key];
    if (val === undefined) return key;
    return _interpolate(val, params);
  }

  function lang() { return _lang; }

  function setLang(code) {
    if (code === _lang) return;
    _lang = code;
    localStorage.setItem("lumina-lang", code);
    document.documentElement.lang = code;
    _renderAll();
    _updateLangBtn();
    var dd = document.getElementById("lang-dropdown");
    if (dd) dd.classList.add("hidden");
  }

  function _renderAll() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      el.title = t(el.getAttribute("data-i18n-title"));
    });
    document.title = t("app.title");
  }

  function _updateLangBtn() {
    var label = document.getElementById("lang-current");
    if (label) label.textContent = _lang.toUpperCase();
  }

  /** Load all translation JSONs via IPC, then init */
  function init() {
    return window.lumina.loadTranslations().then(function (data) {
      _data = data || {};
      document.documentElement.lang = _lang;
      _renderAll();
      _updateLangBtn();
    }).catch(function () {
      // fallback: t() returns key
    });
  }

  return { t: t, lang: lang, setLang: setLang, init: init };
})();
