// src/utils/audioAlert.ts — Tactical HUD Audio Synthesis (Web Audio API)
let audioCtx: AudioContext | null = null;
let isMuted = false;

export function toggleAudioMute(): boolean {
  isMuted = !isMuted;
  return isMuted;
}

export function getAudioMute(): boolean {
  return isMuted;
}

export function playTacticalPing(type: 'CRITICAL' | 'HIGH' | 'SIMULATE' = 'HIGH') {
  if (isMuted) return;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type === 'CRITICAL' ? 'sawtooth' : 'sine';

    const now = audioCtx.currentTime;
    if (type === 'CRITICAL') {
      // Urgent dual-tone pulse
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);
      osc.frequency.setValueAtTime(880, now + 0.2);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.35);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.38);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'SIMULATE') {
      // Tech confirm sweep
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.25);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.3);
    } else {
      // Standard tactical sonar chirp
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.18); // C5
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.25);
    }

    osc.connect(gain);
    gain.connect(audioCtx.destination);
  } catch {
    // Audio context not allowed prior to user gesture
  }
}
