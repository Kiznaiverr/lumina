# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 05-09-2026

> ⚠️ **0.2.0 withdrawn** — the 0.2.0 installers were pulled due to installer bugs (oversized `app.asar` and a console window popping up during CUDA extraction). The 0.2.0 changelog entry remains for reference at [CHANGELOG.md#020---05-09-2026](https://github.com/lumina-tl/lumina/blob/main/CHANGELOG.md#020---05-09-2026).

### Fixed

- **CUDA installer no longer pops a console window**: extracting the ~1.5 GB CUDA runtime used to open a separate terminal during setup. Extraction now runs inside the installer process itself, driving the native progress bar — no terminal.
- **Installers are dramatically smaller**: the app package (`app.asar`) was accidentally including the previous build's entire unpacked output (a second full Electron runtime, ~1.7 GB). It's now limited to the actual app code (~2 MB), shrinking both the DML and CUDA installers significantly.

## [0.2.0] - 05-09-2026

### Added

- **Differential updates**: starting with this version, updating is much smaller and faster — the app only downloads the changed parts of the new version instead of the whole installer again, and installs it automatically when you launch.
- **CUDA installer variant**: for NVIDIA GPU users, a separate `Lumina-Setup-CUDA` installer is available — **highly recommended** if you have an NVIDIA GPU, otherwise stick with the regular (DML) installer.
- **New tools**: brush, eraser, paint bucket (flood fill) and eyedropper for editing the new cleanup raster layer (show/hide, opacity, clear, delete) — with a Photoshop-like shortcut
- **Re-OCR a single text box**: if the text reading (OCR) for one bubble came out wrong, right-click it and pick a different OCR model just for that box — no need to redo the whole page. This can also be undone if the new result isn't better.
- **Text now fits the bubble shape**: translated text now follows the actual shape of the speech bubble instead of just a straight box, so it looks neater and sits better inside. If a bubble contains multiple separate text pieces, it keeps the old straight-box behavior to stay safe.
- **Tilted text detection (AngleNet)**: adds a very small, fast model that measures the slant of each text crop, so translated text is rotated to match the original typesetting. It's a global companion model auto-downloaded in the background on first launch.

### Changed

- The text editor (original vs. translated) now uses tabs instead of stacking both fields — saves space and is easier to read.
- Updated the description for the "PP-OCRv6" OCR model: it's now considered ready for regular use (no longer "in development"), works well for long or multi-line horizontal text, but for very long bubbles the "Baberu OCR" model is recommended instead. Tilted/rotated text is still often misread.
- Fixed how images are cropped before OCR — previously a small extra margin was added, which slightly distorted the image and sometimes caused the text direction to be misread (read sideways). This has been removed.
- Redesigned the home screen: it now shows your recent projects and images right away when you open the app.

### Fixed

- Text with line breaks in the middle no longer breaks the layer list or messes up automatic font sizing.
- Bubbles with long or multi-line horizontal text were sometimes wrongly detected as vertical text and rotated 90°, producing garbled/unreadable output. The app is now smarter at recognizing text direction before splitting lines.

## [0.1.0-experimental-preview] - 02-09-2026

Initial release — the first public preview of Lumina, a desktop app that automates manga/manhwa/manhua translation. Text detection, OCR, translation, inpainting, and typesetting run through a local ONNX Runtime backend (translation is the only step that calls external AI APIs), and every step stays editable.
