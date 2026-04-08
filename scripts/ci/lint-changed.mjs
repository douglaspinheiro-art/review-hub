import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} failed`);
  }
  return (result.stdout || "").trim();
}

function getChangedFiles() {
  const baseRef = process.env.GITHUB_BASE_REF;
  let diffArgs;
  if (baseRef) {
    try {
      run("git", ["fetch", "--depth=1", "origin", baseRef]);
    } catch {
      // Best effort fetch for CI shallow clones.
    }
    diffArgs = ["diff", "--name-only", "--diff-filter=ACMRT", `origin/${baseRef}...HEAD`];
  } else {
    diffArgs = ["diff", "--name-only", "--diff-filter=ACMRT", "HEAD~1...HEAD"];
  }

  const out = run("git", diffArgs);
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx)$/.test(f));
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
