# TASK.md — Lumina: Manga/Manhwa/Manhua Translation Automation Desktop App

> **Project name:** Lumina — *illuminating every panel*

> **Instructions for AI coding assistants (Copilot / Cursor / etc.):**
> This file is a specification, not a suggestion. Do not invent architecture, libraries, or
> file formats that are not listed here. If something is ambiguous, ask or leave a `// TODO:`
> comment instead of guessing. Do not assume library APIs — verify against actual installed
> package documentation before writing code that calls them. All UI strings must go through
> the i18n layer described below — never hardcode user-facing text directly in components.
>
> **Follow the phased order in Section 1.1. Do not skip ahead to a later phase before the
> current phase is confirmed working.**
>
> **Testing rule: the user runs and confirms all tests themselves.** The AI assistant must
> never run, simulate, or self-verify a test on its own initiative — not the app, not a
> script, not a manual "let me check if this works" step. When a phase or task reaches a
> point that needs verification, the assistant must **stop and explicitly ask the user to run
> the test**, describe what to check, and then **wait for the user's reported result** before
> continuing. Do not mark a phase as done based on the assistant's own assumption that the
> code "should work."

## 1.1 Implementation Order (phased — do not build out of order)

Each phase must be confirmed working (by the user, per the testing rule above) before moving
to the next. Do not build features from a later phase early, even if it seems convenient.

1. **Phase 0 — Scaffolding.** Electron+TS shell (empty window, folder structure per Section
   2). Python FastAPI skeleton with a single `/health` endpoint. Electron spawns the Python
   subprocess and successfully calls `/health`. Nothing else. Ask the user to confirm both
   processes start and talk to each other before proceeding.
2. **Phase 1 — Core pipeline endpoints, headless.** Implement `/detect`, `/ocr`, `/inpaint`
   against static test images, testable via curl/Postman — no UI involved yet. Confirm each
   endpoint returns output matching the schemas in Section 5 before moving on.
3. **Phase 2 — Basic page display (read-only).** Electron can import an image, run it through
   detect → ocr → inpaint → translate in sequence (Section 4.1), and display the result
   (cleaned background + translated text) statically — not editable yet. This validates the
   end-to-end data flow before editor complexity is added.
4. **Phase 3 — Canvas editor (Konva.js), editable.** Bubbles become selectable/editable
   objects; editing text triggers font auto-fit (Section 4.2). The `PageState`/`BubbleState`
   model (Section 5) becomes the source of truth from this point on.
5. **Phase 4 — Sidebar table + two-way sync.** Built only after Phase 3 is working, since the
   table is just an alternate view over the same state, not a separate data source.
6. **Phase 5 — Detection review mode + lasso override.** Adds the review-before-inpaint step
   (Section 4.1 step 2, Section 4.3) and reading-order recomputation (Section 4.4) on top of
   the working canvas.
7. **Phase 6 — Flagged/backgroundType handling.** Manual override UI for `flagged` bubbles
   (accept auto result / switch to textbox mode / manual re-mask). Built after core canvas +
   review flow is stable, since this is edge-case handling on top of the normal flow.
8. **Phase 7 — Project file (save/load) + autosave.** Only after the state model from Phases
   3–6 has stabilized, to avoid rework from schema churn.
9. **Phase 8 — Export.** Sequential rename + flattened final image output. Depends on
   everything above.
10. **Phase 9 — Cross-cutting/polish.** Undo/redo, progress queue, GPU auto-detect + first-run
    setup, packaging. Done last so these aren't rebuilt repeatedly while core state is still
    changing.

## 1. Project Summary

A desktop application that automates manga/manhwa/manhua translation through a semi-automatic
pipeline: text/bubble detection → OCR → machine translation → inpainting → editable text
rendering. The pipeline output is **never auto-published** — every page goes through a review
step where the user can correct detection, OCR, translation, and text-fit before final export.

Initial scope: **Japanese manga only**. Korean/Chinese OCR adapters are a planned future
expansion — do not build them yet, but do not hardcode assumptions that block adding them
later (see Section 4, OCR Adapter interface).

The app is planned for **open-source release**. Keep this in mind for packaging, dependency
licensing (do not add GPL-incompatible dependencies without flagging it), and avoiding
requirements that create high friction for average end users (e.g. no Docker requirement for
running the app).

## 2. Tech Stack (fixed — do not substitute without discussion)

| Layer | Choice | Notes |
|---|---|---|
| Desktop shell | Electron + TypeScript | Chosen over Tauri because the whole app logic stays in TS/Node, no Rust required |
| Canvas / bubble editor | Konva.js | Layer-based shape editing, fits per-bubble object model |
| ML backend | Python + FastAPI | Bundled into a standalone executable (PyInstaller or Nuitka), run as a child process from Electron via `child_process.spawn` — **not Docker** |
| ML runtime | PyTorch (CUDA build for GPU variant, CPU-only build for CPU variant) | PyTorch pip wheels bundle their own CUDA runtime — end users only need an NVIDIA driver, not a separate CUDA Toolkit install |
| Detection model | YOLOv8-based (`ultralytics`), following `comic-text-detector` approach | Runs on PyTorch |
| OCR model | `manga-ocr` (Japanese only for now) | Runs on PyTorch |
| Inpainting model | LaMa (`big-lama` checkpoint) | Runs on PyTorch |
| Translation | External API call (DeepL / Google Translate / LLM API), called directly from the Electron/Node side | Not part of the Python service |
| Project file format | Custom extension, ZIP container (like `.docx`/`.pptx`) | See Section 6 |
| Localization | i18n library (e.g. `i18next`) from day one, all UI strings externalized | English is the only shipped language for now, but structure must support adding more later |

**Explicitly rejected:** Docker for the ML backend (too much end-user friction for an
open-source desktop app, especially GPU passthrough via NVIDIA Container Toolkit on Windows).

## 3. Distribution / First-Run Setup

- The installer is a **thin installer**: it only ships the Electron app shell. It does **not**
  bundle PyTorch, model weights, or the Python runtime.
- On first launch, the app must:
  1. Detect NVIDIA GPU presence and driver version by parsing `nvidia-smi` output.
  2. Compare the driver version against the minimum required for the target CUDA build.
     If the driver is missing, too old, or the GPU architecture is unsupported by the target
     CUDA build, **fall back to the CPU-only variant automatically** — do not attempt to
     download/run a GPU package that will fail.
  3. Download the appropriate bundled Python runtime + model weights (GPU or CPU variant)
     with a visible progress indicator.
  4. Show a clear message to the user when falling back to CPU mode, explaining why
     (outdated driver / unsupported GPU), not just silently running slow.
- Provide a manual override in Settings to force GPU or CPU mode, in case auto-detection is
  wrong.
- Model weights are downloaded on first run, not bundled in the installer.

## 4. Pipeline Architecture

### 4.1 Order of operations (per page)

1. **Detection** — run YOLOv8-based detector on the raw page image. Produces bounding boxes
   with a rough type classification (`bubble_text` / `free_text` / `sfx`) and a
   `backgroundType` classification (`solid` / `flagged`) based on local pixel variance around
   the box.
2. **Detection review (manual step, before inpainting runs)** — user reviews the detected
   boxes in a dedicated review mode:
   - Can add missed regions using a **lasso (freeform selection) tool**, not just rectangles.
   - Can remove/merge incorrect detections.
   - On any change (add/remove/move a box), **reading order must be recomputed** for the whole
     page (see 4.4) — it is not a static ID, it reflects reading order.
   - User confirms/approves the final box set for the page before continuing.
3. **Inpaint + OCR (parallel, after approval)**:
   - Inpaint runs on all boxes classified `backgroundType: solid` automatically.
   - Boxes classified `flagged` still get an automatic inpaint attempt (so the user has a
     baseline to compare), but are visually marked in the editor and require the user to pick
     one of: accept auto result / switch to semi-transparent textbox render mode / manually
     redraw the mask and re-trigger inpaint on that region only.
   - OCR runs on a crop of each box from the **original** (non-inpainted) image.
4. **Translation suggestion** — auto-translate OCR output per bubble via the external API.
   This is a suggestion only, always editable.
5. **Review in editor** — canvas + sidebar table (see 4.5), user edits original/translated
   text, fixes flagged bubbles, adjusts font as needed.
6. **Approve page** → final render (flatten text layer over the cleaned/inpainted background).
7. **Export** (see Section 7).

### 4.2 Font auto-fit (required behavior, not optional)

When rendering translated text into a bubble:
1. Render at the project's default font size with word-wrap inside the bubble's usable text
   area (bbox inset by a padding percentage — do not use the raw bbox rectangle, bubbles are
   rarely perfect rectangles).
2. If the wrapped text height exceeds the available height, decrease font size by one step and
   re-measure. Repeat.
3. Line-height must scale down proportionally with font size, not stay fixed.
4. Stop at a defined **minimum font size floor**. If text still doesn't fit at the floor size,
   do not silently overflow or truncate — mark the bubble `needs_manual_fit` so it surfaces in
   review.

### 4.3 Detection override / lasso tool

- Available only in the review-before-inpaint step (Section 4.1, step 2).
- Freeform polygon selection, not restricted to axis-aligned rectangles.
- New boxes created this way go through the same `backgroundType` classification and pipeline
  treatment as auto-detected boxes — do not special-case them downstream.

### 4.4 Reading order computation

- Japanese manga reading order: right-to-left columns, top-to-bottom within a column.
- Implement as a single function that takes the current box set for a page and returns
  assigned `readingOrder` numbers. This function must be **re-run** any time the box set
  changes (add/remove/move via lasso override) — do not maintain reading order as a manually
  incremented counter.

### 4.5 Sidebar table (before/after translate)

- One row per bubble, columns: reading order number, original text (OCR result, editable),
  translated text (editable), status indicator.
- Two-way sync with the canvas: selecting a row highlights/scrolls to the bubble on canvas and
  vice versa.
- Editing `translatedText` in the table must trigger the same font auto-fit logic as editing
  it on canvas — they operate on the same underlying state object, not separate copies.
- No cross-page/cross-chapter batch replace feature — out of scope for now (per-row/per-table
  edits only). Do not build a chapter-wide find-and-replace tool.

## 5. State Model (shared shape between TS and Python — keep in sync)

```ts
interface PageState {
  pageId: string;
  order: number;               // used for sequential export renaming
  imagePath: string;           // original source image
  cleanedImagePath: string;    // cached inpainted background
  bubbles: BubbleState[];
}

interface BubbleState {
  id: string;
  readingOrder: number;                        // recomputed, not manually set
  bbox: { x: number; y: number; w: number; h: number } | Point[]; // rect or lasso polygon
  source: "auto" | "manual";
  type: "bubble_text" | "free_text" | "sfx";
  backgroundType: "solid" | "flagged";
  originalText: string;        // editable (OCR correction)
  translatedText: string;      // editable
  fontSize: number;            // auto-fit result, user-overridable
  status: "auto" | "reviewed" | "flagged" | "needs_manual_fit";
  ocrConfidence?: number;
}
```

## 6. Project File Format

- Custom file extension: **`.lumina`**.
- Container is a **ZIP archive** (same pattern as `.docx`/`.pptx`), containing:
  ```
  manifest.json           # formatVersion, page order, project-level settings
  pages/page_XXX.json     # PageState + BubbleState[] for each page
  originals/               # copies/references to source images
  cache/                   # cached inpainted images (avoid re-running inpaint on load)
  ```
- `manifest.json` must include a `formatVersion` field from the start, to support future
  migrations without breaking old project files.
- Autosave: persist project state periodically, not only on manual save, to protect against
  crashes during long review sessions.

## 7. Export

- Output is **images only** (no PDF, no upload integration in this scope).
- Pages are renamed sequentially based on the project's page `order`, not on original
  filenames (e.g. `abcd.png` → `001.png`), with zero-padding based on total page count.
- Default output format PNG; allow a quality/format setting (e.g. JPEG) as a non-default
  option.

## 8. Cross-cutting Requirements

- **Undo/redo**: required in the editor, especially around actions that trigger expensive
  re-computation (re-inpaint, re-translate).
- **Autosave / crash recovery**: required (see Section 6).
- **Progress queue for batch processing**: when importing/processing multiple pages, show
  per-page status (queued / processing / ready for review) so the user can start reviewing
  completed pages without waiting for the whole batch.
- **Localization-ready**: all user-facing strings go through the i18n layer. English is the
  only shipped locale right now — do not hardcode strings directly in components.
- **Not in scope for now** (explicitly deferred, do not build): glossary/terminology
  consistency tooling across chapters, open-source license auditing of bundled models,
  Korean/Chinese OCR adapters, chapter-wide batch text replace.

## 9. Coding Conventions

- Comments: keep minimal. Only comment on **important/non-obvious functions** (e.g. reading
  order computation, font auto-fit loop, GPU/driver compatibility check, project file
  serialization). Do not add comments restating what obvious code does.
- All UI-facing text in English, routed through the i18n layer — never hardcoded inline.
- Keep the Python service and TS state model in sync manually — there is no shared codegen
  step defined yet; if you change one, update the corresponding shape in the other.