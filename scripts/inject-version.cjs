// Injects version from tag into all source files
// Usage: node scripts/inject-version.cjs <tag>
// Example: node scripts/inject-version.cjs v0.1.2
const fs = require("fs");
const path = require("path");

const tag = process.argv[2];
if (!tag) {
  console.error("Usage: node scripts/inject-version.cjs <tag>");
  process.exit(1);
}

const version = tag.replace(/^v/, "");
if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`Invalid version: ${version}`);
  process.exit(1);
}

const root = path.resolve(__dirname, "..");

const replacements = [
  { file: "package.json",             from: /"version"\s*:\s*"[^"]*"/g, to: `"version": "${version}"` },
  { file: "src-tauri/tauri.conf.json", from: /"version"\s*:\s*"[^"]*"/g, to: `"version": "${version}"` },
  { file: "src-tauri/Cargo.toml",      from: /version\s*=\s*"[^"]*"/g,  to: `version = "${version}"` },
  { file: "app/index.html",            from: /v\d+\.\d+\.\d+/g,         to: `v${version}` },
];

for (const r of replacements) {
  const filePath = path.join(root, r.file);
  const content = fs.readFileSync(filePath, "utf-8");
  const updated = content.replace(r.from, r.to);
  fs.writeFileSync(filePath, updated);
  console.log(`✓ ${r.file}: "${version}"`);
}

console.log("Done: version=" + version + " tag=" + tag);
