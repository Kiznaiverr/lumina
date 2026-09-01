/**
 * electron-builder config for the Lumina DML installer.
 *
 * Builds dist/Lumina-Setup-DML.exe (CPU + DirectML, universal).
 */
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @type {import("electron-builder").Configuration} */
const config = {
  appId: "com.lumina.app",
  productName: "Lumina",
  directories: {
    output: "dist",
    buildResources: "build",
  },
  files: ["dist/**"],
  asar: true,
  extraResources: [
    {
      from: path.join(ROOT, "build", "bundle"),
      to: ".",
      filter: ["**/*"],
    },
  ],
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    artifactName: "Lumina-Setup-DML.exe",
  },
};

export default config;
