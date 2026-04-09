import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} failed`);
  }
  return (result.stdout || "").trim();
}

function runSafe(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    ok: result.status === 0 && !result.error,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function listTsFilesFromOutput(out) {
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx)$/.test(f));
}

function listChangedFromHead() {
  // Works even when checkout is shallow and HEAD~1 is unavailable.
  const headOnly = runSafe("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]);
  if (!headOnly.ok) return [];
  return listTsFilesFromOutput(headOnly.stdout);
}

function getChangedFiles() {
  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef) {
    try {
      run("git", ["fetch", "--depth=50", "origin", baseRef]);
    } catch {
      // Best effort fetch for CI shallow clones.
    }
    const prDiff = runSafe("git", ["diff", "--name-only", "--diff-filter=ACMRT", `origin/${baseRef}...HEAD`]);
    if (prDiff.ok) return listTsFilesFromOutput(prDiff.stdout);
    return listChangedFromHead();
  }

  const hasPrevious = runSafe("git", ["rev-parse", "--verify", "HEAD~1"]);
  if (hasPrevious.ok) {
    const pushDiff = runSafe("git", ["diff", "--name-only", "--diff-filter=ACMRT", "HEAD~1...HEAD"]);
    if (pushDiff.ok) return listTsFilesFromOutput(pushDiff.stdout);
  }

  return listChangedFromHead();
}

try {
  const files = getChangedFiles();
  if (files.length === 0) {
    console.log("No changed TypeScript files. Skipping lint.");
    process.exit(0);
  }
  console.log(`Linting changed files (${files.length})...`);
  const eslint = spawnSync("npx", ["eslint", ...files], { stdio: "inherit", encoding: "utf8" });
  process.exit(eslint.status ?? 1);
} catch (err) {
  console.error("Changed-files lint failed.");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
