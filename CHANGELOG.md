# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - planned 06-09-2026

### Added

- **`electron-updater`**: no more manual installer downloads — Lumina checks for new releases on launch and updates itself in place. Only the changed files are fetched (delta update via `blockmap`), not the full installer; installation runs through the `NSIS wizard` after a restart.

### Changed

- Layer editor now switches between the original and translated text via tabs instead of stacked fields.
- Model descriptions updated: PP-OCRv6 graduated from "in development" — its long / multi-line horizontal text strength is now documented, with cross-references to Baberu OCR for very long bubbles (and vice versa: Japanese manga typesetting is still best handled by manga-ocr / Baberu).
- Removed the 16 px box expansion before OCR — it distorted crop aspect ratios (which re-triggered the orientation misdetection bug in PP-OCRv6).

### Fixed

- OCR and translation results are normalized on entry, so embedded line breaks no longer break the layer list and text auto-fit.
- PP-OCRv6 hallucinating unreadable output: tall multi-line horizontal bubbles were misdetected as vertical and rotated 90° (heuristic `h > w`). Line splitting is now orientation-aware, so those crops stay upright.

## [0.1.0-experimental-preview] - 02-09-2026

Initial release — the first public preview of Lumina, a desktop app that automates manga/manhwa/manhua translation. Text detection, OCR, translation, inpainting, and typesetting run through a local ONNX Runtime backend (translation is the only step that calls external AI APIs), and every step stays editable.
