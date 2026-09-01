/* ── Model descriptions: Inpainting ──
 * Bilingual copy shown in Settings → Models. Keyed by backend registry id.
 * Edit freely — the renderer rebuilds, no backend restart needed.
 */
import type { ModelDescMap } from "./index";

export const INPAINT_DESCS: ModelDescMap = {
  lama: {
    en: `Big-LaMa general-purpose inpainting (OpenCV build, Jan 2025 ONNX).

• Trained on natural/real imagery — solid all-round quality for removing text on any artwork.
• On manga screentones and line art, the LaMa Manga fine-tune below usually reconstructs cleaner.
• Good fallback when you want a smaller, faster download.
• Source: huggingface.co/opencv/inpainting_lama`,
    id: `Big-LaMa inpainting serba-guna (build OpenCV, ONNX Jan 2025).

• Dilatih pada citra natural/nyata — kualitas andal untuk menghapus teks di gambar apa pun.
• Pada screentone dan line-art manga, fine-tune LaMa Manga di bawah biasanya merekonstruksi lebih bersih.
• Pilihan cadangan yang baik saat ingin file lebih kecil dan download lebih cepat.
• Sumber: huggingface.co/opencv/inpainting_lama`,
  },
  lama_manga: {
    en: `Big-LaMa fine-tuned on ~300K manga & anime images (Sanster AnimeMangaInpainting checkpoint, ONNX conversion by koharu).

• Best-in-class for manga pages: reconstructs screentones, line art, and textures around removed text so patches blend into the artwork.
• The recommended default for inpainting.
• Larger file — the first download takes a bit longer.
• Source: huggingface.co/mayocream/lama-manga-onnx`,
    id: `Big-LaMa yang di-fine-tune pada ~300 ribu gambar manga & anime (checkpoint Sanster AnimeMangaInpainting, konversi ONNX oleh koharu).

• Terbaik untuk halaman manga: merekonstruksi screentone, line-art, dan tekstur di sekitar teks yang dihapus sehingga patch menyatu dengan gambar.
• Default yang direkomendasikan untuk inpainting.
• File lebih besar — unduhan pertama agak lebih lama.
• Sumber: huggingface.co/mayocream/lama-manga-onnx`,
  },
};

export const INPAINT_GPU: ModelDescMap = {
  lama: {
    en: `CPU only — GPU acceleration is ignored, the model stays on CPU.`,
    id: `Hanya CPU — akselerasi GPU diabaikan, model tetap berjalan di CPU.`,
  },
  lama_manga: {
    en: `Supported via CUDA only — DirectML unsupported.`,
    id: `Didukung hanya via CUDA — DirectML tidak didukung.`,
  },
};
