/* ── Settings: Translation tab (provider, target lang, instruction) ──
 * System instruction is GLOBAL (shared by llm + gemini). Empty field =
 * use default from prompts/translate-default.md on the backend.
 */
import * as i18n from "../i18n";
import { createIcons } from "../icons";
import { translateSettings, type TranslateConfig } from "../pipeline/translate";

/** Settings card — nested layer above the workbench pane */
function card(): HTMLElement {
  const c = document.createElement("div");
  c.className = "settings-section";
  return c;
}

export const translationTab = {
  build(pane: HTMLElement): void {
    pane.innerHTML = "";

    // ── Provider & target ──
    const general = card();
    general.appendChild(
      this._row(i18n.t("settings.trProvider"), (row) => {
        const sel = document.createElement("select");
        sel.id = "tr-provider";
        sel.className = "field-select";
        for (const [value, label] of [
          ["custom", i18n.t("settings.providerCustom")],
          ["openrouter", i18n.t("settings.providerOpenRouter")],
          ["grok", i18n.t("settings.providerGrok")],
          ["gemini", i18n.t("settings.providerGemini")],
        ] as const) {
          const opt = document.createElement("option");
          opt.value = value;
          opt.textContent = label;
          sel.appendChild(opt);
        }
        row.appendChild(sel);
        return sel;
      }),
    );

    // ── Source language — "auto" lets the model detect it ──
    general.appendChild(
      this._row(i18n.t("settings.trSourceLang"), (row) => {
        const sel = document.createElement("select");
        sel.id = "tr-source-lang";
        sel.className = "field-select";
        for (const [value, label] of [
          ["auto", i18n.t("settings.sourceAuto")],
          ["ja", "Japanese"],
          ["en", "English"],
          ["id", "Bahasa Indonesia"],
          ["ko", "Korean"],
          ["zh", "Chinese"],
          ["fr", "French"],
          ["es", "Spanish"],
          ["pt", "Portuguese"],
          ["ru", "Russian"],
          ["de", "German"],
        ] as const) {
          const opt = document.createElement("option");
          opt.value = value;
          opt.textContent = label;
          sel.appendChild(opt);
        }
        row.appendChild(sel);
        return sel;
      }),
    );

    // ── Target language — free-form language code (e.g. "en") ──
    general.appendChild(
      this._row(i18n.t("settings.trTargetLang"), (row) => {
        const input = document.createElement("input");
        input.id = "tr-target-lang";
        input.type = "text";
        input.placeholder = "en";
        input.className =
          "w-20 px-2 py-1 text-center bg-surface-3 border border-surface-3 rounded text-[0.78rem] text-text-primary outline-none focus:border-accent";
        row.appendChild(input);
        return input;
      }),
    );
    pane.appendChild(general);

    // ── LLM-compatible options panel (custom / OpenRouter / Grok) ──
    const llmOpts = document.createElement("div");
    llmOpts.id = "tr-llm-options";
    llmOpts.className = "settings-section hidden flex flex-col gap-3";

    // API style + base URL only apply to the "custom" provider — OpenRouter
    // and Grok ship with a fixed OpenAI-compatible endpoint.
    const customRows = document.createElement("div");
    customRows.id = "tr-llm-custom-rows";
    customRows.className = "flex flex-col gap-3";
    customRows.appendChild(
      this._row(i18n.t("settings.trLlmStyle"), (row) => {
        const sel = document.createElement("select");
        sel.id = "tr-llm-style";
        sel.className = "field-select";
        for (const [value, label] of [
          ["openai", i18n.t("settings.trStyleOpenai")],
          ["anthropic", i18n.t("settings.trStyleAnthropic")],
        ] as const) {
          const opt = document.createElement("option");
          opt.value = value;
          opt.textContent = label;
          sel.appendChild(opt);
        }
        row.appendChild(sel);
        return sel;
      }),
    );
    customRows.appendChild(
      this._field(
        "tr-llm-url",
        "text",
        i18n.t("settings.trLlmUrl"),
        "https://api.openai.com/v1",
      ),
    );
    customRows.appendChild(
      this._keyField("tr-custom-key", i18n.t("settings.trLlmKey"), "sk-..."),
    );
    customRows.appendChild(
      this._field(
        "tr-llm-model",
        "text",
        i18n.t("settings.trLlmModel"),
        "gpt-4o-mini",
      ),
    );
    llmOpts.appendChild(customRows);

    // OpenRouter: fixed OpenAI-compatible endpoint, own key + model
    const openrouterRows = document.createElement("div");
    openrouterRows.id = "tr-openrouter-rows";
    openrouterRows.className = "hidden flex flex-col gap-3";
    openrouterRows.appendChild(
      this._keyField(
        "tr-openrouter-key",
        i18n.t("settings.trOpenRouterKey"),
        "sk-or-v1-...",
      ),
    );
    openrouterRows.appendChild(
      this._field(
        "tr-openrouter-model",
        "text",
        i18n.t("settings.trLlmModel"),
        "openai/gpt-4o-mini",
      ),
    );
    llmOpts.appendChild(openrouterRows);

    // Grok: fixed endpoint, own key + model
    const grokRows = document.createElement("div");
    grokRows.id = "tr-grok-rows";
    grokRows.className = "hidden flex flex-col gap-3";
    grokRows.appendChild(
      this._keyField("tr-grok-key", i18n.t("settings.trGrokKey"), "xai-..."),
    );
    grokRows.appendChild(
      this._field(
        "tr-grok-model",
        "text",
        i18n.t("settings.trLlmModel"),
        "grok-3",
      ),
    );
    llmOpts.appendChild(grokRows);
    pane.appendChild(llmOpts);

    // ── Gemini options panel ──
    const geminiOpts = document.createElement("div");
    geminiOpts.id = "tr-gemini-options";
    geminiOpts.className = "settings-section hidden flex flex-col gap-3";
    geminiOpts.appendChild(
      this._keyField("tr-gemini-key", i18n.t("settings.trGeminiKey"), ""),
    );
    geminiOpts.appendChild(
      this._field(
        "tr-gemini-model",
        "text",
        i18n.t("settings.trGeminiModel"),
        "gemini-2.0-flash",
      ),
    );
    pane.appendChild(geminiOpts);

    // ── System instruction (global, shared by all providers) — pinned last ──
    const instrCard = card();
    const instrWrap = document.createElement("div");
    const instrLabel = document.createElement("div");
    instrLabel.className = "field-label";
    instrLabel.dataset.i18n = "settings.trLlmInstruction";
    instrLabel.textContent = i18n.t("settings.trLlmInstruction");
    instrWrap.appendChild(instrLabel);

    const instr = document.createElement("textarea");
    instr.id = "tr-instruction";
    instr.rows = 8;
    instr.placeholder = i18n.t("settings.trInstructionPlaceholder");
    instr.className =
      "w-full mt-1 px-2 py-1 bg-surface-3 border border-surface-3 rounded text-[0.72rem] leading-relaxed text-text-primary outline-none resize-y focus:border-accent";
    instrWrap.appendChild(instr);

    const btnRow = document.createElement("div");
    btnRow.className = "flex gap-1 mt-1";

    const loadBtn = document.createElement("button");
    loadBtn.id = "tr-instruction-load";
    loadBtn.className = "btn text-[0.68rem]";
    loadBtn.textContent = i18n.t("settings.trLoadInstruction");
    btnRow.appendChild(loadBtn);

    instrWrap.appendChild(btnRow);
    instrCard.appendChild(instrWrap);
    pane.appendChild(instrCard);

    // ── Wiring ──
    const providerSel = pane.querySelector<HTMLSelectElement>("#tr-provider")!;
    const sourceSel = pane.querySelector<HTMLSelectElement>("#tr-source-lang")!;
    const targetInput =
      pane.querySelector<HTMLInputElement>("#tr-target-lang")!;
    const persist = () => this._persist(pane);

    providerSel.addEventListener("change", function () {
      translationTab._syncVisibility(pane);
      persist();
    });
    const styleSel = pane.querySelector<HTMLSelectElement>("#tr-llm-style");
    styleSel?.addEventListener("change", function () {
      translationTab._syncStylePlaceholders(pane);
      persist();
    });
    // "input" fires on every keystroke/paste — keys are committed immediately
    [sourceSel, targetInput, llmOpts, geminiOpts].forEach((root) => {
      root
        .querySelectorAll("input, select")
        .forEach((el) => el.addEventListener("input", persist));
      root
        .querySelectorAll("input, select")
        .forEach((el) => el.addEventListener("change", persist));
    });
    instr.addEventListener("blur", persist);

    loadBtn.addEventListener("click", function () {
      window.lumina
        .loadDefaultInstruction()
        .then(function (text) {
          instr.value = text;
          persist();
        })
        .catch(function () {});
    });

    // Hydrate non-secret fields synchronously from localStorage FIRST —
    // the DOM must never show defaults (select = first option "llm", empty
    // model fields) that a keystroke/commit could persist over the stored
    // config. Then fill the vault keys asynchronously.
    this._applyLocal(pane);
    this.refresh();
  },

  /** Commit pending DOM edits — called on Done/close before values are lost */
  commit(): void {
    const pane = document.getElementById("tab-translation");
    if (pane) this._persist(pane);
  },

  /**
   * Apply non-secret config from localStorage — synchronous, no IPC, so the
   * DOM is always correct before any user interaction. This is what keeps
   * provider/model/url/instruction from reverting to defaults.
   */
  _applyLocal(pane: HTMLElement): void {
    const cfg = translateSettings.load();
    const providerSel = pane.querySelector<HTMLSelectElement>("#tr-provider");
    const sourceSel = pane.querySelector<HTMLSelectElement>("#tr-source-lang");
    const targetInput = pane.querySelector<HTMLInputElement>("#tr-target-lang");
    if (providerSel) providerSel.value = cfg.provider;
    if (sourceSel) sourceSel.value = cfg.sourceLang;
    if (targetInput) targetInput.value = cfg.targetLang;
    const set = (id: string, v: string) => {
      const el = pane.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        "#" + id,
      );
      if (el && document.activeElement !== el) el.value = v;
    };
    set("tr-instruction", cfg.llmInstruction);
    set("tr-llm-url", cfg.llmBaseUrl);
    // Model fields fall back to per-provider defaults so the request always
    // carries a model even for providers never configured before.
    set("tr-llm-model", cfg.llmModel || "gpt-4o-mini");
    set("tr-openrouter-model", cfg.openrouterModel || "openai/gpt-4o-mini");
    set("tr-grok-model", cfg.grokModel || "grok-3");
    const styleSel = pane.querySelector<HTMLSelectElement>("#tr-llm-style");
    if (styleSel) styleSel.value = cfg.llmStyle;
    this._syncStylePlaceholders(pane);
    set("tr-gemini-model", cfg.geminiModel);
    this._syncVisibility(pane);
  },

  async refresh(): Promise<void> {
    const pane = document.getElementById("tab-translation");
    if (!pane) return;
    // Only the API keys come from the encrypted vault (async IPC). Non-secret
    // fields were already applied synchronously in _applyLocal. Guard against
    // overwriting a key the user just typed while the fetch was in flight.
    const before = this._keySnapshot(pane);
    const cfg = await translateSettings.loadWithSecrets();
    if (this._keySnapshot(pane) !== before) return;
    const set = (id: string, v: string) => {
      const el = pane.querySelector<HTMLInputElement>("#" + id);
      if (el && document.activeElement !== el) el.value = v;
    };
    set("tr-custom-key", cfg.llmApiKey);
    set("tr-openrouter-key", cfg.openrouterApiKey);
    set("tr-grok-key", cfg.grokApiKey);
    set("tr-gemini-key", cfg.geminiApiKey);
  },

  /** Key-field values only — the async part of refresh must not touch the rest */
  _keySnapshot(pane: HTMLElement): string {
    const ids = [
      "tr-custom-key",
      "tr-openrouter-key",
      "tr-grok-key",
      "tr-gemini-key",
    ];
    return ids
      .map((id) => pane.querySelector<HTMLInputElement>("#" + id)?.value ?? "")
      .join("\u0000");
  },

  /** Placeholders for the custom URL/model fields follow the API style */
  _syncStylePlaceholders(pane: HTMLElement): void {
    const style =
      pane.querySelector<HTMLSelectElement>("#tr-llm-style")?.value ?? "openai";
    const url = pane.querySelector<HTMLInputElement>("#tr-llm-url");
    const model = pane.querySelector<HTMLInputElement>("#tr-llm-model");
    if (url)
      url.placeholder =
        style === "anthropic"
          ? "https://api.anthropic.com"
          : "https://api.openai.com/v1";
    if (model)
      model.placeholder =
        style === "anthropic" ? "claude-sonnet-4-5" : "gpt-4o-mini";
  },

  _syncVisibility(pane: HTMLElement): void {
    const provider =
      pane.querySelector<HTMLSelectElement>("#tr-provider")?.value ?? "";
    const llm = pane.querySelector<HTMLElement>("#tr-llm-options");
    const gemini = pane.querySelector<HTMLElement>("#tr-gemini-options");
    const customRows = pane.querySelector<HTMLElement>("#tr-llm-custom-rows");
    const openrouterRows = pane.querySelector<HTMLElement>(
      "#tr-openrouter-rows",
    );
    const grokRows = pane.querySelector<HTMLElement>("#tr-grok-rows");
    if (llm) llm.classList.toggle("hidden", provider === "gemini");
    if (gemini) gemini.classList.toggle("hidden", provider !== "gemini");
    if (customRows)
      customRows.classList.toggle("hidden", provider !== "custom");
    if (openrouterRows)
      openrouterRows.classList.toggle("hidden", provider !== "openrouter");
    if (grokRows) grokRows.classList.toggle("hidden", provider !== "grok");
  },

  _persist(pane: HTMLElement): void {
    const val = (id: string) =>
      (
        pane.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          "#" + id,
        ) as HTMLInputElement | null
      )?.value.trim() ?? "";
    const cfg: TranslateConfig = {
      provider: (pane.querySelector<HTMLSelectElement>("#tr-provider")?.value ??
        "gemini") as TranslateConfig["provider"],
      sourceLang:
        pane.querySelector<HTMLSelectElement>("#tr-source-lang")?.value ??
        "auto",
      targetLang: (val("tr-target-lang") || "en").toLowerCase(),
      llmBaseUrl: val("tr-llm-url"),
      llmApiKey: val("tr-custom-key"),
      llmModel: val("tr-llm-model") || "gpt-4o-mini",
      llmStyle:
        pane.querySelector<HTMLSelectElement>("#tr-llm-style")?.value ===
        "anthropic"
          ? "anthropic"
          : "openai",
      llmInstruction: (
        pane.querySelector<HTMLTextAreaElement>("#tr-instruction")?.value ?? ""
      ).trim(),
      openrouterApiKey: val("tr-openrouter-key"),
      openrouterModel: val("tr-openrouter-model") || "openai/gpt-4o-mini",
      grokApiKey: val("tr-grok-key"),
      grokModel: val("tr-grok-model") || "grok-3",
      geminiApiKey: val("tr-gemini-key"),
      geminiModel: val("tr-gemini-model"),
    };
    translateSettings.save(cfg);
  },

  /** Row with a label span + control appended via fn */
  _row(labelText: string, fn: (row: HTMLElement) => HTMLElement): HTMLElement {
    const row = document.createElement("div");
    row.className = "field-row items-center justify-between mb-3";
    const label = document.createElement("span");
    label.className = "text-[0.78rem] text-text-primary";
    label.textContent = labelText;
    row.appendChild(label);
    const control = fn(row);
    row.appendChild(control);
    return row;
  },

  /** Simple labeled input field */
  _field(
    id: string,
    type: string,
    labelText: string,
    placeholder: string,
  ): HTMLElement {
    const wrap = document.createElement("div");
    const label = document.createElement("div");
    label.className = "field-label";
    label.textContent = labelText;
    wrap.appendChild(label);
    const input = document.createElement("input");
    input.type = type;
    input.id = id;
    input.className =
      "w-full mt-1 px-2 py-1 bg-surface-3 border border-surface-3 rounded text-[0.78rem] text-text-primary outline-none focus:border-accent";
    if (placeholder) input.placeholder = placeholder;
    wrap.appendChild(input);
    return wrap;
  },

  /** Password field with a show/hide toggle button */
  _keyField(id: string, labelText: string, placeholder: string): HTMLElement {
    const wrap = document.createElement("div");
    const label = document.createElement("div");
    label.className = "field-label";
    label.textContent = labelText;
    wrap.appendChild(label);
    const box = document.createElement("div");
    box.className = "relative mt-1";
    const input = document.createElement("input");
    input.type = "password";
    input.id = id;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.className =
      "w-full px-2 py-1 pr-8 bg-surface-3 border border-surface-3 rounded text-[0.78rem] text-text-primary outline-none focus:border-accent";
    if (placeholder) input.placeholder = placeholder;
    box.appendChild(input);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-text-secondary hover:text-text-primary";
    btn.setAttribute("aria-label", i18n.t("settings.trToggleKey"));
    btn.innerHTML = '<i data-lucide="eye" class="w-3.5 h-3.5"></i>';
    btn.addEventListener("click", function () {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = show
        ? '<i data-lucide="eye-off" class="w-3.5 h-3.5"></i>'
        : '<i data-lucide="eye" class="w-3.5 h-3.5"></i>';
      createIcons({ nameAttr: "data-lucide", root: btn });
    });
    box.appendChild(btn);
    wrap.appendChild(box);
    return wrap;
  },
};
