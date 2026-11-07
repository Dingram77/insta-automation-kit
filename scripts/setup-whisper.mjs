#!/usr/bin/env node
// Install local Whisper (faster-whisper) into .venv-whisper and download a model.
//
// Usage: node scripts/setup-whisper.mjs [--model small.en]
// Needs Python 3.9+. Safe to re-run; it skips work already done.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { argv, exit } from "node:process";
import { DEFAULT_MODEL, VENV_DIR, WORKER, venvPython, whisperEnv } from "./whisper-env.mjs";

const FASTER_WHISPER = "faster-whisper==1.2.1";
const mi = argv.indexOf("--model");
const model = mi > -1 ? argv[mi + 1] : DEFAULT_MODEL;

function run(cmd, args, label) {
  console.log(`> ${label}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", env: whisperEnv(), windowsHide: true });
  if (r.error || r.status !== 0) {
    console.error(`${label} failed${r.error ? `: ${r.error.message}` : ""}`);
    exit(r.status || 1);
  }
}

function findSystemPython() {
  const candidates = process.platform === "win32"
    ? [["py", ["-3"]], ["python", []], ["python3", []]]
    : [["python3", []], ["python", []]];
  for (const [cmd, pre] of candidates) {
    const r = spawnSync(cmd, [...pre, "-c", "import sys; print(sys.version_info >= (3, 9))"], { encoding: "utf8", windowsHide: true });
    if (!r.error && r.status === 0 && r.stdout.trim() === "True") return [cmd, pre];
  }
  return null;
}

const py = venvPython();
if (!existsSync(py)) {
  const sys = findSystemPython();
  if (!sys) {
    console.error("Python 3.9+ not found. Install it from https://www.python.org/downloads/ and re-run.");
    exit(1);
  }
  run(sys[0], [...sys[1], "-m", "venv", VENV_DIR], "create .venv-whisper");
}

const has = spawnSync(py, ["-c", "import faster_whisper"], { windowsHide: true });
if (has.status !== 0) run(py, ["-m", "pip", "install", "--disable-pip-version-check", "-q", FASTER_WHISPER], `pip install ${FASTER_WHISPER}`);
else console.log("> faster-whisper already installed");

run(py, ["-B", WORKER, "--model", model, "--download-only"], `download model ${model}`);
console.log(`Local Whisper ready. Transcribe with: npm run transcribe:local -- <video-or-audio>`);
