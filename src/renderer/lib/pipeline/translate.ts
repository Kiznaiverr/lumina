/* ── Lumina Translation settings + pipeline ──
 * Non-secret config persisted in localStorage; API keys stored encrypted
 * via safeStorage vault (main/storage.ts) and injected per-request.
 */
import { state } from "../state";
import * as i18n from "../i18n";
import { ui } from "../ui";
import { history } from "../history";
import { canvas } from "../canvas/index";
import { sidebar } from "../sidebar";
import { normalizeAutoText } from "./textNorm";
import type { TextDetection } from "../../types";

const STORAGE_KEY = "lumina-translate";

/** localStorage holds everything EXCEPT the api keys (those live in the vault) */
type StoredConfig = Omit<
  TranslateConfig,
  "llmApiKey" | "openrouterApiKey" | "grokApiKey" | "geminiApiKey"
>;

export interface TranslateConfig {
  provider: "custom" | "openrouter" | "grok" | "gemini";
  sourceLang: string;
  targetLang: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  llmStyle: "openai" | "anthropic";
  llmInstruction: string;
  openrouterApiKey: string;
  openrouterModel: string;
  grokApiKey: string;
  grokModel: string;
  geminiApiKey: string;
  geminiModel: string;
}

function defaultConfig(): TranslateConfig {
  return {
    provider: "gemini",
    // "auto" = let the model detect the source language from the text
    sourceLang: "auto",
    targetLang: "en",
    llmBaseUrl: "",
    llmApiKey: "",
    llmModel: "gpt-4o-mini",
    llmStyle: "openai",
    // Empty = use default from prompts/translate-default.md (backend side)
    llmInstruction: "",
    openrouterApiKey: "",
    openrouterModel: "openai/gpt-4o-mini",
    grokApiKey: "",
    grokModel: "grok-3",
    geminiApiKey: "",
    geminiModel: "gemini-2.0-flash",
  };
}

export const translateSettings = {
  load(): TranslateConfig {
    let cfg: TranslateConfig = defaultConfig();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) cfg = { ...cfg, ...(JSON.parse(raw) as StoredConfig) };
    } catch {
      /* keep defaults */
    }
    // API keys are NOT in localStorage — they come from the encrypted vault
    return cfg;
  },

  /**
   * Persist non-secret fields to localStorage + keys to the vault.
   * Empty key values do NOT overwrite existing vault entries — this guards
   * against persisting a blank field (e.g. UI not yet hydrated from vault).
   */
  save(cfg: TranslateConfig): void {
    const stored: StoredConfig = {
      provider: cfg.provider,
      sourceLang: cfg.sourceLang,
      targetLang: cfg.targetLang,
      llmBaseUrl: cfg.llmBaseUrl,
      llmModel: cfg.llmModel,
      llmStyle: cfg.llmStyle,
      llmInstruction: cfg.llmInstruction,
      openrouterModel: cfg.openrouterModel,
      grokModel: cfg.grokModel,
      geminiModel: cfg.geminiModel,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    if (window.lumina.setSecret) {
      // Each provider keeps its own key — empty fields never wipe the vault
      if (cfg.llmApiKey) window.lumina.setSecret("llmApiKey", cfg.llmApiKey);
      if (cfg.openrouterApiKey)
        window.lumina.setSecret("openrouterApiKey", cfg.openrouterApiKey);
      if (cfg.grokApiKey) window.lumina.setSecret("grokApiKey", cfg.grokApiKey);
      if (cfg.geminiApiKey)
        window.lumina.setSecret("geminiApiKey", cfg.geminiApiKey);
      console.log(
        `[Lumina] secrets save: custom=${cfg.llmApiKey ? "set" : "empty"} openrouter=${cfg.openrouterApiKey ? "set" : "empty"} grok=${cfg.grokApiKey ? "set" : "empty"} gemini=${cfg.geminiApiKey ? "set" : "empty"}`,
      );
    } else {
      console.warn(
        "[Lumina] window.lumina.setSecret MISSING — preload not rebuilt? Keys NOT saved",
      );
    }
  },

  /** Explicitly clear a stored api key */
  async clearKey(
    name: "llmApiKey" | "openrouterApiKey" | "grokApiKey" | "geminiApiKey",
  ): Promise<void> {
    if (window.lumina.deleteSecret) await window.lumina.deleteSecret(name);
  },

  /** Full config incl. api keys — call before POST /translate */
  async loadWithSecrets(): Promise<TranslateConfig> {
    const cfg = this.load();
    if (window.lumina.getSecret) {
      try {
        cfg.llmApiKey = (await window.lumina.getSecret("llmApiKey")) || "";
        cfg.openrouterApiKey =
          (await window.lumina.getSecret("openrouterApiKey")) || "";
        cfg.grokApiKey = (await window.lumina.getSecret("grokApiKey")) || "";
        cfg.geminiApiKey =
          (await window.lumina.getSecret("geminiApiKey")) || "";
        console.log(
          `[Lumina] secrets load: custom=${cfg.llmApiKey ? "set" : "empty"} openrouter=${cfg.openrouterApiKey ? "set" : "empty"} grok=${cfg.grokApiKey ? "set" : "empty"} gemini=${cfg.geminiApiKey ? "set" : "empty"}`,
        );
      } catch {
        /* vault unavailable — proceed with empty keys */
      }
    }
    return cfg;
  },
};

export const translate = {
  /** Translate all text detections of the active page */
  run: async function (): Promise<void> {
    const page = state.getActivePage();
    if (state.isRunning || !page) return;
    const withText = page.textDetections.filter(function (d) {
      return (d.text || "").trim().length > 0;
    });
    if (!withText.length) {
      ui.toast(i18n.t("toast.trNoText"), "warn");
      return;
    }
    state.isRunning = true;

    const loadingToast = ui.toast(i18n.t("toast.trRunning"), "running", 0);

    try {
      // Full config incl. api keys from the encrypted vault
      const config = await translateSettings.loadWithSecrets();
      const result = await window.lumina.apiPost<{
        results?: Array<{ index: number; text: string }>;
        detail?: string;
      }>("/translate", {
        texts: withText.map(function (d) {
          return d.text;
        }),
        // Full continuity context per segment: ALL preceding lines in reading
        // order (already-translated where available), so the model can complete
        // truncated OCR text and keep names/terms consistent — not just the
        // immediately previous line.
        previousLines: (function () {
          const ctx: string[] = [];
          const acc: string[] = [];
          withText.forEach(function (d) {
            ctx.push(acc.join(" / "));
            acc.push(d.translated || d.text || "");
          });
          return ctx;
        })(),
        // Segment type (dialogue vs narration) so the model can match register
        types: withText.map(function (d) {
          return d.type || "";
        }),
        config: config,
      });
      if (!result || !result.results)
        throw new Error(result?.detail || "Translation failed");

      // Map back via identity of filtered items
      withText.forEach(function (det: TextDetection, i: number) {
        const r = (result.results || []).find(function (x) {
          return x.index === i;
        });
        if (!r) return;
        // Fall back to the source text when the model skipped the index, so
        // no text silently disappears from the page.
        det.translated = normalizeAutoText(r.text || "") || det.text || "";
        // Mirror into the unified layer model
        const detIdx = page.textDetections.indexOf(det);
        const layer = page.layers[detIdx];
        if (layer && layer.type === "text-dialogue")
          layer.translation = det.translated;
      });

      canvas.render();
      sidebar.render();
      history.snapshot();
      ui.dismissToast(loadingToast);
      ui.toast(
        i18n.t("toast.trDone", { count: (result.results || []).length }),
        "success",
        3000,
      );
    } catch (err) {
      console.error("Translate error:", err);
      ui.dismissToast(loadingToast);
      ui.toast((err as Error).message || i18n.t("toast.trFailed"), "error");
    } finally {
      state.isRunning = false;
    }
  },

  /** Re-translate a single layer from the layer list (per-line retranslate) */
  retranslateLayer: async function (id: string): Promise<void> {
    const page = state.getActivePage();
    if (state.isRunning || !page) return;
    const i = page.layers.findIndex(function (l) {
      return l.id === id;
    });
    if (i < 0) return;
    const layer = page.layers[i];
    const text = (layer.source || "").trim();
    if (!text) {
      ui.toast(i18n.t("toast.trNoText"), "warn");
      return;
    }
    state.isRunning = true;

    const loadingToast = ui.toast(
      i18n.t("toast.trRunning", { count: 1 }),
      "running",
      0,
    );

    try {
      // Continuity context: ALL preceding dialogue lines in reading order
      let prev: string[] = [];
      for (let k = i - 1; k >= 0; k--) {
        const p = page.layers[k];
        if (p.type === "text-dialogue") {
          prev.unshift(p.translation || p.source || "");
        }
      }

      const config = await translateSettings.loadWithSecrets();
      const result = await window.lumina.apiPost<{
        results?: Array<{ index: number; text: string }>;
        detail?: string;
      }>("/translate", {
        texts: [text],
        previousLines: [prev.join(" / ")],
        types: [layer.type === "text-dialogue" ? "text_bubble" : "text_free"],
        config: config,
      });
      if (!result || !result.results || !result.results[0])
        throw new Error(result?.detail || "Translation failed");

      const translated = normalizeAutoText(result.results[0].text || "");
      layer.translation = translated;
      // Mirror into the parallel detection model
      if (layer.type === "text-dialogue" && i < page.textDetections.length) {
        page.textDetections[i].translated = translated;
      }

      canvas.render();
      sidebar.render();
      history.snapshot();
      ui.dismissToast(loadingToast);
      ui.toast(i18n.t("toast.trDone", { count: 1 }), "success", 3000);
    } catch (err) {
      console.error("Retranslate error:", err);
      ui.dismissToast(loadingToast);
      ui.toast((err as Error).message || i18n.t("toast.trFailed"), "error");
    } finally {
      state.isRunning = false;
    }
  },
};
