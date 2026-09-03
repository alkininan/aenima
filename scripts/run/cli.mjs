import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * True when this module is the file node was asked to run, rather than one a test imported.
 *
 * Every script here exports a pure function and also runs as a command. Without this the
 * import in a test executes the CLI, which reads stdin and blocks forever — the defect
 * T0.7's gate hook shipped with and its cold review found.
 */
export function isMain(importMetaUrl) {
  const entry = process.argv[1];
  return Boolean(entry) && resolve(entry) === fileURLToPath(importMetaUrl);
}

/** The whole of stdin as a string. */
export async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

/** Print a value as the JSON a skill step reads back. */
export function emit(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
