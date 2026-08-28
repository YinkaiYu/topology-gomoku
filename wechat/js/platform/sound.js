function safeInvoke(callback) {
  try {
    return callback();
  } catch (error) {
    return null;
  }
}

export default class SoundEngine {
  constructor(enabled) {
    this.enabled = enabled !== false;
    this.context = null;
    this.pauseReasons = new Set();
    this.interruptionListeners = {
      begin: () => {
        this.pause('interruption');
      },
      end: () => {
        this.resume('interruption');
      },
    };
    if (typeof wx.onAudioInterruptionBegin === 'function') {
      wx.onAudioInterruptionBegin(this.interruptionListeners.begin);
    }
    if (typeof wx.onAudioInterruptionEnd === 'function') {
      wx.onAudioInterruptionEnd(this.interruptionListeners.end);
    }
  }

  unlock() {
    if (!this.enabled) {
      return;
    }
    if (!this.context && typeof wx.createWebAudioContext === 'function') {
      this.context = safeInvoke(() => wx.createWebAudioContext());
    }
    if (!this.pauseReasons.size
        && this.context
        && this.context.state === 'suspended'
        && typeof this.context.resume === 'function') {
      safeInvoke(() => this.context.resume());
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.enabled) {
      this.resume('disabled');
      this.unlock();
    } else {
      this.pause('disabled');
    }
  }

  pause(reason = 'manual') {
    this.pauseReasons.add(reason);
    if (this.context && typeof this.context.suspend === 'function') {
      safeInvoke(() => this.context.suspend());
    }
  }

  resume(reason = 'manual') {
    this.pauseReasons.delete(reason);
    if (this.enabled
        && !this.pauseReasons.size
        && this.context
        && typeof this.context.resume === 'function') {
      safeInvoke(() => this.context.resume());
    }
  }

  destroy() {
    this.pause('destroy');
    if (this.interruptionListeners) {
      if (typeof wx.offAudioInterruptionBegin === 'function') {
        wx.offAudioInterruptionBegin(this.interruptionListeners.begin);
      }
      if (typeof wx.offAudioInterruptionEnd === 'function') {
        wx.offAudioInterruptionEnd(this.interruptionListeners.end);
      }
    }
    this.interruptionListeners = null;
    if (this.context && typeof this.context.close === 'function') {
      safeInvoke(() => this.context.close());
    }
    this.context = null;
  }

  tone(frequency, duration, delay, type, volume, endFrequency) {
    if (!this.enabled || this.pauseReasons.size || !this.context) {
      return;
    }
    safeInvoke(() => {
      const now = this.context.currentTime + (delay || 0);
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type || 'sine';
      oscillator.frequency.setValueAtTime(frequency, now);
      if (endFrequency) {
        oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
      }
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume || 0.04, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    });
  }

  play(name) {
    if (!this.enabled || this.pauseReasons.size) {
      return;
    }
    this.unlock();
    if (!this.context) {
      return;
    }
    if (name === 'move-human') {
      this.tone(186, 0.09, 0, 'triangle', 0.035, 132);
      this.tone(372, 0.045, 0.008, 'sine', 0.012, 310);
    } else if (name === 'move-ai') {
      this.tone(248, 0.075, 0, 'triangle', 0.028, 194);
      this.tone(512, 0.04, 0.012, 'sine', 0.01, 430);
    } else if (name === 'seam') {
      this.tone(480, 0.12, 0, 'sine', 0.018, 620);
      this.tone(720, 0.15, 0.085, 'sine', 0.014, 860);
    } else if (name === 'win') {
      this.tone(392, 0.28, 0, 'sine', 0.025, 440);
      this.tone(523, 0.31, 0.13, 'sine', 0.025, 587);
      this.tone(659, 0.4, 0.27, 'sine', 0.028, 784);
    } else if (name === 'morph') {
      this.tone(164, 0.72, 0, 'sine', 0.014, 328);
      this.tone(246, 0.66, 0.18, 'sine', 0.012, 493);
      this.tone(740, 0.28, 0.82, 'sine', 0.012, 988);
    } else if (name === 'lose') {
      this.tone(220, 0.42, 0, 'triangle', 0.026, 146);
    } else if (name === 'draw') {
      this.tone(294, 0.18, 0, 'sine', 0.018, 294);
      this.tone(262, 0.2, 0.12, 'sine', 0.015, 262);
    } else {
      this.tone(520, 0.045, 0, 'sine', 0.012, 440);
    }
  }
}
