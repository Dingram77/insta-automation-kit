import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWhisper } from '../scripts/whisper-normalize.mjs';

const raw = {
  language: 'en',
  duration: 3.9,
  segments: [
    { words: [
      { word: ' Find', start: 0.2, end: 0.5, probability: 0.99 },
      { word: ' the', start: 0.5, end: 0.6, probability: 0.98 },
      { word: ' B', start: 0.6, end: 0.8, probability: 0.9 },
      { word: '-roll', start: 0.8, end: 1.1, probability: 0.9 },
      { word: ' .', start: 1.1, end: 1.1, probability: 0.5 },
    ] },
    { words: [
      { word: ' Then', start: 1.05, end: 1.4, probability: 0.97 },
      { word: ' cut.', start: 3.5, end: 4.2, probability: 0.96 },
    ] },
  ],
};

test('normalizes faster-whisper output to the kit transcript format', () => {
  const doc = normalizeWhisper(raw, { duration: 3.9, model: 'small.en' });
  assert.equal(doc.text, 'Find the B-roll. Then cut.');
  assert.equal(doc.audio_duration_secs, 3.9);
  assert.equal(doc.transcription_engine, 'faster-whisper/small.en');
  assert.deepEqual(doc.words.map(w => w.text), ['Find', 'the', 'B-roll.', 'Then', 'cut.']);
  assert.deepEqual(doc.words[2], { text: 'B-roll.', start: 0.6, end: 1.1, type: 'word', confidence: 0.9 });
  // Out-of-order start is clamped forward; overrun end is clamped to the source duration.
  assert.equal(doc.words[3].start, 1.05);
  assert.equal(doc.words[4].end, 3.9);
  for (const w of doc.words) assert.ok(w.end >= w.start);
});

test('handles empty transcripts', () => {
  const doc = normalizeWhisper({ segments: [] }, { duration: 2 });
  assert.deepEqual(doc.words, []);
  assert.equal(doc.text, '');
});
