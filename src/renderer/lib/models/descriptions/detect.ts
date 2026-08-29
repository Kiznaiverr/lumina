/* ── Model descriptions: Text Detection ──
 * Bilingual copy shown in Settings → Models. Keyed by backend registry id.
 * Edit freely — the renderer rebuilds, no backend restart needed.
 */
import type { ModelDescMap } from "./index";

export const DETECT_DESCS: ModelDescMap = {
  rtdetr: {
    en: `RT-DETR v2 r50vd fine-tuned on comics (by ogkalu) — detects text boxes and speech bubbles on manga pages with high accuracy.

• The only text detector included, so it is always used and cannot be changed.
• Works reliably on clean pages as well as pages with screentones.
• Source: huggingface.co/ogkalu/comic-text-and-bubble-detector`,
    id: `RT-DETR v2 r50vd yang di-fine-tune pada dataset komik (oleh ogkalu) — mendeteksi kotak teks dan gelembung ucapan pada halaman manga dengan akurasi tinggi.

• Satu-satunya detektor teks yang tersedia, jadi selalu dipakai dan tidak bisa diganti.
• Bekerja andal pada halaman bersih maupun halaman berscreentone.
• Sumber: huggingface.co/ogkalu/comic-text-and-bubble-detector`,
  },
};
