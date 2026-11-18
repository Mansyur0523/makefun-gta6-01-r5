// All sound is synthesised with WebAudio: no audio files, nothing to download.
// Engine hum, two-tone siren, gunshot, punch, pickup chime, cash register and a
// little looping bassline "radio" with three stations the player can flip (R).
import { clamp } from './random.js';

const STATIONS = [
  { name: 'KROK 101.9 — Velvet Vane', bpm: 96, notes: [55, 0, 55, 65.4, 0, 55, 49, 58.3], wave: 'sawtooth' },
  { name: 'WAVE 88.4 — Sunset Drive', bpm: 78, notes: [82.4, 0, 98, 0, 110, 0, 98, 82.4], wave: 'triangle' },
  { name: 'BASS 104.7 — Night Shift', bpm: 120, notes: [41.2, 41.2, 0, 49, 0, 41.2, 55, 49], wave: 'square' },
];

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let muted = false;
  let station = 0;
  let beatTimer = 0;
  let beatIndex = 0;
  let radioOn = true;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      return false;
    }
    return true;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function noiseBurst(dur, vol, lowpass) {
    if (!ctx || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch {
      // Ignore audio failures.
    }
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    stationName() {
      return STATIONS[station].name;
    },
    nextStation() {
      station = (station + 1) % STATIONS.length;
      beatIndex = 0;
      return STATIONS[station].name;
    },
    shoot() {
      noiseBurst(0.12, 0.5, 2400);
      blip(220, 0.08, 'square', 0.18, 60);
    },
    punch() {
      noiseBurst(0.08, 0.4, 900);
    },
    pickup() {
      blip(660, 0.09, 'sine', 0.25);
      setTimeout(() => blip(990, 0.14, 'sine', 0.25), 90);
    },
    cash() {
      blip(880, 0.08, 'sine', 0.25);
      setTimeout(() => blip(1174, 0.08, 'sine', 0.25), 80);
      setTimeout(() => blip(1568, 0.18, 'sine', 0.25), 160);
    },
    crash() {
      noiseBurst(0.25, 0.5, 700);
    },
    busted() {
      blip(392, 0.3, 'sawtooth', 0.2, 196);
      setTimeout(() => blip(311, 0.5, 'sawtooth', 0.2, 155), 300);
    },
    missionDone() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.28), i * 110));
    },
    update(dt, speed01, wanted, inCar) {
      if (!ctx || muted) return;
      if (engineGain) {
        const target = inCar ? 0.05 + speed01 * 0.11 : 0;
        engineGain.gain.value += (target - engineGain.gain.value) * Math.min(1, dt * 6);
        engineOsc.frequency.value = 48 + speed01 * 130;
      }
      if (sirenGain) {
        sirenTimer += dt;
        const on = wanted > 0;
        const target = on ? 0.045 : 0;
        sirenGain.gain.value += (target - sirenGain.gain.value) * Math.min(1, dt * 4);
        if (on) sirenOsc.frequency.value = Math.sin(sirenTimer * 5.2) > 0 ? 715 : 960;
      }
      // The radio bassline: one short note per beat while the radio is on.
      if (radioOn && !muted) {
        beatTimer += dt;
        const st = STATIONS[station];
        const beatLen = 60 / st.bpm / 2;
        if (beatTimer >= beatLen) {
          beatTimer -= beatLen;
          const note = st.notes[beatIndex % st.notes.length];
          beatIndex += 1;
          if (note > 0) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = st.wave;
            osc.frequency.value = note;
            gain.gain.setValueAtTime(0.06, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + beatLen * 0.9);
            osc.connect(gain);
            gain.connect(master);
            osc.start();
            osc.stop(ctx.currentTime + beatLen);
          }
        }
      }
    },
  };
}
