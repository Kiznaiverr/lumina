import { BrowserWindow, dialog, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import http from "http";
import { IPC } from "../shared/bridge";
import { PROJECT_ROOT } from "./paths";

const PYTHON_PORT = 8765;

function apiGet(endpoint: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      `http://127.0.0.1:${PYTHON_PORT}${endpoint}`,
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error(`Bad JSON from ${endpoint}`));
          }
        });
      },
    );
    req.on("error", reject);
  });
}

function apiPost(endpoint: string, body: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      `http://127.0.0.1:${PYTHON_PORT}${endpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error(`Bad JSON from ${endpoint}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function translateText(text: string): string {
  // Phase 2: simple passthrough — real translation via API added later
  return `[EN] ${text}`;
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // i18n: load translation JSON files from disk
  ipcMain.handle(IPC.loadTranslations, async () => {
    const rendererDir = path.join(PROJECT_ROOT, "src/renderer");
    const i18nDir = path.join(rendererDir, "i18n");
    const result: Record<string, Record<string, string>> = {};
    try {
      for (const name of fs.readdirSync(i18nDir)) {
        if (!name.endsWith(".json")) continue;
        const code = name.replace(".json", "");
        result[code] = JSON.parse(
          fs.readFileSync(path.join(i18nDir, name), "utf-8"),
        );
      }
    } catch (err) {
      console.error("Failed to load translations:", err);
    }
    return result;
  });

  ipcMain.handle(IPC.checkModel, async () => {
    try {
      const result = (await apiGet("/model/check")) as { cached: boolean };
      return result;
    } catch {
      return { cached: false };
    }
  });

  ipcMain.handle(IPC.downloadModel, async (_event, models: string[] = []) => {
    try {
      // Kick off background download in Python backend (empty = all missing)
      await apiPost("/model/download", { models });
    } catch (err) {
      return { error: String(err) };
    }

    // Poll progress and forward to renderer
    const send = (msg: Record<string, unknown>) =>
      mainWindow.webContents.send(IPC.modelDownloadProgress, msg);

    return new Promise((resolve) => {
      const poll = setInterval(async () => {
        try {
          const p = (await apiGet("/model/progress")) as {
            running: boolean;
            progress: number;
            downloaded: number;
            total: number;
            done: boolean;
            error: string | null;
            model?: string | null;
          };
          send(p);
          if (p.done || p.error || !p.running) {
            clearInterval(poll);
            resolve(p.error ? { error: p.error } : { status: "ok" });
          }
        } catch {
          // backend hiccup — keep polling
        }
      }, 500);
    });
  });

  ipcMain.handle(IPC.importImage, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import Manga Page",
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] },
      ],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IPC.importImages, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import Manga Pages",
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] },
      ],
      properties: ["openFile", "multiSelections"],
    });
    if (result.canceled || result.filePaths.length === 0) return [];
    return result.filePaths;
  });

  ipcMain.handle(IPC.runPipeline, async (_event, imagePath: string) => {
    const send = (step: string, detail?: string) => {
      mainWindow.webContents.send(IPC.pipelineProgress, { step, detail });
    };

    try {
      // Step 1: Detect
      send("detect", "Detecting text bubbles...");
      const detectResult = (await apiPost("/detect", { imagePath })) as {
        detections: Array<{
          bbox: unknown;
          type: string;
          backgroundType: string;
          confidence: number;
        }>;
      };
      send("detect", `Found ${detectResult.detections.length} regions`);

      // Step 2: OCR each bubble
      send("ocr", "Reading text from bubbles...");
      const ocrResults: Array<{
        bbox: unknown;
        type: string;
        backgroundType: string;
        originalText: string;
        confidence: number;
      }> = [];
      for (const det of detectResult.detections) {
        const ocrResult = (await apiPost("/ocr", {
          imagePath,
          bbox: det.bbox,
        })) as { text: string; confidence: number };
        ocrResults.push({
          bbox: det.bbox,
          type: det.type,
          backgroundType: det.backgroundType,
          originalText: ocrResult.text,
          confidence: ocrResult.confidence,
        });
        send("ocr", `OCR: "${ocrResult.text}"`);
      }

      // Step 3: Translate
      send("translate", "Translating text...");
      for (const bubble of ocrResults) {
        bubble.originalText = bubble.originalText; // keep original
      }
      const bubbles = ocrResults.map((b) => ({
        ...b,
        translatedText: translateText(b.originalText),
      }));
      send("translate", `Translated ${bubbles.length} bubbles`);

      // Step 4: Inpaint
      send("inpaint", "Cleaning background...");
      const inpaintResult = (await apiPost("/inpaint", {
        imagePath,
        boxes: bubbles.map((b) => b.bbox),
      })) as { patches: Array<{ imagePath: string }> };
      send("inpaint", "Inpaint complete");

      return {
        success: true,
        originalImagePath: imagePath,
        cleanedImagePath: inpaintResult.patches?.[0]?.imagePath ?? null,
        bubbles,
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // Generic API proxy — renderer calls this directly for fine-grained control
  ipcMain.handle(
    IPC.apiPost,
    async (_event, endpoint: string, body: unknown) => {
      try {
        return await apiPost(endpoint, body);
      } catch (err) {
        return { error: true, message: String(err) };
      }
    },
  );

  // System fonts
  ipcMain.handle(IPC.getFonts, async () => {
    const fs = await import("fs");
    const pathMod = await import("path");
    const fontDirs: string[] = [];

    // Windows
    if (process.platform === "win32") {
      const winFonts = pathMod.join(
        process.env.WINDIR || "C:\\Windows",
        "Fonts",
      );
      fontDirs.push(winFonts);
      const localFonts = pathMod.join(
        process.env.LOCALAPPDATA || "",
        "Microsoft",
        "Windows",
        "Fonts",
      );
      if (fs.existsSync(localFonts)) fontDirs.push(localFonts);
    }
    // macOS
    else if (process.platform === "darwin") {
      fontDirs.push("/Library/Fonts", "/System/Library/Fonts");
      const home = process.env.HOME;
      if (home) fontDirs.push(pathMod.join(home, "Library", "Fonts"));
    }
    // Linux
    else {
      fontDirs.push("/usr/share/fonts", "/usr/local/share/fonts");
      const home = process.env.HOME;
      if (home) fontDirs.push(pathMod.join(home, ".fonts"));
    }

    const fonts: Array<{
      family: string;
      path: string;
      weight: number;
      italic: boolean;
    }> = [];
    const seen = new Set<string>();
    const validExts = new Set([".ttf", ".otf"]);

    /** Read weight (OS/2 usWeightClass) + italic flag (fsSelection bit 0).
     * Style variants share one family — the renderer registers each file
     * as a separate FontFace under the same family so bold/italic work. */
    const readMeta = (
      buf: Buffer,
      numTables: number,
      dirOffset: number,
    ): { weight: number; italic: boolean } => {
      let weight = 400;
      let italic = false;
      for (let i = 0; i < numTables; i++) {
        const off = dirOffset + i * 16;
        if (buf.slice(off, off + 4).toString() === "OS/2") {
          const tableOff = buf.readUInt32BE(off + 8);
          weight = buf.readUInt16BE(tableOff + 4);
          italic = (buf.readUInt16BE(tableOff + 62) & 1) === 1;
          break;
        }
      }
      return { weight, italic };
    };

    /** Read the real family name from a font file's `name` table.
     * Filenames like "CC Wild Words Roman.ttf" are NOT family names — the
     * actual family ("CC Wild Words") lives inside the file. This also
     * groups style variants (Bold/Italic files) under one family entry.
     * Supports TTF/OTF and TTC collections (first font). */
    const readFamily = (filePath: string): string | null => {
      try {
        const buf = fs.readFileSync(filePath);
        // Plain TTF/OTF: sfnt header at 0, table directory at byte 12.
        // TTC collection: each font's sfnt header sits at the offset from
        // the TTC header — its table directory is that offset + 12.
        let dirOffset = 12;
        if (buf.slice(0, 4).toString() === "ttcf") {
          dirOffset = buf.readUInt32BE(12) + 12;
        }
        const numTables = buf.readUInt16BE(dirOffset - 8);
        for (let i = 0; i < numTables; i++) {
          const off = dirOffset + i * 16;
          if (buf.slice(off, off + 4).toString() !== "name") continue;
          const nameOff = buf.readUInt32BE(off + 8);
          const count = buf.readUInt16BE(nameOff + 2);
          const strOff = nameOff + buf.readUInt16BE(nameOff + 4);
          for (let j = 0; j < count; j++) {
            const rec = nameOff + 6 + j * 12;
            if (buf.readUInt16BE(rec + 6) !== 1) continue; // family name ID
            const len = buf.readUInt16BE(rec + 8);
            const o = buf.readUInt16BE(rec + 10);
            const platform = buf.readUInt16BE(rec);
            return platform === 3 || platform === 0
              ? buf
                  .slice(strOff + o, strOff + o + len)
                  .swap16()
                  .toString("utf16le")
              : buf.slice(strOff + o, strOff + o + len).toString("latin1");
          }
          break;
        }
      } catch {
        /* unreadable — fall back to filename */
      }
      return null;
    };

    for (const dir of fontDirs) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            const ext = pathMod.extname(entry.name).toLowerCase();
            if (validExts.has(ext)) {
              const filePath = pathMod.join(dir, entry.name);
              try {
                const buf = fs.readFileSync(filePath);
                const family =
                  readFamily(filePath) || entry.name.replace(/\.[^.]+$/, "");
                const meta = readMeta(buf, buf.readUInt16BE(4), 12);
                // Key includes variant so Bold/Italic files are ALL kept
                const key = family + "|" + meta.weight + "|" + meta.italic;
                if (!seen.has(key)) {
                  seen.add(key);
                  fonts.push({ family, path: filePath, ...meta });
                }
              } catch {
                fonts.push({
                  family: entry.name.replace(/\.[^.]+$/, ""),
                  path: filePath,
                  weight: 400,
                  italic: false,
                });
              }
            }
          } else if (entry.isDirectory()) {
            try {
              const sub = fs.readdirSync(pathMod.join(dir, entry.name), {
                withFileTypes: true,
              });
              for (const s of sub) {
                if (s.isFile()) {
                  const ext = pathMod.extname(s.name).toLowerCase();
                  if (validExts.has(ext)) {
                    const filePath = pathMod.join(dir, entry.name, s.name);
                    try {
                      const buf = fs.readFileSync(filePath);
                      const family =
                        readFamily(filePath) || s.name.replace(/\.[^.]+$/, "");
                      const subDirOffset = 12;
                      const meta = readMeta(
                        buf,
                        buf.readUInt16BE(4),
                        subDirOffset,
                      );
                      const key =
                        family + "|" + meta.weight + "|" + meta.italic;
                      if (!seen.has(key)) {
                        seen.add(key);
                        fonts.push({ family, path: filePath, ...meta });
                      }
                    } catch {
                      /* skip unreadable */
                    }
                  }
                }
              }
            } catch {
              /* skip unreadable */
            }
          }
        }
      } catch {
        /* dir not found */
      }
    }

    fonts.sort((a, b) => a.family.localeCompare(b.family));
    return fonts;
  });

  // Load default LLM instruction from prompts/translate-default.md
  ipcMain.handle(IPC.loadDefaultInstruction, async () => {
    try {
      const p = path.join(PROJECT_ROOT, "python/prompts/translate-default.md");
      return fs.readFileSync(p, "utf-8");
    } catch {
      return "";
    }
  });
}
