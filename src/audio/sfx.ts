/* Synthesized SFX — no audio files, no licensing. */
type Wave = OscillatorType;

interface Voice {
  type: Wave;
  freq: number;
  to?: number;
  dur: number;
  gain?: number;
  delay?: number;
  attack?: number;
  filter?: { type: BiquadFilterType; freq: number; q?: number };
}

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  enabled = true;

  init(): void {
    if (this.ctx) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // 1s of white noise for impacts
      const len = Math.floor(this.ctx.sampleRate * 0.6);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    } catch {
      this.ctx = null;
    }
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number): void {
    if (this.master) this.master.gain.value = Math.max(0, Math.min(1, v));
  }

  private tone(v: Voice): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t0 = this.ctx.currentTime + (v.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = v.type;
    osc.frequency.setValueAtTime(v.freq, t0);
    if (v.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, v.to), t0 + v.dur);
    const peak = v.gain ?? 0.2;
    const atk = v.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + v.dur);
    let node: AudioNode = g;
    if (v.filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = v.filter.type;
      f.frequency.value = v.filter.freq;
      f.Q.value = v.filter.q ?? 1;
      g.connect(f);
      node = f;
    }
    osc.connect(g);
    node.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + v.dur + 0.02);
  }

  private noise(dur: number, gain: number, freq: number, type: BiquadFilterType = 'bandpass', delay = 0): void {
    if (!this.ctx || !this.master || !this.noiseBuf || !this.enabled) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  play(id: string): void {
    if (!this.ctx) return;
    const jitter = () => 1 + (Math.random() - 0.5) * 0.08;
    switch (id) {
      case 'step':
        this.noise(0.08, 0.05, 900 + Math.random() * 400, 'lowpass');
        break;
      case 'hit':
        this.noise(0.12, 0.22, 1400, 'bandpass');
        this.tone({ type: 'square', freq: 180 * jitter(), to: 90, dur: 0.12, gain: 0.14 });
        break;
      case 'crit':
        this.noise(0.2, 0.3, 900, 'bandpass');
        this.tone({ type: 'square', freq: 220 * jitter(), to: 70, dur: 0.2, gain: 0.2 });
        this.tone({ type: 'sine', freq: 70, to: 40, dur: 0.28, gain: 0.25 });
        break;
      case 'miss':
        this.noise(0.1, 0.08, 2600, 'highpass');
        break;
      case 'hurt':
        this.tone({ type: 'sawtooth', freq: 160 * jitter(), to: 80, dur: 0.18, gain: 0.18, filter: { type: 'lowpass', freq: 900 } });
        this.noise(0.16, 0.16, 500, 'lowpass');
        break;
      case 'kill':
        this.noise(0.28, 0.2, 400, 'lowpass');
        this.tone({ type: 'triangle', freq: 140, to: 60, dur: 0.26, gain: 0.16 });
        break;
      case 'levelup':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          this.tone({ type: 'triangle', freq: f, dur: 0.26, gain: 0.16, delay: i * 0.085 }));
        break;
      case 'skill':
        this.tone({ type: 'triangle', freq: 520, to: 900, dur: 0.14, gain: 0.14 });
        this.noise(0.12, 0.1, 2200, 'highpass');
        break;
      case 'cast':
        this.tone({ type: 'sine', freq: 300, to: 1200, dur: 0.22, gain: 0.13 });
        break;
      case 'heal':
        [392, 587.33, 783.99].forEach((f, i) =>
          this.tone({ type: 'sine', freq: f, dur: 0.4, gain: 0.11, delay: i * 0.06 }));
        break;
      case 'coin':
        this.tone({ type: 'square', freq: 1180, dur: 0.06, gain: 0.1 });
        this.tone({ type: 'square', freq: 1560, dur: 0.1, gain: 0.09, delay: 0.05 });
        break;
      case 'pickup':
        this.tone({ type: 'sine', freq: 660, to: 880, dur: 0.12, gain: 0.12 });
        break;
      case 'equip':
        this.tone({ type: 'triangle', freq: 300, to: 420, dur: 0.1, gain: 0.12 });
        this.noise(0.08, 0.08, 1800, 'bandpass');
        break;
      case 'anvil':
        this.noise(0.18, 0.24, 2400, 'bandpass');
        this.tone({ type: 'square', freq: 520, to: 300, dur: 0.14, gain: 0.12 });
        break;
      case 'chest':
        this.tone({ type: 'sawtooth', freq: 180, to: 120, dur: 0.16, gain: 0.1 });
        this.tone({ type: 'triangle', freq: 880, dur: 0.2, gain: 0.1, delay: 0.14 });
        break;
      case 'drink':
        this.tone({ type: 'sine', freq: 420, to: 620, dur: 0.14, gain: 0.11 });
        break;
      case 'chop':
        this.noise(0.14, 0.2, 700, 'bandpass');
        this.tone({ type: 'square', freq: 120, to: 80, dur: 0.1, gain: 0.1 });
        break;
      case 'warning':
        this.tone({ type: 'square', freq: 320, dur: 0.12, gain: 0.09 });
        this.tone({ type: 'square', freq: 320, dur: 0.12, gain: 0.09, delay: 0.18 });
        break;
      case 'boom':
        this.noise(0.44, 0.32, 220, 'lowpass');
        this.tone({ type: 'sine', freq: 70, to: 32, dur: 0.5, gain: 0.3 });
        break;
      case 'rest':
        [261.63, 392, 523.25].forEach((f, i) =>
          this.tone({ type: 'sine', freq: f, dur: 0.6, gain: 0.08, delay: i * 0.14 }));
        break;
      case 'quest':
        [587.33, 739.99, 880].forEach((f, i) =>
          this.tone({ type: 'triangle', freq: f, dur: 0.3, gain: 0.13, delay: i * 0.1 }));
        break;
      case 'ui':
        this.tone({ type: 'sine', freq: 520, dur: 0.06, gain: 0.07 });
        break;
      default:
        break;
    }
  }
}
