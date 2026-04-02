/**
 * Voon.fi Chatbot — Voice Infrastructure
 *
 * Features:
 * - Speech-to-Text (STT): Web Speech API (SpeechRecognition)
 * - Text-to-Speech (TTS): Web Speech API (SpeechSynthesis) + ElevenLabs/Azure TTS
 * - Finnish language optimized
 * - Noise detection & silence detection
 * - Audio visualizer
 */

export class VoiceEngine {
  constructor(options = {}) {
    this.options = {
      lang: 'fi-FI',
      ttsLang: 'fi-FI',
      ttsRate: 1.0,
      ttsPitch: 1.0,
      ttsVolume: 1.0,
      silenceTimeout: 2000,   // ms of silence before auto-stop
      continuous: false,
      interimResults: true,
      onTranscript: () => {},
      onFinalTranscript: () => {},
      onStart: () => {},
      onEnd: () => {},
      onError: () => {},
      onSpeakStart: () => {},
      onSpeakEnd: () => {},
      onVolumeChange: () => {},
      ...options,
    };

    this.recognition = null;
    this.synthesis = window.speechSynthesis || null;
    this.currentUtterance = null;
    this.isListening = false;
    this.isSpeaking = false;
    this.audioContext = null;
    this.analyser = null;
    this.mediaStream = null;
    this.silenceTimer = null;
    this.animFrameId = null;
    this.preferredVoice = null;

    this._initRecognition();
    this._loadVoices();
  }

  // ─── Speech Recognition ────────────────────────────────────────────

  get isSTTSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  get isTTSSupported() {
    return !!window.speechSynthesis;
  }

  _initRecognition() {
    if (!this.isSTTSupported) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.lang = this.options.lang;
    this.recognition.continuous = this.options.continuous;
    this.recognition.interimResults = this.options.interimResults;
    this.recognition.maxAlternatives = 3;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.options.onStart();
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this._clearSilenceTimer();
      this._stopAudioAnalysis();
      this.options.onEnd();
    };

    this.recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (interim) {
        this.options.onTranscript(interim, false);
        this._resetSilenceTimer();
      }
      if (final) {
        this.options.onFinalTranscript(final.trim());
        this.options.onTranscript(final.trim(), true);
      }
    };

    this.recognition.onerror = (event) => {
      this.isListening = false;
      let errMsg = 'Tuntematon virhe';
      switch (event.error) {
        case 'not-allowed':
          errMsg = 'Mikrofonin käyttö estetty';
          break;
        case 'no-speech':
          errMsg = 'Puhetta ei havaittu';
          break;
        case 'network':
          errMsg = 'Verkkovirhe puheentunnistuksessa';
          break;
        case 'audio-capture':
          errMsg = 'Mikrofonia ei löydy';
          break;
        case 'aborted':
          errMsg = 'Kuuntelu keskeytettiin';
          break;
      }
      this.options.onError(event.error, errMsg);
    };
  }

  async startListening() {
    if (!this.isSTTSupported) {
      this.options.onError('not-supported', 'Selaimesi ei tue puheentunnistusta');
      return false;
    }
    if (this.isSpeaking) {
      this.stopSpeaking();
    }
    if (this.isListening) return true;

    try {
      // Request microphone permission and setup analyser
      await this._startAudioAnalysis();
      this.recognition.start();
      this._resetSilenceTimer();
      return true;
    } catch (err) {
      this.options.onError('permission', 'Mikrofoni ei ole käytettävissä: ' + err.message);
      return false;
    }
  }

  stopListening() {
    if (!this.isListening) return;
    this._clearSilenceTimer();
    this._stopAudioAnalysis();
    try { this.recognition.stop(); } catch { /* ignore */ }
  }

  abortListening() {
    this._clearSilenceTimer();
    this._stopAudioAnalysis();
    try { this.recognition.abort(); } catch { /* ignore */ }
    this.isListening = false;
  }

  _resetSilenceTimer() {
    this._clearSilenceTimer();
    if (this.options.silenceTimeout > 0 && !this.options.continuous) {
      this.silenceTimer = setTimeout(() => {
        if (this.isListening) this.stopListening();
      }, this.options.silenceTimeout);
    }
  }

  _clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  // ─── Audio Visualization ───────────────────────────────────────────

  async _startAudioAnalysis() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);
      this._tick();
    } catch {
      // No mic — continue without analysis
    }
  }

  _tick() {
    if (!this.analyser) return;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const volume = Math.min(100, Math.round((avg / 256) * 100));
    this.options.onVolumeChange(volume);
    this.animFrameId = requestAnimationFrame(() => this._tick());
  }

  _stopAudioAnalysis() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.options.onVolumeChange(0);
    if (this.analyser) { this.analyser.disconnect(); this.analyser = null; }
    if (this.audioContext) { this.audioContext.close().catch(() => {}); this.audioContext = null; }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
  }

  // ─── Text-to-Speech ────────────────────────────────────────────────

  _loadVoices() {
    if (!this.isTTSSupported) return;

    const pick = () => {
      const voices = this.synthesis.getVoices();
      // Prefer Finnish voices
      const fi = voices.filter(v => v.lang.startsWith('fi'));
      this.preferredVoice = fi[0] || voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
    };

    pick();
    if (this.synthesis.onvoiceschanged !== undefined) {
      this.synthesis.onvoiceschanged = pick;
    }
  }

  getAvailableVoices(langPrefix = 'fi') {
    if (!this.isTTSSupported) return [];
    return this.synthesis.getVoices().filter(v => v.lang.startsWith(langPrefix));
  }

  setVoice(voiceName) {
    const voices = this.synthesis.getVoices();
    const found = voices.find(v => v.name === voiceName);
    if (found) this.preferredVoice = found;
  }

  speak(text, options = {}) {
    if (!this.isTTSSupported || !text) return;

    // Cancel any ongoing speech
    this.stopSpeaking();

    // Strip markdown for speech
    const cleanText = text
      .replace(/#{1,6}\s/g, '')
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[-*+]\s/g, '')
      .replace(/\n+/g, '. ')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = options.lang || this.options.ttsLang;
    utterance.rate = options.rate || this.options.ttsRate;
    utterance.pitch = options.pitch || this.options.ttsPitch;
    utterance.volume = options.volume || this.options.ttsVolume;

    if (this.preferredVoice) {
      utterance.voice = this.preferredVoice;
    }

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.currentUtterance = utterance;
      this.options.onSpeakStart();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.currentUtterance = null;
      this.options.onSpeakEnd();
    };

    utterance.onerror = (e) => {
      if (e.error !== 'interrupted') {
        this.isSpeaking = false;
        this.currentUtterance = null;
        this.options.onSpeakEnd();
      }
    };

    this.currentUtterance = utterance;
    this.synthesis.speak(utterance);
  }

  stopSpeaking() {
    if (!this.isTTSSupported) return;
    this.synthesis.cancel();
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.options.onSpeakEnd();
  }

  pauseSpeaking() {
    if (this.isTTSSupported && this.isSpeaking) {
      this.synthesis.pause();
    }
  }

  resumeSpeaking() {
    if (this.isTTSSupported) {
      this.synthesis.resume();
    }
  }

  // ─── Cleanup ───────────────────────────────────────────────────────

  destroy() {
    this.abortListening();
    this.stopSpeaking();
    this._stopAudioAnalysis();
  }
}

/**
 * Audio Visualizer — renders waveform/bars on a canvas element
 */
export class AudioVisualizer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = {
      barCount: 20,
      color: '#0369A1',
      activeColor: '#22d3ee',
      barWidth: 3,
      barGap: 2,
      minHeight: 4,
      maxHeight: 40,
      ...options,
    };
    this._volume = 0;
    this._animFrame = null;
    this._draw();
  }

  setVolume(vol) {
    this._volume = vol;
  }

  _draw() {
    const { canvas, ctx, options } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const totalWidth = options.barCount * (options.barWidth + options.barGap);
    const startX = (canvas.width - totalWidth) / 2;
    const centerY = canvas.height / 2;

    for (let i = 0; i < options.barCount; i++) {
      const noise = Math.random() * 0.3 + 0.7;
      const volFactor = this._volume / 100;
      const distFromCenter = Math.abs(i - options.barCount / 2) / (options.barCount / 2);
      const h = this._volume < 2
        ? options.minHeight
        : options.minHeight + (options.maxHeight - options.minHeight) * volFactor * noise * (1 - distFromCenter * 0.5);

      const x = startX + i * (options.barWidth + options.barGap);
      const gradient = ctx.createLinearGradient(x, centerY - h / 2, x, centerY + h / 2);
      gradient.addColorStop(0, options.activeColor);
      gradient.addColorStop(1, options.color);

      ctx.fillStyle = this._volume > 5 ? gradient : options.color;
      ctx.globalAlpha = 0.7 + volFactor * 0.3;
      ctx.beginPath();
      ctx.roundRect(x, centerY - h / 2, options.barWidth, h, 2);
      ctx.fill();
    }

    this._animFrame = requestAnimationFrame(() => this._draw());
  }

  destroy() {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
  }
}
