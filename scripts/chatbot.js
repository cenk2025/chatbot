/**
 * Voon.fi Chatbot — Premium Core v2
 * Glassmorphism · Rich Cards · Suggested Replies · Voice · 2026
 */

import { sendMessage } from './api.js';
import { VoiceEngine, AudioVisualizer } from './voice.js';
import { fi as t } from './i18n.js';

// ─── Constants ─────────────────────────────────────────────────────────────
const MAX_HISTORY = 40;
const SESSION_KEY  = 'voon_chat_v2';
const PREFS_KEY    = 'voon_prefs_v2';

// Category cards (welcome screen)
const CATEGORIES = [
  {
    key: 'order', color: 'blue',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    label: 'Tilausten hallinta', desc: 'Tila, muutos, peruutus',
    msg: 'Haluaisin tarkistaa tilauksen tilan tai hallita tilauksiani.',
  },
  {
    key: 'billing', color: 'purple',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>`,
    label: 'Laskutus & maksut', desc: 'Laskut, maksutavat',
    msg: 'Minulla on kysymys laskutuksesta tai maksuista.',
  },
  {
    key: 'tech', color: 'cyan',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M20 12h-2M19.07 19.07l-1.41-1.41M12 20v-2M4.93 19.07l1.41-1.41M4 12H2M4.93 4.93l1.41 1.41"/></svg>`,
    label: 'Tekninen tuki', desc: 'Ongelmat, vianmääritys',
    msg: 'Tarvitsen apua teknisen ongelman kanssa.',
  },
  {
    key: 'account', color: 'emerald',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    label: 'Tili & asetukset', desc: 'Profiili, salasana, tiedot',
    msg: 'Haluaisin muuttaa tilin asetuksia tai tietoja.',
  },
];

// Context-aware suggested replies
const SUGGESTED_REPLIES = {
  default: [
    { icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>`, label: 'Puhu ihmiselle', msg: 'Haluaisin puhua ihmisasiakaspalvelijalle.' },
    { icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`, label: 'Tilauksen tila', msg: 'Mikä on tilaukseni tila?' },
    { icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>`, label: 'Lasku kysymys', msg: 'Minulla on kysymys viimeisestä laskustani.' },
  ],
  order: [
    { label: 'Peruuta tilaus', msg: 'Haluaisin peruuttaa tilaukseni.' },
    { label: 'Muuta toimitusosoite', msg: 'Haluaisin muuttaa toimitustietoja.' },
    { label: 'Tilaus myöhässä?', msg: 'Tilaukseni on myöhässä, mitä voin tehdä?' },
  ],
  billing: [
    { label: 'Maksuvirhe', msg: 'Maksussa tapahtui virhe.' },
    { label: 'Hyvitys', msg: 'Haluaisin pyytää hyvitystä.' },
    { label: 'Lasku ei tule', msg: 'En ole saanut laskua.' },
  ],
  tech: [
    { label: 'Ei toimi', msg: 'Palvelu ei toimi oikein.' },
    { label: 'Kirjautuminen', msg: 'En pysty kirjautumaan sisään.' },
    { label: 'Virheilmoitus', msg: 'Saan virheilmoituksen.' },
  ],
};

// ─── Markdown renderer ─────────────────────────────────────────────────────
function md(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/^#{3}\s+(.+)$/gm,'<h3>$1</h3>')
    .replace(/^#{2}\s+(.+)$/gm,'<h2>$1</h2>')
    .replace(/^#{1}\s+(.+)$/gm,'<h1>$1</h1>')
    .replace(/^[-*+]\s+(.+)$/gm,'<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g,'<ul>$1</ul>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>');
}

function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function ftime(d){ return d.toLocaleTimeString('fi-FI',{hour:'2-digit',minute:'2-digit'}); }
function genId(){ return 'm_'+Date.now()+'_'+Math.random().toString(36).slice(2,6); }

// ─── VoonChatbot ───────────────────────────────────────────────────────────
export class VoonChatbot {
  constructor(rootEl) {
    this.root = typeof rootEl === 'string' ? document.querySelector(rootEl) : rootEl;
    if (!this.root) throw new Error('Root element not found: ' + rootEl);

    this.messages   = [];
    this.isStreaming = false;
    this.abortCtrl  = null;
    this.voice      = null;
    this.visualizer = null;
    this.prefs      = this._loadPrefs();
    this.isMin      = false;
    this.isExp      = false;
    this.currentCtx = 'default'; // for suggested replies context

    this._render();
    this._bind();
    this._initVoice();
    this._restoreSession();
    if (this.messages.length === 0) this._showWelcome();
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  _render() {
    this.root.innerHTML = `
    <div class="voon-chatbot" id="voon-chatbot" role="dialog" aria-label="Voon asiakaspalvelu" aria-modal="true">

      <!-- Header -->
      <header class="chat-header">
        <div class="chat-header-left">
          <div class="bot-avatar" aria-hidden="true">
            <div class="bot-avatar-ring"></div>
            <div class="bot-avatar-inner">
              <svg viewBox="0 0 32 32" fill="none">
                <path d="M8 21c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="#60a5fa" stroke-width="2.5" stroke-linecap="round"/>
                <circle cx="12" cy="14" r="2" fill="#60a5fa"/>
                <circle cx="20" cy="14" r="2" fill="#60a5fa"/>
                <rect x="14" y="6" width="4" height="4" rx="2" fill="#3b82f6"/>
                <line x1="16" y1="6" x2="16" y2="4" stroke="#3b82f6" stroke-width="1.5" stroke-linecap="round"/>
                <circle cx="16" cy="3.5" r="1.2" fill="#60a5fa"/>
              </svg>
            </div>
          </div>
          <div>
            <h1 class="chat-title">Voon Asiakaspalvelu</h1>
            <div class="chat-status">
              <span class="status-dot" id="status-dot"></span>
              <span class="status-text" id="status-text">Verkossa • Tekoälyavustettu</span>
            </div>
          </div>
        </div>
        <div class="chat-header-actions">
          <button class="icon-btn" id="btn-tts" aria-label="Puhesynteesi" title="Puhesynteesi">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
          </button>
          <button class="icon-btn" id="btn-new" aria-label="Uusi keskustelu" title="Uusi keskustelu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <button class="icon-btn" id="btn-expand" aria-label="Laajenna" title="Laajenna">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
          </button>
          <button class="icon-btn" id="btn-min" aria-label="Pienennä" title="Pienennä">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>
          </button>
        </div>
      </header>

      <!-- Messages -->
      <main class="chat-messages" id="chat-messages" role="log" aria-live="polite">
        <div class="messages-inner" id="messages-inner"></div>
      </main>

      <!-- Voice overlay -->
      <div class="voice-overlay" id="voice-overlay" hidden aria-hidden="true">
        <div class="voice-orb" id="voice-orb" role="button" aria-label="Lopeta kuuntelu">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <canvas class="voice-visualizer" id="voice-canvas" width="220" height="56" aria-hidden="true"></canvas>
        <p class="voice-status-text" id="voice-status-text">Kuuntelee...</p>
        <p class="voice-transcript" id="voice-transcript"></p>
        <button class="btn-voice-cancel" id="btn-voice-cancel">Peruuta</button>
      </div>

      <!-- Handoff overlay -->
      <div class="overlay-panel" id="handoff-panel" hidden>
        <div class="overlay-panel-inner">
          <div class="overlay-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          </div>
          <h2>Yhdistetään asiakaspalvelijaan</h2>
          <p>Jätä tietosi, niin otamme sinuun yhteyttä mahdollisimman pian.</p>
          <form id="handoff-form" novalidate>
            <div class="form-group">
              <label for="hf-name" class="form-label">Nimi</label>
              <input id="hf-name" class="form-input" type="text" placeholder="Sinun nimesi" autocomplete="name" required>
            </div>
            <div class="form-group">
              <label for="hf-email" class="form-label">Sähköposti</label>
              <input id="hf-email" class="form-input" type="email" placeholder="sinun@sahkoposti.fi" autocomplete="email" required>
            </div>
            <div class="form-group">
              <label for="hf-msg" class="form-label">Viesti</label>
              <textarea id="hf-msg" class="form-input form-textarea" rows="3" placeholder="Kuvaile ongelmasi lyhyesti..."></textarea>
            </div>
            <div class="handoff-actions">
              <button type="button" class="btn btn-secondary" id="btn-hf-cancel">Peruuta</button>
              <button type="submit" class="btn btn-primary">Lähetä</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Satisfaction overlay -->
      <div class="overlay-panel" id="satisfaction-panel" hidden>
        <div class="overlay-panel-inner" style="align-items:center;text-align:center;">
          <div class="overlay-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          </div>
          <h2>Kuinka arvioisit palvelun?</h2>
          <p>Palautteesi auttaa meitä parantamaan asiakaspalveluamme.</p>
          <div class="satisfaction-stars" role="group" aria-label="Arvio 1-5">
            ${[1,2,3,4,5].map(n=>`<button class="star-btn" data-r="${n}" aria-label="${n} tähteä"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></button>`).join('')}
          </div>
          <textarea class="form-input form-textarea satisfaction-comment" id="satisfaction-comment" placeholder="Lisäkommentteja... (valinnainen)" rows="2" style="width:100%;margin-top:.5rem;"></textarea>
          <button class="btn btn-primary satisfaction-submit" id="btn-sat-submit" style="width:100%;margin-top:.5rem;">Lähetä arvio</button>
          <button class="btn btn-secondary btn-sm" id="btn-sat-skip" style="margin-top:.25rem;">Ohita</button>
        </div>
      </div>

      <!-- Footer -->
      <footer class="chat-footer">
        <div class="footer-chips" id="footer-chips"></div>
        <div class="file-preview" id="file-preview" hidden></div>
        <div class="input-row">
          <label class="icon-btn" for="file-input" aria-label="Lisää liite" title="Lisää liite" style="cursor:pointer;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            <input type="file" id="file-input" accept=".jpg,.jpeg,.png,.pdf,.doc,.docx" hidden>
          </label>
          <div class="input-wrapper">
            <textarea class="chat-input" id="chat-input" placeholder="Kirjoita viestisi..." rows="1" aria-label="Viesti" autocorrect="on" spellcheck="true"></textarea>
          </div>
          <button class="icon-btn mic-btn" id="btn-mic" aria-label="Ääniviesti" title="Ääniviesti">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>
          </button>
          <button class="btn-send" id="btn-send" aria-label="Lähetä" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          </button>
        </div>
        <p class="chat-disclaimer">Voon asiakaspalvelu · AI-avustettu · <a href="https://voon.fi/tietosuoja" target="_blank" rel="noopener">Tietosuoja</a></p>
      </footer>

    </div>`;

    // Cache refs
    this.$ = {
      bot:         this.root.querySelector('#voon-chatbot'),
      msgs:        this.root.querySelector('#chat-messages'),
      inner:       this.root.querySelector('#messages-inner'),
      input:       this.root.querySelector('#chat-input'),
      send:        this.root.querySelector('#btn-send'),
      mic:         this.root.querySelector('#btn-mic'),
      btnNew:      this.root.querySelector('#btn-new'),
      btnExp:      this.root.querySelector('#btn-expand'),
      btnMin:      this.root.querySelector('#btn-min'),
      btnTts:      this.root.querySelector('#btn-tts'),
      voiceOverlay:this.root.querySelector('#voice-overlay'),
      voiceOrb:    this.root.querySelector('#voice-orb'),
      voiceCanvas: this.root.querySelector('#voice-canvas'),
      voiceStat:   this.root.querySelector('#voice-status-text'),
      voiceTrans:  this.root.querySelector('#voice-transcript'),
      voiceCancel: this.root.querySelector('#btn-voice-cancel'),
      handoff:     this.root.querySelector('#handoff-panel'),
      hfForm:      this.root.querySelector('#handoff-form'),
      hfCancel:    this.root.querySelector('#btn-hf-cancel'),
      sat:         this.root.querySelector('#satisfaction-panel'),
      satSubmit:   this.root.querySelector('#btn-sat-submit'),
      satSkip:     this.root.querySelector('#btn-sat-skip'),
      chips:       this.root.querySelector('#footer-chips'),
      fileInput:   this.root.querySelector('#file-input'),
      filePreview: this.root.querySelector('#file-preview'),
    };
  }

  // ─── Events ──────────────────────────────────────────────────────────────
  _bind() {
    const $ = this.$;

    $.send.addEventListener('click', () => this._handleSend());
    $.input.addEventListener('input', () => {
      this._autoResize($.input);
      $.send.disabled = !$.input.value.trim();
    });
    $.input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!$.send.disabled) this._handleSend(); }
    });

    $.mic.addEventListener('click', () => this._toggleVoice());
    $.voiceOrb.addEventListener('click', () => this._stopVoice());
    $.voiceCancel.addEventListener('click', () => this._stopVoice());

    $.btnTts.addEventListener('click', () => {
      this.prefs.tts = !this.prefs.tts; this._savePrefs();
      $.btnTts.classList.toggle('active', this.prefs.tts);
      $.btnTts.title = this.prefs.tts ? 'Puhesynteesi päällä' : 'Puhesynteesi pois';
    });

    $.btnNew.addEventListener('click', () => {
      if (this.messages.length && confirm('Aloitetaanko uusi keskustelu?')) this._newChat();
    });
    $.btnExp.addEventListener('click', () => this._toggleExpand());
    $.btnMin.addEventListener('click', () => this._toggleMin());

    $.hfCancel.addEventListener('click', () => { $.handoff.hidden = true; });
    $.hfForm.addEventListener('submit', e => { e.preventDefault(); this._submitHandoff(); });

    $.sat.querySelectorAll('.star-btn').forEach(b => b.addEventListener('click', () => this._selectStar(+b.dataset.r)));
    $.satSubmit.addEventListener('click', () => this._submitSat());
    $.satSkip.addEventListener('click', () => { $.sat.hidden = true; });

    $.fileInput.addEventListener('change', e => { if (e.target.files[0]) this._handleFile(e.target.files[0]); e.target.value=''; });
    $.input.addEventListener('paste', e => {
      const item = [...(e.clipboardData?.items||[])].find(i=>i.type.startsWith('image/'));
      if (item) this._handleFile(item.getAsFile());
    });

    // Footer chips delegation
    $.chips.addEventListener('click', e => {
      const btn = e.target.closest('[data-msg]');
      if (btn) this._sendUser(btn.dataset.msg);
    });

    document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.isStreaming) this._abort(); });
  }

  // ─── Voice ───────────────────────────────────────────────────────────────
  _initVoice() {
    this.voice = new VoiceEngine({
      lang: 'fi-FI', ttsLang: 'fi-FI', continuous: false, interimResults: true,
      silenceTimeout: 2200,

      onStart: () => {
        this.$['voiceOverlay'].hidden = false;
        this.$['mic'].classList.add('listening');
        this.$['voiceTrans'].textContent = '';
        this.$['voiceStat'].textContent = 'Kuuntelee...';
      },
      onEnd: () => {
        this.$['voiceOverlay'].hidden = true;
        this.$['mic'].classList.remove('listening');
      },
      onTranscript: (text, final) => {
        this.$['voiceTrans'].textContent = text;
        if (final && text.trim()) setTimeout(() => this._sendUser(text.trim()), 300);
      },
      onError: (code, msg) => {
        this.$['voiceOverlay'].hidden = true;
        this.$['mic'].classList.remove('listening');
        this._showSystem(msg, 'error');
      },
      onSpeakStart: () => { this.$['btnTts'].classList.add('speaking'); },
      onSpeakEnd:   () => { this.$['btnTts'].classList.remove('speaking'); },
      onVolumeChange: vol => { if (this.visualizer) this.visualizer.setVolume(vol); },
    });

    this.visualizer = new AudioVisualizer(this.$['voiceCanvas'], {
      color:'rgba(59,130,246,.35)', activeColor:'#60a5fa', barCount:22, barWidth:3,
    });
    this.$['btnTts'].classList.toggle('active', this.prefs.tts);
  }

  async _toggleVoice() {
    if (this.voice.isListening) { this._stopVoice(); return; }
    const ok = await this.voice.startListening();
    if (!ok) this._showSystem('Mikrofoni ei ole käytettävissä.', 'error');
  }
  _stopVoice() { this.voice.stopListening(); }

  // ─── Welcome / Session ───────────────────────────────────────────────────
  _showWelcome() {
    const el = document.createElement('div');
    el.className = 'welcome-card';
    el.innerHTML = `
      <div class="welcome-logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      </div>
      <h2>Hei! Olen Voon Assistentti 👋</h2>
      <p>Olen tekoälyavustettu asiakaspalvelija. Autan sinua tilausten, laskutuksen, teknisten ongelmien ja tilin hallinnan asioissa.</p>
      <div class="quick-categories">
        ${CATEGORIES.map(c=>`
          <button class="category-card" data-color="${c.color}" data-msg="${escHtml(c.msg)}" aria-label="${c.label}">
            <div class="category-icon">${c.icon}</div>
            <span class="category-label">${c.label}</span>
            <span class="category-desc">${c.desc}</span>
          </button>
        `).join('')}
      </div>`;

    el.querySelectorAll('.category-card').forEach(b => {
      b.addEventListener('click', () => {
        this.currentCtx = b.dataset.color === 'blue' ? 'order' :
                          b.dataset.color === 'purple' ? 'billing' :
                          b.dataset.color === 'cyan' ? 'tech' : 'default';
        this._sendUser(b.dataset.msg);
      });
    });

    this.$['inner'].appendChild(el);
    this._renderChips('default');
    this._scrollBottom();
  }

  _restoreSession() {
    try {
      const d = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (d?.messages?.length) {
        this.messages = d.messages;
        this.$['chips'].innerHTML = '';
        d.messages.forEach(m => {
          if (m.role === 'user') this._renderUser(m.content, m.id, m.ts);
          else if (m.role === 'assistant') this._renderBot(m.content, m.id, m.ts);
        });
        this._renderChips('default');
        this._scrollBottom();
      }
    } catch { /* ignore */ }
  }

  _saveSession() {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ messages: this.messages.slice(-MAX_HISTORY) })); } catch {}
  }

  _loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || { tts: false }; } catch { return { tts: false }; } }
  _savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch {} }

  _newChat() {
    this.messages = [];
    this.$['inner'].innerHTML = '';
    this.$['chips'].innerHTML = '';
    sessionStorage.removeItem(SESSION_KEY);
    this.$['handoff'].hidden = true;
    this.$['sat'].hidden = true;
    this._showWelcome();
  }

  // ─── Send / Stream ────────────────────────────────────────────────────────
  _handleSend() {
    const txt = this.$['input'].value.trim();
    if (!txt || this.isStreaming) return;
    this.$['input'].value = '';
    this.$['send'].disabled = true;
    this._autoResize(this.$['input']);
    this._sendUser(txt);
  }

  _sendUser(text) {
    if (this.isStreaming) return;
    // Hide welcome card
    const welcome = this.$['inner'].querySelector('.welcome-card');
    if (welcome) welcome.style.display = 'none';

    const id = genId(), ts = Date.now();
    this.messages.push({ role:'user', content:text, id, ts });
    this._renderUser(text, id, ts);
    this.$['chips'].innerHTML = '';
    this._saveSession();
    this._scrollBottom();
    this._streamBot();
  }

  async _streamBot() {
    this.isStreaming = true;
    this.abortCtrl = new AbortController();

    const typingEl = this._appendTyping();
    const history = this.messages.slice(-MAX_HISTORY).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    const botId = genId(), ts = Date.now();
    let full = '';
    let botEl = null;

    try {
      await sendMessage(
        history,
        chunk => {
          full += chunk;
          if (!botEl) {
            typingEl.remove();
            botEl = this._renderBot('', botId, ts, true);
          }
          const c = botEl.querySelector('.msg-content');
          if (c) c.innerHTML = '<p>' + md(full) + '</p>';
          this._scrollBottom();
        },
        finalText => {
          full = finalText;
          if (botEl) {
            const c = botEl.querySelector('.msg-content');
            if (c) c.innerHTML = '<p>' + md(full) + '</p>';
            const cursor = botEl.querySelector('.streaming-cursor');
            if (cursor) cursor.remove();
            botEl.classList.remove('streaming');
            this._addMsgActions(botEl, full);
          }
          this.messages.push({ role:'assistant', content:full, id:botId, ts });
          this._saveSession();

          if (this.prefs.tts && full) this.voice.speak(full);

          // Suggested replies after bot response
          this._renderChips(this.currentCtx);
          this._checkEscalation(full);
          this._scrollBottom();
        },
        this.abortCtrl.signal,
      );
    } catch(err) {
      typingEl?.remove();
      if (err.name !== 'AbortError') {
        let msg = 'Jokin meni pieleen. Yritä uudelleen.';
        if (err.message?.includes('503')) msg = 'Palvelu on tilapäisesti poissa käytöstä.';
        else if (err.message?.includes('Failed to fetch')) msg = 'Yhteysvirhe. Tarkista internet.';
        this._showSystem(msg, 'error');
        const retry = document.createElement('div');
        retry.className = 'retry-wrapper';
        retry.innerHTML = `<button class="btn btn-secondary btn-sm">↺ Yritä uudelleen</button>`;
        retry.querySelector('button').onclick = () => { retry.remove(); this._streamBot(); };
        this.$['inner'].appendChild(retry);
        this._scrollBottom();
      }
    } finally {
      this.isStreaming = false;
      this.abortCtrl = null;
    }
  }

  _abort() { this.abortCtrl?.abort(); }

  // ─── Rendering ────────────────────────────────────────────────────────────
  _renderUser(text, id, ts) {
    const el = document.createElement('div');
    el.className = 'msg msg-user'; el.dataset.id = id;
    el.innerHTML = `
      <div class="msg-bubble">
        <div class="msg-bubble-inner">
          <div class="msg-content"><p>${escHtml(text)}</p></div>
        </div>
        <div class="msg-meta">
          <time class="msg-time">${ftime(new Date(ts))}</time>
        </div>
      </div>`;
    this.$['inner'].appendChild(el);
    return el;
  }

  _renderBot(text, id, ts, streaming = false) {
    const el = document.createElement('div');
    el.className = 'msg msg-bot' + (streaming ? ' streaming' : ''); el.dataset.id = id;
    el.innerHTML = `
      <div class="bot-msg-avatar" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#1a2540"/><path d="M6 16c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="#60a5fa" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="11" r="1.5" fill="#60a5fa"/><circle cx="15" cy="11" r="1.5" fill="#60a5fa"/></svg>
      </div>
      <div class="msg-bubble">
        <div class="msg-bubble-inner">
          <div class="msg-content">${text ? '<p>'+md(text)+'</p>' : ''}${streaming ? '<span class="streaming-cursor" aria-hidden="true"></span>' : ''}</div>
        </div>
        <div class="msg-meta">
          <time class="msg-time">${ftime(new Date(ts))}</time>
        </div>
        ${!streaming ? '<div class="msg-actions"></div>' : ''}
      </div>`;
    this.$['inner'].appendChild(el);
    if (!streaming) this._addMsgActions(el, text);
    return el;
  }

  _appendTyping() {
    const el = document.createElement('div');
    el.className = 'msg msg-bot'; el.setAttribute('aria-label', 'Kirjoittaa...');
    el.innerHTML = `
      <div class="bot-msg-avatar" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#1a2540"/><path d="M6 16c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="#60a5fa" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="11" r="1.5" fill="#60a5fa"/><circle cx="15" cy="11" r="1.5" fill="#60a5fa"/></svg>
      </div>
      <div class="msg-bubble"><div class="msg-bubble-inner"><div class="typing-dots" aria-hidden="true"><span></span><span></span><span></span></div></div></div>`;
    this.$['inner'].appendChild(el);
    this._scrollBottom();
    return el;
  }

  _addMsgActions(msgEl, text) {
    const act = msgEl.querySelector('.msg-actions');
    if (!act || !text) return;
    act.innerHTML = `
      <button class="msg-action-btn" data-a="copy"  title="Kopioi" aria-label="Kopioi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
      <button class="msg-action-btn" data-a="speak" title="Lue ääneen" aria-label="Lue ääneen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg></button>
      <button class="msg-action-btn" data-a="up"    title="Hyödyllinen" aria-label="Hyödyllinen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg></button>
      <button class="msg-action-btn" data-a="down"  title="Ei hyödyllinen" aria-label="Ei hyödyllinen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg></button>`;
    act.addEventListener('click', e => {
      const btn = e.target.closest('[data-a]');
      if (!btn) return;
      if (btn.dataset.a === 'copy')  { navigator.clipboard.writeText(text).then(()=>{ btn.classList.add('active'); setTimeout(()=>btn.classList.remove('active'),2000); }); }
      if (btn.dataset.a === 'speak') { this.voice.isSpeaking ? this.voice.stopSpeaking() : this.voice.speak(text); btn.classList.toggle('active'); }
      if (btn.dataset.a === 'up')    btn.classList.toggle('active');
      if (btn.dataset.a === 'down')  btn.classList.toggle('active');
    });
  }

  _showSystem(text, type = 'info') {
    const el = document.createElement('div');
    el.className = `system-msg system-msg-${type}`; el.role = 'status'; el.textContent = text;
    this.$['inner'].appendChild(el);
    this._scrollBottom();
    if (type === 'info') setTimeout(() => el.remove(), 5000);
  }

  // ─── Suggested chips ──────────────────────────────────────────────────────
  _renderChips(ctx) {
    const replies = SUGGESTED_REPLIES[ctx] || SUGGESTED_REPLIES.default;
    this.$['chips'].innerHTML = replies.map((r, i) =>
      `<button class="footer-chip" data-msg="${escHtml(r.msg)}" style="animation-delay:${i*0.06}s">
        ${r.icon ? r.icon : ''}${r.label}
      </button>`
    ).join('');
  }

  // ─── Escalation ───────────────────────────────────────────────────────────
  _checkEscalation(text) {
    const kw = ['ihminen','virkailija','asiakaspalvelija','en halua chatbot','puhun ihmiselle'];
    if (kw.some(k => text.toLowerCase().includes(k))) {
      setTimeout(() => { this.$['handoff'].hidden = false; }, 600);
    }
  }

  // ─── Handoff ──────────────────────────────────────────────────────────────
  _submitHandoff() {
    const name  = this.root.querySelector('#hf-name').value.trim();
    const email = this.root.querySelector('#hf-email').value.trim();
    const msg   = this.root.querySelector('#hf-msg').value.trim();
    if (!name || !email) { this._showSystem('Täytä nimi ja sähköposti.', 'error'); return; }
    console.log('[voon handoff]', { name, email, msg });
    this.$['handoff'].hidden = true;
    const id = 1000 + Math.floor(Math.random()*9000);
    this._renderBot(`Tukipyyntösi **#${id}** on vastaanotettu. Otamme sinuun yhteyttä osoitteeseen **${email}** pian. Kiitos kärsivällisyydestäsi!`, genId(), Date.now());
    this._scrollBottom();
  }

  // ─── Satisfaction ─────────────────────────────────────────────────────────
  showSurvey() { this.$['sat'].hidden = false; }
  _selectStar(n) {
    this.$['sat'].querySelectorAll('.star-btn').forEach((b,i) => b.classList.toggle('selected', i < n));
    this.$['sat'].dataset.rating = n;
  }
  _submitSat() {
    const rating = +this.$['sat'].dataset.rating || 0;
    const comment = this.root.querySelector('#satisfaction-comment').value.trim();
    console.log('[voon satisfaction]', { rating, comment });
    this.$['sat'].hidden = true;
    this._showSystem('Kiitos palautteestasi! 🙏', 'info');
  }

  // ─── File upload ──────────────────────────────────────────────────────────
  _handleFile(file) {
    if (file.size > 10*1024*1024) { this._showSystem('Tiedosto on liian suuri (max 10 MB).','error'); return; }
    const allowed = ['image/jpeg','image/png','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(file.type)) { this._showSystem('Tiedostotyyppi ei ole tuettu.','error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const fp = this.$['filePreview'];
      fp.hidden = false;
      const isImg = file.type.startsWith('image/');
      fp.innerHTML = `<div class="file-preview-item">
        ${isImg ? `<img src="${e.target.result}" alt="${escHtml(file.name)}" class="file-preview-img">` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="36" height="36"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>`}
        <span class="file-name">${escHtml(file.name)}</span>
        <button class="file-remove" aria-label="Poista">×</button>
      </div>`;
      fp.querySelector('.file-remove').onclick = () => { fp.hidden = true; fp.innerHTML = ''; };
      this._sendUser(`[Liite: ${file.name}]`);
      fp.hidden = true; fp.innerHTML = '';
    };
    reader.readAsDataURL(file);
  }

  // ─── UI helpers ───────────────────────────────────────────────────────────
  _autoResize(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,140)+'px'; }
  _scrollBottom() { this.$['msgs'].scrollTo({ top:this.$['msgs'].scrollHeight, behavior:'smooth' }); }
  _toggleExpand() { this.isExp=!this.isExp; this.$['bot'].classList.toggle('expanded',this.isExp); }
  _toggleMin()    { this.isMin=!this.isMin; this.$['bot'].classList.toggle('minimized',this.isMin); }

  send(text) { this._sendUser(text); }
  destroy()  { this.voice?.destroy(); this.visualizer?.destroy(); this.root.innerHTML=''; }
}
