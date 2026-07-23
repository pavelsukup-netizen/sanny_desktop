(() => {
  'use strict';

  const PATCH = 'SANNY_PATCH_0_5_2';
  if (window.SannyVoiceGuard?.version === '0.5.2') return;

  const state = {
    micArmedUntil: 0,
    pendingTranscript: null,
    bypassOnce: false,
    dialogOpen: false,
    lastInputValue: '',
    lastVoiceCommandAt: 0
  };

  const DICTIONARY = [
    ['vždy průzkumníka', 'otevři Průzkumníka'],
    ['vždy pruzkumnika', 'otevři Průzkumníka'],
    ['otevři průzkumníka souboru', 'otevři Průzkumníka souborů'],
    ['otevři pruzkumnika souboru', 'otevři Průzkumníka souborů'],
    ['průzkumník souboru', 'Průzkumník souborů'],
    ['pruzkumnik souboru', 'Průzkumník souborů'],
    ['poznámkový blog', 'Poznámkový blok'],
    ['poznamkovy blog', 'Poznámkový blok'],
    ['ovládací paneli', 'Ovládací panely'],
    ['ovladaci paneli', 'Ovládací panely'],
    ['nastavení pozadí plochy', 'Nastavení pozadí'],
    ['nastaveni pozadi plochy', 'Nastavení pozadí'],
    ['knihovny obráz', 'složky Obrázky'],
    ['knihovny obraz', 'složky Obrázky'],
    ['knihovny obrázky', 'složky Obrázky'],
    ['knihovny obrazky', 'složky Obrázky'],
    ['q ven', 'Qwen'],
    ['olama', 'Ollama'],
    ['šený', 'Sanny'],
    ['seni', 'Sanny']
  ];

  const APP_WORDS = [
    'Průzkumník', 'Poznámkový blok', 'Ovládací panely', 'Chrome', 'Edge',
    'Kalkulačka', 'PowerShell', 'Nastavení', 'Obrázky', 'Dokumenty',
    'Stažené soubory', 'Plocha', 'Ollama', 'Qwen', 'GPT-OSS', 'Sanny'
  ];

  const COMMAND_RE = /\b(otevři|spusť|zapni|vypni|zavři|klikni|vyhledej|najdi|napiš|vyplň|nastav|změň|přejdi|ulož|smaž|odešli|potvrď|zruš)\b/i;
  const RISKY_RE = /\b(smaž|odstraň|odešli|kup|objednej|zaplať|instaluj|odinstaluj|restartuj|vypni počítač|formátuj)\b/i;

  function normalizeWhitespace(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function levenshtein(a, b) {
    a = a.toLocaleLowerCase('cs-CZ');
    b = b.toLocaleLowerCase('cs-CZ');
    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return matrix[a.length][b.length];
  }

  function restoreKnownNames(text) {
    const tokens = text.split(/(\s+|[,.!?;:])/);
    return tokens.map(token => {
      if (!/[\p{L}\p{N}-]/u.test(token)) return token;
      const clean = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      if (clean.length < 4) return token;
      let best = null;
      let bestDistance = Infinity;
      for (const term of APP_WORDS) {
        if (term.includes(' ')) continue;
        const distance = levenshtein(clean, term);
        const limit = clean.length >= 8 ? 2 : 1;
        if (distance <= limit && distance < bestDistance) {
          best = term;
          bestDistance = distance;
        }
      }
      return best || token;
    }).join('');
  }

  function correctTranscript(original) {
    let text = normalizeWhitespace(original);
    for (const [wrong, right] of DICTIONARY) {
      text = text.replace(new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), right);
    }
    text = restoreKnownNames(text);
    text = text.replace(/^\s*otevřít\b/i, 'Otevři');
    text = text.replace(/^\s*spustit\b/i, 'Spusť');
    text = text.replace(/^\s*přejít\b/i, 'Přejdi');
    text = text.replace(/\s+([,.!?])/g, '$1');
    if (text && !/[.!?]$/.test(text)) text += '.';
    if (text) text = text[0].toLocaleUpperCase('cs-CZ') + text.slice(1);

    const originalNorm = normalizeWhitespace(original);
    const changed = originalNorm.toLocaleLowerCase('cs-CZ') !== text.replace(/[.!?]$/, '').toLocaleLowerCase('cs-CZ');
    const command = COMMAND_RE.test(text);
    const risky = RISKY_RE.test(text);
    const suspicious = command && (
      text.length < 7 ||
      /\b(vždy|něco|tam|tohle|támhle)\b/i.test(originalNorm) ||
      changed
    );

    return {
      original: originalNorm,
      corrected: text,
      changed,
      command,
      risky,
      needsConfirmation: command && (changed || suspicious || risky)
    };
  }

  function findPrompt() {
    return document.querySelector('#prompt, textarea[placeholder*="Napiš" i], textarea[placeholder*="příkaz" i], textarea');
  }

  function findSendButton() {
    return document.querySelector('#send, button.primary') || [...document.querySelectorAll('button')]
      .find(button => /odeslat|send/i.test(button.textContent || button.title || ''));
  }

  function isMicButton(target) {
    const button = target?.closest?.('button');
    if (!button) return false;
    const text = `${button.id} ${button.title} ${button.textContent}`.toLocaleLowerCase('cs-CZ');
    return /(^|\s)(mic|quickmic|microfon|mikrofon|🎙|nahrát|nahrav)/i.test(text);
  }

  function createDialog() {
    let overlay = document.getElementById('sanny-voice-review-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'sanny-voice-review-overlay';
    overlay.innerHTML = `
      <div class="sanny-voice-review-card">
        <div class="sanny-voice-review-title">🎙️ Kontrola hlasového příkazu</div>
        <div class="sanny-voice-review-label">Whisper zachytil:</div>
        <div id="sanny-voice-original" class="sanny-voice-review-original"></div>
        <div class="sanny-voice-review-label">Opravený příkaz:</div>
        <textarea id="sanny-voice-corrected" rows="3"></textarea>
        <div id="sanny-voice-warning" class="sanny-voice-review-warning"></div>
        <div class="sanny-voice-review-actions">
          <button id="sanny-voice-cancel">Zahodit</button>
          <button id="sanny-voice-edit">Jen vložit do pole</button>
          <button id="sanny-voice-confirm" class="primary">Provést příkaz</button>
        </div>
      </div>`;

    const style = document.createElement('style');
    style.textContent = `
      #sanny-voice-review-overlay{position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;background:rgba(3,7,12,.72);backdrop-filter:blur(5px);font-family:Segoe UI,Arial,sans-serif;color:#eef3f8}
      #sanny-voice-review-overlay.open{display:flex}
      .sanny-voice-review-card{width:min(520px,calc(100vw - 28px));background:#0e141c;border:1px solid #2b3948;border-radius:18px;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.55)}
      .sanny-voice-review-title{font-size:18px;font-weight:700;margin-bottom:14px}
      .sanny-voice-review-label{font-size:12px;color:#91a0b1;margin:10px 0 5px}
      .sanny-voice-review-original{padding:10px 12px;border:1px solid #26313d;border-radius:12px;background:#111820;line-height:1.4}
      #sanny-voice-corrected{width:100%;box-sizing:border-box;resize:vertical;border:1px solid #2e9b64;border-radius:12px;background:#111820;color:#eef3f8;padding:10px 12px;font:inherit;line-height:1.4}
      .sanny-voice-review-warning{min-height:20px;margin-top:8px;color:#ffc96b;font-size:12px}
      .sanny-voice-review-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}
      .sanny-voice-review-actions button{border:1px solid #2b3948;border-radius:11px;background:#171f29;color:#eef3f8;padding:9px 12px;cursor:pointer}
      .sanny-voice-review-actions button.primary{background:#18432f;border-color:#2e9b64}
    `;
    document.head.appendChild(style);
    document.body.appendChild(overlay);
    return overlay;
  }

  function closeDialog() {
    const overlay = document.getElementById('sanny-voice-review-overlay');
    overlay?.classList.remove('open');
    state.dialogOpen = false;
  }

  function showReview(result, onDecision) {
    const overlay = createDialog();
    state.dialogOpen = true;
    overlay.classList.add('open');

    overlay.querySelector('#sanny-voice-original').textContent = result.original || 'Prázdný přepis';
    const corrected = overlay.querySelector('#sanny-voice-corrected');
    corrected.value = result.corrected;
    overlay.querySelector('#sanny-voice-warning').textContent = result.risky
      ? 'Tento příkaz může měnit nebo odesílat data. Zkontroluj ho opravdu pečlivě.'
      : result.changed
        ? 'Text byl automaticky opraven. Před provedením zkontroluj význam.'
        : 'Hlasové příkazy se před provedením potvrzují.';

    const finish = decision => {
      const value = normalizeWhitespace(corrected.value);
      closeDialog();
      onDecision(decision, value);
    };
    overlay.querySelector('#sanny-voice-cancel').onclick = () => finish('cancel');
    overlay.querySelector('#sanny-voice-edit').onclick = () => finish('edit');
    overlay.querySelector('#sanny-voice-confirm').onclick = () => finish('confirm');
    corrected.focus();
    corrected.select();
  }

  function stageFromInput() {
    const prompt = findPrompt();
    if (!prompt) return;
    const value = normalizeWhitespace(prompt.value || prompt.textContent || '');
    if (!value) return;
    state.pendingTranscript = correctTranscript(value);
    state.lastVoiceCommandAt = Date.now();
    prompt.value = state.pendingTranscript.corrected;
    prompt.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function handlePotentialSend(event) {
    if (state.bypassOnce) {
      state.bypassOnce = false;
      state.pendingTranscript = null;
      return;
    }
    const pending = state.pendingTranscript;
    if (!pending || !pending.command || state.dialogOpen) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    showReview(pending, (decision, value) => {
      const prompt = findPrompt();
      if (prompt) {
        prompt.value = value;
        prompt.dispatchEvent(new Event('input', { bubbles: true }));
        prompt.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (decision === 'cancel') {
        state.pendingTranscript = null;
        return;
      }
      if (decision === 'edit') {
        state.pendingTranscript = null;
        prompt?.focus();
        return;
      }
      state.bypassOnce = true;
      state.pendingTranscript = null;
      setTimeout(() => findSendButton()?.click(), 0);
    });
  }

  document.addEventListener('click', event => {
    if (isMicButton(event.target)) {
      state.micArmedUntil = Date.now() + 45000;
      state.pendingTranscript = null;
      return;
    }
    const send = findSendButton();
    if (send && event.target?.closest?.('button') === send) handlePotentialSend(event);
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && event.target === findPrompt()) {
      handlePotentialSend(event);
    }
  }, true);

  setInterval(() => {
    const prompt = findPrompt();
    if (!prompt) return;
    const current = normalizeWhitespace(prompt.value || prompt.textContent || '');
    if (current === state.lastInputValue) return;
    const previous = state.lastInputValue;
    state.lastInputValue = current;

    if (Date.now() <= state.micArmedUntil && current && current !== previous) {
      const result = correctTranscript(current);
      state.pendingTranscript = result;
      state.lastVoiceCommandAt = Date.now();
      if (result.changed && 'value' in prompt) {
        prompt.value = result.corrected;
        prompt.dispatchEvent(new Event('input', { bubbles: true }));
        state.lastInputValue = result.corrected;
      }
    }
  }, 180);

  // Jemná pojistka proti nedoloženým tvrzením po hlasovém příkazu.
  const observer = new MutationObserver(() => {
    if (!state.lastVoiceCommandAt || Date.now() - state.lastVoiceCommandAt > 90000) return;
    const messages = [...document.querySelectorAll('.msg.assistant, .message.assistant, [data-role="assistant"]')];
    const last = messages.at(-1);
    if (!last || last.dataset.voiceTruthChecked === PATCH) return;
    last.dataset.voiceTruthChecked = PATCH;
    const text = normalizeWhitespace(last.textContent || '');
    const claimsSuccess = /\b(otevřel jsem|spustil jsem|provedeno|hotovo|nastavil jsem|zapsal jsem|kliknul jsem|vyplnil jsem)\b/i.test(text);
    const hasEvidence = /\b(nástroj|tool|ověřeno|potvrzeno|úspěch|success|✓)\b/i.test(text);
    if (claimsSuccess && !hasEvidence) {
      const warning = document.createElement('div');
      warning.textContent = '⚠️ Tohle tvrzení není v odpovědi doložené výsledkem nástroje. Zkontroluj, zda se akce opravdu provedla.';
      warning.style.cssText = 'margin-top:8px;padding:8px 10px;border:1px solid #a36c22;border-radius:10px;background:#2a2114;color:#ffd38a;font-size:12px;';
      last.appendChild(warning);
    }
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });

  window.SannyVoiceGuard = {
    version: '0.5.2',
    stageFromInput,
    correctTranscript,
    get pending() { return state.pendingTranscript; }
  };
})();
