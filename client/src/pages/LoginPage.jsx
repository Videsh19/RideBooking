import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, LogIn, AlertCircle, KeyRound, CheckCircle2, ArrowLeft, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Card from '../components/common/Card';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import LoadingSpinner from '../components/common/LoadingSpinner';

const API_BASE_URL = 'http://localhost:5000/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Password Recovery state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState(1); // 1 = Request, 2 = Reset
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryToken, setRecoveryToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState(null);
  const [recoveryError, setRecoveryError] = useState(null);
  const [devToken, setDevToken] = useState(null);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setRecoverySubmitting(true);
    setRecoveryError(null);
    setRecoveryMessage(null);
    setDevToken(null);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to generate reset request.');
      }
      setRecoveryMessage(data.message);
      if (data.devResetToken) {
        setDevToken(data.devResetToken);
        setRecoveryToken(data.devResetToken);
      }
      setRecoveryStep(2);
    } catch (err) {
      setRecoveryError(err.message);
    } finally {
      setRecoverySubmitting(false);
    }
  };

  const handleExecuteReset = async (e) => {
    e.preventDefault();
    setRecoverySubmitting(true);
    setRecoveryError(null);
    setRecoveryMessage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: recoveryToken.trim(),
          newPassword: newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Password reset failed.');
      }
      setRecoveryMessage(data.message);
      setRecoveryStep(3); // 3 = Complete
      setPassword(newPassword);
      setEmail(recoveryEmail);
    } catch (err) {
      setRecoveryError(err.message);
    } finally {
      setRecoverySubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const authenticatedUser = await login(email.trim(), password);

      // Determine destination: user's return URL or role-specific console
      const userRole = (authenticatedUser.role || '').toUpperCase();
      let targetPath = '/rider';

      if (userRole === 'DRIVER') {
        targetPath = '/driver';
      } else if (userRole === 'ADMIN') {
        targetPath = '/admin';
      }

      // If user came from a protected route of the SAME role, preserve it
      const fromPath = location.state?.from?.pathname;
      if (fromPath && (
        (userRole === 'RIDER' && fromPath.startsWith('/rider')) ||
        (userRole === 'DRIVER' && fromPath.startsWith('/driver')) ||
        (userRole === 'ADMIN' && fromPath.startsWith('/admin'))
      )) {
        targetPath = fromPath;
      }

      navigate(targetPath, { replace: true });
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickFill = (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError(null);
  };

  return (
    <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-lg bg-theme-primary text-white flex items-center justify-center mx-auto shadow-sm">
            <LogIn className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-theme-text">
            Sign In to GoRide
          </h1>
          <p className="text-xs text-theme-text-secondary">
            Access your verified passenger, driver partner, or fleet governance console
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-lg border border-red-800/40 bg-red-950/20 text-red-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-300">Authentication Failed</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <Card padding="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <Input
              label="Email Address"
              id="login-email"
              type="email"
              icon={Mail}
              placeholder="e.g. user@goride.internal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            {/* Password Field */}
            <Input
              label="Password"
              id="login-password"
              type="password"
              icon={Lock}
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setRecoveryEmail(email);
                  setRecoveryStep(1);
                  setRecoveryError(null);
                  setRecoveryMessage(null);
                  setShowForgotModal(true);
                }}
                className="text-xs text-theme-primary hover:underline font-medium"
                id="forgot-password-link"
              >
                Forgot password?
              </button>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full mt-2"
              id="login-submit-btn"
              disabled={submitting}
            >
              {submitting ? (
                <LoadingSpinner size="sm" label="Verifying Credentials..." />
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          {/* Seeded Demo Account Quick Access */}
          <div className="mt-6 pt-5 border-t border-theme-border">
            <span className="text-[11px] font-semibold text-theme-text-secondary block uppercase tracking-wider mb-2">
              Fast Demo Sign-In
            </span>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => handleQuickFill('rider@goride.internal', 'Password123!')}
                className="p-2 rounded-lg border border-theme-border bg-theme-surface hover:border-theme-primary text-theme-text text-center transition-colors"
              >
                <span className="font-semibold block">Rider</span>
                <span className="text-[10px] text-theme-text-secondary">Passenger</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill('driver@goride.internal', 'Password123!')}
                className="p-2 rounded-lg border border-theme-border bg-theme-surface hover:border-theme-primary text-theme-text text-center transition-colors"
              >
                <span className="font-semibold block">Driver</span>
                <span className="text-[10px] text-theme-text-secondary">Partner</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill('admin@goride.internal', 'AdminPassword123!')}
                className="p-2 rounded-lg border border-theme-border bg-theme-surface hover:border-theme-primary text-theme-text text-center transition-colors"
              >
                <span className="font-semibold block">Admin</span>
                <span className="text-[10px] text-theme-text-secondary">Fleet Gov</span>
              </button>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-theme-border text-center text-xs text-theme-text-secondary">
            Don't have an account yet?{' '}
            <Link
              to="/register"
              className="text-theme-primary font-semibold hover:underline"
            >
              Register here
            </Link>
          </div>
        </Card>

        {/* Secure Password Recovery Modal (REQ-009) */}
        {showForgotModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="relative w-full max-w-md p-6 rounded-2xl bg-theme-surface border border-theme-border shadow-2xl">
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-theme-text-secondary hover:text-theme-text hover:bg-theme-border/40"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-2 rounded-lg bg-theme-primary/10 text-theme-primary">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-theme-text">Account Password Recovery</h3>
                  <p className="text-xs text-theme-text-secondary">Cryptographically secure single-use recovery</p>
                </div>
              </div>

              {recoveryError && (
                <div className="mb-4 p-3 rounded-lg border border-red-800/40 bg-red-950/20 text-red-200 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p>{recoveryError}</p>
                </div>
              )}

              {recoveryStep === 1 && (
                <form onSubmit={handleRequestReset} className="space-y-4">
                  <p className="text-xs text-theme-text-secondary">
                    Enter your registered email address. If the account exists, password reset instructions will be generated.
                  </p>
                  <Input
                    label="Registered Email Address"
                    id="recovery-email"
                    type="email"
                    icon={Mail}
                    placeholder="user@goride.internal"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    required
                  />
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowForgotModal(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={recoverySubmitting}
                      id="request-reset-btn"
                    >
                      {recoverySubmitting ? <LoadingSpinner size="sm" label="Generating..." /> : 'Send Reset Link'}
                    </Button>
                  </div>
                </form>
              )}

              {recoveryStep === 2 && (
                <form onSubmit={handleExecuteReset} className="space-y-4">
                  <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40 text-emerald-300 text-xs flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Reset Instructions Generated</p>
                      <p className="mt-0.5 text-emerald-400/90">{recoveryMessage}</p>
                    </div>
                  </div>

                  {devToken && (
                    <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-800/40 text-[11px] text-amber-200">
                      <span className="font-bold block uppercase tracking-wider text-[10px] text-amber-400">Development Mode Helper</span>
                      <span className="text-[10px] font-mono break-all text-amber-300/90">{devToken}</span>
                      <p className="mt-1 text-[10px] text-amber-400/80">Token auto-populated for local development.</p>
                    </div>
                  )}

                  <Input
                    label="Reset Token"
                    id="recovery-token"
                    type="text"
                    icon={KeyRound}
                    placeholder="Enter 64-char reset token"
                    value={recoveryToken}
                    onChange={(e) => setRecoveryToken(e.target.value)}
                    required
                  />

                  <Input
                    label="New Password"
                    id="recovery-new-password"
                    type="password"
                    icon={Lock}
                    placeholder="Minimum 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />

                  <div className="flex justify-between items-center pt-2">
                    <button
                      type="button"
                      onClick={() => setRecoveryStep(1)}
                      className="text-xs text-theme-text-secondary hover:text-theme-text flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back
                    </button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={recoverySubmitting}
                      id="execute-reset-btn"
                    >
                      {recoverySubmitting ? <LoadingSpinner size="sm" label="Resetting..." /> : 'Update Password'}
                    </Button>
                  </div>
                </form>
              )}

              {recoveryStep === 3 && (
                <div className="text-center py-4 space-y-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-theme-text">Password Reset Successfully!</h4>
                    <p className="text-xs text-theme-text-secondary mt-1">
                      Your password has been securely updated. All previous sessions have been invalidated.
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="md"
                    className="w-full"
                    onClick={() => setShowForgotModal(false)}
                  >
                    Proceed to Sign In
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
