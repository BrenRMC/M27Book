const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

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
const sourceSetup = path.join(__dirname, "setup.iss");
const tempRoot = path.join(os.tmpdir(), "M27BookInstaller");
const stagedAppDir = path.join(tempRoot, "app");
const outputDir = path.join(tempRoot, "output");
const generatedSetup = path.join(tempRoot, "setup.generated.iss");

for (const [label, target] of [["Packaged Electron app", appDir], ["Installer icon", iconPath], ["Installer script", sourceSetup]]) {
  if (!fs.existsSync(target)) {
    console.error(`${label} not found: ${target}`);
    console.error("Run the Electron package step first and verify the project assets are present.");
    process.exit(1);
  }
}

fs.rmSync(tempRoot, { recursive: true, force: true });
fs.mkdirSync(tempRoot, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

// Stage the packaged app under a short temp path. Deep node_modules paths can exceed
// Windows/Inno Setup path limits when the project lives under a long Downloads path.
fs.cpSync(appDir, stagedAppDir, { recursive: true });

const win = value => path.resolve(value);
let iss = fs.readFileSync(sourceSetup, "utf8");
iss = iss.replace(/^#define MyAppVersion .*$/m, '#define MyAppVersion "1.1.0"');
iss = iss.replace(/^OutputDir=.*$/m, `OutputDir=${win(outputDir)}`);
iss = iss.replace(/^OutputBaseFilename=.*$/m, "OutputBaseFilename=Madden27-Sportsbook-1.1.0-Setup");
iss = iss.replace(/^SetupIconFile=.*$/m, `SetupIconFile="${win(iconPath)}"`);
const sourceLinePattern = /^Source: "\.\.\\\.\.\\out\\Madden27-Sportsbook-win32-x64\\\*"/m;
if (!sourceLinePattern.test(iss)) {
  console.error("Could not find the expected [Files] Source directive in setup.iss; refusing to compile with an unpatched source path.");
  process.exit(1);
}
iss = iss.replace(sourceLinePattern, `Source: "${win(stagedAppDir)}\\*"`);
fs.writeFileSync(generatedSetup, iss, "utf8");

try {
  execFileSync(iscc, [generatedSetup], { cwd: tempRoot, stdio: "inherit" });
  console.log(`Installer created in: ${outputDir}`);
} catch (error) {
  console.error("Installer compilation failed. Generated script preserved at:", generatedSetup);
  throw error;
}
