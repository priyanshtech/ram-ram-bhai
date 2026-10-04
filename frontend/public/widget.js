(function() {
  // 1. Find the script tag that loaded this script to extract config
  const scriptTag = document.currentScript || document.querySelector('script[src*="widget.js"]');
  const botId = scriptTag.getAttribute('data-bot-id');
  const apiHost = scriptTag.getAttribute('data-api-host') || 'https://support-ai-api-b4id.onrender.com/api/v1';
  
  if (!botId) {
    console.error("AI Widget Error: data-bot-id attribute is missing from the script tag.");
    return;
  }

  // 2. State & Data
  let sessionToken = null;
  let botConfig = null;
  let isOpen = false;
  let isFetchingSession = false;

  // 3. Inject CSS
  const style = document.createElement('style');
  style.innerHTML = `
    #ai-widget-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    
    #ai-widget-fab {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #4F46E5;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 25px rgba(0,0,0,0.15);
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      border: none;
      outline: none;
    }
    
    #ai-widget-fab:hover {
      transform: scale(1.05);
      box-shadow: 0 15px 35px rgba(0,0,0,0.2);
    }
    
    #ai-widget-fab svg {
      width: 28px;
      height: 28px;
    }

    #ai-widget-window {
      position: absolute;
      bottom: 80px;
      right: 0;
      width: 360px;
      height: 520px;
      max-height: calc(100vh - 120px);
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.15);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      pointer-events: none;
      transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      border: 1px solid rgba(0,0,0,0.08);
    }

    #ai-widget-window.ai-widget-open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    #ai-widget-header {
      padding: 16px;
      color: white;
      background: #4F46E5;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    #ai-widget-header .ai-avatar {
      width: 36px;
      height: 36px;
      background: rgba(255,255,255,0.2);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    #ai-widget-header .ai-title {
      font-weight: 600;
      font-size: 15px;
      margin: 0;
      line-height: 1.2;
    }

    #ai-widget-header .ai-status {
      font-size: 11px;
      opacity: 0.9;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    #ai-widget-messages {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #f8fafc;
    }

    .ai-msg {
      max-width: 85%;
      padding: 10px 14px;
      font-size: 14px;
      line-height: 1.5;
    }

    .ai-msg-bot {
      background: #ffffff;
      color: #334155;
      align-self: flex-start;
      border-radius: 16px 16px 16px 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
      border: 1px solid rgba(0,0,0,0.04);
    }

    .ai-msg-user {
      background: #4F46E5;
      color: white;
      align-self: flex-end;
      border-radius: 16px 16px 4px 16px;
    }

    #ai-widget-input-area {
      padding: 16px;
      background: #ffffff;
      border-top: 1px solid rgba(0,0,0,0.05);
      display: flex;
      gap: 8px;
    }

    #ai-widget-input {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }

    #ai-widget-input:focus {
      border-color: #4F46E5;
    }

    #ai-widget-send {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #4F46E5;
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      outline: none;
    }
    
    #ai-widget-send:disabled {
      background: #cbd5e1;
      cursor: not-allowed;
    }
    
    .ai-escalation-links {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    
    .ai-esc-btn {
      padding: 6px 10px;
      font-size: 12px;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 500;
      display: inline-block;
    }
    
    .ai-esc-whatsapp { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .ai-esc-email { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .ai-esc-phone { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
    .ai-esc-booking { background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff; }

    @media (max-width: 480px) {
      #ai-widget-window {
        width: calc(100vw - 32px);
        height: calc(100vh - 160px);
        right: -8px;
      }
    }
  `;
  document.head.appendChild(style);

  // 4. Create DOM
  const container = document.createElement('div');
  container.id = 'ai-widget-container';

  container.innerHTML = `
    <div id="ai-widget-window">
      <div id="ai-widget-header">
        <div class="ai-avatar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
        </div>
        <div>
          <h3 class="ai-title">Support AI</h3>
          <span class="ai-status">
            <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#4ade80;"></span>
            Online
          </span>
        </div>
      </div>
      <div id="ai-widget-messages"></div>
      <div id="ai-widget-input-area">
        <input type="text" id="ai-widget-input" placeholder="Type your message..." />
        <button id="ai-widget-send">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
        </button>
      </div>
    </div>
    <button id="ai-widget-fab">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </button>
  `;
  document.body.appendChild(container);

  // 5. Select Elements
  const fab = document.getElementById('ai-widget-fab');
  const chatWindow = document.getElementById('ai-widget-window');
  const header = document.getElementById('ai-widget-header');
  const title = document.querySelector('#ai-widget-header .ai-title');
  const messagesDiv = document.getElementById('ai-widget-messages');
  const input = document.getElementById('ai-widget-input');
  const sendBtn = document.getElementById('ai-widget-send');

  // 6. Logic
  function parseMarkdown(text) {
    if (!text) return "";
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); // Escape HTML
    
    // Remove all bold markers
    html = html.replace(/\*\*/g, '');
    
    // Convert bullet points to real bullets
    html = html.replace(/(^|\n)\s*\*\s/g, '$1• ');
    html = html.replace(/(^|\n)\s*-\s/g, '$1• ');
    
    // Remove any remaining single asterisks
    html = html.replace(/\*/g, '');
    
    html = html.replace(/\n/g, '<br/>'); // Newlines
    return html;
  }

  function appendMessage(text, sender) {
    const div = document.createElement('div');
    div.className = `ai-msg ai-msg-${sender}`;
    div.dataset.fullText = text;
    div.innerHTML = sender === 'bot' ? parseMarkdown(text) : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return div;
  }

  async function initSession() {
    if (sessionToken || isFetchingSession) return true;
    isFetchingSession = true;
    try {
      const res = await fetch(`${apiHost}/widget/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_key: botId })
      });
      
      if (!res.ok) {
        throw new Error(await res.text());
      }
      
      const data = await res.json();
      sessionToken = data.visitor_session_token;
      botConfig = data;
      
      // Update UI with bot config
      title.textContent = data.bot_name;
      header.style.backgroundColor = data.theme_color;
      fab.style.backgroundColor = data.theme_color;
      sendBtn.style.backgroundColor = data.theme_color;
      
      // Inject CSS overrides for theme colors dynamically
      const themeStyle = document.createElement('style');
      themeStyle.innerHTML = `
        #ai-widget-input:focus { border-color: ${data.theme_color} !important; }
        .ai-msg-user { background: ${data.theme_color} !important; }
      `;
      document.head.appendChild(themeStyle);
      
      appendMessage(data.greeting_message, 'bot');
      return true;
    } catch (err) {
      console.error("AI Widget Initialization Error:", err);
      let errMsg = "Failed to connect to support bot. Ensure this domain is allowed.";
      try {
        const p = JSON.parse(err.message);
        if (p.detail) errMsg = p.detail;
      } catch(e) {}
      appendMessage(errMsg, 'bot');
      return false;
    } finally {
      isFetchingSession = false;
    }
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || !sessionToken) return;
    
    input.value = '';
    appendMessage(text, 'user');
    const botMsgDiv = appendMessage('...', 'bot');
    botMsgDiv.style.opacity = '0.7';
    input.disabled = true;
    sendBtn.disabled = true;

    try {
      const res = await fetch(`${apiHost}/chat/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ message: text })
      });
      
      if (!res.ok) throw new Error("Failed to send message");
      
      botMsgDiv.dataset.fullText = '';
      botMsgDiv.innerHTML = '';
      botMsgDiv.style.opacity = '1';
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let pending = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split('\n\n');
        pending = lines.pop();
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6);
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'chunk' && data.text) {
                botMsgDiv.dataset.fullText += data.text;
                botMsgDiv.innerHTML = parseMarkdown(botMsgDiv.dataset.fullText);
              } else if (data.type === 'done') {
                 if (typeof data.answer === 'string') {
                   botMsgDiv.dataset.fullText = data.answer;
                   botMsgDiv.innerHTML = parseMarkdown(data.answer);
                 }
                 if (!data.escalation_links || Object.keys(data.escalation_links).length === 0) continue;
                 // Render escalation links
                 const escDiv = document.createElement('div');
                 escDiv.className = 'ai-escalation-links';
                 
                 if (data.escalation_links.whatsapp) {
                   escDiv.innerHTML += `<a href="${data.escalation_links.whatsapp}" target="_blank" class="ai-esc-btn ai-esc-whatsapp">💬 WhatsApp Us</a>`;
                 }
                 if (data.escalation_links.email) {
                   escDiv.innerHTML += `<a href="${data.escalation_links.email}" target="_blank" class="ai-esc-btn ai-esc-email">✉️ Email Support</a>`;
                 }
                 if (data.escalation_links.phone) {
                   escDiv.innerHTML += `<a href="${data.escalation_links.phone}" class="ai-esc-btn ai-esc-phone">📞 Call Us</a>`;
                 }
                 if (data.escalation_links.booking) {
                   escDiv.innerHTML += `<a href="${data.escalation_links.booking}" target="_blank" class="ai-esc-btn ai-esc-booking">📅 Book Meeting</a>`;
                 }
                 
                 messagesDiv.appendChild(escDiv);
              }
            } catch(e) {}
          }
        }
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }
    } catch (err) {
      botMsgDiv.textContent = "Sorry, an error occurred while processing your request.";
      botMsgDiv.style.opacity = '1';
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  // Event Listeners
  fab.addEventListener('click', async () => {
    isOpen = !isOpen;
    if (isOpen) {
      chatWindow.classList.add('ai-widget-open');
      fab.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
      const ok = await initSession();
      if (ok) input.focus();
    } else {
      chatWindow.classList.remove('ai-widget-open');
      fab.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    }
  });

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

})();
