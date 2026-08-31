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
• Always runs on CPU: LaMa's FFC blocks crash under the DirectML provider (microsoft/onnxruntime#24744), so inpainting never uses GPU acceleration. CUDA users still get GPU inpainting via LUMINA_EP=cuda.
• Source: huggingface.co/opencv/inpainting_lama`,
    id: `Big-LaMa inpainting serba-guna (build OpenCV, ONNX Jan 2025).

• Dilatih pada citra natural/nyata — kualitas andal untuk menghapus teks di gambar apa pun.
• Pada screentone dan line-art manga, fine-tune LaMa Manga di bawah biasanya merekonstruksi lebih bersih.
• Pilihan cadangan yang baik saat ingin file lebih kecil dan download lebih cepat.
• Selalu berjalan di CPU: blok FFC LaMa crash pada provider DirectML (microsoft/onnxruntime#24744), jadi inpaint tidak pernah memakai akselerasi GPU. Pengguna CUDA tetap mendapat inpaint GPU via LUMINA_EP=cuda.
• Sumber: huggingface.co/opencv/inpainting_lama`,
  },
  lama_manga: {
    en: `Big-LaMa fine-tuned on ~300K manga & anime images (Sanster AnimeMangaInpainting checkpoint, ONNX conversion by koharu).

• Best-in-class for manga pages: reconstructs screentones, line art, and textures around removed text so patches blend into the artwork.
• The recommended default for inpainting.
• Larger file — the first download takes a bit longer.
• Always runs on CPU: LaMa's FFC blocks crash under the DirectML provider (microsoft/onnxruntime#24744), so inpainting never uses GPU acceleration. CUDA users still get GPU inpainting via LUMINA_EP=cuda.
• Source: huggingface.co/mayocream/lama-manga-onnx`,
    id: `Big-LaMa yang di-fine-tune pada ~300 ribu gambar manga & anime (checkpoint Sanster AnimeMangaInpainting, konversi ONNX oleh koharu).

• Terbaik untuk halaman manga: merekonstruksi screentone, line-art, dan tekstur di sekitar teks yang dihapus sehingga patch menyatu dengan gambar.
• Default yang direkomendasikan untuk inpainting.
• File lebih besar — unduhan pertama agak lebih lama.
• Selalu berjalan di CPU: blok FFC LaMa crash pada provider DirectML (microsoft/onnxruntime#24744), jadi inpaint tidak pernah memakai akselerasi GPU. Pengguna CUDA tetap mendapat inpaint GPU via LUMINA_EP=cuda.
• Sumber: huggingface.co/mayocream/lama-manga-onnx`,
  },
};
