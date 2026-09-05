/**
 * electron-builder config for the Lumina DML installer.
 *
 * Builds dist/dml/Lumina-Setup-DML-<version>.exe (CPU + DirectML, universal).
 * - publish.channel "dml" -> dml.yml feed (CUDA installs use a
 *   separate channel, so the two variants never cross-update).
 */
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @type {import("electron-builder").Configuration} */
const config = {
  appId: "com.lumina.app",
  productName: "Lumina",
  directories: {
    output: "dist/dml",
    // Icon & installer assets live here (NOT build/ — that folder is
    // gitignored because it holds generated bundle artifacts)
    buildResources: "assets",
  },
  // Only the compiled app code goes into app.asar. Never use dist/** here:
  // electron-builder writes its output into dist/dml + dist/cuda, so a
  // dist/** glob would pack the whole previous installer output (including
  // a full Electron runtime) into the asar.
  files: ["dist/main/**", "dist/preload/**", "dist/renderer/**"],
  // Generates dml.yml + .blockmap so electron-updater can resolve the
  // DML channel feed. Actual upload happens in CI (draft release) — publishing
  // itself is disabled so the workflow keeps full control over drafts.
  publish: {
    provider: "github",
    owner: "lumina-tl",
    repo: "lumina",
    channel: "dml",
  },
  extraResources: [
    {
      from: path.join(ROOT, "build", "bundle-dml"),
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
