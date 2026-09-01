/* ── Model descriptions: OCR ──
 * Bilingual copy shown in Settings → Models. Keyed by backend registry id.
 * Edit freely — the renderer rebuilds, no backend restart needed.
 */
import type { ModelDescMap } from "./index";

export const OCR_DESCS: ModelDescMap = {
  manga_ocr: {
    en: `Japanese text recognition trained on manga (original by kha-white, ONNX port by mayocream).

• The most accurate Japanese recognizer of the three — handles vertical, horizontal, stylized, and even handwritten typesetting.
• Japanese only: use it when the source language is Japanese; it won't help for other languages.
• Lightweight and fast.
• Source: huggingface.co/mayocream/manga-ocr-onnx`,
    id: `Pengenalan teks bahasa Jepang yang dilatih pada manga (asli oleh kha-white, port ONNX oleh mayocream).

• Paling akurat untuk bahasa Jepang di antara ketiganya — menangani teks vertikal, horizontal, bergaya, bahkan tulisan tangan.
• Khusus Jepang: pakai saat bahasa sumbernya Jepang; tidak membantu untuk bahasa lain.
• Ringan dan cepat.
• Sumber: huggingface.co/mayocream/manga-ocr-onnx`,
  },
  ppocrv6: {
    en: `In development — integration is still being tuned; the app works with it, but output may be unreliable.

PP-OCRv6 medium by PaddlePaddle — recognition for 50+ languages including Japanese. Very fast on CPU (~5 ms/line).

• ⚠ Not recommended — in this app's testing the output was unreliable/inaccurate (likely a setup/config issue in the integration).
• For manga, prefer Baberu OCR (recommended) or manga-ocr.
• Source: huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec_onnx`,
    id: `Sedang disesuaikan — integrasinya masih dituning; aplikasi tetap bisa memakainya, tapi hasilnya mungkin belum akurat.

PP-OCRv6 medium oleh PaddlePaddle — pengenalan untuk 50+ bahasa termasuk Jepang. Sangat cepat di CPU (~5 ms/baris).

• ⚠ Tidak direkomendasikan — pada pengujian di aplikasi ini hasilnya kurang akurat/tidak konsisten (kemungkinan masalah setting atau setup kode integrasinya).
• Untuk manga, pilih Baberu OCR (direkomendasikan) atau manga-ocr.
• Sumber: huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec_onnx`,
  },
  baberu: {
    en: `Baberu OCR (by genshiai-daichi) — a 115M-parameter multilingual model (Japanese / Chinese / English) purpose-built for manga speech bubbles.

• Trained on real manga typesetting: vertical text, horizontal text, and sound effects (SFX).
• Understands stylized bubble layouts better than general-purpose OCR.
• Runs fast on CPU — the recommended default for manga.
• Source: huggingface.co/genshiai-daichi/baberu-ocr`,
    id: `Baberu OCR (oleh genshiai-daichi) — model multibahasa 115M parameter (Jepang / Cina / Inggris) yang dirancang khusus untuk gelembung ucapan manga.

• Dilatih pada tata letak manga asli: teks vertikal, teks horizontal, dan efek suara (SFX).
• Lebih memahami layout gelembung yang bergaya daripada OCR tujuan umum.
• Cepat di CPU — default yang direkomendasikan untuk manga.
• Sumber: huggingface.co/genshiai-daichi/baberu-ocr`,
  },
  paddleocr_vl: {
    en: `In development — integration is still being tuned; the app works with it, but output may be unreliable.

PaddleOCR-VL 1.6 (by PaddlePaddle, ONNX port by iaa2005) — a vision-language OCR model (NaViT + ERNIE-4.5 decoder) that reads whole text regions at once, in many languages (zh / en / ru / more).

• Region-based: adjacent text boxes are recognized together in one pass with context — better on multi-line bubbles.
• Multi-language, strongest on zh/en; Japanese manga typesetting is handled better by manga-ocr or Baberu.
• Slow: roughly 10–25 s per page on CPU — a fallback model, not a daily driver.
• ~1.2 GB download.
• Source: huggingface.co/iaa2005/PaddleOCR-VL-1.6-ONNX`,
    id: `Sedang disesuaikan — integrasinya masih dituning; aplikasi tetap bisa memakainya, tapi hasilnya mungkin belum akurat.

PaddleOCR-VL 1.6 (oleh PaddlePaddle, port ONNX oleh iaa2005) — model OCR vision-language (NaViT + decoder ERNIE-4.5) yang membaca seluruh region teks sekaligus, multibahasa (zh / en / ru / lainnya).

• Berbasis region: kotak teks yang berdekatan dikenali sekaligus dalam satu proses dengan konteks — lebih baik pada gelembung multi-baris.
• Multibahasa, terkuat di zh/en; tata letak manga Jepang lebih baik ditangani manga-ocr atau Baberu.
• Lambat: sekitar 10–25 detik per halaman di CPU — model cadangan, bukan untuk pemakaian harian.
• Unduhan ±1.2 GB.
• Sumber: huggingface.co/iaa2005/PaddleOCR-VL-1.6-ONNX`,
  },
};
export const OCR_GPU: ModelDescMap = {
  // Multi-session graphs: no single PREFER value — badge is a composite.
  manga_ocr: {
    en: `Supported via CUDA / DirectML (decoder runs on CPU).`,
    id: `Didukung via CUDA / DirectML (decoder berjalan di CPU).`,
  },
  baberu: {
    en: `Supported via CUDA / DirectML (decoder runs on CPU).`,
    id: `Didukung via CUDA / DirectML (decoder berjalan di CPU).`,
  },
  paddleocr_vl: {
    en: `CUDA only — DirectML unsupported.`,
    id: `Hanya CUDA — DirectML tidak didukung.`,
  },
};
