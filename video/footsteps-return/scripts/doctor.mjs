import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const requiredAssets = [
  "app/assets/fonts/noto-serif-sc-400.woff2",
  "app/assets/fonts/noto-serif-sc-600.woff2",
  "app/assets/fonts/noto-serif-sc-700.woff2",
  "app/assets/topologies/plane.svg",
  "app/assets/topologies/cylinder.svg",
  "app/assets/topologies/mobius.svg",
  "app/assets/topologies/torus.svg",
  "app/assets/topologies/sphere.svg",
  "app/assets/topologies/klein.svg",
  "app/assets/topologies/projective.svg"
];

function isCallable(command, args = ["--version"]) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return result.status === 0;
}

function fromWingetPackage(packagePrefix, relativeExecutable) {
  if (process.platform !== "win32" || !process.env.LOCALAPPDATA) {
    return undefined;
  }
  const packagesDirectory = path.join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Packages");
  try {
    const packageDirectory = readdirSync(packagesDirectory).find((entry) => entry.startsWith(packagePrefix));
    if (!packageDirectory) {
      return undefined;
    }
    const packageRoot = path.join(packagesDirectory, packageDirectory);
    const extractedDirectory = readdirSync(packageRoot).find((entry) => entry.startsWith("ffmpeg-"));
    if (!extractedDirectory) {
      return undefined;
    }
    const executable = path.join(packageRoot, extractedDirectory, relativeExecutable);
    return existsSync(executable) ? executable : undefined;
  } catch {
    return undefined;
  }
}

function findCallable(candidates, args = ["--version"]) {
  return candidates.find((command) => command && isCallable(command, args));
}

function findFfmpeg() {
  return findCallable([
    "ffmpeg",
    fromWingetPackage("Gyan.FFmpeg_", path.join("bin", "ffmpeg.exe"))
  ], ["-version"]);
}

function findEspeak() {
  return findCallable([
    "espeak-ng",
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "eSpeak NG", "espeak-ng.exe")
  ]);
}

function findMuseScore() {
  return findCallable([
    "MuseScore4.exe",
    "MuseScore4",
    "mscore4",
    "mscore",
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "MuseScore 4", "bin", "MuseScore4.exe")
  ]);
}

function reportMissing(message, remediation) {
  console.error(`✗ ${message}\n  ${remediation}`);
}

function runMuseScore() {
  const command = findMuseScore();
  if (!command) {
    reportMissing("MuseScore 4 is not callable.", "Install it with: winget install Musescore.Musescore");
    process.exitCode = 1;
    return;
  }
  const result = spawnSync(command, process.argv.slice(3), { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
}

if (process.argv[2] === "--musescore") {
  runMuseScore();
} else {
  let failed = false;

  if (Number.parseInt(process.versions.node, 10) < 22) {
    reportMissing(`Node.js ${process.versions.node} is unsupported; Node.js 22 or newer is required.`, "Install Node.js 22+ and reopen the terminal.");
    failed = true;
  }
  if (!findFfmpeg()) {
    reportMissing("FFmpeg is not callable.", "Install it with: winget install Gyan.FFmpeg");
    failed = true;
  }
  if (!findEspeak()) {
    reportMissing("eSpeak NG is not callable.", "Install it with: winget install eSpeak-NG.eSpeak-NG");
    failed = true;
  }
  if (!findMuseScore()) {
    reportMissing("MuseScore 4 is not callable.", "Install it with: winget install Musescore.Musescore");
    failed = true;
  }

  const missingAssets = requiredAssets.filter((asset) => !existsSync(path.join(repositoryRoot, asset)));
  if (missingAssets.length > 0) {
    reportMissing(`Required PV assets are missing: ${missingAssets.join(", ")}`, "Restore the tracked font and topology assets before producing the PV.");
    failed = true;
  }

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log("✓ PV toolchain is ready: Node.js, FFmpeg, eSpeak NG, MuseScore 4, fonts, and topology assets are available.");
  }
}
