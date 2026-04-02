(() => {
  function normalizeBaseUrl(value) {
    return typeof value === 'string' ? value.trim().replace(/\/$/, '') : '';
  }

  function buildUrl(baseUrl, pathname, query) {
    const url = new URL(`${baseUrl}${pathname}`);

    Object.entries(query || {}).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim()) {
        url.searchParams.set(key, value.trim());
      }
    });

    return url.toString();
  }

  function createBubble(text, role) {
    const bubble = document.createElement('div');
    bubble.className = `store-reply-bubble ${
      role === 'customer' ? 'store-reply-bubble-customer' : 'store-reply-bubble-agent'
    }`;
    bubble.textContent = text;
    return bubble;
  }

  async function safeJson(response) {
    const text = await response.text();

    try {
      return text ? JSON.parse(text) : {};
    } catch (error) {
      return {
        error: text || 'The widget received an invalid response.',
      };
    }
  }

  function initializeWidget(root) {
    const launcher = root.querySelector('.store-reply-launcher');
    const panel = root.querySelector('.store-reply-panel');
    const closeButton = root.querySelector('.store-reply-close');
    const form = root.querySelector('.store-reply-input-row');
    const input = root.querySelector('.store-reply-input');
    const thread = root.querySelector('.store-reply-thread');
    const status = root.querySelector('.store-reply-status');
    const title = root.querySelector('.store-reply-title');
    const subtitle = root.querySelector('.store-reply-subtitle');

    if (!launcher || !panel || !closeButton || !form || !input || !thread || !status || !title || !subtitle) {
      return;
    }

    const accentColor = root.dataset.accentColor;
    const shopDomain = root.dataset.shopDomain || '';
    const backendUrl = normalizeBaseUrl(root.dataset.backendUrl);
    const backendHeaders = {
      'ngrok-skip-browser-warning': 'true',
    };

    if (accentColor) {
      root.style.setProperty('--store-reply-accent', accentColor);
    }

    function openPanel() {
      panel.hidden = false;
      launcher.hidden = true;
      input.focus();
    }

    function closePanel() {
      panel.hidden = true;
      launcher.hidden = false;
      hideStatus();
    }

    function showStatus(message, type) {
      status.hidden = false;
      status.className = `store-reply-status store-reply-status-${type || 'info'}`;
      status.textContent = message;
    }

    function hideStatus() {
      status.hidden = true;
      status.textContent = '';
      status.className = 'store-reply-status';
    }

    function appendBubble(text, role) {
      thread.appendChild(createBubble(text, role));
      thread.scrollTop = thread.scrollHeight;
    }

    function setInputEnabled(enabled) {
      input.disabled = !enabled;
      form.querySelector('.store-reply-send').disabled = !enabled;
    }

    async function loadConfig() {
      if (!backendUrl || !shopDomain) {
        thread.innerHTML = '';
        appendBubble(
          'This widget needs a backend URL and Shopify store domain before it can load.',
          'agent'
        );
        showStatus('Set the backend URL in the Shopify embed settings first.', 'error');
        setInputEnabled(false);
        return;
      }

      showStatus('Loading support widget settings...', 'info');
      setInputEnabled(false);

      try {
        const response = await fetch(
          buildUrl(backendUrl, '/api/widget-config', { shop: shopDomain }),
          {
            headers: backendHeaders,
            credentials: 'omit',
          }
        );
        const data = await safeJson(response);

        if (!response.ok) {
          throw new Error(data.error || 'Could not load widget settings.');
        }

        const settings = data.settings || {};
        title.textContent = 'Zypher';
        subtitle.textContent = 'Support Agent';
        input.placeholder = settings.placeholderText || 'Ask a question...';
        thread.innerHTML = '';
        appendBubble(
          settings.welcomeMessage ||
            'Hi there. Ask a question about shipping, returns, exchanges, or your order.',
          'agent'
        );

        if (!data.connected || !data.knowledgeSourceCount) {
          showStatus(
            'This store has not synced support knowledge yet. Connect Shopify and sync from the merchant dashboard.',
            'warning'
          );
        } else {
          hideStatus();
        }

        if (settings.botEnabled === false) {
          showStatus('The merchant has temporarily disabled the storefront support widget.', 'warning');
          setInputEnabled(false);
          return;
        }

        setInputEnabled(Boolean(data.connected && data.knowledgeSourceCount));
      } catch (error) {
        thread.innerHTML = '';
        appendBubble('Support Agent could not reach the support backend yet.', 'agent');
        showStatus(error.message || 'Could not load widget settings.', 'error');
        setInputEnabled(false);
      }
    }

    async function handleSubmit(event) {
      event.preventDefault();
      const question = input.value.trim();

      if (!question || !backendUrl || !shopDomain) {
        return;
      }

      appendBubble(question, 'customer');
      input.value = '';
      showStatus('Generating a support reply...', 'info');
      setInputEnabled(false);

      try {
        const response = await fetch(buildUrl(backendUrl, '/ask'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...backendHeaders,
          },
          body: JSON.stringify({
            shop: shopDomain,
            question,
            channel: 'storefront_widget',
          }),
        });
        const data = await safeJson(response);

        if (!response.ok) {
          throw new Error(data.error || 'The support request failed.');
        }

        appendBubble(data.reply || 'No reply was returned.', 'agent');
        hideStatus();
      } catch (error) {
        appendBubble(
          'Sorry, I could not answer that just yet. Please try again in a moment.',
          'agent'
        );
        showStatus(error.message || 'The support request failed.', 'error');
      } finally {
        setInputEnabled(true);
      }
    }

    launcher.addEventListener('click', openPanel);
    closeButton.addEventListener('click', closePanel);
    form.addEventListener('submit', handleSubmit);

    loadConfig();
  }

  document.querySelectorAll('.store-reply-widget-root').forEach(initializeWidget);
})();
