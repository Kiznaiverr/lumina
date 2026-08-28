import { fileURLToPath } from "url";
import path from "path";

/** Directory of the compiled main bundle (dist/main). */
export const MAIN_DIR = path.dirname(fileURLToPath(import.meta.url));
/** Repo root — dist/main is always two levels below the project root. */
export const PROJECT_ROOT = path.join(MAIN_DIR, "../..");
