// Convert raw faster-whisper output into the kit's transcript format:
// { text, audio_duration_secs, words: [{ text, start, end, type: "word" }] }
// with times in seconds on the source recording's timeline.

const round = (n) => Math.round(n * 1000) / 1000;
const PUNCT_ONLY = /^[^\p{L}\p{N}]+$/u;

export function normalizeWhisper(raw, { duration, model, language } = {}) {
  const total = Number.isFinite(duration) ? duration : Number(raw?.duration);
  const words = [];
  for (const seg of raw?.segments ?? []) {
    let segWords = 0;
    for (const w of seg.words ?? []) {
      const rawText = String(w.word ?? w.text ?? "");
      const text = rawText.trim();
      if (!text) continue;
      const prevWord = words[words.length - 1];
      // Whisper marks a new word with a leading space; a token without one
      // (e.g. "-roll" after "B") continues the previous word.
      if (segWords > 0 && prevWord && !/^\s/.test(rawText)) {
        prevWord.text += text;
        if (Number.isFinite(Number(w.end))) prevWord.end = Math.max(prevWord.end, round(Math.min(Number(w.end), Number.isFinite(total) ? total : Infinity)));
        continue;
      }
      segWords++;
      let start = Number(w.start);
      let end = Number(w.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      // Stray punctuation tokens belong to the previous word, never their own timing.
      if (PUNCT_ONLY.test(text) && words.length) {
        words[words.length - 1].text += text;
        continue;
      }
      if (Number.isFinite(total)) {
        start = Math.min(Math.max(start, 0), total);
        end = Math.min(Math.max(end, 0), total);
      }
      const prev = words[words.length - 1];
      if (prev && start < prev.start) start = prev.start; // keep order monotonic
      if (end < start) end = start;
      const word = { text, start: round(start), end: round(end), type: "word" };
      if (Number.isFinite(w.probability)) word.confidence = round(w.probability);
      words.push(word);
    }
  }
  return {
    text: words.map((w) => w.text).join(" "),
    language_code: language ?? raw?.language ?? null,
    audio_duration_secs: Number.isFinite(total) ? round(total) : null,
    transcription_engine: `faster-whisper${model ? `/${model}` : ""}`,
    words,
  };
}
