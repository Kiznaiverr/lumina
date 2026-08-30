import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import http from "http";
import { PROJECT_ROOT } from "./paths";

export const CACHE_DIR = path.join(os.tmpdir(), "lumina");

function countFiles(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countFiles(full);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      files++;
      try {
        bytes += fs.statSync(full).size;
      } catch {
        /* file vanished mid-walk */
      }
    }
  }
  return { files, bytes };
}

function clearCacheDir(reason: string): void {
  let files = 0;
  let bytes = 0;
  if (fs.existsSync(CACHE_DIR)) {
    for (const entry of fs.readdirSync(CACHE_DIR, { withFileTypes: true })) {
      const full = path.join(CACHE_DIR, entry.name);
      try {
        if (entry.isDirectory()) {
          const sub = countFiles(full);
          files += sub.files;
          bytes += sub.bytes;
          fs.rmSync(full, { recursive: true, force: true });
        } else {
          files++;
          bytes += fs.statSync(full).size;
          fs.unlinkSync(full);
        }
      } catch (err) {
        console.warn(`[Lumina] Failed to remove cache entry ${full}:`, err);
      }
    }
  }
  if (files > 0) {
    const mb = (bytes / 1024 / 1024).toFixed(1);
    console.log(
      `[Lumina] Cache cleaned (${reason}): ${files} file(s), ${mb} MB`,
    );
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/** Called once at startup — wipes leftovers from a previous crashed session. */
export function prepareCacheDir(): void {
  console.log(`[Lumina] Cache dir: ${CACHE_DIR}`);
  clearCacheDir("previous session leftovers");
}

// ── Minimal .env loader ──
function loadEnvFile(): void {
  const envPath = path.join(PROJECT_ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Real environment variables take precedence over .env file
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile();

let pythonProcess: ChildProcess | null = null;
const PYTHON_PORT = parseInt(process.env.LUMINA_BACKEND_PORT || "8765", 10);
const PYTHON_DIR = path.join(PROJECT_ROOT, "python");
const PYTHON_ENTRY = path.join(PYTHON_DIR, "main.py");
const PYTHON_EXECUTABLE =
  process.platform === "win32"
    ? path.join(PROJECT_ROOT, "venv", "Scripts", "python.exe")
    : path.join(PROJECT_ROOT, "venv", "bin", "python");

export function spawnPythonBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[Lumina] Starting Python backend at ${PYTHON_ENTRY}`);
    pythonProcess = spawn(
      PYTHON_EXECUTABLE,
      [PYTHON_ENTRY, "--port", String(PYTHON_PORT)],
      {
        cwd: PYTHON_DIR,
        env: {
          ...process.env,
          // Force UTF-8 stdout/stderr (Japanese text in logs breaks cp1252)
          PYTHONIOENCODING: "utf-8",
          // Model cache dir override (used by services/detect/rtdetr.py)
          LUMINA_MODEL_DIR:
            process.env.LUMINA_MODEL_DIR || path.join(PROJECT_ROOT, "models"),
          // Keep all model weights inside <repo>/models (manga-ocr etc.)
          HF_HOME:
            process.env.HF_HOME ||
            path.join(
              process.env.LUMINA_MODEL_DIR || path.join(PROJECT_ROOT, "models"),
              "huggingface",
            ),
          // Session artifacts (inpaint patches) -> OS temp dir
          LUMINA_CACHE_DIR: CACHE_DIR,
        },
      },
    );

    pythonProcess.stdout?.on("data", (data: Buffer) => {
      console.log(`[Python] ${data.toString().trim()}`);
    });

    pythonProcess.stderr?.on("data", (data: Buffer) => {
      console.log(`[Python stderr] ${data.toString().trim()}`);
    });

    pythonProcess.on("error", (err) => {
      console.error("[Lumina] Failed to start Python backend:", err.message);
      reject(err);
    });

    pythonProcess.on("exit", (code) => {
      console.log(`[Lumina] Python backend exited with code ${code}`);
    });

    waitForHealth(resolve, reject, 30);
  });
}

function waitForHealth(
  resolve: () => void,
  reject: (err: Error) => void,
  retries: number,
): void {
  if (retries <= 0) {
    reject(new Error("Python backend did not become ready in time"));
    return;
  }

  const req = http.get(`http://127.0.0.1:${PYTHON_PORT}/health`, (res) => {
    if (res.statusCode === 200) {
      console.log("[Lumina] Python backend is ready");
      resolve();
    } else {
      setTimeout(() => waitForHealth(resolve, reject, retries - 1), 500);
    }
  });

  req.on("error", () => {
    setTimeout(() => waitForHealth(resolve, reject, retries - 1), 500);
  });

  req.end();
}

export function stopPythonBackend(): void {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
    console.log("[Lumina] Python backend stopped");
  }
  // Patch files are session-scoped: safe to delete once the backend is
  // down (no writer holds them anymore).
  clearCacheDir("app close");
}
