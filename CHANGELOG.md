# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - planned 06-09-2026

### Added

- **electron-updater**: self-update on launch with delta downloads and NSIS install flow.
- **Re-OCR submenu**: re-OCR a single text box with any installed OCR model via right-click; the re-run is its own undo step.
- **Bubble-aware auto-fit**: dialogue inside a detected bubble fits the bubble interior instead of the glyph-tight box; bubbles with multiple text detections keep the tight box. OCR/inpaint unchanged. RF-DETR class semantics documented in `CLASS_NAMES`.

### Changed

- Layer editor switches original/translated text via tabs instead of stacked fields.
- PP-OCRv6 model description updated: graduated from "in development", documents long / multi-line horizontal text strengths, cross-references Baberu OCR for very long bubbles, and warns rotated / skewed text is rarely recognized accurately.
- Removed the 16 px box expansion before OCR — it distorted crop aspect ratios and re-triggered the orientation misdetection bug in PP-OCRv6.
- UI redesign: landing page now shows recent projects and images.

### Fixed

- OCR and translation results are normalized on entry, so embedded line breaks no longer break the layer list and text auto-fit.
- PP-OCRv6 hallucinating unreadable output on tall multi-line horizontal bubbles (misdetected as vertical and rotated 90° via the `h > w` heuristic); line splitting is now orientation-aware.

## [0.1.0-experimental-preview] - 02-09-2026

Initial release — the first public preview of Lumina, a desktop app that automates manga/manhwa/manhua translation. Text detection, OCR, translation, inpainting, and typesetting run through a local ONNX Runtime backend (translation is the only step that calls external AI APIs), and every step stays editable.
