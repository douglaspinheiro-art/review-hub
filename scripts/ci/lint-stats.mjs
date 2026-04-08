import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["eslint", ".", "-f", "json"], {
  encoding: "utf8",
  shell: true,
  maxBuffer: 50 * 1024 * 1024,
});

let data = [];
try {
  data = JSON.parse(result.stdout || "[]");
} catch {
  console.error("Failed to parse eslint JSON output.");
  console.error(result.stderr || result.stdout?.slice(0, 2000));
  process.exit(1);
}

let errors = 0;
let warnings = 0;
const byRule = new Map();

for (const file of data) {
  for (const m of file.messages || []) {
    if (m.severity === 2) {
      errors += 1;
      const rule = m.ruleId || "unknown";
      byRule.set(rule, (byRule.get(rule) || 0) + 1);
    }
    if (m.severity === 1) warnings += 1;
  }
}

const topRules = [...byRule.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([rule, count]) => ({ rule, count }));

const out = {
  errors,
  warnings,
  eslintExitCode: result.status ?? 0,
  topErrorRules: topRules,
};

console.log(JSON.stringify(out, null, 2));
process.exit(0);
