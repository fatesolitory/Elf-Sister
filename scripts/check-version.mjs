import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const expected = "26.06.24.1.8";
const expectedPackageVersion = "26.6.24-1.8";

const checks = [
  ["VERSION.txt", fs.readFileSync(path.join(root, "VERSION.txt"), "utf8").trim()]
];

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const packageChecks = [
  ["package.json", packageJson.version],
  ["package-lock.json", packageLock.version],
  ["package-lock.json packages root", packageLock.packages?.[""]?.version ?? ""]
];

const appSource = fs.readFileSync(path.join(root, "src", "renderer", "App.tsx"), "utf8");
checks.push(["src/renderer/App.tsx APP_VERSION", appSource.match(/const APP_VERSION = "([^"]+)"/)?.[1] ?? ""]);

const packageScript = fs.readFileSync(path.join(root, "scripts", "package-win.ps1"), "utf8");
checks.push(["scripts/package-win.ps1 $version", packageScript.match(/\$version = "([^"]+)"/)?.[1] ?? ""]);

const mismatches = checks.filter(([, value]) => value !== expected);
const packageMismatches = packageChecks.filter(([, value]) => value !== expectedPackageVersion);
if (mismatches.length > 0 || packageMismatches.length > 0) {
  for (const [file, value] of mismatches) {
    console.error(`${file}: expected ${expected}, got ${value || "(missing)"}`);
  }
  for (const [file, value] of packageMismatches) {
    console.error(`${file}: expected ${expectedPackageVersion}, got ${value || "(missing)"}`);
  }
  process.exit(1);
}

console.log(`Version check passed: ${expected} (package ${expectedPackageVersion})`);
