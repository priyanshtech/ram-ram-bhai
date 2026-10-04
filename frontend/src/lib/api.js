let API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
if (process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.endsWith('/api/v1')) {
  // Automatically append /api/v1 if the user forgot it in their Vercel settings
  API_BASE = `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')}/api/v1`;
}

export function getAuthToken() {
  if (typeof window !== "undefined") {
    return localStorage.getItem("access_token");
  }
  return null;
}

export function setAuthData(data) {
  if (typeof window !== "undefined") {
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("tenant_id", data.tenant_id);
    localStorage.setItem("bot_id", data.bot_id);
  }
}

export function clearAuthData() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("access_token");
    localStorage.removeItem("tenant_id");
    localStorage.removeItem("bot_id");
  }
}

export function getStoredData() {
  if (typeof window !== "undefined") {
    return {
      tenant_id: localStorage.getItem("tenant_id"),
      bot_id: localStorage.getItem("bot_id")
    };
  }
  return { tenant_id: null, bot_id: null };
}

async function fetchWithAuth(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const url = `${API_BASE}${endpoint}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Request failed with status ${response.status}`);
    }

    return response.json();
  } catch (error) {
    if (error.message === 'Failed to fetch') {
      throw new Error(`Failed to fetch from ${url}. Check if the backend is running and the URL is correct.`);
    }
    throw error;
  }
}

export const api = {
  getWhatsAppAccount: (tenant_id) => fetchWithAuth(`/whatsapp/account?tenant_id=${encodeURIComponent(tenant_id)}`),
  configureWhatsApp: (tenant_id, data) => fetchWithAuth(`/whatsapp/account?tenant_id=${encodeURIComponent(tenant_id)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
  }),
  connectWhatsApp: (tenant_id) => fetchWithAuth(`/whatsapp/connect?tenant_id=${encodeURIComponent(tenant_id)}`, { method: "POST" }),
  disconnectWhatsApp: (tenant_id) => fetchWithAuth(`/whatsapp/disconnect?tenant_id=${encodeURIComponent(tenant_id)}`, { method: "POST" }),
  logoutWhatsApp: (tenant_id) => fetchWithAuth(`/whatsapp/logout?tenant_id=${encodeURIComponent(tenant_id)}`, { method: "POST" }),
  getWhatsAppChats: (tenant_id) => fetchWithAuth(`/whatsapp/chats?tenant_id=${encodeURIComponent(tenant_id)}`),
  toggleWhatsAppChat: (tenant_id, chat_id, enabled) => fetchWithAuth(`/whatsapp/chats/${encodeURIComponent(chat_id)}?tenant_id=${encodeURIComponent(tenant_id)}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled })
  }),
  signup: (data) => fetchWithAuth("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }),
  
  login: (email, password) => {
    // OAuth2PasswordRequestForm needs x-www-form-urlencoded
    const formData = new URLSearchParams();
    formData.append("username", email);
    formData.append("password", password);
    
    return fetchWithAuth("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString()
    });
  },

  getBots: (tenant_id) => fetchWithAuth(`/bots?tenant_id=${tenant_id}`),
  
  getBot: (bot_id, tenant_id) => fetchWithAuth(`/bots/${bot_id}?tenant_id=${tenant_id}`),
  
  updateBot: (bot_id, tenant_id, data) => fetchWithAuth(`/bots/${bot_id}?tenant_id=${tenant_id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }),
  
  getDomains: (bot_id, tenant_id) => fetchWithAuth(`/bots/${bot_id}/domains?tenant_id=${tenant_id}`),
  
  addDomain: (bot_id, tenant_id, domain) => fetchWithAuth(`/bots/${bot_id}/domains?tenant_id=${tenant_id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain })
  }),
  
  removeDomain: (bot_id, domain_id, tenant_id) => fetchWithAuth(`/bots/${bot_id}/domains/${domain_id}?tenant_id=${tenant_id}`, {
    method: "DELETE"
  }),

  uploadKnowledge: async (bot_id, tenant_id, file) => {
    const token = getAuthToken();
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_BASE}/knowledge/${bot_id}/upload?tenant_id=${tenant_id}`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Upload failed");
    }
    return response.json();
  },

  getKnowledgeSources: (bot_id, tenant_id) => fetchWithAuth(`/knowledge/${bot_id}/sources?tenant_id=${tenant_id}`),
  
  deleteKnowledgeSource: (bot_id, source_id, tenant_id) => fetchWithAuth(`/knowledge/${bot_id}/sources/${source_id}?tenant_id=${tenant_id}`, {
    method: "DELETE"
  }),
  
  getDashboardOverview: (bot_id, tenant_id) => fetchWithAuth(`/dashboard/${bot_id}/overview?tenant_id=${tenant_id}`),
  
  getLeads: (bot_id, tenant_id) => fetchWithAuth(`/dashboard/${bot_id}/leads?tenant_id=${tenant_id}`),
  
  getFunnel: (bot_id, tenant_id) => fetchWithAuth(`/dashboard/${bot_id}/funnel?tenant_id=${tenant_id}`),
  
  getConversations: (bot_id, tenant_id) => fetchWithAuth(`/dashboard/${bot_id}/conversations?tenant_id=${tenant_id}`),
  
  getMessages: (bot_id, conversation_id, tenant_id) => fetchWithAuth(`/dashboard/${bot_id}/conversations/${conversation_id}/messages?tenant_id=${tenant_id}`),
  
  createWidgetSession: async (public_key) => {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE}/widget/session`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ public_key })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Failed to create session");
    }
    return response.json();
  }
};
