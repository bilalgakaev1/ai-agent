(function () {
    const API_ENDPOINT = "https://mxpkn8ns.ru/webhook/525c1d91-ca51-409b-9217-fc610f4318bb/chat";

    const inputBlock = document.getElementById('ai-input-block');
    const loadingBlock = document.getElementById('ai-loading-block');
    const resultsBlock = document.getElementById('ai-results-block');
    const startBtn = document.getElementById('ai-start-btn');
    const newSearchBtn = document.getElementById('ai-new-search');
    const queryInput = document.getElementById('ai-query');
    const resultsDiv = document.getElementById('results');

    function showBlock(block) {
      [inputBlock, loadingBlock, resultsBlock].forEach(b => b.classList.remove('active'));
      block.classList.add('active');
    }

    
    function generateUUID() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
    function getSessionId() {
      try {
        let sid = localStorage.getItem('lava_agent_session');
        if (!sid) {
          sid = generateUUID();
          localStorage.setItem('lava_agent_session', sid);
        }
        return sid;
      } catch (e) {
        return 'tmp-' + Date.now();
      }
    }

    
    function setLoadingState(active) {
      startBtn.disabled = active;
      queryInput.disabled = active;
      if (active) showBlock(loadingBlock);
    }

    function renderResults(items) {
      if (!items || !items.length) {
        resultsDiv.innerHTML = "<p>Ничего не найдено 😕</p>";
      } else {
        resultsDiv.innerHTML = items.map(v => {
          
          const title = v.title || v.name || v.message || v.text || '';
          const url = v.url || v.link || '';
          const meta = v.channel || v.source || v.description || '';
          return `
            <div class="video-card">
              <strong>${escapeHtml(title)}</strong>
              ${ meta ? `<div class="hint">${escapeHtml(meta)}</div>` : '' }
              ${ url ? `<div style="margin-top:8px;"><a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></div>` : '' }
            </div>`;
        }).join('');
      }
      showBlock(resultsBlock);
    }

    function renderError(message, code) {
      resultsDiv.innerHTML = `
        <div class="error-box">
          <strong>Произошла ошибка${code ? ' ('+code+')' : ''}.</strong>
          <div style="margin-top:8px;">${escapeHtml(message)}</div>
          <div class="hint">Запрос занял слишком много времени. Попробуйте ещё раз.</div>
          <div style="margin-top:8px;">
            <button id="ai-retry-btn">Повторить</button>
            <button id="ai-newsearch-err" style="margin-left:8px;">Новый запрос</button>
          </div>
        </div>`;
      showBlock(resultsBlock);

      
      const retry = document.getElementById('ai-retry-btn');
      const newsearchErr = document.getElementById('ai-newsearch-err');
      if (retry) retry.addEventListener('click', () => {
        const q = queryInput.value.trim();
        if (q) fetchResults(q);
      });
      if (newsearchErr) newsearchErr.addEventListener('click', () => {
        queryInput.value = '';
        showBlock(inputBlock);
      });
    }

    
    function escapeHtml(str) {
      if (!str && str !== 0) return '';
      return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[s]));
    }
    function escapeAttr(s) {
      return escapeHtml(s).replace(/"/g, '&quot;');
    }

    async function fetchResults(query) {
      showBlock(loadingBlock);
      startBtn.disabled = true;
      queryInput.disabled = true;

      const sessionId = getSessionId();

      const controller = new AbortController();
      const timeoutMs = 20000; // 20s
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const payload = {
        action: "sendMessage",
        chatInput: query,
        sessionId: sessionId
      };

      try {
        const res = await fetch(API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timer);

        if (!res.ok) {
          
          const status = res.status;
          let bodyText = '';
          try { bodyText = await res.text(); } catch(e){ bodyText = ''; }
          console.warn('Server error:', status, bodyText);
          if (status === 404) {
            renderError('Сервис временно недоступен. Попробуйте позже.', 404);
            return;
          }
          if (status === 500) {
            renderError('Произошла внутренняя ошибка. Повторите попытку позже.', 500);
            return;
          }
          renderError('Ошибка сервера: ' + (bodyText || `HTTP ${status}`), status);
          return;
        }

        
        let data;
        try {
          data = await res.json();
        } catch (e) {
          
          const txt = await res.text().catch(()=>'');
          renderError('Сервер вернул некорректный JSON: ' + txt);
          return;
        }

        
        let items = [];
        if (Array.isArray(data)) items = data;
        else if (Array.isArray(data.result)) items = data.result;
        else if (Array.isArray(data.items)) items = data.items;
        else if (Array.isArray(data.messages)) items = data.messages;
        else if (Array.isArray(data.videos)) items = data.videos;
        else if (data.reply && Array.isArray(data.reply)) items = data.reply;
        else if (data.message && Array.isArray(data.message)) items = data.message;
        else if (typeof data === 'object' && data !== null) {
          
          if (data.text || data.message || data.answer || data.replyText) {
            const txt = data.text || data.message || data.answer || data.replyText;
            items = [{ title: txt }];
          } else {
            
            items = [{ title: JSON.stringify(data) }];
          }
        }

        renderResults(items);
      } catch (err) {
        clearTimeout(timer);
        console.error('Agent fetch error', err);
        const isAbort = err.name === 'AbortError';
        const msg = isAbort ? 'Время ожидания запроса истекло. Попробуйте ещё раз.' : (err.message || 'Ошибка сети');
        renderError(msg);
      } finally {
        startBtn.disabled = false;
        queryInput.disabled = false;
      }
    }

    
    startBtn.addEventListener('click', () => {
      const q = queryInput.value.trim();
      if (!q) return alert('Введите запрос');
      fetchResults(q);
    });

    newSearchBtn.addEventListener('click', () => {
      queryInput.value = '';
      showBlock(inputBlock);
    });

    
    queryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        startBtn.click();
      }
    });

  })();