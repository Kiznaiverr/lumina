import { spawn, ChildProcess } from "child_process";
import path from "path";
import http from "http";

let pythonProcess: ChildProcess | null = null;
const PYTHON_PORT = 8765;

// From dist/electron/main/backend.js → ../../../lumina root
const PROJECT_ROOT = path.join(__dirname, "../../..");
const PYTHON_DIR = path.join(PROJECT_ROOT, "src", "python");
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
        env: { ...process.env, HF_HUB_DISABLE_TELEMETRY: "1" },
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
}
