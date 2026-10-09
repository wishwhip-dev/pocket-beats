"use client";

import { getAudioContext, getMasterGain } from "@/lib/audio";

/**
 * The four drum voices, synthesized from oscillators and white noise on the shared AudioContext.
 * There are no audio files: every hit is built here, so nothing can fail to load.
 *
 * `when` is an audio-clock time from the sequencer's look-ahead scheduler; omit it to play
 * immediately (the row preview buttons). Nothing is audible until the context is running —
 * `unlockAudio()` from a click handler does that — and a call before then stays silent rather
 * than throwing.
 */

export type DrumId = "kick" | "snare" | "hat" | "clap";

export const DRUM_IDS: readonly DrumId[] = ["kick", "snare", "hat", "clap"];

/** One second of white noise, built once and reused by every noise-based voice. */
let noise: AudioBuffer | null = null;

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise) return noise;
  const length = Math.floor(ctx.sampleRate * 1);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noise = buffer;
  return buffer;
}

/** A noise burst with a percussive decay envelope, fed into `destination`. */
function noiseHit(ctx: AudioContext, destination: AudioNode, t: number, duration: number, peak: number): void {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  source.connect(gain).connect(destination);
  // A different slice of the buffer each time, so repeated hits do not sound identical.
  source.start(t, Math.random() * 0.5);
  source.stop(t + duration + 0.05);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
  };
}

/** An oscillator with a percussive decay envelope, fed into `destination`. */
function toneHit(
  ctx: AudioContext,
  destination: AudioNode,
  t: number,
  type: OscillatorType,
  frequency: number,
  endFrequency: number | null,
  duration: number,
  peak: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t);
  if (endFrequency !== null) osc.frequency.exponentialRampToValueAtTime(endFrequency, t + duration * 0.6);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

export function playDrum(id: DrumId, when?: number): void {
  const ctx = getAudioContext();
  const out = getMasterGain();
  if (!ctx || !out || ctx.state !== "running") return;
  const t = Math.max(ctx.currentTime, when ?? ctx.currentTime);

  switch (id) {
    case "kick": {
      toneHit(ctx, out, t, "sine", 150, 46, 0.34, 0.9);
      // A short filtered click so the attack cuts through on small speakers.
      const click = ctx.createBiquadFilter();
      click.type = "lowpass";
      click.frequency.value = 4000;
      click.connect(out);
      noiseHit(ctx, click, t, 0.02, 0.35);
      break;
    }
    case "snare": {
      const wire = ctx.createBiquadFilter();
      wire.type = "highpass";
      wire.frequency.value = 1400;
      wire.connect(out);
      noiseHit(ctx, wire, t, 0.2, 0.55);
      toneHit(ctx, out, t, "triangle", 190, 120, 0.12, 0.3);
      break;
    }
    case "hat": {
      const sheen = ctx.createBiquadFilter();
      sheen.type = "highpass";
      sheen.frequency.value = 7200;
      sheen.connect(out);
      noiseHit(ctx, sheen, t, 0.055, 0.4);
      break;
    }
    case "clap": {
      const room = ctx.createBiquadFilter();
      room.type = "bandpass";
      room.frequency.value = 1100;
      room.Q.value = 1.1;
      room.connect(out);
      // Three quick hand strokes, then the longer reverberant tail.
      for (let i = 0; i < 3; i++) noiseHit(ctx, room, t + i * 0.011, 0.03, 0.5);
      noiseHit(ctx, room, t + 0.014, 0.24, 0.45);
      break;
    }
  }
}