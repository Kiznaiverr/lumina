/* ── Lumina Secrets — safeStorage-backed key/value vault ──
 * API keys are encrypted with the OS credential facility (DPAPI on Windows,
 * Keychain on macOS, libsecret on Linux) and persisted to
 * <userData>/secrets.json. Values survive restarts for the same OS user.
 */
import { app, dialog, BrowserWindow, ipcMain, safeStorage } from "electron";
import fs from "fs";
import path from "path";
import { IPC } from "../shared/bridge";
import type { ModelsPathState } from "../shared/bridge";

const FILE_NAME = "secrets.json";

function filePath(): string {
  return path.join(app.getPath("userData"), FILE_NAME);
}

// In-memory cache — the vault file is read at most once per process; every
// translate used to re-read + decrypt the whole file 4× via getSecret.
let _cache: Record<string, string> | null = null;

function readAll(): Record<string, string> {
  if (_cache) return _cache;
  let data: Record<string, string>;
  try {
    data = JSON.parse(fs.readFileSync(filePath(), "utf-8"));
  } catch {
    data = {};
  }
  _cache = data;
  return _cache;
}

function writeAll(data: Record<string, string>): void {
  _cache = data;
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Write via temp file + rename so a crash can't corrupt the store
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, file);
  console.log(
    `[Lumina secrets] wrote ${file} keys=[${Object.keys(data).join(",")}]`,
  );
}

export function isVaultAvailable(): boolean {
  const ok = safeStorage.isEncryptionAvailable();
  console.log(`[Lumina secrets] isEncryptionAvailable: ${ok}`);
  return ok;
}

export function setSecret(key: string, plain: string): void {
  console.log(
    `[Lumina secrets] setSecret(${key}) len=${plain.length} encrypted=${isVaultAvailable()}`,
  );
  if (!isVaultAvailable()) {
    // Fallback: store base64 (obfuscation only) rather than failing hard
    const data = readAll();
    data[key] = Buffer.from(plain, "utf-8").toString("base64");
    writeAll(data);
    return;
  }
  const data = readAll();
  if (plain === "") {
    delete data[key];
  } else {
    data[key] = safeStorage.encryptString(plain).toString("base64");
  }
  writeAll(data);
}

export function getSecret(key: string): string | null {
  const value = readAll()[key];
  if (value === undefined) {
    console.log(`[Lumina secrets] getSecret(${key}): MISS`);
    return null;
  }
  try {
    const buf = Buffer.from(value, "base64");
    if (isVaultAvailable()) {
      return safeStorage.decryptString(buf);
    }
    // Fallback-encoded (or legacy plaintext) value
    return buf.toString("utf-8");
  } catch {
    return null;
  }
}

export function deleteSecret(key: string): void {
  const data = readAll();
  delete data[key];
  writeAll(data);
}

export function registerSecretHandlers(): void {
  ipcMain.handle(IPC.secretsSet, (_e, key: string, value: string) => {
    setSecret(String(key), String(value ?? ""));
  });
  ipcMain.handle(IPC.secretsGet, (_e, key: string) => getSecret(String(key)));
  ipcMain.handle(IPC.secretsGetMany, (_e, keys: string[]) => {
    const out: Record<string, string | null> = {};
    const list = Array.isArray(keys) ? keys : [];
    for (const k of list) out[String(k)] = getSecret(String(k));
    return out;
  });
  ipcMain.handle(IPC.secretsDelete, (_e, key: string) =>
    deleteSecret(String(key)),
  );
}

/* ── Lumina App Config — plain JSON key/value store ──
 * Non-secret settings (e.g. the custom models directory) persisted to
 * <userData>/config.json. Unlike secrets, values are stored in plain text
 * so they survive reinstall and are easy to inspect.
 */
const CONFIG_FILE = "config.json";

interface AppConfig {
  modelsPath: string;
}

const DEFAULT_CONFIG: AppConfig = {
  modelsPath: "",
};

function configFilePath(): string {
  return path.join(app.getPath("userData"), CONFIG_FILE);
}

export function readConfig(): AppConfig {
  try {
    return {
      ...DEFAULT_CONFIG,
      ...JSON.parse(fs.readFileSync(configFilePath(), "utf-8")),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(patch: Partial<AppConfig>): AppConfig {
  const config = { ...readConfig(), ...patch };
  const file = configFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), "utf-8");
  fs.renameSync(tmp, file);
  return config;
}

/** Effective models directory: env override > saved config > userData default.
 *  Shared by the Settings UI (IPC) and backend spawn (LUMINA_MODEL_DIR). */
export function resolveModelsDir(): ModelsPathState {
  const env = process.env.LUMINA_MODEL_DIR;
  if (env) return { path: env, envOverride: true };
  const saved = readConfig().modelsPath;
  if (saved) return { path: saved, envOverride: false };
  return {
    path: path.join(app.getPath("userData"), "models"),
    envOverride: false,
  };
}

export function registerConfigHandlers(): void {
  ipcMain.handle(IPC.modelsPathGet, () => resolveModelsDir());
  ipcMain.handle(IPC.modelsPathSet, (_e, value: string) => {
    const v = String(value ?? "").trim();
    writeConfig({ modelsPath: v });
    return resolveModelsDir();
  });
  ipcMain.handle(IPC.modelsPathChoose, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const result = await dialog.showOpenDialog(win!, {
      title: "Choose models directory",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}
