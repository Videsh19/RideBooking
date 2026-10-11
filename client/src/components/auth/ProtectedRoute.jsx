import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../common/LoadingSpinner';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-theme-bg text-theme-text">
        <LoadingSpinner label="Authenticating session and permissions..." />
      </div>
    );
  }

  // Unauthenticated user -> redirect to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Cross-role unauthorized access check
  const userRole = (user.role || '').toUpperCase();
  const normalizedAllowed = allowedRoles.map((r) => r.toUpperCase());

  if (normalizedAllowed.length > 0 && !normalizedAllowed.includes(userRole)) {
    const getOwnDashboard = () => {
      if (userRole === 'RIDER') return { path: '/rider', label: 'Rider Workspace' };
      if (userRole === 'DRIVER') return { path: '/driver', label: 'Driver Console' };
      if (userRole === 'ADMIN') return { path: '/admin', label: 'Admin Console' };
      return { path: '/', label: 'Overview' };
    };

    const ownDashboard = getOwnDashboard();

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-theme-bg text-theme-text">
        <div className="max-w-md w-full">
          <Card padding="p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-red-950/40 border border-red-800/50 text-red-400 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-theme-text">
                403 — Access Restricted
              </h2>
              <p className="text-xs text-theme-text-secondary mt-1">
                You do not have administrative authorization to view this console.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-theme-surface border border-theme-border text-xs text-left space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-theme-text-secondary">Your Account:</span>
                <span className="font-semibold text-theme-text">{user.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-theme-text-secondary">Your Role:</span>
                <Badge variant="purple" size="sm">{userRole}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-theme-text-secondary">Required Role:</span>
                <Badge variant="neutral" size="sm">{allowedRoles.join(' or ')}</Badge>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Link to={ownDashboard.path} className="w-full">
                <Button variant="primary" size="sm" className="w-full">
                  <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                  Return to Your {ownDashboard.label}
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={logout}
                className="w-full"
              >
                <LogOut className="w-3.5 h-3.5 mr-1.5" />
                Sign Out / Switch Account
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return children;
}
