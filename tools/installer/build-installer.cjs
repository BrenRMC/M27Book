const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const candidates = [
  "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe",
  "C:\\Program Files\\Inno Setup 6\\ISCC.exe"
];
const iscc = candidates.find(fs.existsSync);
if (!iscc) {
  console.error("Inno Setup compiler (ISCC.exe) was not found. Install Inno Setup 6 first.");
  process.exit(1);
}
const projectRoot = path.resolve(__dirname, "../..");
const setup = path.join(__dirname, "setup.iss");
execFileSync(iscc, [setup], { cwd: projectRoot, stdio: "inherit" });
