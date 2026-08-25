/* ── Lumina Secrets — safeStorage-backed key/value vault ──
 * API keys are encrypted with the OS credential facility (DPAPI on Windows,
 * Keychain on macOS, libsecret on Linux) and persisted to
 * <userData>/secrets.json. Values survive restarts for the same OS user.
 */
import { app, safeStorage } from "electron";
import fs from "fs";
import path from "path";

const FILE_NAME = "secrets.json";

function filePath(): string {
  return path.join(app.getPath("userData"), FILE_NAME);
}

function readAll(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(filePath(), "utf-8"));
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, string>): void {
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
  // Lazy import to avoid circular import with pipeline.ts registration order
  const { ipcMain } = require("electron") as typeof import("electron");
  ipcMain.handle("secrets-set", (_e, key: string, value: string) => {
    setSecret(String(key), String(value ?? ""));
  });
  ipcMain.handle("secrets-get", (_e, key: string) => getSecret(String(key)));
  ipcMain.handle("secrets-delete", (_e, key: string) =>
    deleteSecret(String(key)),
  );
}
