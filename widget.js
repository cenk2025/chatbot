/**
 * Voon.fi Chatbot — Embeddable Widget
 *
 * Upota mille tahansa sivustolle lisäämällä tämä koodi <body> loppuun:
 *
 *   <script>
 *     window.VOON_CHATBOT_CONFIG = {
 *       systemPrompt: 'Olet Voon.fi:n asiakaspalveluassistentti...',
 *     };
 *   </script>
 *   <script src="https://your-vercel-domain.vercel.app/widget.js" async></script>
 *
 *   API-avain asetetaan Vercel Dashboard → Settings → Environment Variables → GOOGLE_API_KEY
 */

(function () {
  'use strict';

  const BASE_URL = (function () {
    const scripts = document.getElementsByTagName('script');
    const current = scripts[scripts.length - 1];
    return current.src.replace(/\/[^/]+$/, '');
  })();

  function injectStyles() {
    if (document.querySelector('#voon-chatbot-styles')) return;
    const link = document.createElement('link');
    link.id = 'voon-chatbot-styles';
    link.rel = 'stylesheet';
    link.href = BASE_URL + '/styles/chatbot.css';
    document.head.appendChild(link);
  }

  function createWidgetMarkup() {
    // Launcher button
    const launcher = document.createElement('div');
    launcher.className = 'voon-widget-launcher';
    launcher.innerHTML = `
      <button class="launcher-btn" id="voon-launcher-btn" aria-label="Avaa asiakaspalvelu chat" title="Voon Asiakaspalvelu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
      </button>
    `;

    // Chat container
    const container = document.createElement('div');
    container.className = 'voon-widget-container';
    container.id = 'voon-widget-container';
    container.hidden = true;
    container.innerHTML = `<div id="voon-chatbot-root"></div>`;

    document.body.appendChild(launcher);
    document.body.appendChild(container);

    return { launcher, container };
  }

  async function init() {
    injectStyles();
    const { launcher, container } = createWidgetMarkup();
    const launcherBtn = launcher.querySelector('#voon-launcher-btn');
    let chatbot = null;
    let isOpen = false;

    async function openChat() {
      if (!chatbot) {
        // Lazy-load chatbot module
        try {
          const { VoonChatbot } = await import(BASE_URL + '/scripts/chatbot.js');
          chatbot = new VoonChatbot('#voon-chatbot-root');
          window.VoonChat = chatbot;
        } catch (err) {
          console.error('[Voon Chatbot] Failed to load:', err);
          return;
        }
      }

      isOpen = true;
      container.hidden = false;
      launcherBtn.setAttribute('aria-expanded', 'true');
      launcherBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      `;
    }

    function closeChat() {
      isOpen = false;
      container.hidden = true;
      launcherBtn.setAttribute('aria-expanded', 'false');
      launcherBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
      `;
    }

    launcherBtn.addEventListener('click', () => {
      if (isOpen) closeChat(); else openChat();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) closeChat();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (isOpen && !container.contains(e.target) && !launcher.contains(e.target)) {
        closeChat();
      }
    });

    // Public API
    window.VoonChatWidget = {
      open: openChat,
      close: closeChat,
      toggle: () => isOpen ? closeChat() : openChat(),
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
