import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface AppUser {
  id?: string;
  userId?: string;
  email?: string;
  name?: string;
  isGuest?: boolean;
  token?: string;
}

interface AppContextType {
  agentActive: boolean;
  cameraActive: boolean;
  currentTopic: string;
  toggleAgent: () => void;
  toggleCamera: () => void;
  setCurrentTopic: (topic: string) => void;
  // auth
  user: AppUser | null;
  register: (email: string, password: string, name?: string) => Promise<void>;
  checkName: (name: string) => Promise<boolean>;
  login: (email: string, password: string) => Promise<void>;
  guest: () => Promise<void>;
  logout: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const AGENT_ACTIVE_KEY = 'doubtsense_agentActive';

export function AppProvider({ children }: { children: ReactNode }) {
  const [agentActive, setAgentActive] = useState(() => {
    try {
      const raw = localStorage.getItem(AGENT_ACTIVE_KEY);
      if (raw === null) return true;
      return raw === 'true';
    } catch {
      return true;
    }
  });
  const [cameraActive, setCameraActive] = useState(false);
  const [currentTopic, setCurrentTopic] = useState('');
  const [user, setUser] = useState<AppUser | null>(() => {
    try {
      const raw = localStorage.getItem('doubtsense_user');
      return raw ? JSON.parse(raw) as AppUser : null;
    } catch {
      return null;
    }
  });

  // Persist agentActive so other clients (e.g., extension) can read a stable source of truth.
  useEffect(() => {
    try {
      localStorage.setItem(AGENT_ACTIVE_KEY, String(agentActive));
    } catch {
      // ignore
    }
  }, [agentActive]);
  // Backend-backed auth functions
  // Vite exposes env vars on import.meta.env; `process` is unavailable in the browser.
  const API = (import.meta.env.VITE_API_URL as string) || 'http://localhost:4000';

  const syncAgentStatusToBackend = async (nextAgentActive: boolean) => {
    const userId = user?.userId;
    if (!userId) return;
    try {
      await fetch(`${API}/api/agent/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, agentActive: nextAgentActive })
      });
    } catch {
      // ignore; local storage remains source-of-truth
    }
  };

  const register = async (email: string, password: string, name?: string) => {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || 'Registration failed');
    }
    const token = data.token as string;
    const u = data.user as AppUser;
    u.token = token;
    setUser(u);
    localStorage.setItem('doubtsense_user', JSON.stringify(u));
    void fetch(`${API}/api/agent/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: u.userId, agentActive })
    }).catch(() => {});
  };

  const checkName = async (name: string) => {
    if (!name) return true;
    try {
      const res = await fetch(`${API}/api/auth/check-name?name=${encodeURIComponent(name)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return true; // don't block UX on server errors
      return Boolean(data?.available);
    } catch (err) {
      return true;
    }
  };

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || 'Login failed');
    }
    const token = data.token as string;
    const u = data.user as AppUser;
    u.token = token;
    setUser(u);
    localStorage.setItem('doubtsense_user', JSON.stringify(u));
    void fetch(`${API}/api/agent/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: u.userId, agentActive })
    }).catch(() => {});
  };

  const guest = async () => {
    const res = await fetch(`${API}/api/auth/guest`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || 'Guest creation failed');
    }
    const token = data.token as string;
    const u = data.user as AppUser;
    u.token = token;
    setUser(u);
    localStorage.setItem('doubtsense_user', JSON.stringify(u));
    void fetch(`${API}/api/agent/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: u.userId, agentActive })
    }).catch(() => {});
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('doubtsense_user');
  };

  const toggleAgent = () =>
    setAgentActive(prev => {
      const next = !prev;
      // Persist immediately
      try {
        localStorage.setItem(AGENT_ACTIVE_KEY, String(next));
      } catch {
        // ignore
      }
      // Best-effort backend sync for extension fail-safe
      void syncAgentStatusToBackend(next);
      return next;
    });
  const toggleCamera = () => setCameraActive(prev => !prev);

  // (no demo auth) backend-backed functions above

  return (
    <AppContext.Provider value={{
      agentActive,
      cameraActive,
      currentTopic,
      toggleAgent,
      toggleCamera,
      setCurrentTopic,
      user,
  register,
  checkName,
      login,
      guest,
      logout
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
