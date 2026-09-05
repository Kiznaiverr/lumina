/**
 * electron-builder config for the Lumina CUDA installer.
 *
 * Builds dist/cuda/Lumina-Setup-CUDA-<version>.exe (CUDA 12 EP, NVIDIA-only).
 * - LZMA2 maximum compression to keep the ~1.5GB NVIDIA runtime as small as
 *   possible (GitHub's 2GB per-file upload limit).
 * - publish.channel "cuda" -> cuda.yml feed so CUDA installs only ever
 *   update from CUDA artifacts (DML channel is separate).
 */
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @type {import("electron-builder").Configuration} */
const config = {
  appId: "com.lumina.app",
  productName: "Lumina",
  directories: {
    output: "dist/cuda",
    buildResources: "assets",
  },
  // Only the compiled app code goes into app.asar. Never use dist/** here:
  // electron-builder writes its output into dist/dml + dist/cuda, so a
  // dist/** glob would pack the whole previous installer output (including
  // a full Electron runtime) into the asar.
  files: ["dist/main/**", "dist/preload/**", "dist/renderer/**"],
  // Generates cuda.yml + .blockmap so electron-updater can resolve the
  // CUDA channel feed. Actual upload happens in CI (draft release) —
  // publishing itself is disabled so the workflow keeps full control.
  publish: {
    provider: "github",
    owner: "lumina-tl",
    repo: "lumina",
    channel: "cuda",
  },
  extraResources: [
    {
      from: path.join(ROOT, "build", "bundle-cuda"),
      to: ".",
      filter: ["**/*"],
    },
  ],
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
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
    artifactName: "Lumina-Setup-CUDA-${version}.exe",
    // Extract ort/cuda.7z into resources/ort/cuda during setup and delete
    // the archive (~1.5GB saved) — the app never extracts at first run.
    include: path.join(ROOT, "scripts", "nsis-cuda.nsh"),
  },
  // CUDA bundle is dominated by nvidia DLLs — solid LZMA2 maximum gives the
  // best compression; the extra build/install time is worth staying <2GB.
  compression: "store",
};

export default config;
