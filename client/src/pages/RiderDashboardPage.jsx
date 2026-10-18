import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Navigation,
  Car,
  Zap,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RotateCcw,
  Compass,
  CreditCard,
  Star,
  DollarSign,
  Check,
  Receipt,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import Card from '../components/common/Card';
import LocationSearchInput from '../components/common/LocationSearchInput';
import LiveRideMap from '../components/common/LiveRideMap';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import EmptyState from '../components/common/EmptyState';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { getCashCollectionDisplayStatus } from '../utils/cashCollectionDisplay';

const API_BASE_URL = 'http://localhost:5000/api';
const TRACKING_POLL_INTERVAL_MS = 8000;
const TRACKING_REQUEST_TIMEOUT_MS = 15000;
const ROUTE_GEOMETRY_RETRY_INTERVAL_MS = 60000;
const LOCATION_FIX_MAX_AGE_MS = 5 * 60 * 1000;
const LOCATION_FIX_MAX_FUTURE_MS = 30 * 1000;

const isValidCoordinatePair = (latitude, longitude) =>
  typeof latitude === 'number' &&
  Number.isFinite(latitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  typeof longitude === 'number' &&
  Number.isFinite(longitude) &&
  longitude >= -180 &&
  longitude <= 180;

const isValidRouteGeometry = (geometry) =>
  geometry?.type === 'LineString' &&
  Array.isArray(geometry.coordinates) &&
  geometry.coordinates.length >= 2 &&
  geometry.coordinates.every(
    (coordinate) =>
      Array.isArray(coordinate) &&
      coordinate.length >= 2 &&
      isValidCoordinatePair(coordinate[1], coordinate[0])
  );

const getEstimateContextKey = (pickup, dropoff, vehicleTier) =>
  JSON.stringify([pickup.trim(), dropoff.trim(), vehicleTier]);

const isValidFixTimestamp = (timestamp) =>
  Number.isSafeInteger(timestamp) &&
  timestamp > 0 &&
  timestamp <= Date.now() + LOCATION_FIX_MAX_FUTURE_MS;

const isFreshFixTimestamp = (timestamp) =>
  isValidFixTimestamp(timestamp) &&
  timestamp >= Date.now() - LOCATION_FIX_MAX_AGE_MS;

export default function RiderDashboardPage() {
  // Location selection with coordinates and detected territories
  const [pickup, setPickup] = useState('Gateway of India, Colaba');
  const [pickupCoords, setPickupCoords] = useState({ lat: null, lng: null });
  const [pickupTerritory, setPickupTerritory] = useState('');
  const [pickupError, setPickupError] = useState('');

  const [dropoff, setDropoff] = useState('Dadar Western Railway Station');
  const [destCoords, setDestCoords] = useState({ lat: null, lng: null });
  const [destTerritory, setDestTerritory] = useState('');
  const [destError, setDestError] = useState('');

  const [selectedTier, setSelectedTier] = useState('STANDARD');

  // Upfront Fare estimation state
  const [estimate, setEstimate] = useState(null);
  const [estimateContextKey, setEstimateContextKey] = useState(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState(null);
  const estimateRequestGeneration = useRef(0);
  const [locationSelectionRevision, setLocationSelectionRevision] = useState(0);

  // Booking action state
  const [submitting, setSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(null);
  const [bookingError, setBookingError] = useState(null);

  // Trips ledger state
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);
  const [trackingByBooking, setTrackingByBooking] = useState({});

  // Payment Simulation modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payingBooking, setPayingBooking] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [paymentReceipt, setPaymentReceipt] = useState(null);

  // Post-trip Rating modal state
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [ratingBooking, setRatingBooking] = useState(null);
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingComments, setRatingComments] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState(null);
  const [ratingSuccess, setRatingSuccess] = useState(false);

  const vehicleTiers = [
    {
      id: 'STANDARD',
      name: 'GoRide Standard',
      capacity: '4 seats',
      description: 'Standard compact & sedan vehicles for regular city commutes.',
      icon: Car,
    },
    {
      id: 'COMFORT',
      name: 'GoRide Comfort',
      capacity: '4 seats',
      description: 'Spacious vehicles with top-rated driver partners and climate control.',
      icon: Zap,
    },
    {
      id: 'XL',
      name: 'GoRide XL',
      capacity: '6 seats',
      description: 'Extended SUVs and vans for groups and extra luggage.',
      icon: Users,
    },
  ];

  const invalidateEstimate = () => {
    estimateRequestGeneration.current += 1;
    setEstimate(null);
    setEstimateContextKey(null);
    setEstimateError(null);
    setEstimateLoading(false);
  };

  const handlePickupTextChange = (value) => {
    if (value !== pickup) {
      invalidateEstimate();
      setPickupCoords({ lat: null, lng: null });
      setPickupTerritory('');
      setPickupError('');
    }
    setPickup(value);
  };

  const handleDropoffTextChange = (value) => {
    if (value !== dropoff) {
      invalidateEstimate();
      setDestCoords({ lat: null, lng: null });
      setDestTerritory('');
      setDestError('');
    }
    setDropoff(value);
  };

  // Handlers for place selection via autocomplete
  const handleSelectPickup = (place) => {
    invalidateEstimate();
    setLocationSelectionRevision((revision) => revision + 1);
    if (!place) {
      setPickupCoords({ lat: null, lng: null });
      setPickupTerritory('');
      setPickupError('');
      return;
    }
    setPickup(place.name || place.address);
    setPickupCoords({ lat: place.latitude, lng: place.longitude });
    setPickupTerritory(place.territory || '');
    setPickupError('');
  };

  const handleSelectDropoff = (place) => {
    invalidateEstimate();
    setLocationSelectionRevision((revision) => revision + 1);
    if (!place) {
      setDestCoords({ lat: null, lng: null });
      setDestTerritory('');
      setDestError('');
      return;
    }
    setDropoff(place.name || place.address);
    setDestCoords({ lat: place.latitude, lng: place.longitude });
    setDestTerritory(place.territory || '');
    setDestError('');
  };

  const handleSelectTier = (tier) => {
    if (tier === selectedTier) return;
    invalidateEstimate();
    setSelectedTier(tier);
  };

  // Recalculate distance, duration, and fare whenever pickup, destination, or vehicle tier changes
  useEffect(() => {
    let isMounted = true;
    const requestGeneration = ++estimateRequestGeneration.current;
    const isCurrentRequest = () =>
      isMounted && requestGeneration === estimateRequestGeneration.current;

    async function fetchRouteEstimate() {
      const hasText = pickup.trim().length >= 3 && dropoff.trim().length >= 3;

      if (!hasText) {
        setEstimate(null);
        setEstimateContextKey(null);
        setEstimateError(null);
        setEstimateLoading(false);
        return;
      }

      try {
        setEstimateLoading(true);
        setEstimateError(null);

        const requestBody = {
          pickupAddress: pickup.trim(),
          destAddress: dropoff.trim(),
          vehicleTier: selectedTier,
        };
        if (isValidCoordinatePair(pickupCoords.lat, pickupCoords.lng)) {
          requestBody.pickupLat = pickupCoords.lat;
          requestBody.pickupLng = pickupCoords.lng;
        }
        if (isValidCoordinatePair(destCoords.lat, destCoords.lng)) {
          requestBody.destLat = destCoords.lat;
          requestBody.destLng = destCoords.lng;
        }

        const res = await fetch(`${API_BASE_URL}/bookings/estimate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        const json = await res.json();

        if (!res.ok) {
          throw new Error(
            json.error?.message || 'Could not calculate road route estimate.'
          );
        }

        const estimatedPickupCoords = json.data?.pickupCoords;
        const estimatedDestCoords = json.data?.destCoords;
        if (
          !json.success ||
          !isValidCoordinatePair(estimatedPickupCoords?.latitude, estimatedPickupCoords?.longitude) ||
          !isValidCoordinatePair(estimatedDestCoords?.latitude, estimatedDestCoords?.longitude)
        ) {
          throw new Error('Could not verify both pickup and destination locations.');
        }

        if (isCurrentRequest()) {
          setEstimate(json.data);
          setEstimateContextKey(getEstimateContextKey(pickup, dropoff, selectedTier));
          setPickupCoords({
            lat: estimatedPickupCoords.latitude,
            lng: estimatedPickupCoords.longitude,
          });
          setDestCoords({
            lat: estimatedDestCoords.latitude,
            lng: estimatedDestCoords.longitude,
          });
          if (json.data.pickupZone) {
            setPickupTerritory(json.data.pickupZone);
          }
          if (json.data.destZone) {
            setDestTerritory(json.data.destZone);
          }
        }
      } catch (err) {
        if (isCurrentRequest()) {
          setEstimate(null);
          setEstimateContextKey(null);
          setEstimateError(err.message);
        }
      } finally {
        if (isCurrentRequest()) setEstimateLoading(false);
      }
    }

    const timer = setTimeout(() => {
      fetchRouteEstimate();
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [pickup, dropoff, selectedTier, locationSelectionRevision]);

  const estimateMatchesCurrentContext =
    Boolean(estimate) &&
    estimateContextKey === getEstimateContextKey(pickup, dropoff, selectedTier) &&
    isValidCoordinatePair(estimate?.pickupCoords?.latitude, estimate?.pickupCoords?.longitude) &&
    isValidCoordinatePair(estimate?.destCoords?.latitude, estimate?.destCoords?.longitude) &&
    pickupCoords.lat === estimate.pickupCoords.latitude &&
    pickupCoords.lng === estimate.pickupCoords.longitude &&
    destCoords.lat === estimate.destCoords.latitude &&
    destCoords.lng === estimate.destCoords.longitude;

  const { token } = useAuth();

  const activeBookings = bookings.filter(
    (booking) => booking.status === 'CONFIRMED' || booking.status === 'ONGOING'
  );
  const trackableBookings = activeBookings.filter(
    (booking) => booking.driver_id !== null && booking.driver_id !== undefined
  );
  const trackingBookingKey = trackableBookings
    .map((booking) => `${booking.booking_id}:${booking.status}:${booking.driver_id}`)
    .join('|');
  const hasRefreshableBookings = bookings.some(
    (booking) =>
      booking.status === 'REQUESTED' ||
      booking.status === 'CONFIRMED' ||
      booking.status === 'ONGOING'
  );

  // Load real bookings from MySQL
  const loadBookings = async () => {
    if (!token) return;
    try {
      setLoadingBookings(true);
      const res = await fetch(`${API_BASE_URL}/bookings`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        setBookings(json.data || []);
      }
    } catch (err) {
      console.error('Failed to load trips from MySQL:', err);
    } finally {
      setLoadingBookings(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadBookings();
    }
  }, [token]);

  useEffect(() => {
    if (!token || !hasRefreshableBookings) return undefined;

    let isActive = true;
    let requestInFlight = false;
    let controller = null;

    const refreshBookings = async () => {
      if (!isActive || requestInFlight) return;

      requestInFlight = true;
      controller = new AbortController();
      try {
        const res = await fetch(`${API_BASE_URL}/bookings`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok || !json.success || !Array.isArray(json.data)) {
          throw new Error(json.error?.message || 'Could not refresh active rides.');
        }
        if (isActive) {
          setBookings(json.data);
        }
      } catch (err) {
        if (isActive && err.name !== 'AbortError') {
          console.error('Failed to refresh active rides:', err);
        }
      } finally {
        requestInFlight = false;
        controller = null;
      }
    };

    const interval = setInterval(refreshBookings, TRACKING_POLL_INTERVAL_MS);
    return () => {
      isActive = false;
      clearInterval(interval);
      controller?.abort();
    };
  }, [token, hasRefreshableBookings]);

  useEffect(() => {
    if (!token || trackableBookings.length === 0) return undefined;

    let isActive = true;
    const requests = new Map();
    const expiryTimers = new Map();
    const geometryRequestAt = new Map();

    setTrackingByBooking((current) => {
      const next = { ...current };
      trackableBookings.forEach((booking) => {
        next[booking.booking_id] = {
          token,
          driverId: booking.driver_id,
          phase: 'checking',
          bookingStatus: booking.status,
          coordinates: null,
          fixTimestampMs: null,
          routeGeometry: null,
        };
      });
      return next;
    });

    const pollBooking = async (booking) => {
      const bookingId = booking.booking_id;
      if (!isActive || requests.has(bookingId)) return;

      const now = Date.now();
      const lastGeometryRequestAt = geometryRequestAt.get(bookingId);
      const requestRouteGeometry =
        lastGeometryRequestAt === undefined ||
        now - lastGeometryRequestAt >= ROUTE_GEOMETRY_RETRY_INTERVAL_MS;
      if (requestRouteGeometry) {
        geometryRequestAt.set(bookingId, now);
      }

      const controller = new AbortController();
      requests.set(bookingId, controller);
      let requestTimedOut = false;
      const timeout = setTimeout(() => {
        requestTimedOut = true;
        controller.abort();
      }, TRACKING_REQUEST_TIMEOUT_MS);

      try {
        const trackingUrl = `${API_BASE_URL}/bookings/${bookingId}/tracking${
          requestRouteGeometry ? '?includeRouteGeometry=true' : ''
        }`;
        const res = await fetch(trackingUrl, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error?.message || 'Could not refresh driver location.');
        }

        const data = json.data;
        const hasValidCoordinates = isValidCoordinatePair(data.latitude, data.longitude);
        const hasValidTimestamp = isValidFixTimestamp(data.fix_timestamp_ms);
        const fixIsFresh = hasValidTimestamp && isFreshFixTimestamp(data.fix_timestamp_ms);
        const available =
          data.available === true &&
          data.fresh === true &&
          hasValidCoordinates &&
          fixIsFresh;
        const fixTimestampMs = hasValidTimestamp ? data.fix_timestamp_ms : null;

        if (!isActive) return;
        clearTimeout(expiryTimers.get(bookingId));
        expiryTimers.delete(bookingId);

        setTrackingByBooking((current) => ({
          ...current,
          [bookingId]: {
            token,
            driverId: booking.driver_id,
            phase: available
              ? 'available'
              : hasValidTimestamp && !fixIsFresh
                ? 'stale'
                : 'unavailable',
            bookingStatus: booking.status,
            coordinates: available
              ? { latitude: data.latitude, longitude: data.longitude }
              : null,
            fixTimestampMs,
            routeGeometry: isValidRouteGeometry(data.route_geometry)
              ? data.route_geometry
              : current[bookingId]?.token === token &&
                  current[bookingId]?.driverId === booking.driver_id
                ? current[bookingId].routeGeometry
                : null,
          },
        }));

        if (available) {
          const expiryDelay = Math.max(
            0,
            fixTimestampMs + LOCATION_FIX_MAX_AGE_MS - Date.now() + 1
          );
          const expiryTimer = setTimeout(() => {
            if (!isActive) return;
            setTrackingByBooking((current) => {
              const tracked = current[bookingId];
              if (
                tracked?.token !== token ||
                tracked.driverId !== booking.driver_id ||
                tracked.fixTimestampMs !== fixTimestampMs
              ) {
                return current;
              }
              return {
                ...current,
                [bookingId]: {
                  ...tracked,
                  phase: 'stale',
                  coordinates: null,
                },
              };
            });
            expiryTimers.delete(bookingId);
          }, expiryDelay);
          expiryTimers.set(bookingId, expiryTimer);
        }
      } catch (err) {
        if (!isActive || (err.name === 'AbortError' && !requestTimedOut)) return;
        clearTimeout(expiryTimers.get(bookingId));
        expiryTimers.delete(bookingId);
        setTrackingByBooking((current) => {
          const previous = current[bookingId];
          return {
            ...current,
            [bookingId]: {
              token,
              driverId: booking.driver_id,
              phase: 'error',
              bookingStatus: booking.status,
              coordinates: null,
              fixTimestampMs: null,
              routeGeometry:
                previous?.token === token &&
                previous.driverId === booking.driver_id
                  ? previous.routeGeometry
                  : null,
            },
          };
        });
      } finally {
        clearTimeout(timeout);
        if (requests.get(bookingId) === controller) {
          requests.delete(bookingId);
        }
      }
    };

    const pollAllBookings = () => {
      trackableBookings.forEach((booking) => {
        pollBooking(booking);
      });
    };

    pollAllBookings();
    const interval = setInterval(pollAllBookings, TRACKING_POLL_INTERVAL_MS);
    return () => {
      isActive = false;
      clearInterval(interval);
      requests.forEach((controller) => controller.abort());
      expiryTimers.forEach((timer) => clearTimeout(timer));
    };
  }, [token, trackingBookingKey]);

  // Submit Booking (Booking.bookRide())
  const handleRequestRide = async (e) => {
    e.preventDefault();
    setBookingError(null);
    setBookingSuccess(null);

    if (!pickup.trim() || !dropoff.trim()) {
      setBookingError('Please enter valid pickup and destination locations.');
      return;
    }
    if (!estimateMatchesCurrentContext) {
      setBookingError('Please select or verify both pickup and destination locations before booking.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE_URL}/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pickupAddress: pickup.trim(),
          pickupLat: estimate.pickupCoords.latitude,
          pickupLng: estimate.pickupCoords.longitude,
          destAddress: dropoff.trim(),
          destLat: estimate.destCoords.latitude,
          destLng: estimate.destCoords.longitude,
          vehicleTier: selectedTier,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to create ride booking.');
      }

      setBookingSuccess(json.data);
      // Refresh ledger from MySQL
      await loadBookings();
    } catch (err) {
      setBookingError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel Booking (Booking.cancelRide())
  const handleCancelBooking = async (bookingId) => {
    try {
      setCancellingId(bookingId);
      const res = await fetch(`${API_BASE_URL}/bookings/${bookingId}/cancel`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: 'Cancelled by passenger via workspace' }),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error?.message || 'Failed to cancel booking.');
      } else {
        await loadBookings();
      }
    } catch (err) {
      alert(`Cancellation failed: ${err.message}`);
    } finally {
      setCancellingId(null);
    }
  };

  // Open simulated payment modal
  const handleOpenPayment = (booking) => {
    setPayingBooking(booking);
    setPaymentMethod('UPI');
    setSimulateFailure(false);
    setPaymentError(null);
    setPaymentReceipt(null);
    setPaymentModalOpen(true);
  };

  // Submit simulated payment to backend
  const handleProcessPayment = async () => {
    if (!payingBooking || !token) return;
    try {
      setProcessingPayment(true);
      setPaymentError(null);
      const res = await fetch(`${API_BASE_URL}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bookingId: payingBooking.booking_id,
          paymentMethod,
          simulateFailure,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Simulated payment processing failed.');
      }

      if (json.data?.cash_collection_status === 'OUTSTANDING') {
        setPaymentModalOpen(false);
        await loadBookings();
        return;
      }

      setPaymentReceipt(json.data);
      await loadBookings();
    } catch (err) {
      setPaymentError(err.message);
    } finally {
      setProcessingPayment(false);
    }
  };

  // Open post-trip rating modal
  const handleOpenRating = (booking) => {
    setRatingBooking(booking);
    setRatingStars(5);
    setRatingHover(0);
    setRatingComments('');
    setRatingError(null);
    setRatingSuccess(false);
    setRatingModalOpen(true);
  };

  // Submit post-trip rating to backend
  const handleSubmitRating = async () => {
    if (!ratingBooking || !token) return;
    try {
      setSubmittingRating(true);
      setRatingError(null);
      const res = await fetch(`${API_BASE_URL}/ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bookingId: ratingBooking.booking_id,
          rating: ratingStars,
          comments: ratingComments,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Rating submission failed.');
      }

      setRatingSuccess(true);
      await loadBookings();
      setTimeout(() => {
        setRatingModalOpen(false);
      }, 1200);
    } catch (err) {
      setRatingError(err.message);
    } finally {
      setSubmittingRating(false);
    }
  };

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'REQUESTED':
        return 'purple';
      case 'CONFIRMED':
        return 'info';
      case 'ONGOING':
        return 'warning';
      case 'COMPLETED':
        return 'success';
      case 'CANCELLED':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  return (
    <DashboardLayout
      role="Rider"
      title="Rider Booking Workspace"
      subtitle="Road routing dispatch terminal with dynamic MMR service validation"
    >
      <div className="space-y-6">
        {/* Booking Confirmation Banner */}
        {bookingSuccess && (
          <div className="p-4 rounded-xl border border-purple-800/40 bg-purple-950/20 text-purple-200 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-sm text-theme-text">
                  Ride Booking Confirmed (Ref #GR-BK-{bookingSuccess.booking_id})
                </p>
                <p className="text-theme-text-secondary">
                  Your ride request from <strong>{bookingSuccess.pickup_address}</strong> ({bookingSuccess.pickup_zone}) to <strong>{bookingSuccess.dest_address}</strong> ({bookingSuccess.dest_zone}) has been persisted in MySQL.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
                  <span>Vehicle: <strong className="text-theme-primary uppercase font-bold">{bookingSuccess.vehicle_tier || bookingSuccess.vehicle_category}</strong></span>
                  <span>Distance: <strong className="text-theme-text">{bookingSuccess.distance_km} km</strong></span>
                  <span>Duration: <strong className="text-theme-text">{bookingSuccess.estimated_duration_min} mins</strong></span>
                  <span>Fare: <strong className="text-theme-text">₹{bookingSuccess.total_fare}</strong></span>
                  <span>Status: <Badge variant="purple" size="sm">{bookingSuccess.status}</Badge></span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBookingSuccess(null)}
              className="text-theme-text-secondary hover:text-theme-text p-1"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Validation / Booking Error */}
        {bookingError && (
          <div className="p-4 rounded-xl border border-red-800/40 bg-red-950/20 text-red-200 flex items-start gap-3 text-xs">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-red-300">Booking Request Failed</p>
              <p className="mt-0.5">{bookingError}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Route Parameters & Tier Selection */}
          <div className="lg:col-span-5 space-y-6">
            <Card
              title="Book a Ride"
              subtitle="Enter transit origin and destination points with location autocomplete"
            >
              <form onSubmit={handleRequestRide} className="space-y-4">
                {/* Pickup Origin Autocomplete */}
                <LocationSearchInput
                  label="Pickup Location"
                  id="pickup-input"
                  icon={MapPin}
                  placeholder="Search landmark, building or street in Mumbai MMR..."
                  value={pickup}
                  onChangeText={handlePickupTextChange}
                  onSelectPlace={handleSelectPickup}
                  selectedTerritory={pickupTerritory}
                  selectedCoords={pickupCoords}
                  error={pickupError}
                  required
                />

                {/* Destination Autocomplete */}
                <LocationSearchInput
                  label="Destination Location"
                  id="destination-input"
                  icon={Navigation}
                  placeholder="Search destination place, station or hub..."
                  value={dropoff}
                  onChangeText={handleDropoffTextChange}
                  onSelectPlace={handleSelectDropoff}
                  selectedTerritory={destTerritory}
                  selectedCoords={destCoords}
                  error={destError}
                  required
                />

                {/* Vehicle Class Selector */}
                <div className="pt-2">
                  <label className="block text-xs font-semibold text-theme-text mb-2 uppercase tracking-wider">
                    Select Vehicle Class
                  </label>
                  <div className="space-y-2">
                    {vehicleTiers.map((tier) => {
                      const Icon = tier.icon;
                      const isSelected = selectedTier === tier.id;
                      return (
                        <div
                          key={tier.id}
                          onClick={() => handleSelectTier(tier.id)}
                          className={`p-3 rounded-lg border cursor-pointer transition-all duration-150 ${isSelected
                              ? 'border-theme-primary bg-theme-surface'
                              : 'border-theme-border hover:border-theme-border hover:bg-theme-surface/50'
                            }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected
                                    ? 'bg-theme-primary text-white'
                                    : 'bg-theme-surface text-theme-text-secondary border border-theme-border'
                                  }`}
                              >
                                <Icon className="w-4 h-4" />
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-theme-text">
                                  {tier.name}
                                </h4>
                                <span className="text-[11px] text-theme-text-secondary">
                                  {tier.capacity}
                                </span>
                              </div>
                            </div>
                            <Badge variant={isSelected ? 'purple' : 'neutral'} size="sm">
                              {isSelected ? 'Selected' : 'Select'}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-theme-text-secondary mt-1.5 pl-10 leading-relaxed">
                            {tier.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Upfront Fare Estimate Box */}
                <div className="p-3.5 rounded-lg bg-theme-surface border border-theme-border text-xs space-y-2">
                  <div className="flex items-center justify-between font-semibold text-theme-text">
                    <div className="flex items-center gap-2">
                      <span>Road Route Fare Estimate</span>
                      <Badge variant="purple" size="sm">Road Routing API</Badge>
                    </div>
                    {estimateLoading ? (
                      <LoadingSpinner size="sm" label="" />
                    ) : (
                      <span className="text-base text-theme-primary font-bold">
                        ₹{estimate ? estimate.totalFare : '--'}
                      </span>
                    )}
                  </div>

                  {estimate && (
                    <div className="space-y-1 pt-1 border-t border-theme-border text-[11px] text-theme-text-secondary">
                      <div className="flex items-center justify-between">
                        <span>Driving Distance: <strong className="text-theme-text">{estimate.distanceKm} km</strong></span>
                        <span>Est. Duration: <strong className="text-theme-text">{estimate.estimatedDurationMin} mins</strong></span>
                      </div>
                      <div className="flex items-center justify-between pt-0.5">
                        <span>Base Fare: ₹{estimate.baseFare}</span>
                        <span>Rate: ₹{estimate.ratePerKm}/km</span>
                        <span>Vehicle: <strong className="text-theme-primary uppercase">{estimate.vehicleTier}</strong></span>
                      </div>
                    </div>
                  )}

                  {estimateError && (
                    <div className="text-[11px] text-red-400 flex items-start gap-1.5 pt-1 border-t border-theme-border">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{estimateError}</span>
                    </div>
                  )}

                  <p className="text-[10px] text-theme-text-secondary">
                    * Rates computed strictly from actual road network distance and SRS fare formula (REQ-020, REQ-021). Fixed zone distance matrix removed.
                  </p>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="w-full"
                  id="request-ride-btn"
                  disabled={
                    submitting ||
                    estimateLoading ||
                    Boolean(estimateError) ||
                    !estimateMatchesCurrentContext
                  }
                >
                  {submitting ? (
                    <LoadingSpinner size="sm" label="Creating Booking in MySQL..." />
                  ) : (
                    'Confirm Ride Booking'
                  )}
                </Button>
              </form>
            </Card>
          </div>

          {/* Right Column: Route Map Preview & Trips Ledger */}
          <div className="lg:col-span-7 space-y-6">
            {/* Live Driver Tracking */}
            <Card
              title="Live Ride Tracking"
              subtitle="Assigned driver locations for your confirmed and ongoing rides"
              padding="p-0 overflow-hidden"
            >
              {activeBookings.length > 0 ? (
                <div className="divide-y divide-theme-border">
                  {activeBookings.map((booking) => {
                    const tracking = trackingByBooking[booking.booking_id];
                    const trackingMatchesBooking =
                      tracking?.token === token &&
                      tracking.driverId === booking.driver_id &&
                      tracking.bookingStatus === booking.status;
                    const fixTimestampMs = trackingMatchesBooking
                      ? tracking.fixTimestampMs
                      : null;
                    const hasValidLastUpdate = isValidFixTimestamp(fixTimestampMs);
                    const locationIsFresh =
                      trackingMatchesBooking &&
                      tracking.phase === 'available' &&
                      isFreshFixTimestamp(fixTimestampMs) &&
                      isValidCoordinatePair(
                        tracking.coordinates?.latitude,
                        tracking.coordinates?.longitude
                      );
                    const lastUpdated = hasValidLastUpdate
                      ? new Date(fixTimestampMs).toLocaleTimeString()
                      : null;

                    let trackingMessage = 'Checking driver location…';
                    if (booking.driver_id === null || booking.driver_id === undefined) {
                      trackingMessage = 'No driver is assigned yet. Live location will appear after assignment.';
                    } else if (trackingMatchesBooking && tracking.phase === 'error') {
                      trackingMessage = 'Unable to refresh driver location. The marker is hidden; retrying.';
                    } else if (trackingMatchesBooking && tracking.phase === 'stale') {
                      trackingMessage = 'Driver location is stale. The marker is hidden.';
                    } else if (
                      trackingMatchesBooking &&
                      tracking.phase === 'available' &&
                      !locationIsFresh
                    ) {
                      trackingMessage = 'Driver location is no longer fresh. The marker is hidden.';
                    } else if (trackingMatchesBooking && tracking.phase === 'unavailable') {
                      trackingMessage = 'Driver location is unavailable or stale.';
                    } else if (locationIsFresh && lastUpdated) {
                      trackingMessage = `Fresh driver location · Updated ${lastUpdated}`;
                    }

                    return (
                      <div key={booking.booking_id} className="space-y-3 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-theme-text truncate">
                              {booking.pickup_address} → {booking.dest_address}
                            </p>
                            <p className="text-[11px] text-theme-text-secondary mt-0.5">
                              Ride #{booking.booking_id}
                              {booking.driver_name ? ` · Driver ${booking.driver_name}` : ''}
                            </p>
                          </div>
                          <Badge variant={getStatusBadgeVariant(booking.status)} size="sm">
                            {booking.status}
                          </Badge>
                        </div>

                        <p className={`text-[11px] ${
                          locationIsFresh ? 'text-emerald-400' : 'text-theme-text-secondary'
                        }`}>
                          {trackingMessage}
                          {!locationIsFresh && lastUpdated && (
                            <span> Last fix: {lastUpdated}.</span>
                          )}
                        </p>

                        {booking.driver_id !== null && booking.driver_id !== undefined && (
                          <LiveRideMap
                            driverCoordinates={
                              locationIsFresh ? tracking.coordinates : null
                            }
                            routeGeometry={
                              trackingMatchesBooking &&
                              isValidRouteGeometry(tracking.routeGeometry)
                                ? tracking.routeGeometry
                                : null
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-64 w-full bg-theme-surface/40 flex flex-col items-center justify-center p-6 text-center border-b border-theme-border relative">
                  <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#8B5CF6_1px,transparent_1px)] [background-size:16px_16px]" />
                  <div className="relative z-10 max-w-md space-y-2.5">
                    <div className="w-10 h-10 rounded-xl bg-theme-card border border-theme-border flex items-center justify-center text-theme-primary mx-auto shadow-sm">
                      <Navigation className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-theme-text">
                        No active rides to track
                      </h4>
                      <p className="text-xs text-theme-text-secondary mt-0.5 leading-relaxed">
                        An assigned driver&apos;s fresh location will appear here after a ride is confirmed.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Badge variant="purple" size="sm">
                        {estimate ? `${estimate.distanceKm} km Road Route` : 'Road Routing: Ready'}
                      </Badge>
                      {estimate && (
                        <Badge variant="info" size="sm">
                          ~{estimate.estimatedDurationMin} mins Travel Time
                        </Badge>
                      )}
                      <Badge variant="neutral" size="sm">
                        Coverage: 6 MMR Zones
                      </Badge>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-3.5 grid grid-cols-2 gap-3 text-xs bg-theme-card">
                <div className="p-2.5 rounded-lg border border-theme-border bg-theme-surface/30">
                  <span className="text-[11px] text-theme-text-secondary block">
                    Origin Service Territory
                  </span>
                  <span className="font-semibold text-theme-text block truncate mt-0.5">
                    {pickupTerritory || 'Auto-detecting...'}
                  </span>
                  {pickupCoords.lat && (
                    <span className="font-mono text-[10px] text-theme-text-secondary block mt-0.5">
                      {pickupCoords.lat.toFixed(4)}° N, {pickupCoords.lng.toFixed(4)}° E
                    </span>
                  )}
                </div>
                <div className="p-2.5 rounded-lg border border-theme-border bg-theme-surface/30">
                  <span className="text-[11px] text-theme-text-secondary block">
                    Destination Territory
                  </span>
                  <span className="font-semibold text-theme-text block truncate mt-0.5">
                    {destTerritory || 'Auto-detecting...'}
                  </span>
                  {destCoords.lat && (
                    <span className="font-mono text-[10px] text-theme-text-secondary block mt-0.5">
                      {destCoords.lat.toFixed(4)}° N, {destCoords.lng.toFixed(4)}° E
                    </span>
                  )}
                </div>
              </div>
            </Card>

            {/* Real Trips Ledger from MySQL */}
            <Card
              title="Passenger Rides Ledger (MySQL)"
              subtitle="Live trip records persisted in database with actual route metrics"
              headerAction={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadBookings}
                  disabled={loadingBookings}
                >
                  <RotateCcw className={`w-3.5 h-3.5 mr-1 ${loadingBookings ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              }
            >
              {loadingBookings ? (
                <div className="py-6 flex justify-center">
                  <LoadingSpinner label="Loading saved bookings from MySQL..." />
                </div>
              ) : bookings.length === 0 ? (
                <EmptyState
                  icon={Car}
                  title="No Bookings Yet"
                  description="Use the form on the left to create your first ride booking. It will be recorded in MySQL with actual route distance, duration, and fare."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-theme-border text-theme-text-secondary">
                        <th className="pb-2.5 font-semibold">Ref #</th>
                        <th className="pb-2.5 font-semibold">Route & Distance</th>
                        <th className="pb-2.5 font-semibold">Vehicle</th>
                        <th className="pb-2.5 font-semibold">Fare</th>
                        <th className="pb-2.5 font-semibold">Status</th>
                        <th className="pb-2.5 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-theme-border text-theme-text">
                      {bookings.map((item) => (
                        <tr key={item.booking_id}>
                          <td className="py-3 font-mono text-[11px] text-theme-text-secondary">
                            GR-BK-{item.booking_id}
                          </td>
                          <td className="py-3 max-w-xs">
                            <div className="font-medium text-theme-text truncate">
                              {item.pickup_address} → {item.dest_address}
                            </div>
                            <div className="text-[10px] text-theme-text-secondary flex items-center gap-2 mt-0.5">
                              <span>{item.distance_km} km ({item.estimated_duration_min}m)</span>
                              <span>•</span>
                              <span>{item.pickup_zone} ➔ {item.dest_zone}</span>
                            </div>
                            {item.driver_name && (
                              <div className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5">
                                <span>Driver: <strong>{item.driver_name}</strong> ({item.driver_vehicle_no} • {item.driver_vehicle_model})</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              {item.vehicle_tier || item.vehicle_category}
                            </span>
                          </td>
                          <td className="py-3 font-semibold text-theme-text">
                            ₹{item.total_fare}
                          </td>
                          <td className="py-3">
                            <div className="flex flex-col gap-1 items-start">
                              <Badge
                                variant={getStatusBadgeVariant(item.status)}
                                size="sm"
                              >
                                {item.status}
                              </Badge>
                              {item.status === 'COMPLETED' && (
                                getCashCollectionDisplayStatus(item.payment_method, item.cash_collection_status) === 'OUTSTANDING' ? (
                                  <span className="inline-flex items-center text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                                    CASH OUTSTANDING
                                  </span>
                                ) : getCashCollectionDisplayStatus(item.payment_method, item.cash_collection_status) === 'UNVERIFIED' ? (
                                  <span className="inline-flex items-center text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                                    CASH COLLECTION UNVERIFIED
                                  </span>
                                ) : item.payment_status === 'PAID' ? (
                                  <span className="inline-flex items-center text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                                    PAID ({item.payment_method || 'SIMULATED'})
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                                    UNPAID
                                  </span>
                                )
                              )}
                            </div>
                          </td>
                          <td className="py-3 text-right">
                            {item.status === 'REQUESTED' || item.status === 'CONFIRMED' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCancelBooking(item.booking_id)}
                                disabled={cancellingId === item.booking_id}
                                className="text-red-500 hover:text-red-600 hover:border-red-500"
                              >
                                {cancellingId === item.booking_id ? (
                                  <LoadingSpinner size="sm" label="" />
                                ) : (
                                  'Cancel'
                                )}
                              </Button>
                            ) : item.status === 'ONGOING' ? (
                              <span className="text-[10px] text-amber-400 font-medium">
                                In Transit
                              </span>
                            ) : item.status === 'CANCELLED' ? (
                              <div className="flex flex-col items-end">
                                <span className="text-[10px] text-theme-text-secondary italic">
                                  Cancelled
                                </span>
                                {Number(item.cancellation_fee) > 0 ? (
                                  <span className="text-[10px] font-semibold text-red-400" title="Assessed for late cancellation after driver confirmation">
                                    Fee: ₹{Number(item.cancellation_fee).toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-emerald-400 font-medium">
                                    Fee: ₹0 (Waived)
                                  </span>
                                )}
                              </div>
                            ) : item.status === 'COMPLETED' ? (
                              <div className="flex flex-col items-end gap-1.5">
                                {getCashCollectionDisplayStatus(item.payment_method, item.cash_collection_status) === 'OUTSTANDING' ? (
                                  <span className="text-[10px] text-amber-400 font-medium">
                                    Awaiting driver cash confirmation
                                  </span>
                                ) : getCashCollectionDisplayStatus(item.payment_method, item.cash_collection_status) === 'UNVERIFIED' ? (
                                  <span className="text-[10px] text-amber-400 font-medium">
                                    Cash collection status is unavailable
                                  </span>
                                ) : item.payment_status !== 'PAID' ? (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => handleOpenPayment(item)}
                                    className="bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-semibold py-1 px-2.5 flex items-center"
                                  >
                                    <CreditCard className="w-3.5 h-3.5 mr-1" />
                                    Pay ₹{item.total_fare}
                                  </Button>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    {item.rider_rating ? (
                                      <div
                                        className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded text-amber-400 font-semibold text-[11px]"
                                        title={item.rider_comments || 'No written review'}
                                      >
                                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                        <span>{item.rider_rating}/5</span>
                                      </div>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleOpenRating(item)}
                                        className="text-amber-400 border-amber-500/40 hover:bg-amber-500/10 text-[11px] py-1 px-2.5 flex items-center"
                                      >
                                        <Star className="w-3.5 h-3.5 mr-1" />
                                        Rate Ride
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-theme-text-secondary">
                                Settled
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* Payment Simulation Modal */}
      {paymentModalOpen && payingBooking && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-theme-surface border border-theme-border rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-theme-border pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-theme-text">
                    {paymentMethod === 'Cash' ||
                    paymentReceipt?.payment_method === 'Cash' ||
                    paymentReceipt?.paymentMethod === 'Cash'
                      ? 'Cash Collection Record'
                      : 'Simulated Payment Gateway'}
                  </h3>
                  <p className="text-xs text-theme-text-secondary font-mono">
                    Ref: GR-BK-{payingBooking.booking_id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPaymentModalOpen(false)}
                className="text-theme-text-secondary hover:text-theme-text text-lg p-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-3">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div>
                {paymentMethod === 'Cash' ||
                paymentReceipt?.payment_method === 'Cash' ||
                paymentReceipt?.paymentMethod === 'Cash' ? (
                  <>
                    <strong className="text-amber-300">Cash Collection:</strong> The payment record is confirmed only by the assigned driver. Cash is not processed by an electronic payment gateway.
                  </>
                ) : (
                  <>
                    <strong className="text-amber-300">Academic Demo Simulation:</strong> This interface simulates an electronic payment terminal. No real payment gateway is connected and no bank credentials, card numbers, or PINs are stored.
                  </>
                )}
              </div>
            </div>

            {paymentReceipt ? (
              /* Success State / Receipt */
              <div className="space-y-4 py-2">
                {paymentReceipt.payment_method === 'Cash' || paymentReceipt.paymentMethod === 'Cash' ? (
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                      <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <h4 className="text-sm font-bold text-emerald-400">
                      {paymentReceipt.cash_collection_status === 'COLLECTED' ||
                      paymentReceipt.cashCollectionStatus === 'COLLECTED'
                        ? 'Driver-Confirmed Cash Collection'
                        : 'Cash Collection Status Unverified'}
                    </h4>
                    <p className="text-xs text-theme-text-secondary">
                      This is a cash collection record, not a simulated electronic payment.
                    </p>
                  </div>
                ) : (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <h4 className="text-sm font-bold text-emerald-400">
                    Simulated Payment Successful
                  </h4>
                  <p className="text-xs text-theme-text-secondary">
                    This demo transaction was recorded successfully. No real money was transferred.
                  </p>
                </div>
                )}

                <div className="p-3.5 rounded-xl bg-theme-surface/50 border border-theme-border text-xs space-y-2.5 font-mono">
                  <div className="flex justify-between">
                    <span className="text-theme-text-secondary">
                      {paymentReceipt.payment_method === 'Cash' || paymentReceipt.paymentMethod === 'Cash'
                        ? 'Cash Record Ref:'
                        : 'Demo Txn Ref:'}
                    </span>
                    <span className="font-semibold text-purple-400">{paymentReceipt.transactionId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-text-secondary">Recorded Amount:</span>
                    <span className="font-semibold text-theme-text">₹{paymentReceipt.amount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-text-secondary">Payment Method:</span>
                    <span className="font-semibold text-theme-text">{paymentReceipt.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-text-secondary">
                      {paymentReceipt.payment_method === 'Cash' || paymentReceipt.paymentMethod === 'Cash'
                        ? 'Collection Timestamp:'
                        : 'Timestamp:'}
                    </span>
                    <span className="text-theme-text">
                      {(paymentReceipt.payment_method === 'Cash' || paymentReceipt.paymentMethod === 'Cash')
                        ? (paymentReceipt.cash_collected_at || paymentReceipt.cashCollectedAt
                          ? new Date(
                              paymentReceipt.cash_collected_at || paymentReceipt.cashCollectedAt
                            ).toLocaleString()
                          : 'Unavailable')
                        : new Date(paymentReceipt.paymentDate).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setPaymentModalOpen(false)}
                  >
                    Close
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold"
                    onClick={() => {
                      const bk = payingBooking;
                      setPaymentModalOpen(false);
                      handleOpenRating(bk);
                    }}
                  >
                    <Star className="w-4 h-4 mr-1.5 fill-slate-950" />
                    Rate Driver Now
                  </Button>
                </div>
              </div>
            ) : (
              /* Simulation Payment Form */
              <div className="space-y-4">
                {/* Trip & Fare summary */}
                <div className="p-3.5 rounded-xl bg-theme-surface/60 border border-theme-border flex justify-between items-center">
                  <div>
                    <span className="text-[11px] text-theme-text-secondary block">Destination Trip</span>
                    <span className="text-xs font-semibold text-theme-text block truncate max-w-xs">
                      {payingBooking.pickup_address} → {payingBooking.dest_address}
                    </span>
                    <span className="text-[10px] text-theme-text-secondary capitalize">
                      {payingBooking.vehicle_tier} Tier • {payingBooking.distance_km} km
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-theme-text-secondary block">Fare Due (MySQL)</span>
                    <span className="text-lg font-extrabold text-purple-400 font-mono">
                      ₹{payingBooking.total_fare}
                    </span>
                  </div>
                </div>

                {/* Payment Method Selector */}
                <div>
                  <label className="text-xs font-semibold text-theme-text block mb-2">
                    Select Payment Method:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'UPI', name: 'Simulated UPI', desc: 'Google Pay / PhonePe' },
                      { id: 'Card', name: 'Card', desc: 'Credit / Debit Card' },
                      { id: 'Cash', name: 'Cash', desc: 'Cash to Driver' },
                      { id: 'Wallet', name: 'Wallet', desc: 'Digital Wallet' },
                      { id: 'NetBanking', name: 'NetBanking', desc: 'Direct Bank Transfer' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setPaymentMethod(m.id);
                          if (m.id === 'Cash') setSimulateFailure(false);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all ${paymentMethod === m.id
                            ? 'border-purple-500 bg-purple-500/10 text-purple-300 font-semibold'
                            : 'border-theme-border bg-theme-surface/30 text-theme-text hover:border-theme-border/80'
                          }`}
                      >
                        <div className="text-xs font-bold">{m.name}</div>
                        <div className="text-[10px] text-theme-text-secondary">{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {paymentMethod !== 'Cash' && (
                  <p className="text-xs font-bold text-amber-300">
                    DEMO PAYMENT — NO REAL MONEY. Electronic payment methods are simulated only.
                  </p>
                )}

                {paymentMethod === 'Cash' && (
                  <p className="text-xs text-amber-300">
                    Cash remains outstanding until your assigned driver confirms collection.
                  </p>
                )}

                {paymentMethod === 'UPI' && (
                  <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 flex flex-col items-center gap-3 text-center">
                    <span className="text-xs font-semibold text-purple-300">
                      Demo-only QR graphic
                    </span>
                    <svg
                      viewBox="0 0 120 120"
                      role="img"
                      aria-label="Decorative demo QR graphic; not scannable"
                      className="h-32 w-32 rounded-lg bg-white p-2"
                    >
                      <path
                        fill="#111827"
                        d="M8 8h24v24H8zM14 14v12h12V14zM88 8h24v24H88zM94 14v12h12V14zM8 88h24v24H8zM14 94v12h12V94zM40 8h8v8h-8zM56 8h8v16h-8zM72 8h8v8h-8zM40 24h8v16h-8zM56 32h8v8h-8zM72 24h8v16h-8zM8 40h8v8H8zM24 40h16v8H24zM48 48h8v8h-8zM64 48h16v8H64zM8 56h16v8H8zM32 56h8v16h-8zM48 64h16v8H48zM72 56h8v16h-8zM88 40h8v16h-8zM104 40h8v8h-8zM88 64h16v8H88zM40 80h8v8h-8zM56 80h8v16h-8zM72 80h8v8h-8zM88 80h8v16h-8zM104 80h8v8h-8zM40 96h8v16h-8zM72 96h8v16h-8zM96 96h16v8H96z"
                      />
                      <rect x="38" y="44" width="44" height="32" rx="4" fill="white" />
                      <text
                        x="60"
                        y="64"
                        textAnchor="middle"
                        fill="#7c3aed"
                        fontSize="12"
                        fontWeight="700"
                      >
                        DEMO
                      </text>
                    </svg>
                    <p className="text-xs font-bold text-amber-300">
                      DEMO ONLY — NOT A REAL PAYMENT QR. No money will be transferred.
                    </p>
                  </div>
                )}

                {paymentMethod !== 'Cash' && (
                  /* Simulate Failure Checkbox (for testing failure handling & retries) */
                  <div className="p-3 rounded-xl border border-theme-border bg-theme-surface/30 flex items-center justify-between">
                    <div className="pr-3">
                      <span className="text-xs font-medium text-theme-text block">
                        Simulate Gateway Failure
                      </span>
                      <span className="text-[10px] text-theme-text-secondary block">
                        Test simulated transaction rejection and safe retry policies
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      id="simulateFailureCheck"
                      checked={simulateFailure}
                      onChange={(e) => setSimulateFailure(e.target.checked)}
                      className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-theme-border"
                    />
                  </div>
                )}

                {paymentError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{paymentError}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setPaymentModalOpen(false)}
                    disabled={processingPayment}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                    onClick={handleProcessPayment}
                    disabled={processingPayment}
                  >
                    {processingPayment ? (
                      <LoadingSpinner size="sm" label="Processing..." />
                    ) : (
                      paymentMethod === 'Cash'
                        ? `Record Cash ₹${payingBooking.total_fare}`
                        : `Pay ₹${payingBooking.total_fare}`
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Post-Trip Rating Modal */}
      {ratingModalOpen && ratingBooking && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-theme-surface border border-theme-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-theme-border pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Star className="w-5 h-5 fill-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-theme-text">Rate Your Trip</h3>
                  <p className="text-xs text-theme-text-secondary font-mono">
                    Ref: GR-BK-{ratingBooking.booking_id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRatingModalOpen(false)}
                className="text-theme-text-secondary hover:text-theme-text text-lg p-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Driver Information */}
            <div className="p-3.5 rounded-xl bg-theme-surface/60 border border-theme-border flex items-center justify-between">
              <div>
                <span className="text-[11px] text-theme-text-secondary block">Assigned Driver</span>
                <span className="text-xs font-bold text-theme-text block">
                  {ratingBooking.driver_name || 'Driver Partner'}
                </span>
                <span className="text-[10px] text-theme-text-secondary block mt-0.5">
                  {ratingBooking.driver_vehicle_no} • {ratingBooking.driver_vehicle_model}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-theme-text-secondary block">Completed Fare</span>
                <span className="text-sm font-bold text-theme-text">₹{ratingBooking.total_fare}</span>
              </div>
            </div>

            {ratingSuccess ? (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-bold text-emerald-400">Rating Submitted!</h4>
                <p className="text-xs text-theme-text-secondary">
                  Thank you for your feedback. Driver rating score has been updated.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Star rating selector (1-5 stars) */}
                <div className="text-center py-2">
                  <label className="text-xs text-theme-text-secondary block mb-2">
                    How was your experience?
                  </label>
                  <div className="flex items-center justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRatingStars(star)}
                        onMouseEnter={() => setRatingHover(star)}
                        onMouseLeave={() => setRatingHover(0)}
                        className="p-1 transition-transform hover:scale-125 focus:outline-none"
                      >
                        <Star
                          className={`w-7 h-7 transition-colors ${star <= (ratingHover || ratingStars)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-theme-border fill-transparent'
                            }`}
                        />
                      </button>
                    ))}
                  </div>
                  <div className="text-xs font-semibold text-amber-400 mt-2">
                    {[
                      '1 Star - Poor',
                      '2 Stars - Fair',
                      '3 Stars - Good',
                      '4 Stars - Very Good',
                      '5 Stars - Excellent',
                    ][(ratingHover || ratingStars) - 1]}
                  </div>
                </div>

                {/* Optional Written Review (up to 500 chars) */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-theme-text">
                      Written Review (Optional):
                    </label>
                    <span className="text-[10px] text-theme-text-secondary font-mono">
                      {ratingComments.length}/500
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={ratingComments}
                    onChange={(e) => setRatingComments(e.target.value)}
                    placeholder="Share feedback on cleanliness, punctuality, or driving..."
                    className="w-full text-xs p-3 rounded-xl bg-theme-surface/50 border border-theme-border text-theme-text placeholder:text-theme-text-secondary focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                {ratingError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{ratingError}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setRatingModalOpen(false)}
                    disabled={submittingRating}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold"
                    onClick={handleSubmitRating}
                    disabled={submittingRating}
                  >
                    {submittingRating ? (
                      <LoadingSpinner size="sm" label="Submitting..." />
                    ) : (
                      'Submit Rating'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
