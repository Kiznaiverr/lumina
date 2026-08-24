import { BrowserWindow, dialog, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import http from "http";

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
  ipcMain.handle("load-translations", async () => {
    const rendererDir = path.join(__dirname, "../../../src/electron/renderer");
    const i18nDir = path.join(rendererDir, "i18n");
    const result: Record<string, Record<string, string>> = {};
    try {
      for (const name of fs.readdirSync(i18nDir)) {
        if (!name.endsWith(".json")) continue;
        const code = name.replace(".json", "");
        result[code] = JSON.parse(
          fs.readFileSync(path.join(i18nDir, name), "utf-8")
        );
      }
    } catch (err) {
      console.error("Failed to load translations:", err);
    }
    return result;
  });

  ipcMain.handle("check-model", async () => {
    try {
      const result = (await apiGet("/model/check")) as { cached: boolean };
      return result;
    } catch {
      return { cached: false };
    }
  });

  ipcMain.handle("download-model", async () => {
    try {
      const result = await apiPost("/model/download", {});
      return result;
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle("import-image", async () => {
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

  ipcMain.handle("import-images", async () => {
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

  ipcMain.handle("run-pipeline", async (_event, imagePath: string) => {
    const send = (step: string, detail?: string) => {
      mainWindow.webContents.send("pipeline-progress", { step, detail });
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
        bboxes: bubbles.map((b) => b.bbox),
      })) as { outputPath: string };
      send("inpaint", "Inpaint complete");

      return {
        success: true,
        originalImagePath: imagePath,
        cleanedImagePath: inpaintResult.outputPath,
        bubbles,
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // Generic API proxy — renderer calls this directly for fine-grained control
  ipcMain.handle(
    "api-post",
    async (_event, endpoint: string, body: unknown) => {
      try {
        return await apiPost(endpoint, body);
      } catch (err) {
        return { error: true, message: String(err) };
      }
    },
  );

  // System fonts
  ipcMain.handle("get-fonts", async () => {
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

    const fonts: Set<string> = new Set();
    const validExts = new Set([".ttf", ".otf", ".woff", ".woff2"]);

    for (const dir of fontDirs) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            const ext = pathMod.extname(entry.name).toLowerCase();
            if (validExts.has(ext)) {
              fonts.add(entry.name.replace(/\.[^.]+$/, ""));
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
                    fonts.add(s.name.replace(/\.[^.]+$/, ""));
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

    return Array.from(fonts).sort();
  });
}
