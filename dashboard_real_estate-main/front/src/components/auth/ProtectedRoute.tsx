import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { currentUser, loading, requireOnboarding } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    if (requireOnboarding) {
        // If they don't have a verified phone, send to verify-phone
        // (Unless they are already there)
        if (!currentUser.phoneNumber && location.pathname !== '/verify-phone') {
            return <Navigate to="/verify-phone" replace />;
        }
        // If they DO have a verified phone, send to onboarding
        // (Unless they are already there or at /verify-phone where we do local redirect)
        if (currentUser.phoneNumber && location.pathname !== '/onboarding' && location.pathname !== '/verify-phone') {
            return <Navigate to="/onboarding" replace />;
        }
    }

    if (!requireOnboarding && (location.pathname === '/onboarding' || location.pathname === '/verify-phone')) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}
