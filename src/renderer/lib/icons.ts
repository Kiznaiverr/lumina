/* ── Lucide icon rendering (tree-shaken) ──
 * Importing `icons` from "lucide" bundles the ENTIRE icon registry
 * (~1600 icons, ~700KB). Instead we import only the icons this app
 * actually uses (by their PascalCase exports) and register them under
 * their `data-lucide` kebab names.
 *
 * GOTCHA: any new `<i data-lucide="...">` must be added to `icons` here
 * or it will silently not render (createIcons skips unknown names).
 */
import { createIcons as _createIcons } from "lucide";
import type { CreateIconsOptions } from "lucide";
import {
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleX,
  Copy,
  Eraser,
  Eye,
  EyeOff,
  FolderOpen,
  Globe,
  Grip,
  Image,
  Keyboard,
  Languages,
  Lasso,
  Layers,
  Loader2,
  Maximize,
  Minus,
  MousePointer2,
  Package,
  Plus,
  Redo2,
  RotateCcw,
  Scan,
  ScanText,
  Settings,
  SlidersHorizontal,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide";

const icons = {
  "alert-triangle": AlertTriangle,
  "align-center": AlignCenter,
  "align-left": AlignLeft,
  "align-right": AlignRight,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-up": ChevronUp,
  "circle-check": CircleCheck,
  "circle-x": CircleX,
  copy: Copy,
  eraser: Eraser,
  eye: Eye,
  "eye-off": EyeOff,
  "folder-open": FolderOpen,
  globe: Globe,
  grip: Grip,
  image: Image,
  keyboard: Keyboard,
  languages: Languages,
  lasso: Lasso,
  layers: Layers,
  "loader-2": Loader2,
  maximize: Maximize,
  minus: Minus,
  "mouse-pointer-2": MousePointer2,
  package: Package,
  plus: Plus,
  "redo-2": Redo2,
  "rotate-ccw": RotateCcw,
  scan: Scan,
  "scan-text": ScanText,
  settings: Settings,
  "sliders-horizontal": SlidersHorizontal,
  square: Square,
  "trash-2": Trash2,
  type: Type,
  "undo-2": Undo2,
  x: X,
};

export function createIcons(
  options: Omit<CreateIconsOptions, "icons"> = {},
): void {
  _createIcons({ ...options, icons });
}
