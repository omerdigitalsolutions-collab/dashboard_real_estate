import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import DashboardLayout from './layouts/DashboardLayout';
import PublicLayout from './layouts/PublicLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import Onboarding from './pages/Onboarding';
import VerifyPhonePage from './pages/VerifyPhonePage';
import AgentJoin from './pages/AgentJoin';
import AgentSetup from './pages/AgentSetup';
import JoinByCode from './pages/JoinByCode';
import Dashboard from './pages/Dashboard';
import AgentDashboard from './pages/AgentDashboard';
import Leads from './pages/Leads';
import Properties from './pages/Properties';
import Transactions from './pages/Transactions';
import Agents from './pages/Agents';
import Settings from './pages/Settings';
import Calendar from './pages/Calendar';
import SharedCatalogPage from './pages/SharedCatalog';
import Catalogs from './pages/Catalogs';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import SuperAdminRoute from './components/routing/SuperAdminRoute';
import LandingPage from './pages/LandingPage';
import { PreferencesProvider } from './context/PreferencesContext';
import { useAuth } from './context/AuthContext';
import { Navigate } from 'react-router-dom';
import { DashboardDataProvider } from './hooks/useLiveDashboardData';
import AgencyDrillDown from './pages/superadmin/AgencyDrillDown';
import ProfitAndLossDashboard from './pages/ProfitAndLossDashboard';
import ContractEditor from './pages/ContractEditor';
import Contracts from './pages/Contracts';
import ContractAuditLog from './pages/ContractAuditLog';
import SignaturePage from './pages/SignaturePage';
import ContractTemplates from './pages/ContractTemplates';
import ContractInstanceEditor from './pages/ContractInstanceEditor';
import ContractInstanceViewer from './pages/ContractInstanceViewer';
import SignInstancePage from './pages/SignInstancePage';
import BillingLockScreen from './pages/BillingLockScreen';
import PendingApproval from './pages/PendingApproval';
import ExploreGallery from './pages/ExploreGallery';
import { useSubscriptionGuard } from './hooks/useSubscriptionGuard';
import OnboardingTour from './components/common/OnboardingTour';

/** Wraps the dashboard and renders the lock screen if billing is expired */
function SubscriptionProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLockedOut, loading } = useSubscriptionGuard();
  if (loading) return null;
  if (isLockedOut) return <BillingLockScreen />;
  return <>{children}</>;
}

function DashboardIndex() {
  const { userData, loading } = useAuth();

  if (loading) return null;

  // Agents get their own personal dashboard (filtered to their own data).
  // Admins get the full agency-wide dashboard.
  if (userData?.role === 'agent') {
    return <AgentDashboard />;
  }

  return <Dashboard />;
}

function App() {
  return (
    <BrowserRouter>
      <Toaster position="bottom-right" toastOptions={{ className: 'rtl-grid text-sm shadow-xl', style: { background: '#1e293b', color: '#fff', border: '1px solid #334155' } }} />
      <Routes>
        {/* Firebase Auth handler bypass */}
        <Route path="/__/*" element={null} />

        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Public Routes */}
        <Route element={<PublicLayout />}>
          <Route path="/catalog/:token" element={<SharedCatalogPage />} />
          {/* Agent invite join page — token is Firestore stub ID */}
          <Route path="/join" element={<AgentJoin />} />
          <Route path="/join-agency" element={<JoinByCode />} />
        </Route>

        {/* B2C Property Gallery — fully public, no auth */}
        <Route path="/explore" element={<ExploreGallery />} />

        {/* Onboarding (new agency admins) - Now public for Step 0 lead capture */}
        <Route path="/onboarding" element={<Onboarding />} />

        {/* Dedicated SMS Verification before full onboarding */}
        <Route
          path="/verify-phone"
          element={
            <ProtectedRoute>
              <VerifyPhonePage />
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

        {/* Pending Approval — shown when agency registration is awaiting admin approval */}
        <Route
          path="/pending-approval"
          element={
            <ProtectedRoute>
              <PendingApproval />
            </ProtectedRoute>
          }
        />

        <Route path="/" element={<LandingPage />} />
        <Route path="/training" element={<LandingPage />} />

        {/* Dashboard Routes are protected */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <SubscriptionProtectedRoute>
                <PreferencesProvider>
                  <DashboardDataProvider>
                    <OnboardingTour />
                    <DashboardLayout />
                  </DashboardDataProvider>
                </PreferencesProvider>
              </SubscriptionProtectedRoute>
            </ProtectedRoute>
          }
        >
          <Route index element={<ErrorBoundary><DashboardIndex /></ErrorBoundary>} />
          <Route path="leads" element={<ErrorBoundary><Leads /></ErrorBoundary>} />
          <Route path="properties" element={<ErrorBoundary><Properties /></ErrorBoundary>} />
          <Route path="catalogs" element={<ErrorBoundary><Catalogs /></ErrorBoundary>} />
          <Route path="transactions" element={<ErrorBoundary><Transactions /></ErrorBoundary>} />
          <Route path="agents" element={<ErrorBoundary><Agents /></ErrorBoundary>} />
          <Route path="pnl" element={<ErrorBoundary><ProfitAndLossDashboard /></ErrorBoundary>} />
          <Route path="calendar" element={<ErrorBoundary><Calendar /></ErrorBoundary>} />
          <Route path="settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
          <Route path="contracts" element={<ErrorBoundary><Contracts /></ErrorBoundary>} />
          <Route path="contracts/:dealId/edit" element={<ErrorBoundary><ContractEditor /></ErrorBoundary>} />
          <Route path="contracts/:contractId/logs" element={<ErrorBoundary><ContractAuditLog /></ErrorBoundary>} />
          <Route path="contracts/templates" element={<ErrorBoundary><ContractTemplates /></ErrorBoundary>} />
          <Route path="contracts/instances/:instanceId/edit" element={<ErrorBoundary><ContractInstanceEditor /></ErrorBoundary>} />
          <Route path="contracts/instances/:instanceId/view" element={<ErrorBoundary><ContractInstanceViewer /></ErrorBoundary>} />
          <Route path="super-admin" element={
            <SuperAdminRoute>
              <ErrorBoundary><SuperAdminDashboard /></ErrorBoundary>
            </SuperAdminRoute>
          } />
          <Route path="super-admin/agencies/:agencyId" element={
            <SuperAdminRoute>
              <ErrorBoundary><AgencyDrillDown /></ErrorBoundary>
            </SuperAdminRoute>
          } />
        </Route>

        {/* Public contract signing — no auth required, uses anonymous Firebase Auth */}
        <Route path="/sign/:agencyId/:contractId" element={<SignaturePage />} />
        <Route path="/sign-instance/:agencyId/:instanceId" element={<SignInstancePage />} />

        {/* Catch-all route to redirect unknown paths to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
