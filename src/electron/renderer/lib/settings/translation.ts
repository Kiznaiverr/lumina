/* ── Settings: Translation tab (provider, target lang, instruction) ──
 * System instruction is GLOBAL (shared by llm + gemini). Empty field =
 * use default from prompts/translate-default.md on the backend.
 */
import * as i18n from "../i18n";
import { translateSettings, type TranslateConfig } from "../pipeline/translate";

export const translationTab = {
  build(pane: HTMLElement): void {
    pane.innerHTML = "";

    // ── Provider ──
    pane.appendChild(
      this._row(i18n.t("settings.trProvider"), (row) => {
        const sel = document.createElement("select");
        sel.id = "tr-provider";
        sel.className = "field-select";
        for (const [value, label] of [
          ["llm", "LLM"],
          ["gemini", "Gemini"],
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

    // ── Target language ──
    pane.appendChild(
      this._row(i18n.t("settings.trTargetLang"), (row) => {
        const sel = document.createElement("select");
        sel.id = "tr-target-lang";
        sel.className = "field-select";
        for (const [value, label] of [
          ["en", "English"],
          ["id", "Bahasa Indonesia"],
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

    // ── System instruction (global, shared by all LLM-based providers) ──
    const instrWrap = document.createElement("div");
    instrWrap.className = "mb-3";
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

    const clearBtn = document.createElement("button");
    clearBtn.id = "tr-instruction-clear";
    clearBtn.className = "btn text-[0.68rem]";
    clearBtn.textContent = i18n.t("settings.trResetInstruction");
    btnRow.appendChild(clearBtn);

    instrWrap.appendChild(btnRow);
    pane.appendChild(instrWrap);

    // ── LLM options panel ──
    const llmOpts = document.createElement("div");
    llmOpts.id = "tr-llm-options";
    llmOpts.className = "hidden mb-3 flex flex-col gap-3";
    llmOpts.appendChild(
      this._field(
        "tr-llm-url",
        "text",
        i18n.t("settings.trLlmUrl"),
        "https://api.openai.com/v1",
      ),
    );
    llmOpts.appendChild(
      this._field("tr-llm-key", "password", i18n.t("settings.trLlmKey"), ""),
    );
    llmOpts.appendChild(
      this._field(
        "tr-llm-model",
        "text",
        i18n.t("settings.trLlmModel"),
        "gpt-4o-mini",
      ),
    );
    pane.appendChild(llmOpts);

    // ── Gemini options panel ──
    const geminiOpts = document.createElement("div");
    geminiOpts.id = "tr-gemini-options";
    geminiOpts.className = "hidden mb-3 flex flex-col gap-3";
    geminiOpts.appendChild(
      this._field(
        "tr-gemini-key",
        "password",
        i18n.t("settings.trGeminiKey"),
        "",
      ),
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

    // ── Wiring ──
    const providerSel = pane.querySelector<HTMLSelectElement>("#tr-provider")!;
    const targetSel = pane.querySelector<HTMLSelectElement>("#tr-target-lang")!;
    const persist = () => this._persist(pane);

    providerSel.addEventListener("change", function () {
      translationTab._syncVisibility(pane);
      persist();
    });
    // "input" fires on every keystroke/paste — keys are committed immediately
    [targetSel, llmOpts, geminiOpts].forEach((root) => {
      root
        .querySelectorAll("input")
        .forEach((el) => el.addEventListener("input", persist));
      root
        .querySelectorAll("input")
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

    clearBtn.addEventListener("click", function () {
      // Empty = fall back to prompts/translate-default.md on backend
      instr.value = "";
      persist();
    });

    this.refresh();
  },

  /** Commit pending DOM edits — called on Done/close before values are lost */
  commit(): void {
    const pane = document.getElementById("tab-translation");
    if (pane) this._persist(pane);
  },

  async refresh(): Promise<void> {
    const pane = document.getElementById("tab-translation");
    if (!pane) return;
    // Snapshot field values now; if the user edits while the vault fetch is
    // in flight, abort applying stale values over their edits.
    const before = this._snapshot(pane);
    // Full config incl. api keys from the encrypted vault
    const cfg = await translateSettings.loadWithSecrets();
    if (this._snapshot(pane) !== before) return; // user edited during fetch
    const providerSel = pane.querySelector<HTMLSelectElement>("#tr-provider");
    const targetSel = pane.querySelector<HTMLSelectElement>("#tr-target-lang");
    if (providerSel) providerSel.value = cfg.provider;
    if (targetSel) targetSel.value = cfg.targetLang;
    const set = (id: string, v: string) => {
      const el = pane.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        "#" + id,
      );
      if (el && document.activeElement !== el) el.value = v;
    };
    set("tr-instruction", cfg.llmInstruction);
    set("tr-llm-url", cfg.llmBaseUrl);
    set("tr-llm-key", cfg.llmApiKey);
    set("tr-llm-model", cfg.llmModel);
    set("tr-gemini-key", cfg.geminiApiKey);
    set("tr-gemini-model", cfg.geminiModel);
    this._syncVisibility(pane);
  },

  /** Serialized field values — used to detect edits during async refresh */
  _snapshot(pane: HTMLElement): string {
    return [
      "tr-provider",
      "tr-target-lang",
      "tr-instruction",
      "tr-llm-url",
      "tr-llm-key",
      "tr-llm-model",
      "tr-gemini-key",
      "tr-gemini-model",
    ]
      .map(
        (id) =>
          pane.querySelector<HTMLInputElement | HTMLTextAreaElement>("#" + id)
            ?.value ?? "",
      )
      .join("\u0000");
  },

  _syncVisibility(pane: HTMLElement): void {
    const provider =
      pane.querySelector<HTMLSelectElement>("#tr-provider")?.value ?? "";
    const llm = pane.querySelector<HTMLElement>("#tr-llm-options");
    const gemini = pane.querySelector<HTMLElement>("#tr-gemini-options");
    if (llm) llm.classList.toggle("hidden", provider !== "llm");
    if (gemini) gemini.classList.toggle("hidden", provider !== "gemini");
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
      sourceLang: "ja",
      targetLang:
        pane.querySelector<HTMLSelectElement>("#tr-target-lang")?.value ?? "en",
      llmBaseUrl: val("tr-llm-url"),
      llmApiKey: val("tr-llm-key"),
      llmModel: val("tr-llm-model"),
      llmInstruction: (
        pane.querySelector<HTMLTextAreaElement>("#tr-instruction")?.value ?? ""
      ).trim(),
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
};
