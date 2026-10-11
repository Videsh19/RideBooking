import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Phone, Lock, UserPlus, Car, Navigation, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Card from '../components/common/Card';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function RegisterPage() {
  const [role, setRole] = useState('rider');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Driver-specific fields
  const [licenseNo, setLicenseNo] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleCategory, setVehicleCategory] = useState('STANDARD');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Password confirmation does not match the entered password.');
      return;
    }

    try {
      setSubmitting(true);
      const newUser = await register({
        name: fullName.trim(),
        email: email.trim(),
        phoneNo: phone.trim(),
        password,
        role: role.toUpperCase(),
        licenseNo: role === 'driver' ? licenseNo.trim() : undefined,
        vehicleNo: role === 'driver' ? vehicleNo.trim() : undefined,
        vehicleModel: role === 'driver' ? vehicleModel.trim() : undefined,
        vehicleCategory: role === 'driver' ? vehicleCategory : undefined,
      });

      if (newUser.role === 'DRIVER') {
        navigate('/driver', { replace: true });
      } else {
        navigate('/rider', { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-lg bg-theme-primary text-white flex items-center justify-center mx-auto shadow-sm">
            <UserPlus className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-theme-text">
            Create GoRide Account
          </h1>
          <p className="text-xs text-theme-text-secondary">
            Register as a passenger rider or onboard as an authorized driver partner
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-lg border border-red-800/40 bg-red-950/20 text-red-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-300">Registration Failed</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <Card padding="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Account Role Selector (Rider or Driver Only - Admin is strictly excluded) */}
            <div>
              <label className="block text-xs font-semibold text-theme-text mb-2 uppercase tracking-wider">
                Registration Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRole('rider');
                    setError(null);
                  }}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all duration-150 ${
                    role === 'rider'
                      ? 'border-theme-primary bg-theme-surface text-theme-primary font-semibold'
                      : 'border-theme-border text-theme-text-secondary hover:text-theme-text hover:bg-theme-surface'
                  }`}
                >
                  <Navigation className="w-4 h-4" />
                  <span>Passenger Rider</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRole('driver');
                    setError(null);
                  }}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all duration-150 ${
                    role === 'driver'
                      ? 'border-theme-primary bg-theme-surface text-theme-primary font-semibold'
                      : 'border-theme-border text-theme-text-secondary hover:text-theme-text hover:bg-theme-surface'
                  }`}
                >
                  <Car className="w-4 h-4" />
                  <span>Driver Partner</span>
                </button>
              </div>
              <p className="text-[10px] text-theme-text-secondary mt-1">
                * Note: Fleet Administrator accounts are provisioned via governance procedures and cannot be registered publicly.
              </p>
            </div>

            {/* Full Name */}
            <Input
              label="Full Legal Name"
              id="register-fullname"
              icon={User}
              placeholder="e.g. Alex Morgan"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />

            {/* Email Address */}
            <Input
              label="Email Address"
              id="register-email"
              type="email"
              icon={Mail}
              placeholder="e.g. alex@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            {/* Phone Number */}
            <Input
              label="Mobile Phone Number"
              id="register-phone"
              type="tel"
              icon={Phone}
              placeholder="+91 98200 00000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />

            {/* Driver-Specific Requirements */}
            {role === 'driver' && (
              <div className="p-3 rounded-lg border border-theme-border bg-theme-surface/50 space-y-3">
                <span className="text-[11px] font-semibold text-theme-text block uppercase tracking-wider">
                  Driver Partner Vehicle Information
                </span>
                <Input
                  label="Driving License Number"
                  id="driver-license"
                  placeholder="e.g. MH-01-2022-1234567"
                  value={licenseNo}
                  onChange={(e) => setLicenseNo(e.target.value)}
                  required
                />
                <Input
                  label="Vehicle Registration Number"
                  id="driver-vehicle-no"
                  placeholder="e.g. MH-02-AB-1234"
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value)}
                  required
                />
                <Input
                  label="Vehicle Make & Model"
                  id="driver-vehicle-model"
                  placeholder="e.g. Maruti Suzuki WagonR"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  required
                />
                <div>
                  <label className="block text-xs font-semibold text-theme-text mb-1.5 uppercase tracking-wider">
                    Vehicle Category Classification <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'STANDARD', label: 'STANDARD', desc: 'Compact / Sedan' },
                      { id: 'COMFORT', label: 'COMFORT', desc: 'Premium Sedan' },
                      { id: 'XL', label: 'XL', desc: 'SUV / 6 Seats' },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        id={`category-select-${cat.id.toLowerCase()}`}
                        onClick={() => setVehicleCategory(cat.id)}
                        className={`p-2 rounded-lg border text-left transition-all ${
                          vehicleCategory === cat.id
                            ? 'border-theme-primary bg-theme-primary/10 text-theme-primary font-semibold ring-1 ring-theme-primary'
                            : 'border-theme-border bg-theme-surface/70 text-theme-text-secondary hover:text-theme-text'
                        }`}
                      >
                        <div className="text-xs font-bold">{cat.label}</div>
                        <div className="text-[10px] text-theme-text-secondary truncate mt-0.5">{cat.desc}</div>
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-theme-text-secondary mt-1">
                    * Determines which ride categories you are certified to dispatch and accept.
                  </p>
                </div>
                <p className="text-[10px] text-theme-text-secondary">
                  Driver registrations are placed in PENDING review until authorized by system administration.
                </p>
              </div>
            )}

            {/* Password Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Password"
                id="register-password"
                type="password"
                icon={Lock}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                label="Confirm Password"
                id="register-confirm"
                type="password"
                icon={Lock}
                placeholder="••••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full mt-2"
              id="register-submit-btn"
              disabled={submitting}
            >
              {submitting ? (
                <LoadingSpinner size="sm" label="Creating Account..." />
              ) : (
                `Register as ${role === 'rider' ? 'Passenger Rider' : 'Driver Partner'}`
              )}
            </Button>
          </form>

          <div className="mt-5 pt-4 border-t border-theme-border text-center text-xs text-theme-text-secondary">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-theme-primary font-semibold hover:underline"
            >
              Sign In
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
