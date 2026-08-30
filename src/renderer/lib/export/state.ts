/* ── Shared mutable state + constants for the export window. ── */

import type { Page } from "../../types";

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 8;
export const ZOOM_STEP = 1.25;
export const WINDOW_KEY = "lumina:exportWindow";

export interface ExportState {
  order: Page[];
  format: "png" | "jpg";
  quality: number;
  overlay: HTMLElement | null;
  list: HTMLElement | null;
  selIdx: number;
  dragIdx: number | null;
  previewHost: HTMLElement | null;
  previewCanvas: HTMLCanvasElement | null;
  previewCtx: CanvasRenderingContext2D | null;
  previewImg: HTMLCanvasElement | null;
  previewVersion: number;
  ro: ResizeObserver | null;
  zoom: number;
  panX: number;
  panY: number;
}

export const st: ExportState = {
  order: [],
  format: "png",
  quality: 92,
  overlay: null,
  list: null,
  selIdx: 0,
  dragIdx: null,
  previewHost: null,
  previewCanvas: null,
  previewCtx: null,
  previewImg: null,
  previewVersion: 0,
  ro: null,
  zoom: 1,
  panX: 0,
  panY: 0,
};
