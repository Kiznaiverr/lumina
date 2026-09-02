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
    // Icon & installer assets live here (NOT build/ — that folder is
    // gitignored because it holds generated bundle artifacts)
    buildResources: "assets",
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
    // Registers .lmi so double-clicking a Lumina project opens the app.
    // Icon omitted → falls back to the default app icon.
    fileAssociations: [
      {
        ext: "lmi",
        name: "Lumina Project",
        description: "Lumina Project File",
      },
    ],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    artifactName: "Lumina-Setup-DML-${version}.exe",
  },
};

export default config;
