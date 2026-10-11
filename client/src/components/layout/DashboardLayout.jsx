import React from 'react';
import { Link } from 'react-router-dom';
import {
  Car,
  ArrowLeft,
  LogOut,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../common/ThemeToggle';
import Badge from '../common/Badge';
import Button from '../common/Button';

export default function DashboardLayout({
  children,
  role = 'Rider',
  title = 'Workspace',
  subtitle = '',
  actions,
}) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-theme-bg text-theme-text transition-colors">
      {/* Top Application Bar */}
      <header className="sticky top-0 z-30 bg-theme-card border-b border-theme-border transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Left: Brand + Breadcrumb */}
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="flex items-center gap-1.5 text-theme-text-secondary hover:text-theme-text transition-colors text-xs font-medium px-2 py-1 rounded-md hover:bg-theme-surface"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Overview</span>
              </Link>
              <span className="text-theme-border">/</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-theme-text">GoRide</span>
                <Badge variant="purple" size="sm">
                  {role}
                </Badge>
              </div>
            </div>

            {/* Right: User Profile & Actions */}
            <div className="flex items-center gap-2.5">
              {user && (
                <div className="hidden sm:flex items-center gap-2 text-xs mr-2 pr-3 border-r border-theme-border">
                  <div className="w-6 h-6 rounded-full bg-theme-surface border border-theme-border flex items-center justify-center text-theme-text-secondary">
                    <User className="w-3 h-3" />
                  </div>
                  <span className="font-semibold text-theme-text truncate max-w-[140px]">
                    {user.name}
                  </span>
                </div>
              )}

              <ThemeToggle />

              <Button
                variant="outline"
                size="sm"
                onClick={logout}
                id="dashboard-signout-btn"
                className="text-theme-text-secondary hover:text-red-400 hover:border-red-400/40 text-xs"
              >
                <LogOut className="w-3 h-3 mr-1" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Sub-header / Page Title */}
      <div className="border-b border-theme-border bg-theme-card/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-theme-text">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs text-theme-text-secondary mt-1">
                  {subtitle}
                </p>
              )}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Compact Workspace Footer */}
      <footer className="border-t border-theme-border bg-theme-card py-3 transition-colors mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs text-theme-text-secondary">
          <span>GoRide System Workspace • Mumbai Metropolitan Region</span>
          <span>Move Smarter. Ride Better.</span>
        </div>
      </footer>
    </div>
  );
}
