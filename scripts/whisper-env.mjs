// Shared locations for the local Whisper runtime (repo-local virtualenv).
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const VENV_DIR = join(WORKSPACE_ROOT, ".venv-whisper");
export const WORKER = join(WORKSPACE_ROOT, "scripts", "whisper-local.py");
export const DEFAULT_MODEL = "small.en";

export function venvPython(venv = VENV_DIR) {
  return process.platform === "win32" ? join(venv, "Scripts", "python.exe") : join(venv, "bin", "python");
}

// WHISPER_PYTHON overrides the repo-local virtualenv.
export function findWhisperPython() {
  if (process.env.WHISPER_PYTHON) return process.env.WHISPER_PYTHON;
  const py = venvPython();
  return existsSync(py) ? py : null;
}

// Plain HTTPS model downloads work on every network, including proxied ones.
export function whisperEnv() {
  return { ...process.env, HF_HUB_DISABLE_XET: process.env.HF_HUB_DISABLE_XET ?? "1", PYTHONDONTWRITEBYTECODE: "1" };
}
