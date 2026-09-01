"use client";

/**
 * Auction sound effects, synthesized entirely in the browser via the Web
 * Audio API — no external audio files, no licensing concerns. These are
 * short, distinct tones for each auction "moment," not an attempt to
 * simulate a real crowd or licensed music.
 *
 * If real audio clips become available later (a recorded crowd cheer, a
 * drumroll, a stadium announcer), swap the oscillator-based playSound()
 * implementation for <audio> playback — the trigger call sites
 * (useAuctionSoundEffects hook) don't need to change at all.
 *
 * Browser autoplay policy: an AudioContext can't produce sound until
 * after a user gesture. Call `enableSound()` from a click handler once
 * (a "🔊 Enable sound" button) before any effect will actually play.
 */

export type SoundEvent = "playerIntro" | "bid" | "urgentTick" | "sold" | "unsold";

let audioCtx: AudioContext | null = null;
let enabled = false;

export function isSoundEnabled() {
  return enabled;
}

export function enableSound() {
  if (typeof window === "undefined") return;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  enabled = true;
  try {
    localStorage.setItem("ioxion_sound_enabled", "1");
  } catch {
    // ignore — private browsing etc.
  }
}

export function disableSound() {
  enabled = false;
  try {
    localStorage.setItem("ioxion_sound_enabled", "0");
  } catch {
    // ignore
  }
}

export function loadSoundPreference() {
  if (typeof window === "undefined") return;
  try {
    const pref = localStorage.getItem("ioxion_sound_enabled");
    if (pref === "1" && audioCtx === null) {
      // Was enabled last visit — set up context, but it'll stay
      // "suspended" until a real click resumes it (browser policy).
      enabled = true;
    }
  } catch {
    // ignore
  }
}

function tone(freq: number, startTime: number, duration: number, type: OscillatorType = "sine", gainPeak = 0.15) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

export function playSound(event: SoundEvent) {
  if (!enabled || !audioCtx || audioCtx.state !== "running") return;
  const now = audioCtx.currentTime;

  switch (event) {
    case "playerIntro": {
      // A rising two-note swell — "here comes the next player"
      tone(392, now, 0.35, "sine", 0.12); // G4
      tone(523, now + 0.12, 0.4, "sine", 0.12); // C5
      break;
    }
    case "bid": {
      // Short, percussive tick — a new bid landed
      tone(880, now, 0.12, "triangle", 0.1);
      break;
    }
    case "urgentTick": {
      // Sharper, higher tick — final countdown
      tone(1046, now, 0.08, "square", 0.06);
      break;
    }
    case "sold": {
      // Triumphant ascending arpeggio — C-E-G-C
      tone(523, now, 0.2, "sine", 0.14);
      tone(659, now + 0.1, 0.2, "sine", 0.14);
      tone(784, now + 0.2, 0.2, "sine", 0.14);
      tone(1046, now + 0.32, 0.5, "sine", 0.16);
      break;
    }
    case "unsold": {
      // A gentle descending pair — no fanfare, but not silence either
      tone(440, now, 0.25, "sine", 0.1);
      tone(349, now + 0.15, 0.35, "sine", 0.1);
      break;
    }
  }
}
