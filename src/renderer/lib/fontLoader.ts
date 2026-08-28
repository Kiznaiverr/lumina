/* ── Lumina Font Loader ──
 * System fonts come from the main process as { family, path } pairs.
 * Chromium doesn't know them by name, so each font file is registered as a
 * FontFace with a sanitized internal family name. The renderer then uses
 * that internal name everywhere (Konva.Text, textarea styles).
 */
import { state } from "./state";

/** Internal family name used in CSS/Konva for a given system font */
export function internalFontName(family: string): string {
  return "lumina-" + family.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Register all system fonts as FontFaces so they render on canvas.
 * Style variants (Bold/Italic files) share the same internal family name —
 * each file is registered with its own weight/style so the browser picks
 * the right face for typography.fontWeight/fontStyle. */
export async function loadSystemFonts(): Promise<void> {
  if (!window.lumina.getFonts) return;
  let fonts: Array<{
    family: string;
    path: string;
    weight: number;
    italic: boolean;
  }> = [];
  try {
    fonts = (await window.lumina.getFonts()) || [];
  } catch {
    return;
  }
  state.fontList = fonts;

  const jobs = fonts.map(async function (f) {
    const name = internalFontName(f.family);
    try {
      // Windows paths need the canonical file:///C:/... form — a two-slash
      // "file://C:\..." URL parses with an empty host and fails to load.
      // Spaces in filenames (e.g. "CC Wild Words Roman.ttf") must be
      // percent-encoded — unquoted url() with spaces is invalid CSS and
      // FontFace.load() fails silently.
      const url =
        "file:///" +
        encodeURI(f.path.split(/[\\/]/).join("/")).replace(/#/g, "%23");
      const face = new FontFace(name, "url(" + url + ")", {
        weight: String(f.weight),
        style: f.italic ? "italic" : "normal",
      });
      await face.load();
      document.fonts.add(face);
    } catch {
      /* unreadable/unsupported font file — skip */
    }
  });
  await Promise.all(jobs);
}
