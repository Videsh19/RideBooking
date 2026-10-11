import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      id="theme-toggle-btn"
      onClick={toggleTheme}
      className={`inline-flex items-center justify-center p-2 rounded-lg border border-theme-border bg-theme-surface text-theme-text hover:bg-opacity-80 transition-colors focus:outline-none focus:ring-2 focus:ring-theme-primary ${className}`}
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-label="Toggle visual theme"
    >
      {theme === 'dark' ? (
        <Sun className="w-4 h-4 text-amber-400" />
      ) : (
        <Moon className="w-4 h-4 text-theme-primary" />
      )}
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
