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

export function playTacticalPing(type: 'CRITICAL' | 'HIGH' | 'SIMULATE' | 'DISPATCH' | 'LOCK_ON' | 'RADAR' = 'HIGH') {
  if (isMuted) return;
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    if (type === 'CRITICAL') {
      // Urgent dual-tone klaxon pulse
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);
      osc.frequency.setValueAtTime(880, now + 0.2);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.35);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.38);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'DISPATCH') {
      // Military radio chirp & authorization confirmation
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(1040, now + 0.08);
      osc.frequency.setValueAtTime(780, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(1560, now + 0.22);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.26);
      osc.start(now);
      osc.stop(now + 0.28);
    } else if (type === 'LOCK_ON') {
      // High-pitched targeting laser lock tone
      osc.type = 'square';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.setValueAtTime(1600, now + 0.06);
      osc.frequency.setValueAtTime(2000, now + 0.12);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'RADAR') {
      // Subtle sonar sweep click
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.06);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.07);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'SIMULATE') {
      // Tech confirm sweep
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.25);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.3);
    } else {
      // Standard tactical sonar chirp
      osc.type = 'sine';
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
