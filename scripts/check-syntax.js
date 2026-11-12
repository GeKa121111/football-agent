import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { relative, resolve } from "node:path";

const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "playwright-report",
  "test-results"
]);
const checkedExtensions = new Set([".js", ".mjs", ".cjs"]);

async function collectJavaScriptFiles(directory, files = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        await collectJavaScriptFiles(resolve(directory, entry.name), files);
      }
      continue;
    }
    if (!entry.isFile()) continue;
    const extension = entry.name.slice(entry.name.lastIndexOf("."));
    if (checkedExtensions.has(extension)) files.push(resolve(directory, entry.name));
  }
  return files;
}

const files = (await collectJavaScriptFiles(process.cwd()))
  .sort((a, b) => a.localeCompare(b));
const failures = [];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8"
  });
  if (result.error || result.status !== 0) {
    failures.push({
      file: relative(process.cwd(), file),
      output: [result.error?.message, result.stderr, result.stdout].filter(Boolean).join("\n")
    });
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write("\n[SYNTAX ERROR] " + failure.file + "\n" + failure.output + "\n");
  }
  process.stderr.write("\nJavaScript syntax check failed for " + failures.length + " of " + files.length + " files.\n");
  process.exitCode = 1;
} else {
  process.stdout.write("JavaScript syntax check passed for " + files.length + " files.\n");
}
