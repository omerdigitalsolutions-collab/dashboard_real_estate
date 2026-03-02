import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import DashboardLayout from './layouts/DashboardLayout';
import PublicLayout from './layouts/PublicLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';
import AgentJoin from './pages/AgentJoin';
import AgentSetup from './pages/AgentSetup';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Properties from './pages/Properties';
import Transactions from './pages/Transactions';
import Agents from './pages/Agents';
import Settings from './pages/Settings';
import SharedCatalogPage from './pages/SharedCatalog';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import SuperAdminRoute from './components/routing/SuperAdminRoute';
import LandingPage from './pages/LandingPage';
import { PreferencesProvider } from './context/PreferencesContext';
import { useAuth } from './context/AuthContext';
import { Navigate } from 'react-router-dom';

function DashboardIndex() {
  const { userData, loading } = useAuth();

  if (loading) return null;

  if (userData?.role === 'agent') {
    return <Navigate to="/dashboard/transactions" replace />;
  }

  return <Dashboard />;
}

function App() {
  return (
    <BrowserRouter>
      <Toaster position="bottom-right" toastOptions={{ className: 'rtl-grid text-sm shadow-xl', style: { background: '#1e293b', color: '#fff', border: '1px solid #334155' } }} />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Public Routes */}
        <Route element={<PublicLayout />}>
          <Route path="/catalog/:token" element={<SharedCatalogPage />} />
          {/* Agent invite join page — token is Firestore stub ID */}
          <Route path="/join" element={<AgentJoin />} />
        </Route>

        {/* Onboarding (new agency admins) */}
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />

        {/* Agent Setup — minimal profile for invited agents */}
        <Route
          path="/agent-setup"
          element={
            <ProtectedRoute>
              <AgentSetup />
            </ProtectedRoute>
          }
        />

        <Route path="/" element={<LandingPage />} />

        {/* Dashboard Routes are protected */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <PreferencesProvider>
                <DashboardLayout />
              </PreferencesProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<ErrorBoundary><DashboardIndex /></ErrorBoundary>} />
          <Route path="leads" element={<ErrorBoundary><Leads /></ErrorBoundary>} />
          <Route path="properties" element={<ErrorBoundary><Properties /></ErrorBoundary>} />
          <Route path="transactions" element={<ErrorBoundary><Transactions /></ErrorBoundary>} />
          <Route path="agents" element={<ErrorBoundary><Agents /></ErrorBoundary>} />
          <Route path="settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
          <Route path="super-admin" element={
            <SuperAdminRoute>
              <ErrorBoundary><SuperAdminDashboard /></ErrorBoundary>
            </SuperAdminRoute>
          } />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
