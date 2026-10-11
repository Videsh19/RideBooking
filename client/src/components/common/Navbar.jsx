import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Car, Menu, X, Shield, Navigation, Home, LogOut, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import Button from './Button';
import Badge from './Badge';

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  // Navigation items rendered according to authentication and role
  const getNavLinks = () => {
    const links = [{ label: 'Overview', path: '/', icon: Home }];

    if (isAuthenticated && user) {
      const userRole = (user.role || '').toUpperCase();
      if (userRole === 'RIDER') {
        links.push({ label: 'Rider Workspace', path: '/rider', icon: Navigation });
      } else if (userRole === 'DRIVER') {
        links.push({ label: 'Driver Console', path: '/driver', icon: Car });
      } else if (userRole === 'ADMIN') {
        links.push({ label: 'Admin Console', path: '/admin', icon: Shield });
      }
    }

    return links;
  };

  const navLinks = getNavLinks();

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <header className="sticky top-0 z-40 bg-theme-card border-b border-theme-border transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Identity */}
          <Link
            to="/"
            id="nav-brand-logo"
            className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary rounded-lg p-1.5 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-theme-primary flex items-center justify-center text-white shadow-sm flex-shrink-0">
              <Car className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-theme-text block leading-none">
                GoRide
              </span>
              <span className="text-[10px] text-theme-text-secondary tracking-wide uppercase font-medium">
                Urban Transit
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1.5" aria-label="Main Navigation">
            {navLinks.map((item) => {
              const active = isActive(item.path);
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border transition-all duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary ${
                    active
                      ? 'bg-theme-surface border-theme-primary text-theme-primary font-semibold shadow-xs'
                      : 'border-transparent text-theme-text-secondary hover:text-theme-text hover:bg-theme-surface hover:border-theme-border'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${active ? 'text-theme-primary' : 'text-theme-text-secondary'}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right Controls */}
          <div className="hidden md:flex items-center gap-2.5">
            <ThemeToggle />

            {isAuthenticated && user ? (
              <div className="flex items-center gap-2.5 pl-2 border-l border-theme-border">
                {/* User Identity Chip */}
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-7 h-7 rounded-full bg-theme-surface border border-theme-border flex items-center justify-center text-theme-text-secondary">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-left hidden lg:block leading-tight">
                    <span className="font-semibold text-theme-text block truncate max-w-[120px]">
                      {user.name}
                    </span>
                    <Badge variant="purple" size="sm" className="mt-0.5">
                      {user.role}
                    </Badge>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={logout}
                  id="nav-logout-btn"
                  className="text-theme-text-secondary hover:text-red-400 hover:border-red-400/40"
                >
                  <LogOut className="w-3.5 h-3.5 mr-1" />
                  Sign Out
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" id="nav-login-link">
                  <Button variant="secondary" size="sm">
                    Sign In
                  </Button>
                </Link>
                <Link to="/register" id="nav-register-link">
                  <Button variant="primary" size="sm">
                    Register
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              type="button"
              id="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg border border-theme-border bg-theme-surface text-theme-text hover:bg-opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-theme-border bg-theme-card px-4 pt-3 pb-4 space-y-2">
          {navLinks.map((item) => {
            const active = isActive(item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-medium border transition-all duration-150 ${
                  active
                    ? 'bg-theme-surface border-theme-primary text-theme-primary font-semibold'
                    : 'border-transparent text-theme-text-secondary hover:text-theme-text hover:bg-theme-surface hover:border-theme-border'
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-theme-primary' : 'text-theme-text-secondary'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <div className="pt-3 mt-2 border-t border-theme-border flex flex-col gap-2">
            {isAuthenticated && user ? (
              <>
                <div className="flex items-center justify-between p-2 rounded-lg bg-theme-surface border border-theme-border text-xs">
                  <span className="font-semibold text-theme-text">{user.name}</span>
                  <Badge variant="purple" size="sm">{user.role}</Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                  className="w-full text-red-400 border-red-500/30"
                >
                  <LogOut className="w-3.5 h-3.5 mr-1" />
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full"
                >
                  <Button variant="secondary" size="sm" className="w-full">
                    Sign In
                  </Button>
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full"
                >
                  <Button variant="primary" size="sm" className="w-full">
                    Register
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
