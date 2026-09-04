# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

# Changelog

## [Unreleased] - planned 2026-06-09

### Added

- **Auto-update**: starting with this version, the app can update itself automatically when you launch it. Previously, every new version meant downloading and running the installer again by hand — from now on, that's no longer necessary.
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
