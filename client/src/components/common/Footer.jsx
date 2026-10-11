import React from 'react';
import { Link } from 'react-router-dom';
import { Car } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-theme-card border-t border-theme-border transition-colors mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Column */}
          <div className="md:col-span-1 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-theme-primary flex items-center justify-center text-white">
                <Car className="w-4 h-4" />
              </div>
              <span className="font-bold text-base text-theme-text">GoRide</span>
            </div>
            <p className="text-xs text-theme-text-secondary leading-relaxed">
              Smart Urban Ride Booking and Management System.
            </p>
            <p className="text-xs text-theme-primary font-medium">
              Move Smarter. Ride Better.
            </p>
          </div>

          {/* Platform Modules */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-theme-text mb-3">
              Platform Modules
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link
                  to="/rider"
                  className="text-theme-text-secondary hover:text-theme-text transition-colors"
                >
                  Rider Booking Workspace
                </Link>
              </li>
              <li>
                <Link
                  to="/driver"
                  className="text-theme-text-secondary hover:text-theme-text transition-colors"
                >
                  Driver Dispatch Console
                </Link>
              </li>
              <li>
                <Link
                  to="/admin"
                  className="text-theme-text-secondary hover:text-theme-text transition-colors"
                >
                  Fleet Admin Console
                </Link>
              </li>
            </ul>
          </div>

          {/* Access & Account */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-theme-text mb-3">
              Access & Setup
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link
                  to="/login"
                  className="text-theme-text-secondary hover:text-theme-text transition-colors"
                >
                  Sign In (Prototype)
                </Link>
              </li>
              <li>
                <Link
                  to="/register"
                  className="text-theme-text-secondary hover:text-theme-text transition-colors"
                >
                  Registration (Prototype)
                </Link>
              </li>
              <li>
                <a
                  href="http://localhost:5000/api/health"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-theme-text-secondary hover:text-theme-text transition-colors"
                >
                  API Health Status (Direct)
                </a>
              </li>
            </ul>
          </div>

          {/* Governance & Legal */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-theme-text mb-3">
              Governance & Policies
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link
                  to="/privacy"
                  className="text-theme-text-secondary hover:text-theme-text transition-colors"
                >
                  Privacy Policy (Review Placeholder)
                </Link>
              </li>
              <li>
                <Link
                  to="/terms"
                  className="text-theme-text-secondary hover:text-theme-text transition-colors"
                >
                  Terms & Conditions (Review Placeholder)
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-6 border-t border-theme-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-theme-text-secondary">
          <p>
            &copy; {new Date().getFullYear()} GoRide System Architecture. Software Engineering Academic Implementation.
          </p>
          <p className="text-[11px]">
            Serving Mumbai City, Mumbai Suburban, Palghar, Thane, Kalyan-Dombivli & Navi Mumbai
          </p>
        </div>
      </div>
    </footer>
  );
}
