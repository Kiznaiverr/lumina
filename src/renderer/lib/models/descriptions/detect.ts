/* ── Model descriptions: Text Detection ──
 * Bilingual copy shown in Settings → Models. Keyed by backend registry id.
 * Edit freely — the renderer rebuilds, no backend restart needed.
 */
import type { ModelDescMap } from "./index";

export const DETECT_DESCS: ModelDescMap = {
  rtdetr: {
    en: `RT-DETR v2 r50vd fine-tuned on comics (by ogkalu) — detects text boxes and speech bubbles on manga pages with high accuracy.

• Fast box-only detection, no segmentation mask output.
• Works reliably on clean pages as well as pages with screentones.
• Inpainting falls back to heuristic (Otsu) masking inside each box.
• Source: huggingface.co/ogkalu/comic-text-and-bubble-detector`,
    id: `RT-DETR v2 r50vd yang di-fine-tune pada dataset komik (oleh ogkalu) — mendeteksi kotak teks dan gelembung ucapan pada halaman manga dengan akurasi tinggi.

• Deteksi kotak yang cepat, tanpa output mask segmentasi.
• Bekerja andal pada halaman bersih maupun halaman berscreentone.
• Inpainting memakai masking heuristik (Otsu) di dalam setiap kotak.
• Sumber: huggingface.co/ogkalu/comic-text-and-bubble-detector`,
  },
  rfdetr_seg: {
    en: `Koharu Layout RF-DETR Seg 2XL (1152px, by ShiniShiho) — segmentation model that outputs precise per-text instance masks.

• The recommended default for text detection.
• Produces a full-page binary text mask, so inpainting erases exactly the glyph pixels instead of a rough box — much better on colorful and detailed pages.
• Onomatopoeia/SFX are deliberately kept as artwork, only text is erased.
• Slower on CPU (~10-30s/page).
• Source: huggingface.co/ShiniShiho/koharu-layout-rfdetr-seg-2xl-1152-onnx`,
    id: `Koharu Layout RF-DETR Seg 2XL (1152px, oleh ShiniShiho) — model segmentasi yang menghasilkan mask per-teks yang presisi.

• Rekomendasi default untuk deteksi teks.
• Menghasilkan mask teks biner satu halaman penuh, sehingga inpainting menghapus tepat piksel huruf, bukan kotak kasar — jauh lebih baik pada halaman berwarna dan detail.
• Onomatope/SFX sengaja dipertahankan sebagai artwork, hanya teks yang dihapus.
• Lebih lambat di CPU (~10-30 detik/halaman).
• Sumber: huggingface.co/ShiniShiho/koharu-layout-rfdetr-seg-2xl-1152-onnx`,
  },
};
