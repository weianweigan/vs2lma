// Bundles the compiled proxy server into a standalone Node.js SEA executable.
// Run: node scripts/build-sea.js
const { buildSync } = require("esbuild");
const { execSync } = require("child_process");
const { existsSync, copyFileSync, mkdirSync, rmSync, writeFileSync } = require("fs");
const { join } = require("path");

const root = join(__dirname, "..");
const entry = join(root, "dist", "index.js");
const bundleDir = join(root, "dist-bundle");
const outCjs = join(bundleDir, "proxy.cjs");

if (!existsSync(entry)) {
  console.error("dist/index.js not found. Run 'npm run build' first.");
  process.exit(1);
}

console.log("[1/4] Bundling with esbuild (CJS)...");
rmSync(bundleDir, { recursive: true, force: true });
mkdirSync(bundleDir, { recursive: true });

const result = buildSync({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: outCjs,
  format: "cjs",
  external: [],
});
if (result.errors.length > 0) {
  console.error(result.errors);
  process.exit(1);
}
console.log(`  Bundled: ${outCjs}`);

console.log("[2/4] Creating SEA config...");
const seaConfig = {
  main: outCjs,
  output: join(bundleDir, "sea-prep.blob"),
  disableExperimentalSEAWarning: true,
  useCodeCache: true,
};
writeFileSync(
  join(bundleDir, "sea-config.json"),
  JSON.stringify(seaConfig, null, 2)
);

execSync(
  `node --experimental-sea-config "${join(bundleDir, "sea-config.json")}"`,
  { stdio: "inherit", cwd: root }
);

console.log("[3/4] Copying node.exe...");
const nodeExe = process.execPath;
const targetExe = join(root, "dist", "proxy-server.exe");
copyFileSync(nodeExe, targetExe);
console.log(`  ${nodeExe} -> ${targetExe}`);

console.log("[4/4] Injecting SEA blob...");
execSync(
  `npx postject "${targetExe}" NODE_SEA_BLOB "${join(bundleDir, "sea-prep.blob")}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`,
  { stdio: "inherit", cwd: root }
);

rmSync(bundleDir, { recursive: true, force: true });
console.log("\nDone: dist/proxy-server.exe");

// Copy to Tauri resource directory for bundling
mkdirSync(join(root, "src-tauri", "binary"), { recursive: true });
copyFileSync(
  join(root, "dist", "proxy-server.exe"),
  join(root, "src-tauri", "binary", "proxy-server.exe")
);
console.log("Copied to src-tauri/binary/proxy-server.exe");
