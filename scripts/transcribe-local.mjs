#!/usr/bin/env node
// Transcribe a video/audio file with local Whisper (faster-whisper) -> word-level JSON.
// Free, offline after the model downloads, no API key. Output matches the
// format the cutting tools read (same shape as transcribe-elevenlabs.mjs).
//
// Usage:
//   node scripts/transcribe-local.mjs <input> [options]
//
// Options:
//   --output <path>     default: <input-without-ext>.json next to the source
//   --model <name>      tiny.en | base.en | small.en (default) | medium.en | large-v3 | ...
//   --language <code>   default: en (use with a multilingual model for other languages)
//   --device <d>        auto (default) | cpu | cuda
//   --compute-type <t>  default int8 on CPU, float16 on GPU
//   --vad               skip long non-speech stretches (timestamps stay on the source timeline)
//   --keep-audio        keep the extracted 16 kHz WAV next to the output
//
// One-time install: npm run setup:whisper

import { mkdtempSync, rmSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { argv, exit } from "node:process";
import { DEFAULT_MODEL, WORKER, findWhisperPython, whisperEnv } from "./whisper-env.mjs";
import { normalizeWhisper } from "./whisper-normalize.mjs";

const die = (msg, code = 1) => { console.error(msg); exit(code); };

const args = argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(
    "Usage: node scripts/transcribe-local.mjs <input> [--output path] [--model small.en] " +
      "[--language en] [--device auto|cpu|cuda] [--compute-type int8] [--vad] [--keep-audio]",
  );
  exit(args.length === 0 ? 1 : 0);
}

const opts = { input: null, output: null, model: DEFAULT_MODEL, language: "en", device: "auto", computeType: "default", vad: false, keepAudio: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--output" || a === "-o") opts.output = args[++i];
  else if (a === "--model") opts.model = args[++i];
  else if (a === "--language" || a === "--lang") opts.language = args[++i];
  else if (a === "--device") opts.device = args[++i];
  else if (a === "--compute-type") opts.computeType = args[++i];
  else if (a === "--vad") opts.vad = true;
  else if (a === "--keep-audio") opts.keepAudio = true;
  else if (a.startsWith("--")) die(`unknown option: ${a}`);
  else if (!opts.input) opts.input = a;
  else die(`unexpected argument: ${a}`);
}
if (!opts.input) die("no input file given");
if (opts.language && opts.model.endsWith(".en") && opts.language !== "en") {
  die(`${opts.model} is English-only; use a multilingual model (e.g. small) for --language ${opts.language}`);
}

const inputPath = resolve(opts.input);
if (!existsSync(inputPath)) die(`input not found: ${inputPath}`);
const stem = basename(inputPath, extname(inputPath));
const outputPath = resolve(opts.output ?? join(dirname(inputPath), `${stem}.json`));

const python = findWhisperPython();
if (!python) die("Local Whisper is not installed. Run: npm run setup:whisper");

// Full source duration comes from ffprobe, not the decoder.
const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", inputPath], { encoding: "utf8" });
const duration = Number(probe.stdout?.trim());
if (probe.status !== 0 || !Number.isFinite(duration)) die(`ffprobe could not read duration:\n${probe.stderr ?? ""}`);

const work = mkdtempSync(join(tmpdir(), "whisper-"));
const wav = join(work, `${stem}.wav`);
try {
  console.log(`extracting audio (${duration.toFixed(1)}s) ...`);
  const ff = spawnSync("ffmpeg", ["-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav], { stdio: ["ignore", "ignore", "pipe"] });
  if (ff.status !== 0) die(`ffmpeg failed:\n${ff.stderr?.toString() ?? ""}`, ff.status ?? 1);

  const t0 = Date.now();
  const workerArgs = ["-B", WORKER, wav, "--model", opts.model, "--language", opts.language, "--device", opts.device, "--compute-type", opts.computeType];
  if (opts.vad) workerArgs.push("--vad");
  const r = spawnSync(python, workerArgs, { env: whisperEnv(), encoding: "utf8", maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "inherit"] });
  if (r.error || r.status !== 0) die(`whisper failed${r.error ? `: ${r.error.message}` : ""}`, r.status || 1);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  const doc = normalizeWhisper(JSON.parse(r.stdout), { duration, model: opts.model });
  writeFileSync(outputPath, JSON.stringify(doc, null, 2));
  if (opts.keepAudio) copyFileSync(wav, join(dirname(outputPath), `${stem}.wav`));
  console.log(`ok ${dt}s | ${doc.words.length} words | ${duration.toFixed(1)}s audio | ${outputPath}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
