/**
 * Voon.fi Chatbot — Core Logic
 * Handles: conversation state, message rendering, UI events, session management
 */

import { sendMessage } from './api.js';
import { VoiceEngine, AudioVisualizer } from './voice.js';
import { fi as t } from './i18n.js';

// ─── Constants ─────────────────────────────────────────────────────────────

const MAX_HISTORY = 40;
const SESSION_KEY = 'voon_chat_session';
const PREFS_KEY = 'voon_chat_prefs';

const QUICK_ACTIONS = [
  { key: 'order_status', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>`, label: t.quick_actions.order_status },
  { key: 'billing', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>`, label: t.quick_actions.billing },
  { key: 'technical', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M20 12h-2M19.07 19.07l-1.41-1.41M12 20v-2M4.93 19.07l1.41-1.41M4 12H2M4.93 4.93l1.41 1.41"/></svg>`, label: t.quick_actions.technical },
  { key: 'account', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`, label: t.quick_actions.account },
];

const QUICK_MESSAGES = {
  order_status: 'Haluaisin tarkistaa tilauksen tilan.',
  billing: 'Minulla on kysymys laskutuksesta tai maksamisesta.',
  technical: 'Minulla on tekninen ongelma, tarvitsen apua.',
  account: 'Haluaisin hallita tiliäni.',
};

// ─── Markdown → HTML ───────────────────────────────────────────────────────

function renderMarkdown(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>')
    .replace(/^[\-*+]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

// ─── Time formatting ────────────────────────────────────────────────────────

function formatTime(date) {
  return date.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return t.time.just_now;
  if (diff < 3600000) return t.time.minutes_ago.replace('{n}', Math.floor(diff / 60000));
  if (diff < 7200000) return t.time.hour_ago;
  return t.time.hours_ago.replace('{n}', Math.floor(diff / 3600000));
}

// ─── VoonChatbot ───────────────────────────────────────────────────────────

export class VoonChatbot {
  constructor(rootEl) {
    this.root = typeof rootEl === 'string' ? document.querySelector(rootEl) : rootEl;
    if (!this.root) throw new Error('Chatbot root element not found');

    this.messages = [];      // { role, content, id, timestamp, status }
    this.isStreaming = false;
    this.abortController = null;
    this.voiceEngine = null;
    this.visualizer = null;
    this.prefs = this._loadPrefs();
    this.isMinimized = false;
    this.isExpanded = false;
    this.unreadCount = 0;
    this.ticketCounter = 1000;

    this._render();
    this._bindEvents();
    this._initVoice();
    this._restoreSession();
    this._showWelcome();
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  _render() {
    this.root.innerHTML = `
    <div class="voon-chatbot" id="voon-chatbot" role="dialog" aria-label="Voon.fi asiakaspalveluchat" aria-modal="true">

      <!-- Header -->
      <header class="chat-header">
        <div class="chat-header-left">
          <div class="bot-avatar" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="16" fill="#0F172A"/>
              <path d="M8 20c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="#22d3ee" stroke-width="2" stroke-linecap="round"/>
              <circle cx="12" cy="14" r="1.5" fill="#22d3ee"/>
              <circle cx="20" cy="14" r="1.5" fill="#22d3ee"/>
              <rect x="13" y="7" width="6" height="3" rx="1.5" fill="#0369A1"/>
              <line x1="16" y1="7" x2="16" y2="5" stroke="#0369A1" stroke-width="1.5" stroke-linecap="round"/>
              <circle cx="16" cy="4.5" r="1" fill="#22d3ee"/>
            </svg>
          </div>
          <div class="chat-header-info">
            <h1 class="chat-title">${t.header.title}</h1>
            <div class="chat-status">
              <span class="status-dot" id="status-dot" aria-hidden="true"></span>
              <span class="status-text" id="status-text">${t.header.status_online}</span>
            </div>
          </div>
        </div>
        <div class="chat-header-actions">
          <button class="icon-btn" id="btn-voice-toggle" aria-label="${t.voice.voice_enabled}" title="${t.voice.voice_enabled}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>
          </button>
          <button class="icon-btn" id="btn-new-chat" aria-label="${t.buttons.new_chat}" title="${t.buttons.new_chat}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <button class="icon-btn" id="btn-expand" aria-label="${t.buttons.expand}" title="${t.buttons.expand}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
          </button>
          <button class="icon-btn" id="btn-minimize" aria-label="${t.buttons.minimize}" title="${t.buttons.minimize}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>
          </button>
        </div>
      </header>

      <!-- Messages -->
      <main class="chat-messages" id="chat-messages" role="log" aria-live="polite" aria-label="Viestihistoria">
        <div class="messages-inner" id="messages-inner"></div>
      </main>

      <!-- Voice overlay -->
      <div class="voice-overlay" id="voice-overlay" hidden aria-hidden="true">
        <canvas class="voice-visualizer" id="voice-canvas" width="200" height="60" aria-hidden="true"></canvas>
        <p class="voice-status" id="voice-status-text">${t.voice.listening}</p>
        <button class="btn-voice-cancel" id="btn-voice-cancel">${t.buttons.close}</button>
      </div>

      <!-- Agent handoff panel -->
      <div class="handoff-panel" id="handoff-panel" hidden>
        <div class="handoff-inner">
          <svg class="handoff-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          <h2>${t.handoff.title}</h2>
          <p id="handoff-message">${t.handoff.leave_message}</p>
          <form class="handoff-form" id="handoff-form" novalidate>
            <div class="form-group">
              <label for="handoff-name" class="form-label">Nimi</label>
              <input type="text" id="handoff-name" class="form-input" placeholder="${t.handoff.name_placeholder}" autocomplete="name" required>
            </div>
            <div class="form-group">
              <label for="handoff-email" class="form-label">Sähköposti</label>
              <input type="email" id="handoff-email" class="form-input" placeholder="${t.handoff.email_placeholder}" autocomplete="email" required>
            </div>
            <div class="form-group">
              <label for="handoff-msg" class="form-label">Viesti</label>
              <textarea id="handoff-msg" class="form-input form-textarea" rows="3" placeholder="Kuvaile ongelmaasi..."></textarea>
            </div>
            <div class="handoff-actions">
              <button type="button" class="btn btn-secondary" id="btn-handoff-cancel">${t.handoff.cancel}</button>
              <button type="submit" class="btn btn-primary">${t.handoff.submit}</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Satisfaction panel -->
      <div class="satisfaction-panel" id="satisfaction-panel" hidden>
        <p class="satisfaction-question">${t.satisfaction.question}</p>
        <div class="satisfaction-stars" role="group" aria-label="Arvio">
          ${[1,2,3,4,5].map(n => `
            <button class="star-btn" data-rating="${n}" aria-label="${n} tähteä" title="${[t.satisfaction.terrible,t.satisfaction.bad,t.satisfaction.ok,t.satisfaction.good,t.satisfaction.excellent][n-1]}">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            </button>
          `).join('')}
        </div>
        <textarea class="form-input form-textarea satisfaction-comment" id="satisfaction-comment" placeholder="${t.satisfaction.comment_placeholder}" rows="2"></textarea>
        <button class="btn btn-primary satisfaction-submit" id="btn-satisfaction-submit">${t.satisfaction.submit}</button>
      </div>

      <!-- Input area -->
      <footer class="chat-footer">
        <!-- Quick actions (shown only at start) -->
        <div class="quick-actions" id="quick-actions" aria-label="Pikavalinnat">
          ${QUICK_ACTIONS.map(a => `
            <button class="quick-action-btn" data-action="${a.key}" aria-label="${a.label}">
              <span class="quick-action-icon" aria-hidden="true">${a.icon}</span>
              <span>${a.label}</span>
            </button>
          `).join('')}
        </div>

        <!-- File preview -->
        <div class="file-preview" id="file-preview" hidden></div>

        <!-- Input row -->
        <div class="input-row">
          <label class="icon-btn" for="file-input" aria-label="${t.input.attach}" title="${t.input.attach}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            <input type="file" id="file-input" accept=".jpg,.jpeg,.png,.pdf,.doc,.docx" aria-label="${t.input.attach}" hidden>
          </label>

          <div class="input-wrapper">
            <textarea
              class="chat-input"
              id="chat-input"
              placeholder="${t.input.placeholder}"
              rows="1"
              aria-label="Kirjoita viesti"
              aria-multiline="true"
              autocomplete="off"
              autocorrect="on"
              spellcheck="true"
            ></textarea>
          </div>

          <button class="icon-btn mic-btn" id="btn-mic" aria-label="${t.input.voice_start}" title="${t.input.voice_start}">
            <svg class="mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>
          </button>

          <button class="btn-send" id="btn-send" aria-label="${t.input.send}" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          </button>
        </div>

        <p class="chat-disclaimer">Voon asiakaspalvelu · AI-avustettu · <a href="https://voon.fi/tietosuoja" target="_blank" rel="noopener">Tietosuoja</a></p>
      </footer>

    </div>
    `;

    // Cache DOM refs
    this.dom = {
      chatbot: this.root.querySelector('#voon-chatbot'),
      messagesEl: this.root.querySelector('#chat-messages'),
      messagesInner: this.root.querySelector('#messages-inner'),
      inputEl: this.root.querySelector('#chat-input'),
      sendBtn: this.root.querySelector('#btn-send'),
      micBtn: this.root.querySelector('#btn-mic'),
      newChatBtn: this.root.querySelector('#btn-new-chat'),
      expandBtn: this.root.querySelector('#btn-expand'),
      minimizeBtn: this.root.querySelector('#btn-minimize'),
      voiceToggleBtn: this.root.querySelector('#btn-voice-toggle'),
      voiceOverlay: this.root.querySelector('#voice-overlay'),
      voiceCanvas: this.root.querySelector('#voice-canvas'),
      voiceStatusText: this.root.querySelector('#voice-status-text'),
      voiceCancelBtn: this.root.querySelector('#btn-voice-cancel'),
      quickActions: this.root.querySelector('#quick-actions'),
      handoffPanel: this.root.querySelector('#handoff-panel'),
      handoffForm: this.root.querySelector('#handoff-form'),
      handoffCancelBtn: this.root.querySelector('#btn-handoff-cancel'),
      satisfactionPanel: this.root.querySelector('#satisfaction-panel'),
      satisfactionSubmitBtn: this.root.querySelector('#btn-satisfaction-submit'),
      statusDot: this.root.querySelector('#status-dot'),
      statusText: this.root.querySelector('#status-text'),
      fileInput: this.root.querySelector('#file-input'),
      filePreview: this.root.querySelector('#file-preview'),
    };
  }

  // ─── Events ──────────────────────────────────────────────────────────────

  _bindEvents() {
    const { dom } = this;

    // Send button
    dom.sendBtn.addEventListener('click', () => this._handleSend());

    // Input auto-resize & enable send
    dom.inputEl.addEventListener('input', () => {
      this._autoResize(dom.inputEl);
      dom.sendBtn.disabled = !dom.inputEl.value.trim();
    });

    // Enter to send (Shift+Enter = newline)
    dom.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!dom.sendBtn.disabled) this._handleSend();
      }
    });

    // Voice mic
    dom.micBtn.addEventListener('click', () => this._toggleVoiceInput());
    dom.voiceCancelBtn.addEventListener('click', () => this._stopVoiceInput());

    // Voice TTS toggle
    dom.voiceToggleBtn.addEventListener('click', () => {
      this.prefs.ttsEnabled = !this.prefs.ttsEnabled;
      this._savePrefs();
      dom.voiceToggleBtn.classList.toggle('active', this.prefs.ttsEnabled);
      dom.voiceToggleBtn.title = this.prefs.ttsEnabled ? t.voice.voice_enabled : t.voice.voice_disabled;
      dom.voiceToggleBtn.setAttribute('aria-label', dom.voiceToggleBtn.title);
    });

    // New chat
    dom.newChatBtn.addEventListener('click', () => this._confirmNewChat());

    // Expand / minimize
    dom.expandBtn.addEventListener('click', () => this._toggleExpand());
    dom.minimizeBtn.addEventListener('click', () => this._toggleMinimize());

    // Quick actions
    dom.quickActions.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) {
        const msg = QUICK_MESSAGES[btn.dataset.action];
        if (msg) this._sendUserMessage(msg);
      }
    });

    // Handoff form
    dom.handoffCancelBtn.addEventListener('click', () => this._hideHandoff());
    dom.handoffForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this._submitHandoff();
    });

    // Satisfaction stars
    dom.satisfactionPanel.querySelectorAll('.star-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const rating = parseInt(btn.dataset.rating);
        this._selectRating(rating);
      });
    });
    dom.satisfactionSubmitBtn.addEventListener('click', () => this._submitSatisfaction());

    // File upload
    dom.fileInput.addEventListener('change', (e) => this._handleFileUpload(e));

    // Stop streaming on ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isStreaming) {
        this._abortStream();
      }
    });

    // Paste image support
    dom.inputEl.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) this._processFile(file);
        }
      }
    });
  }

  // ─── Voice init ──────────────────────────────────────────────────────────

  _initVoice() {
    this.voiceEngine = new VoiceEngine({
      lang: 'fi-FI',
      ttsLang: 'fi-FI',
      continuous: false,
      interimResults: true,

      onStart: () => {
        this._showVoiceOverlay();
        this.dom.micBtn.classList.add('listening');
        this.dom.inputEl.placeholder = t.input.placeholder_voice;
      },

      onEnd: () => {
        this._hideVoiceOverlay();
        this.dom.micBtn.classList.remove('listening');
        this.dom.inputEl.placeholder = t.input.placeholder;
      },

      onTranscript: (text, isFinal) => {
        this.dom.inputEl.value = text;
        this._autoResize(this.dom.inputEl);
        this.dom.sendBtn.disabled = !text.trim();
        if (isFinal && text.trim()) {
          setTimeout(() => this._handleSend(), 300);
        }
      },

      onFinalTranscript: (text) => {
        this.dom.voiceStatusText.textContent = text;
      },

      onError: (code, msg) => {
        this._hideVoiceOverlay();
        this.dom.micBtn.classList.remove('listening');
        this._showSystemMessage(msg, 'error');
      },

      onSpeakStart: () => {
        this.dom.voiceToggleBtn.classList.add('speaking');
      },

      onSpeakEnd: () => {
        this.dom.voiceToggleBtn.classList.remove('speaking');
      },

      onVolumeChange: (vol) => {
        if (this.visualizer) this.visualizer.setVolume(vol);
      },
    });

    // Init visualizer
    this.visualizer = new AudioVisualizer(this.dom.voiceCanvas, {
      color: 'rgba(3,105,161,0.4)',
      activeColor: '#22d3ee',
    });

    // Apply TTS pref
    this.dom.voiceToggleBtn.classList.toggle('active', this.prefs.ttsEnabled);
  }

  // ─── Session & Welcome ───────────────────────────────────────────────────

  _showWelcome() {
    if (this.messages.length === 0) {
      this._appendBotMessage(
        `**${t.welcome.greeting}**\n\n${t.welcome.intro}`,
        { isWelcome: true }
      );
    }
  }

  _restoreSession() {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.messages?.length) {
          this.messages = data.messages;
          this.dom.quickActions.hidden = true;
          data.messages.forEach(msg => {
            if (msg.role === 'user') {
              this._renderUserMessage(msg.content, msg.id, msg.timestamp);
            } else if (msg.role === 'assistant') {
              this._renderBotMessage(msg.content, msg.id, msg.timestamp);
            }
          });
          this._scrollToBottom();
        }
      }
    } catch { /* ignore */ }
  }

  _saveSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ messages: this.messages.slice(-MAX_HISTORY) }));
    } catch { /* ignore */ }
  }

  _loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY)) || { ttsEnabled: false };
    } catch { return { ttsEnabled: false }; }
  }

  _savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* ignore */ }
  }

  // ─── Send / Receive ──────────────────────────────────────────────────────

  async _handleSend() {
    const text = this.dom.inputEl.value.trim();
    if (!text || this.isStreaming) return;

    this._sendUserMessage(text);
  }

  _sendUserMessage(text) {
    if (this.isStreaming) return;

    // Clear input
    this.dom.inputEl.value = '';
    this.dom.sendBtn.disabled = true;
    this._autoResize(this.dom.inputEl);

    // Hide quick actions
    this.dom.quickActions.hidden = true;

    // Add to history
    const msgId = this._genId();
    const timestamp = Date.now();
    this.messages.push({ role: 'user', content: text, id: msgId, timestamp });
    this._renderUserMessage(text, msgId, timestamp);
    this._saveSession();

    // Scroll
    this._scrollToBottom();

    // AI response
    this._streamBotResponse();
  }

  async _streamBotResponse() {
    this.isStreaming = true;
    this.abortController = new AbortController();

    const botId = this._genId();
    const timestamp = Date.now();

    // Add typing indicator
    const typingEl = this._appendTypingIndicator();

    // Prepare history for API (last N messages)
    const history = this.messages.slice(-MAX_HISTORY).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    let fullText = '';
    let botMsgEl = null;

    try {
      await sendMessage(
        history,
        (chunk) => {
          fullText += chunk;
          if (!botMsgEl) {
            typingEl.remove();
            botMsgEl = this._renderBotMessage('', botId, timestamp, true);
          }
          const contentEl = botMsgEl.querySelector('.msg-content');
          if (contentEl) {
            contentEl.innerHTML = '<p>' + renderMarkdown(fullText) + '</p>';
          }
          this._scrollToBottom();
        },
        (full) => {
          fullText = full;
          // Finalize
          if (botMsgEl) {
            const contentEl = botMsgEl.querySelector('.msg-content');
            if (contentEl) {
              contentEl.innerHTML = '<p>' + renderMarkdown(full) + '</p>';
            }
            botMsgEl.classList.remove('streaming');
            this._addMessageActions(botMsgEl, full);
          }
          this.messages.push({ role: 'assistant', content: full, id: botId, timestamp });
          this._saveSession();

          // TTS
          if (this.prefs.ttsEnabled && full) {
            this.voiceEngine.speak(full);
          }

          this._checkEscalation(full);
          this._scrollToBottom();
        },
        this.abortController.signal,
      );
    } catch (err) {
      typingEl?.remove();
      if (err.name !== 'AbortError') {
        let errMsg = t.states.error_generic;
        if (err.message === 'API_KEY_MISSING') {
          errMsg = 'API-avain puuttuu. Aseta VOON_CHATBOT_CONFIG.apiKey.';
        } else if (err.message?.includes('API_ERROR')) {
          errMsg = t.states.error_api;
        } else if (err.message?.includes('Failed to fetch')) {
          errMsg = t.states.error_network;
        }
        this._showSystemMessage(errMsg, 'error');
        // Add retry option
        this._appendRetryButton(() => this._streamBotResponse());
      }
    } finally {
      this.isStreaming = false;
      this.abortController = null;
    }
  }

  _abortStream() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  // ─── Message Rendering ───────────────────────────────────────────────────

  _renderUserMessage(text, id, timestamp) {
    const el = document.createElement('div');
    el.className = 'msg msg-user';
    el.dataset.id = id;
    el.innerHTML = `
      <div class="msg-bubble">
        <div class="msg-content"><p>${this._escapeHtml(text)}</p></div>
        <time class="msg-time" datetime="${new Date(timestamp).toISOString()}">${formatTime(new Date(timestamp))}</time>
      </div>
    `;
    this.dom.messagesInner.appendChild(el);
    return el;
  }

  _renderBotMessage(text, id, timestamp, streaming = false) {
    const el = document.createElement('div');
    el.className = 'msg msg-bot' + (streaming ? ' streaming' : '');
    el.dataset.id = id;
    el.innerHTML = `
      <div class="bot-msg-avatar" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#0F172A"/><path d="M6 15c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="#22d3ee" stroke-width="1.5" stroke-linecap="round"/><circle cx="9" cy="10.5" r="1.2" fill="#22d3ee"/><circle cx="15" cy="10.5" r="1.2" fill="#22d3ee"/></svg>
      </div>
      <div class="msg-bubble">
        <div class="msg-content">${text ? '<p>' + renderMarkdown(text) + '</p>' : ''}</div>
        ${streaming ? '<div class="streaming-cursor" aria-hidden="true"></div>' : ''}
        <time class="msg-time" datetime="${new Date(timestamp).toISOString()}">${formatTime(new Date(timestamp))}</time>
        ${!streaming ? `<div class="msg-actions" aria-label="Viestin toiminnot"></div>` : ''}
      </div>
    `;
    this.dom.messagesInner.appendChild(el);
    if (!streaming) this._addMessageActions(el, text);
    return el;
  }

  _appendBotMessage(text, opts = {}) {
    const id = this._genId();
    const timestamp = Date.now();
    const el = this._renderBotMessage(text, id, timestamp);
    if (!opts.isWelcome) {
      this.messages.push({ role: 'assistant', content: text, id, timestamp });
      this._saveSession();
    }
    this._scrollToBottom();
    return el;
  }

  _appendTypingIndicator() {
    const el = document.createElement('div');
    el.className = 'msg msg-bot msg-typing';
    el.setAttribute('aria-label', t.states.typing);
    el.innerHTML = `
      <div class="bot-msg-avatar" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#0F172A"/><path d="M6 15c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="#22d3ee" stroke-width="1.5" stroke-linecap="round"/><circle cx="9" cy="10.5" r="1.2" fill="#22d3ee"/><circle cx="15" cy="10.5" r="1.2" fill="#22d3ee"/></svg>
      </div>
      <div class="msg-bubble">
        <div class="typing-dots" aria-hidden="true"><span></span><span></span><span></span></div>
      </div>
    `;
    this.dom.messagesInner.appendChild(el);
    this._scrollToBottom();
    return el;
  }

  _addMessageActions(msgEl, text) {
    const actionsEl = msgEl.querySelector('.msg-actions');
    if (!actionsEl || !text) return;

    actionsEl.innerHTML = `
      <button class="msg-action-btn" data-action="copy" aria-label="${t.buttons.copy}" title="${t.buttons.copy}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      </button>
      <button class="msg-action-btn" data-action="speak" aria-label="${t.voice.read_aloud}" title="${t.voice.read_aloud}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
      </button>
      <button class="msg-action-btn" data-action="thumbup" aria-label="${t.buttons.thumbs_up}" title="${t.buttons.thumbs_up}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
      </button>
      <button class="msg-action-btn" data-action="thumbdown" aria-label="${t.buttons.thumbs_down}" title="${t.buttons.thumbs_down}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg>
      </button>
    `;

    actionsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      switch (btn.dataset.action) {
        case 'copy': this._copyText(text, btn); break;
        case 'speak': this._speakMessage(text, btn); break;
        case 'thumbup': this._reactMessage(btn, 'up'); break;
        case 'thumbdown': this._reactMessage(btn, 'down'); break;
      }
    });
  }

  _showSystemMessage(text, type = 'info') {
    const el = document.createElement('div');
    el.className = `system-msg system-msg-${type}`;
    el.setAttribute('role', 'status');
    el.textContent = text;
    this.dom.messagesInner.appendChild(el);
    this._scrollToBottom();
    if (type === 'info') {
      setTimeout(() => el.remove(), 5000);
    }
  }

  _appendRetryButton(onRetry) {
    const el = document.createElement('div');
    el.className = 'retry-wrapper';
    el.innerHTML = `<button class="btn btn-secondary btn-sm">${t.buttons.retry}</button>`;
    el.querySelector('button').addEventListener('click', () => {
      el.remove();
      onRetry();
    });
    this.dom.messagesInner.appendChild(el);
    this._scrollToBottom();
  }

  // ─── Message Actions ─────────────────────────────────────────────────────

  _copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      btn.classList.add('active');
      setTimeout(() => btn.classList.remove('active'), 2000);
      this._showSystemMessage(t.notifications.copied, 'info');
    }).catch(() => {});
  }

  _speakMessage(text, btn) {
    if (this.voiceEngine.isSpeaking) {
      this.voiceEngine.stopSpeaking();
      btn.classList.remove('active');
    } else {
      this.voiceEngine.speak(text);
      btn.classList.add('active');
      this.voiceEngine.options.onSpeakEnd = () => btn.classList.remove('active');
    }
  }

  _reactMessage(btn, type) {
    btn.classList.toggle('active');
  }

  // ─── Voice Input ─────────────────────────────────────────────────────────

  async _toggleVoiceInput() {
    if (this.voiceEngine.isListening) {
      this._stopVoiceInput();
    } else {
      const started = await this.voiceEngine.startListening();
      if (!started) {
        this._showSystemMessage(t.voice.error_no_mic, 'error');
      }
    }
  }

  _stopVoiceInput() {
    this.voiceEngine.stopListening();
  }

  _showVoiceOverlay() {
    this.dom.voiceOverlay.hidden = false;
    this.dom.voiceOverlay.removeAttribute('aria-hidden');
    this.dom.voiceStatusText.textContent = t.voice.speak_now;
  }

  _hideVoiceOverlay() {
    this.dom.voiceOverlay.hidden = true;
    this.dom.voiceOverlay.setAttribute('aria-hidden', 'true');
  }

  // ─── Escalation / Handoff ─────────────────────────────────────────────────

  _checkEscalation(text) {
    const keywords = ['ihminen', 'virkailija', 'asiakaspalvelija', 'puhun ihmiselle', 'en halua puhua botin kanssa', 'agentti'];
    const lower = text.toLowerCase();
    if (keywords.some(k => lower.includes(k))) {
      setTimeout(() => this._showHandoff(), 800);
    }
  }

  _showHandoff() {
    this.dom.handoffPanel.hidden = false;
    this.dom.handoffPanel.querySelector('input')?.focus();
  }

  _hideHandoff() {
    this.dom.handoffPanel.hidden = true;
  }

  _submitHandoff() {
    const name = this.root.querySelector('#handoff-name').value.trim();
    const email = this.root.querySelector('#handoff-email').value.trim();
    const msg = this.root.querySelector('#handoff-msg').value.trim();

    if (!name || !email) {
      this._showSystemMessage('Täytä nimi ja sähköposti.', 'error');
      return;
    }

    // In production: POST to your backend
    console.log('Handoff request:', { name, email, msg, history: this.messages });

    this._hideHandoff();
    const ticketId = ++this.ticketCounter;
    this._showSystemMessage(`${t.ticket.created.replace('{id}', ticketId)} ${t.ticket.followup}`, 'info');
    this._appendBotMessage(`Tukipyyntösi (#${ticketId}) on vastaanotettu. Otamme sinuun yhteyttä sähköpostiosoitteeseen **${email}** mahdollisimman pian. Kiitos kärsivällisyydestäsi!`);
  }

  // ─── Satisfaction ─────────────────────────────────────────────────────────

  showSatisfactionPanel() {
    this.dom.satisfactionPanel.hidden = false;
  }

  _selectRating(rating) {
    this.dom.satisfactionPanel.querySelectorAll('.star-btn').forEach((btn, i) => {
      btn.classList.toggle('selected', i < rating);
    });
    this.dom.satisfactionPanel.dataset.rating = rating;
  }

  _submitSatisfaction() {
    const rating = parseInt(this.dom.satisfactionPanel.dataset.rating || 0);
    const comment = this.root.querySelector('#satisfaction-comment').value.trim();

    // In production: POST to your backend
    console.log('Satisfaction:', { rating, comment });

    this.dom.satisfactionPanel.hidden = true;
    this._showSystemMessage(t.satisfaction.submitted, 'info');
  }

  // ─── File Upload ─────────────────────────────────────────────────────────

  _handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (file) this._processFile(file);
    e.target.value = '';
  }

  _processFile(file) {
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      this._showSystemMessage(t.upload.error_size, 'error');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      this._showSystemMessage(t.upload.error_type, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = this.dom.filePreview;
      preview.hidden = false;
      const isImage = file.type.startsWith('image/');
      preview.innerHTML = `
        <div class="file-preview-item">
          ${isImage ? `<img src="${e.target.result}" alt="${this._escapeHtml(file.name)}" class="file-preview-img">` :
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>`}
          <span class="file-name">${this._escapeHtml(file.name)}</span>
          <button class="file-remove" aria-label="Poista liite">&times;</button>
        </div>
      `;
      preview.querySelector('.file-remove').addEventListener('click', () => {
        preview.hidden = true;
        preview.innerHTML = '';
      });

      // Send as user message with attachment info
      this._sendUserMessage(`[Liite: ${file.name}]`);
      preview.hidden = true;
      preview.innerHTML = '';
    };
    reader.readAsDataURL(file);
  }

  // ─── UI Helpers ───────────────────────────────────────────────────────────

  _autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  _scrollToBottom() {
    const el = this.dom.messagesEl;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }

  _toggleExpand() {
    this.isExpanded = !this.isExpanded;
    this.dom.chatbot.classList.toggle('expanded', this.isExpanded);
    const icon = this.dom.expandBtn;
    icon.title = this.isExpanded ? t.buttons.minimize : t.buttons.expand;
    icon.setAttribute('aria-label', icon.title);
  }

  _toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    this.dom.chatbot.classList.toggle('minimized', this.isMinimized);
    this.dom.minimizeBtn.setAttribute('aria-label', this.isMinimized ? 'Avaa chat' : t.buttons.minimize);
    if (!this.isMinimized) this.unreadCount = 0;
  }

  _confirmNewChat() {
    if (this.messages.length === 0) return;
    if (confirm('Aloitetaanko uusi keskustelu? Nykyinen historia poistetaan.')) {
      this._newChat();
    }
  }

  _newChat() {
    this.messages = [];
    this.dom.messagesInner.innerHTML = '';
    this.dom.quickActions.hidden = false;
    sessionStorage.removeItem(SESSION_KEY);
    this._showWelcome();
    this.dom.satisfactionPanel.hidden = true;
    this.dom.handoffPanel.hidden = true;
  }

  _genId() {
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Programmatically send a message */
  send(text) { this._sendUserMessage(text); }

  /** Show handoff panel */
  requestHuman() { this._showHandoff(); }

  /** Show satisfaction survey */
  showSurvey() { this.showSatisfactionPanel(); }

  /** Update API config at runtime */
  setConfig(config) {
    window.VOON_CHATBOT_CONFIG = { ...(window.VOON_CHATBOT_CONFIG || {}), ...config };
  }

  /** Destroy instance */
  destroy() {
    this.voiceEngine?.destroy();
    this.visualizer?.destroy();
    this.root.innerHTML = '';
  }
}
