import React, { useState, useEffect } from 'react';
import {
  Car,
  Power,
  Shield,
  Clock,
  Compass,
  Inbox,
  CheckCircle2,
  AlertCircle,
  MapPin,
  RefreshCw,
  FileText,
  Clock3,
  Navigation,
  DollarSign,
  TrendingUp,
  User,
  Phone,
  ArrowRight,
  Check,
  X,
  Play,
  CheckCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import EmptyState from '../components/common/EmptyState';
import LoadingSpinner from '../components/common/LoadingSpinner';

const API_BASE_URL = 'http://localhost:5000/api';

export default function DriverDashboardPage() {
  const { token, user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(new Date());
  const [refreshFeedback, setRefreshFeedback] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [locationFeedback, setLocationFeedback] = useState(null);

  // Live dispatch and ride state
  const [dispatchQueue, setDispatchQueue] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [historyData, setHistoryData] = useState({ trips: [], totalCompleted: 0, totalEarnings: 0 });
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchDriverData = async (isManual = false) => {
    if (!token) return;
    if (isManual) {
      setRefreshing(true);
    }
    try {
      setError(null);

      // 1. Fetch Profile
      const profRes = await fetch(`${API_BASE_URL}/driver/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const profJson = await profRes.json();
      if (!profRes.ok) {
        throw new Error(profJson.error?.message || 'Failed to load driver profile.');
      }
      setProfile(profJson.data);
      const onlineStatus = Boolean(profJson.data.is_available);
      setIsOnline(onlineStatus);

      // If approved, load active ride, history, and queue
      if (profJson.data.approval_status === 'APPROVED') {
        const [activeRes, histRes] = await Promise.all([
          fetch(`${API_BASE_URL}/driver/rides/active`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE_URL}/driver/rides/history`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (activeRes.ok) {
          const activeJson = await activeRes.json();
          setActiveRide(activeJson.data || null);
        } else {
          const activeJson = await activeRes.json().catch(() => ({}));
          console.warn('[DriverDashboard] Active ride fetch issue:', activeJson);
        }

        if (histRes.ok) {
          const histJson = await histRes.json();
          setHistoryData(histJson.data || { trips: [], totalCompleted: 0, totalEarnings: 0 });
        } else {
          const histJson = await histRes.json().catch(() => ({}));
          console.warn('[DriverDashboard] History fetch issue:', histJson);
        }

        // If online, fetch dispatch queue
        if (onlineStatus) {
          const queueRes = await fetch(`${API_BASE_URL}/driver/dispatch-queue`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (queueRes.ok) {
            const queueJson = await queueRes.json();
            setDispatchQueue(queueJson.data || []);
          } else {
            const queueJson = await queueRes.json().catch(() => ({}));
            console.warn('[DriverDashboard] Dispatch queue fetch issue:', queueJson);
          }
        } else {
          setDispatchQueue([]);
        }
      }

      if (isManual) {
        setLastRefreshedAt(new Date());
        setRefreshFeedback(true);
        setTimeout(() => setRefreshFeedback(false), 2500);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      if (isManual) {
        setRefreshing(false);
      }
    }
  };

  const handleManualRefresh = () => {
    fetchDriverData(true);
  };

  useEffect(() => {
    fetchDriverData();
    // Poll queue and active ride every 8 seconds if approved and online
    const interval = setInterval(() => {
      if (token && profile?.approval_status === 'APPROVED' && isOnline) {
        fetchDriverData(false);
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [token, isOnline, profile?.approval_status]);

  useEffect(() => {
    if (
      !token ||
      !user ||
      user.role !== 'DRIVER' ||
      !isOnline ||
      profile?.approval_status !== 'APPROVED'
    ) {
      setLocationFeedback(null);
      return undefined;
    }

    if (!navigator.geolocation) {
      setLocationFeedback({
        type: 'error',
        message: 'Location sharing is unavailable because this browser does not support geolocation.',
      });
      return undefined;
    }

    let isActive = true;
    let requestInFlight = false;
    let activeRequestController = null;
    let watchId;

    const reportGeolocationError = (geoError) => {
      if (!isActive) return;

      const message = geoError.code === geoError.PERMISSION_DENIED
        ? 'Location permission was denied. Allow location access in your browser settings to share your position.'
        : geoError.code === geoError.POSITION_UNAVAILABLE
          ? 'Your current location is unavailable. Check your device GPS or location settings.'
          : geoError.code === geoError.TIMEOUT
            ? 'Getting your location timed out. The browser will continue trying.'
            : 'Unable to read your current location.';

      setLocationFeedback({ type: 'error', message });
    };

    const sendLocation = async (position) => {
      if (!isActive || requestInFlight) return;

      const { latitude, longitude } = position.coords;
      const fixTimestampMs = position.timestamp;
      const now = Date.now();

      if (!Number.isSafeInteger(fixTimestampMs) || fixTimestampMs <= 0) {
        setLocationFeedback({
          type: 'error',
          message: 'The browser returned an invalid GPS timestamp. Waiting for a valid location fix.',
        });
        return;
      }
      if (fixTimestampMs < now - 5 * 60 * 1000) {
        setLocationFeedback({
          type: 'error',
          message: 'The GPS fix is stale. Waiting for a fresh location.',
        });
        return;
      }
      if (fixTimestampMs > now + 30 * 1000) {
        setLocationFeedback({
          type: 'error',
          message: 'The GPS fix timestamp is ahead of the current time. Waiting for a valid location.',
        });
        return;
      }

      // Drop overlapping samples rather than queueing fixes that may become stale.
      requestInFlight = true;
      const controller = new AbortController();
      activeRequestController = controller;
      try {
        const res = await fetch(`${API_BASE_URL}/driver/location`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ latitude, longitude, fixTimestampMs }),
          signal: controller.signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error?.message || 'Could not update your location.');
        }

        if (isActive) {
          setLocationFeedback({
            type: 'success',
            message: 'Your current location is being shared.',
          });
        }
      } catch (locationError) {
        if (isActive) {
          setLocationFeedback({
            type: 'error',
            message: locationError instanceof TypeError
              ? 'Network error while sharing your location. Check your internet connection.'
              : locationError.message || 'Could not update your location.',
          });
        }
      } finally {
        if (activeRequestController === controller) {
          activeRequestController = null;
        }
        requestInFlight = false;
      }
    };

    try {
      watchId = navigator.geolocation.watchPosition(
        sendLocation,
        reportGeolocationError,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
    } catch (geoError) {
      setLocationFeedback({
        type: 'error',
        message: geoError.message || 'Unable to start browser location sharing.',
      });
    }

    return () => {
      isActive = false;
      activeRequestController?.abort();
      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [token, user, isOnline, profile?.approval_status]);

  const handleToggleDuty = async () => {
    if (!token || updating) return;

    if (profile?.approval_status !== 'APPROVED') {
      alert('Your driver partner account is currently pending administrative review. Duty toggle will unlock upon approval.');
      return;
    }

    try {
      setUpdating(true);
      const newStatus = !isOnline;
      const res = await fetch(`${API_BASE_URL}/driver/duty`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isAvailable: newStatus }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to update duty status.');
      }

      setIsOnline(newStatus);
      await fetchDriverData();
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdating(false);
    }
  };

  // Accept a ride offer
  const handleAcceptRide = async (bookingId) => {
    try {
      setActionLoadingId(bookingId);
      const res = await fetch(`${API_BASE_URL}/driver/rides/${bookingId}/accept`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error?.message || 'Failed to accept ride request.');
      } else {
        await fetchDriverData();
      }
    } catch (err) {
      alert(`Accept failed: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Decline/Reject a ride offer
  const handleRejectRide = async (bookingId) => {
    try {
      setActionLoadingId(bookingId);
      const res = await fetch(`${API_BASE_URL}/driver/rides/${bookingId}/reject`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error?.message || 'Failed to decline ride request.');
      } else {
        // Remove locally from queue immediately
        setDispatchQueue((prev) => prev.filter((b) => b.booking_id !== bookingId));
      }
    } catch (err) {
      alert(`Decline failed: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Start Ride (CONFIRMED -> ONGOING)
  const handleStartRide = async (bookingId) => {
    try {
      setActionLoadingId(`start-${bookingId}`);
      const res = await fetch(`${API_BASE_URL}/driver/rides/${bookingId}/start`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error?.message || 'Failed to start trip.');
      } else {
        await fetchDriverData();
      }
    } catch (err) {
      alert(`Start trip failed: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Complete Ride (ONGOING -> COMPLETED)
  const handleCompleteRide = async (bookingId) => {
    try {
      setActionLoadingId(`complete-${bookingId}`);
      const res = await fetch(`${API_BASE_URL}/driver/rides/${bookingId}/complete`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error?.message || 'Failed to complete trip.');
      } else {
        await fetchDriverData();
      }
    } catch (err) {
      alert(`Complete trip failed: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  if (loading) {
    return (
      <DashboardLayout
        role="Driver"
        title="Driver Dispatch Console"
        subtitle="Verifying partner operational credentials from MySQL..."
      >
        <div className="py-16 flex justify-center">
          <LoadingSpinner label="Authenticating driver partner credentials..." />
        </div>
      </DashboardLayout>
    );
  }

  // 1. Pending Verification State: Unapproved driver partners cannot access live dispatch
  if (profile && profile.approval_status !== 'APPROVED') {
    return (
      <DashboardLayout
        role="Driver"
        title="Driver Partner Onboarding & Verification"
        subtitle="Operational authorization and municipal fleet approval review"
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={handleManualRefresh}
            disabled={refreshing || loading}
            id="driver-check-approval-btn"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Checking...' : 'Check Approval Status'}
          </Button>
        }
      >
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Status Banner */}
          <div className="p-4 rounded-xl border border-amber-800/40 bg-amber-950/20 text-amber-200 text-xs flex items-start gap-3">
            <Clock3 className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-amber-300">
                  Application In Review (Pending Administrative Approval)
                </span>
                <Badge variant="warning" size="sm">PENDING</Badge>
              </div>
              <p className="text-theme-text-secondary leading-relaxed">
                Your driver partner profile has been registered in the GoRide MySQL database. In accordance with municipal fleet compliance regulations, live ride dispatch controls remain locked until administrators verify your license and vehicle documents.
              </p>
            </div>
          </div>

          {/* Submitted Documentation Summary */}
          <Card
            title="Submitted Partner Credentials"
            subtitle="Verified relational records in goride_db.driver_profiles"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 rounded-lg border border-theme-border bg-theme-surface/40">
                <span className="text-[11px] text-theme-text-secondary block">Driver Partner Name</span>
                <span className="font-semibold text-theme-text text-sm block mt-0.5">{profile.name}</span>
                <span className="text-[10px] text-theme-text-secondary mt-1 block">{profile.email} • {profile.phone_no}</span>
              </div>

              <div className="p-3 rounded-lg border border-theme-border bg-theme-surface/40">
                <span className="text-[11px] text-theme-text-secondary block">Driving License Number</span>
                <span className="font-mono font-bold text-theme-text text-sm block mt-0.5">{profile.license_no}</span>
                <span className="text-[10px] text-emerald-400 mt-1 block">✓ Document submitted</span>
              </div>

              <div className="p-3 rounded-lg border border-theme-border bg-theme-surface/40">
                <span className="text-[11px] text-theme-text-secondary block">Vehicle Registration Number</span>
                <span className="font-mono font-bold text-theme-text text-sm block mt-0.5">{profile.vehicle_no}</span>
                <span className="text-[10px] text-theme-text-secondary mt-1 block">MMR Regional Transport Office</span>
              </div>

              <div className="p-3 rounded-lg border border-theme-border bg-theme-surface/40">
                <span className="text-[11px] text-theme-text-secondary block">Vehicle Make & Model</span>
                <span className="font-semibold text-theme-text text-sm block mt-0.5">{profile.vehicle_model}</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-theme-text-secondary">Category:</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    {profile.vehicle_category || 'UNCLASSIFIED'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 p-3.5 rounded-lg border border-theme-border bg-theme-surface text-xs text-theme-text-secondary flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-theme-text block">Next Steps for Full Driver Authorization:</span>
                <p className="mt-0.5">
                  The GoRide fleet governance team verifies insurance, municipal permits, and vehicle roadworthiness. Once marked <code className="text-theme-primary">APPROVED</code> in MySQL, this workspace will automatically unlock live duty toggles and the MMR dispatch queue.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // 2. Approved Driver Partner Console
  return (
    <DashboardLayout
      role="Driver"
      title="Driver Dispatch Console"
      subtitle="Shift controls, vehicle assignment, and dispatch queue"
      actions={
        <div className="flex items-center gap-2">
          {refreshFeedback && (
            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1 animate-pulse">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Updated
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={refreshing || loading}
            id="driver-refresh-btn"
            title={`Last synchronized at ${lastRefreshedAt.toLocaleTimeString()}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>

          <Button
            variant={isOnline ? 'primary' : 'secondary'}
            size="sm"
            onClick={handleToggleDuty}
            disabled={updating}
            id="driver-status-toggle-btn"
          >
            <Power className="w-3.5 h-3.5 mr-1" />
            {updating ? 'Updating...' : isOnline ? 'Status: Online' : 'Status: Offline'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="p-3.5 rounded-lg border border-red-800/40 bg-red-950/20 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {locationFeedback && (
          <div className={`p-3.5 rounded-lg border text-xs flex items-center gap-2 ${
            locationFeedback.type === 'success'
              ? 'border-emerald-800/40 bg-emerald-950/20 text-emerald-200'
              : 'border-amber-800/40 bg-amber-950/20 text-amber-200'
          }`}>
            <AlertCircle className={`w-4 h-4 flex-shrink-0 ${
              locationFeedback.type === 'success' ? 'text-emerald-400' : 'text-amber-400'
            }`} />
            <span>{locationFeedback.message}</span>
          </div>
        )}

        {profile && !profile.vehicle_category && (
          <div className="p-4 rounded-xl border border-amber-800/40 bg-amber-950/20 text-amber-200 text-xs flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-amber-300">Vehicle Category Unclassified</p>
              <p className="mt-0.5 text-theme-text-secondary leading-relaxed">
                Your driver partner profile does not have an assigned vehicle category. Under GoRide category dispatch policy, unclassified profiles are excluded from the dispatch queue until an administrator classifies your vehicle category (STANDARD, COMFORT, or XL).
              </p>
            </div>
          </div>
        )}

        {/* Shift Overview Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card padding="p-4">
            <span className="text-[11px] font-medium text-theme-text-secondary block">
              Driver Duty Status
            </span>
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
                }`}
              />
              <span className="text-sm font-bold text-theme-text">
                {isOnline ? 'Online (Available)' : 'Offline / Off-Duty'}
              </span>
            </div>
            <p className="text-[10px] text-theme-text-secondary mt-1">
              Toggle button switches operational duty state
            </p>
          </Card>

          <Card padding="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-theme-text-secondary">
                Assigned Vehicle
              </span>
              {profile?.vehicle_category ? (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  {profile.vehicle_category}
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  UNCLASSIFIED
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <Car className="w-4 h-4 text-theme-primary flex-shrink-0" />
              <span className="text-sm font-bold text-theme-text truncate">
                {profile ? profile.vehicle_model : 'Loading...'}
              </span>
            </div>
            <p className="text-[10px] text-theme-text-secondary mt-1 font-mono">
              {profile ? profile.vehicle_no : '--'}
            </p>
          </Card>

          <Card padding="p-4">
            <span className="text-[11px] font-medium text-theme-text-secondary block">
              Completed Trips
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-bold text-theme-text">
                {historyData.totalCompleted}
              </span>
              <span className="text-xs text-theme-text-secondary">rides</span>
            </div>
            <p className="text-[10px] text-theme-text-secondary mt-1">
              Persisted in goride_db.bookings
            </p>
          </Card>

          <Card padding="p-4">
            <span className="text-[11px] font-medium text-theme-text-secondary block">
              Total Ride Earnings
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-bold text-emerald-400">
                ₹{Number(historyData.totalEarnings || 0).toLocaleString()}
              </span>
            </div>
            <p className="text-[10px] text-theme-text-secondary mt-1">
              Real completed fare sum from MySQL
            </p>
          </Card>
        </div>

        {/* 1. Active Assigned Ride Card (if any) */}
        {activeRide && (
          <Card
            title={`Active Ride in Progress — Ref #GR-BK-${activeRide.booking_id}`}
            subtitle={`Current operational trip status: ${activeRide.status}`}
          >
            <div className="p-4 rounded-xl border border-purple-800/40 bg-purple-950/20 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-800/30 pb-3">
                <div className="flex items-center gap-2">
                  <Badge variant={activeRide.status === 'ONGOING' ? 'warning' : 'info'} size="md">
                    {activeRide.status === 'ONGOING' ? 'TRIP ONGOING' : 'DRIVER ASSIGNED (CONFIRMED)'}
                  </Badge>
                  <span className="text-xs text-theme-text-secondary">
                    Tier: <strong className="uppercase text-theme-text">{activeRide.vehicle_tier}</strong>
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-theme-text-secondary block">Estimated Fare</span>
                  <span className="text-lg font-bold text-theme-text">₹{activeRide.total_fare}</span>
                </div>
              </div>

              {/* Route Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-emerald-400 block">Pickup</span>
                      <p className="font-medium text-theme-text">{activeRide.pickup_address}</p>
                      <Badge variant="neutral" size="sm" className="mt-1">{activeRide.pickup_zone}</Badge>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 pt-2">
                    <Navigation className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-purple-400 block">Destination</span>
                      <p className="font-medium text-theme-text">{activeRide.dest_address}</p>
                      <Badge variant="neutral" size="sm" className="mt-1">{activeRide.dest_zone}</Badge>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 bg-theme-surface/50 p-3 rounded-lg border border-theme-border">
                  <span className="text-[11px] font-semibold text-theme-text block">Passenger Information:</span>
                  <div className="flex items-center gap-2 text-xs">
                    <User className="w-4 h-4 text-theme-text-secondary" />
                    <span className="font-medium text-theme-text">{activeRide.passenger_name || 'Passenger'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Phone className="w-4 h-4 text-theme-text-secondary" />
                    <span className="font-mono text-theme-text">{activeRide.passenger_phone || 'Confidential'}</span>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-theme-text-secondary pt-1 border-t border-theme-border">
                    <span>Distance: <strong className="text-theme-text">{activeRide.distance_km} km</strong></span>
                    <span>Duration: <strong className="text-theme-text">{activeRide.estimated_duration_min} min</strong></span>
                  </div>
                </div>
              </div>

              {/* Lifecycle Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-purple-800/30">
                {activeRide.status === 'CONFIRMED' && (
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => handleStartRide(activeRide.booking_id)}
                    disabled={actionLoadingId === `start-${activeRide.booking_id}`}
                  >
                    <Play className="w-4 h-4 mr-1.5" />
                    {actionLoadingId === `start-${activeRide.booking_id}` ? 'Starting Trip...' : 'Start Trip (Arrived at Pickup)'}
                  </Button>
                )}

                {activeRide.status === 'ONGOING' && (
                  <Button
                    variant="success"
                    size="md"
                    onClick={() => handleCompleteRide(activeRide.booking_id)}
                    disabled={actionLoadingId === `complete-${activeRide.booking_id}`}
                  >
                    <CheckCheck className="w-4 h-4 mr-1.5" />
                    {actionLoadingId === `complete-${activeRide.booking_id}` ? 'Completing Trip...' : 'Complete Trip (Arrived at Destination)'}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* 2. Dispatch Queue Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            <Card
              title="Live Ride Dispatch Queue"
              subtitle="Regional ride offers across Mumbai MMR"
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManualRefresh}
                  disabled={refreshing || loading}
                  id="driver-refresh-queue-btn"
                  title={`Last synchronized at ${lastRefreshedAt.toLocaleTimeString()}`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Refreshing...' : 'Refresh Queue'}
                </Button>
              }
            >
              {!isOnline ? (
                <EmptyState
                  icon={Power}
                  title="Driver Currently Offline"
                  description="Switch your status to Online in the top right to start receiving ride dispatch notifications."
                />
              ) : activeRide ? (
                <EmptyState
                  icon={Navigation}
                  title="Active Trip in Progress"
                  description="You are currently assigned to an active trip. Complete your ongoing ride above to receive new dispatch offers."
                />
              ) : dispatchQueue.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="Dispatch Queue Idle"
                  description="You are Online and visible in the GoRide network. Waiting for passenger requests in Mumbai MMR..."
                />
              ) : (
                <div className="space-y-3">
                  {dispatchQueue.map((item) => (
                    <div
                      key={item.booking_id}
                      className="p-4 rounded-xl border border-theme-border bg-theme-surface hover:border-theme-primary/50 transition-all text-xs space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-theme-text-secondary">
                            GR-BK-{item.booking_id}
                          </span>
                          <Badge variant="purple" size="sm" className="uppercase">
                            {item.vehicle_tier}
                          </Badge>
                          <span className="text-[10px] text-theme-text-secondary">
                            {new Date(item.booking_date).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-base font-bold text-theme-text">₹{item.total_fare}</span>
                        </div>
                      </div>

                      <div className="space-y-1.5 border-l-2 border-theme-primary/30 pl-3">
                        <div className="flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <span className="text-theme-text font-medium">{item.pickup_address}</span>
                        </div>
                        <div className="flex items-start gap-1.5">
                          <Navigation className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5" />
                          <span className="text-theme-text font-medium">{item.dest_address}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-theme-border">
                        <div className="flex items-center gap-4 text-[11px] text-theme-text-secondary">
                          <span>Route: <strong className="text-theme-text">{item.distance_km} km</strong></span>
                          <span>Est. Time: <strong className="text-theme-text">{item.estimated_duration_min} min</strong></span>
                          <span>Passenger: <strong className="text-theme-text">{item.passenger_name}</strong></span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleRejectRide(item.booking_id)}
                            disabled={actionLoadingId === item.booking_id}
                          >
                            <X className="w-3.5 h-3.5 mr-1" />
                            Decline
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleAcceptRide(item.booking_id)}
                            disabled={actionLoadingId === item.booking_id}
                          >
                            <Check className="w-3.5 h-3.5 mr-1" />
                            {actionLoadingId === item.booking_id ? 'Accepting...' : 'Accept Ride'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Completed Trips History Ledger */}
            <Card
              title="Driver Completed Trips Ledger"
              subtitle="Persisted ride history from MySQL bookings"
            >
              {historyData.trips.length === 0 ? (
                <p className="text-xs text-theme-text-secondary py-6 text-center">
                  No completed trips recorded yet. Complete assigned trips to view your ledger and earnings.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-theme-border text-theme-text-secondary">
                        <th className="pb-2.5 font-semibold">Booking ID</th>
                        <th className="pb-2.5 font-semibold">Passenger</th>
                        <th className="pb-2.5 font-semibold">Route</th>
                        <th className="pb-2.5 font-semibold">Distance</th>
                        <th className="pb-2.5 font-semibold">Fare Earned</th>
                        <th className="pb-2.5 font-semibold">Settlement</th>
                        <th className="pb-2.5 font-semibold">Completed At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-theme-border text-theme-text">
                      {historyData.trips.map((t) => (
                        <tr key={t.booking_id}>
                          <td className="py-2.5 font-mono text-[11px] text-theme-text-secondary">
                            GR-BK-{t.booking_id}
                          </td>
                          <td className="py-2.5 font-medium">
                            {t.passenger_name}
                          </td>
                          <td className="py-2.5 max-w-xs truncate text-theme-text-secondary">
                            {t.pickup_address} → {t.dest_address}
                          </td>
                          <td className="py-2.5 text-theme-text-secondary">
                            {t.distance_km} km
                          </td>
                          <td className="py-2.5 font-semibold text-emerald-400">
                            ₹{t.total_fare}
                          </td>
                          <td className="py-2.5">
                            {t.payment_status === 'PAID' ? (
                              <Badge variant="success" size="sm">PAID</Badge>
                            ) : (
                              <Badge variant="warning" size="sm">PENDING</Badge>
                            )}
                          </td>
                          <td className="py-2.5 font-mono text-[10px] text-theme-text-secondary">
                            {t.completed_at ? new Date(t.completed_at).toLocaleString() : t.updated_at ? new Date(t.updated_at).toLocaleString() : '--'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <Card
              title="Operational Service Boundaries"
              subtitle="Designated coverage zones"
            >
              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-lg border border-theme-border bg-theme-surface/40 flex items-center justify-between">
                  <span>Mumbai City & Suburban</span>
                  <Badge variant="purple" size="sm">Active</Badge>
                </div>
                <div className="p-2.5 rounded-lg border border-theme-border bg-theme-surface/40 flex items-center justify-between">
                  <span>Thane & Navi Mumbai</span>
                  <Badge variant="purple" size="sm">Active</Badge>
                </div>
                <div className="p-2.5 rounded-lg border border-theme-border bg-theme-surface/40 flex items-center justify-between">
                  <span>Kalyan-Dombivli & Palghar</span>
                  <Badge variant="purple" size="sm">Active</Badge>
                </div>
              </div>
            </Card>

            <Card
              title="Driver Rating & Verification"
              subtitle="Municipality compliance record"
            >
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-theme-border bg-theme-surface/40">
                  <span className="text-theme-text-secondary">Partner Rating</span>
                  <span className="font-bold text-amber-400 text-sm">★ {Number(profile?.rating || 5.0).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-theme-border bg-theme-surface/40">
                  <span className="text-theme-text-secondary">License State</span>
                  <span className="font-mono text-emerald-400">VERIFIED</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-theme-border bg-theme-surface/40">
                  <span className="text-theme-text-secondary">Vehicle Status</span>
                  <span className="font-mono text-theme-text">{profile?.vehicle_no}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
