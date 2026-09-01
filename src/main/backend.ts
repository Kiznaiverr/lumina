import { spawn, ChildProcess } from "child_process";
import { app } from "electron";
import fs from "fs";
import os from "os";
import path from "path";
import http from "http";
import { PROJECT_ROOT } from "./paths";
import { resolveModelsDir } from "./storage";

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

interface PythonLaunch {
  /** Working directory for the spawned process. */
  dir: string;
  /** Script to execute (main.py in dev, run_backend.py in bundle). */
  entry: string;
  executable: string;
  /** os.pathsep-joined extra sys.path dirs — bundle only (null in dev). */
  pythonPath: string | null;
}

/** Writable app-private folder for runtime artifacts (deps, logs). */
export function runtimeDir(): string {
  return path.join(app.getPath("userData"), "runtime");
}

/**
 * Resolve the active onnxruntime variant folder.
 *
 * The EP is fixed at install time (one variant is bundled per installer):
 * bundled DML at <resources>/ort/dml (universal installer) first, then
 * bundled CUDA at <resources>/ort/cuda (CUDA installer). Returns null when
 * no variant is present — the backend then runs without onnxruntime
 * (models unavailable).
 */
export function activeOrtDir(): string | null {
  const bundledDml = path.join(process.resourcesPath, "ort", "dml");
  const bundledCuda = path.join(process.resourcesPath, "ort", "cuda");
  const has = (d: string) => fs.existsSync(path.join(d, "onnxruntime"));
  if (has(bundledDml)) return bundledDml;
  if (has(bundledCuda)) return bundledCuda;
  return null;
}

/**
 * Resolve how to launch the Python backend for this runtime mode.
 *
 * Dev (source checkout): venv interpreter + python/main.py, no PYTHONPATH
 * games — exactly the current behavior.
 *
 * Packaged: embeddable Python at <resources>/python, backend source at
 * <resources>/backend (real files — Python cannot read inside asar), and
 * the active ORT variant folder prepended via LUMINA_PYTHONPATH. The
 * embeddable's ._pth file ignores PYTHONPATH, so run_backend.py (the
 * entry) prepends those dirs to sys.path before importing main.
 */
function pythonLaunch(): PythonLaunch {
  if (app.isPackaged) {
    const res = process.resourcesPath;
    const pyRoot = path.join(res, "python");
    const pyApp = path.join(res, "backend");
    const sitePkgs = path.join(pyRoot, "Lib", "site-packages");
    const ortDir = activeOrtDir();
    const extra = ortDir
      ? [runtimeDir(), ortDir, sitePkgs]
      : [runtimeDir(), sitePkgs];
    return {
      dir: pyApp,
      entry: path.join(pyApp, "run_backend.py"),
      executable: path.join(pyRoot, "python.exe"),
      pythonPath: extra.join(path.delimiter),
    };
  }
  const dir = path.join(PROJECT_ROOT, "python");
  return {
    dir,
    entry: path.join(dir, "main.py"),
    executable:
      process.platform === "win32"
        ? path.join(PROJECT_ROOT, "venv", "Scripts", "python.exe")
        : path.join(PROJECT_ROOT, "venv", "bin", "python"),
    pythonPath: null,
  };
}

/** Effective models directory — see resolveModelsDir() (env > config > userData). */
function modelsDir(): string {
  return resolveModelsDir().path;
}

export function spawnPythonBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    const launch = pythonLaunch();
    console.log(`[Lumina] Starting Python backend at ${launch.entry}`);
    pythonProcess = spawn(
      launch.executable,
      [launch.entry, "--port", String(PYTHON_PORT)],
      {
        cwd: launch.dir,
        env: {
          ...process.env,
          // Force UTF-8 stdout/stderr (Japanese text in logs breaks cp1252)
          PYTHONIOENCODING: "utf-8",
          // Model dir: env override > saved config > userData/models
          LUMINA_MODEL_DIR: modelsDir(),
          // Keep all model weights inside the models dir (manga-ocr etc.)
          HF_HOME: process.env.HF_HOME || path.join(modelsDir(), "huggingface"),
          // Session artifacts (inpaint patches) -> OS temp dir
          LUMINA_CACHE_DIR: CACHE_DIR,
          // Bundle only: extra sys.path dirs read by run_backend.py
          ...(launch.pythonPath
            ? { LUMINA_PYTHONPATH: launch.pythonPath }
            : {}),
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
