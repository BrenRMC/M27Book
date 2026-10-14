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
const outDir = path.join(projectRoot, "out");
const appDir = path.join(outDir, "Madden27-Sportsbook-win32-x64");
const iconPath = path.join(projectRoot, "assets", "madden27-sportsbook-setup.ico");
const outputDir = path.join(outDir, "installer");
const sourceSetup = path.join(__dirname, "setup.iss");
const generatedSetup = path.join(__dirname, "setup.generated.iss");

for (const [label, target] of [["Packaged Electron app", appDir], ["Installer icon", iconPath]]) {
  if (!fs.existsSync(target)) {
    console.error(`${label} not found: ${target}`);
    console.error("Run the Electron package step first and verify the project assets are present.");
    process.exit(1);
  }
}
fs.mkdirSync(outputDir, { recursive: true });

// Inno Setup resolves relative OutputDir paths against its working directory, which
// caused the old script to compile files and then fail at final output. Generate a
// temporary script with absolute paths so spaces in Windows paths are handled safely.
const win = value => path.resolve(value);
let iss = fs.readFileSync(sourceSetup, "utf8");
iss = iss.replace(/^#define MyAppVersion .*$/m, '#define MyAppVersion "1.8.06"');
iss = iss.replace(/^OutputDir=.*$/m, `OutputDir=${win(outputDir)}`);
iss = iss.replace(/^OutputBaseFilename=.*$/m, "OutputBaseFilename=Madden27-Sportsbook-1.8.06-Setup");
iss = iss.replace(/^SetupIconFile=.*$/m, `SetupIconFile="${win(iconPath)}"`);
iss = iss.replace(/^Source: "\.\.\\\.\.\\out\\Madden27-Sportsbook-win32-x64\\\*"/m,
  `Source: "${win(appDir)}\\*"`);
fs.writeFileSync(generatedSetup, iss, "utf8");

try {
  execFileSync(iscc, [generatedSetup], { cwd: projectRoot, stdio: "inherit" });
  console.log(`Installer created in: ${outputDir}`);
} finally {
  try { fs.unlinkSync(generatedSetup); } catch {}
}
