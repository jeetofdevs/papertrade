// Tiny WebAudio sound effects. No audio files needed.

import { getSettings } from './settings';

let ctx: AudioContext | null = null;

function tone(freqs: number[], dur = 0.08, type: OscillatorType = 'sine', gain = 0.06) {
  if (!getSettings().sound) return;
  try {
    ctx ??= new AudioContext();
    let t = ctx.currentTime;
    for (const f of freqs) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur);
      t += dur * 0.9;
    }
  } catch {
    /* audio not available */
  }
}

export const sound = {
  open: () => tone([660, 880], 0.07, 'triangle'),
  win: () => tone([523, 659, 784, 1047], 0.09, 'triangle'),
  loss: () => tone([440, 330], 0.12, 'sine'),
  bust: () => tone([180, 120, 90], 0.16, 'sawtooth', 0.05),
};
