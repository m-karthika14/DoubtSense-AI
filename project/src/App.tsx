import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
// no page transition animations — keep routing instant
import { ThemeProvider } from './context/ThemeContext';
import { AppProvider } from './context/AppContext';
import { Navigation } from './components/Navigation';
import { IntroPage } from './pages/IntroPage';
import { LoginPage } from './pages/LoginPage';
import { Dashboard } from './pages/Dashboard';
import { StudyView } from './pages/StudyView';
import { InsightsPage } from './pages/InsightsPage';
import { SettingsPage } from './pages/SettingsPage';
import { RegisterPage } from './pages/RegisterPage';

function AnimatedRoutes() {
  const location = useLocation();
  // hide navbar on intro, login and register pages
  const showNav = !['/', '/login', '/register'].includes(location.pathname);

  return (
    <>
      {showNav && <Navigation />}
      <div className={`${showNav ? 'pt-16' : ''} min-h-screen`}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<IntroPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/study" element={<StudyView />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <Router>
          <AnimatedRoutes />
        </Router>
      </AppProvider>
    </ThemeProvider>
  );
}

export default App;
