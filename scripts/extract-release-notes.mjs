/**
 * Extracts the "## [<version>]" section body from CHANGELOG.md.
 *
 * Usage: node scripts/extract-release-notes.mjs <version> [output-file]
 *   - Prints the section body (trimmed) to stdout when no output file given.
 *   - Writes it to output-file when provided.
 *   - Exits 1 when the section is missing or empty, so the caller can fall
 *     back to generated release notes.
 *
 * Notes are taken from the versioned section the user wrote manually — never
 * from "[Unreleased]", which may accumulate notes for more than one release.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const version = process.argv[2];
const outFile = process.argv[3];

if (!version) {
  console.error(
    "usage: node scripts/extract-release-notes.mjs <version> [output-file]",
  );
  process.exit(1);
}

const changelog = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");
const lines = changelog.split("\n");

// Find the header starting with "## [<version>]" (may continue with " - date").
const header = `## [${version}]`;
let start = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith(header)) {
    start = i;
    break;
  }
}

// Section body ends at the next "## [" header (Unreleased or a newer version).
let body = "";
if (start !== -1) {
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## [")) {
      end = i;
      break;
    }
  }
  body = lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
}

if (!body) {
  console.error(`CHANGELOG.md: section "${header}" not found or empty`);
  process.exit(1);
}

if (outFile) {
  fs.writeFileSync(outFile, body + "\n");
} else {
  process.stdout.write(body + "\n");
}
