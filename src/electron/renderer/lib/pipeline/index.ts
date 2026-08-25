/* ── Lumina Pipeline — Facade ── */
import { detection } from "./detection";
import { ocr } from "./ocr";
import { translate } from "./translate";
import { inpaint } from "./inpaint";

export const pipeline = {
  runDetection: detection.run,
  runDetectionAll: detection.runAll,
  runOcr: ocr.run,
  runTranslate: translate.run,
  runInpaint: inpaint.run,
};
