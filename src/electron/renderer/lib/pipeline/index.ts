/* ── Lumina Pipeline — Facade ── */
import { detection } from "./detection";
import { ocr } from "./ocr";

export const pipeline = {
  runDetection: detection.run,
  runDetectionAll: detection.runAll,
  runOcr: ocr.run,
};
