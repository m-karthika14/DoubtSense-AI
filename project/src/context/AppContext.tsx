import { createContext, useContext, useState, ReactNode } from 'react';

interface AppContextType {
  agentActive: boolean;
  cameraActive: boolean;
  currentTopic: string;
  toggleAgent: () => void;
  toggleCamera: () => void;
  setCurrentTopic: (topic: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [agentActive, setAgentActive] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [currentTopic, setCurrentTopic] = useState('');

  const toggleAgent = () => setAgentActive(prev => !prev);
  const toggleCamera = () => setCameraActive(prev => !prev);

  return (
    <AppContext.Provider value={{
      agentActive,
      cameraActive,
      currentTopic,
      toggleAgent,
      toggleCamera,
      setCurrentTopic
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
