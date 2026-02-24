import { Navigate } from 'react-router-dom';
import { useSuperAdmin } from '../../hooks/useSuperAdmin';

interface SuperAdminRouteProps {
    children: React.ReactNode;
}

export default function SuperAdminRoute({ children }: SuperAdminRouteProps) {
    const { isSuperAdmin, loading } = useSuperAdmin();

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600"></div>
                    <p className="text-sm font-medium text-slate-500">Super Admin Authentication...</p>
                </div>
            </div>
        );
    }

    if (!isSuperAdmin) {
        // Not a super admin, redirect to main dashboard
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}
