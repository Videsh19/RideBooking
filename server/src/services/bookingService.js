import { getDbPool } from '../config/db.js';

// Tier pricing parameters derived from SRS REQ-020 and REQ-021
export const TIER_RATES = {
  STANDARD: { baseFare: 50, ratePerKm: 15, minFare: 70 },
  COMFORT: { baseFare: 80, ratePerKm: 22, minFare: 110 },
  XL: { baseFare: 130, ratePerKm: 32, minFare: 180 },
  standard: { baseFare: 50, ratePerKm: 15, minFare: 70 },
  comfort: { baseFare: 80, ratePerKm: 22, minFare: 110 },
  xl: { baseFare: 130, ratePerKm: 32, minFare: 180 },
};

function getLocationArea(details = {}) {
  const area = [
    details.territory,
    details.locality,
    details.district,
    details.city,
    details.county,
    details.state,
    details.country,
    details.name,
  ].find((value) => typeof value === 'string' && value.trim());

  return area ? area.trim().slice(0, 50) : '';
}

function isValidCoordinatePair(latitude, longitude) {
  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function parseCoordinate(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) return Number(value);
  return NaN;
}

async function requestGeocodingFeatures(query, limit) {
  const geocodingBase =
    process.env.GEOCODING_API_URL?.trim() || 'https://photon.komoot.io/api';
  const endpoint = `${geocodingBase.replace(/\/$/, '')}/?q=${encodeURIComponent(query)}&limit=${limit}`;

  let response;
  try {
    response = await fetch(endpoint, {
      headers: { 'User-Agent': 'GoRide/1.0' },
      signal: AbortSignal.timeout(6000),
    });
  } catch (err) {
    throw {
      statusCode: 502,
      code: 'GEOCODING_SERVICE_UNAVAILABLE',
      message: `Location search service connection failed: ${err.message}`,
    };
  }

  if (!response.ok) {
    throw {
      statusCode: 502,
      code: 'GEOCODING_SERVICE_ERROR',
      message: `Location search provider returned HTTP status ${response.status}.`,
    };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw {
      statusCode: 502,
      code: 'INVALID_GEOCODING_RESPONSE',
      message: 'Location search provider returned an invalid response.',
    };
  }

  if (!Array.isArray(data.features)) {
    throw {
      statusCode: 502,
      code: 'INVALID_GEOCODING_RESPONSE',
      message: 'Location search provider returned an invalid response.',
    };
  }

  return data.features;
}

/**
 * Calculate driving road distance and travel duration using the configured routing API.
 * Never falls back to fixed territory distance matrices or fictitious numbers.
 */
export async function calculateRoadRoute({
  pickupLat,
  pickupLng,
  destLat,
  destLng,
  pickupDetails = {},
  destDetails = {},
  includeGeometry = false,
}) {
  const routingBaseUrl = process.env.ROUTING_API_URL?.trim();
  if (!routingBaseUrl) {
    throw {
      statusCode: 503,
      code: 'ROUTING_API_NOT_CONFIGURED',
      message: 'Routing service is not configured. Please define ROUTING_API_URL in server environment variables.',
    };
  }

  const pLat = parseCoordinate(pickupLat);
  const pLng = parseCoordinate(pickupLng);
  const dLat = parseCoordinate(destLat);
  const dLng = parseCoordinate(destLng);

  if (
    !isValidCoordinatePair(pLat, pLng) ||
    !isValidCoordinatePair(dLat, dLng)
  ) {
    throw {
      statusCode: 400,
      code: 'INVALID_COORDINATES',
      message: 'Valid pickup and destination geographic coordinates (latitude and longitude) are required.',
    };
  }

  const pickupTerritory = getLocationArea(pickupDetails) || 'Unknown area';
  const destTerritory = getLocationArea(destDetails) || 'Unknown area';

  // Call Road Routing API (OSRM)
  const routeOptions = includeGeometry
    ? 'overview=full&geometries=geojson'
    : 'overview=false';
  const endpoint = `${routingBaseUrl.replace(/\/$/, '')}/route/v1/driving/${pLng},${pLat};${dLng},${dLat}?${routeOptions}`;

  let response;
  try {
    response = await fetch(endpoint, {
      headers: {
        'User-Agent': 'GoRide-UrbanMobility/1.0 (Ride Booking System)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    });
  } catch (err) {
    throw {
      statusCode: 502,
      code: 'ROUTING_SERVICE_UNAVAILABLE',
      message: `Road routing service connection failed: ${err.message}. Please verify ROUTING_API_URL connectivity.`,
    };
  }

  if (!response.ok) {
    throw {
      statusCode: 502,
      code: 'ROUTING_SERVICE_ERROR',
      message: `Routing provider returned HTTP status ${response.status}.`,
    };
  }

  let routeData;
  try {
    routeData = await response.json();
  } catch {
    throw {
      statusCode: 502,
      code: 'INVALID_ROUTING_RESPONSE',
      message: 'Routing provider returned an invalid response.',
    };
  }
  if (routeData.code !== 'Ok' || !routeData.routes || routeData.routes.length === 0) {
    throw {
      statusCode: 404,
      code: 'NO_DRIVING_ROUTE_FOUND',
      message: 'No drivable road route could be calculated between the selected origin and destination coordinates.',
    };
  }

  const primary = routeData.routes[0];
  if (
    !Number.isFinite(primary.distance) ||
    primary.distance < 0 ||
    !Number.isFinite(primary.duration) ||
    primary.duration < 0
  ) {
    throw {
      statusCode: 502,
      code: 'INVALID_ROUTING_RESPONSE',
      message: 'Routing provider returned invalid route distance or duration data.',
    };
  }
  const distanceKm = parseFloat((primary.distance / 1000).toFixed(2));
  const estimatedDurationMin = Math.max(1, Math.round(primary.duration / 60));
  const geometry = primary.geometry;
  const hasValidGeometry =
    includeGeometry &&
    geometry?.type === 'LineString' &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length >= 2 &&
    geometry.coordinates.every(
      (coordinate) =>
        Array.isArray(coordinate) &&
        coordinate.length >= 2 &&
        typeof coordinate[0] === 'number' &&
        Number.isFinite(coordinate[0]) &&
        coordinate[0] >= -180 &&
        coordinate[0] <= 180 &&
        typeof coordinate[1] === 'number' &&
        Number.isFinite(coordinate[1]) &&
        coordinate[1] >= -90 &&
        coordinate[1] <= 90
    );

  return {
    distanceKm,
    estimatedDurationMin,
    pickupTerritory,
    destTerritory,
    ...(hasValidGeometry
      ? {
          routeGeometry: {
            type: 'LineString',
            coordinates: geometry.coordinates.map(([longitude, latitude]) => [
              longitude,
              latitude,
            ]),
          },
        }
      : {}),
  };
}

/**
 * Calculates fare strictly from actual road distance and vehicle tier pricing rules
 */
export function calculateFareFromDistance(distanceKm, vehicleTier = 'STANDARD') {
  const tierKey = String(vehicleTier || '').trim().toUpperCase();
  if (!['STANDARD', 'COMFORT', 'XL'].includes(tierKey)) {
    throw {
      statusCode: 400,
      code: 'INVALID_VEHICLE_CATEGORY',
      message: `Invalid vehicle category '${vehicleTier}'. Supported categories are STANDARD, COMFORT, and XL.`,
    };
  }
  const tierConfig = TIER_RATES[tierKey];

  const calculated = tierConfig.baseFare + distanceKm * tierConfig.ratePerKm;
  const totalFare = Math.max(tierConfig.minFare, Math.round(calculated));

  return {
    vehicleTier: tierKey,
    vehicleCategory: tierKey,
    distanceKm,
    baseFare: tierConfig.baseFare,
    ratePerKm: tierConfig.ratePerKm,
    minFare: tierConfig.minFare,
    totalFare,
  };
}

/**
 * Search for locations globally using the configured Photon-compatible service.
 */
export async function searchPlaces(query) {
  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return [];
  }

  const features = await requestGeocodingFeatures(query.trim(), 10);
  const seenPlaces = new Set();
  const results = [];

  for (const feature of features) {
    const properties = feature?.properties || {};
    const coordinates = feature?.geometry?.coordinates;
    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !isValidCoordinatePair(coordinates[1], coordinates[0])
    ) {
      continue;
    }

    const [longitude, latitude] = coordinates;
    const name =
      properties.name ||
      properties.street ||
      properties.locality ||
      properties.city ||
      query.trim();
    const addressParts = [
      properties.name,
      properties.street,
      properties.locality,
      properties.district,
      properties.city,
      properties.state,
      properties.country,
      properties.postcode,
    ].filter((part) => typeof part === 'string' && part.trim());
    const address = [...new Set(addressParts)].join(', ') || name;
    const placeId = properties.osm_id
      ? `osm-${properties.osm_type || 'place'}-${properties.osm_id}`
      : `location-${latitude}-${longitude}-${name}`;

    if (seenPlaces.has(placeId)) continue;
    seenPlaces.add(placeId);
    results.push({
      placeId,
      name,
      address,
      latitude,
      longitude,
      territory: getLocationArea(properties),
    });
  }

  return results;
}

/**
 * Geocode a freeform address using the configured Photon-compatible service.
 */
export async function geocodeAddress(addressString) {
  if (!addressString || typeof addressString !== 'string' || !addressString.trim()) {
    return null;
  }

  const [feature] = await requestGeocodingFeatures(addressString.trim(), 1);
  const coordinates = feature?.geometry?.coordinates;
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !isValidCoordinatePair(coordinates[1], coordinates[0])
  ) {
    return null;
  }

  const properties = feature.properties || {};
  const name =
    properties.name ||
    properties.street ||
    properties.locality ||
    properties.city ||
    addressString.trim();
  const addressParts = [
    properties.name,
    properties.street,
    properties.locality,
    properties.district,
    properties.city,
    properties.state,
    properties.country,
    properties.postcode,
  ].filter((part) => typeof part === 'string' && part.trim());

  return {
    name,
    address: [...new Set(addressParts)].join(', ') || addressString.trim(),
    latitude: coordinates[1],
    longitude: coordinates[0],
    territory: getLocationArea(properties),
  };
}

/**
 * Calculate distance, duration, and fare estimation based on actual coordinates and road route.
 * Replaces old fixed territory-to-territory distance matrix.
 */
export async function estimateFare({
  pickupAddress,
  pickupLat,
  pickupLng,
  pickupTerritory,
  destAddress,
  destLat,
  destLng,
  destTerritory,
  vehicleTier,
  vehicleCategory,
}) {
  const chosenCategory = String(vehicleCategory || vehicleTier || '').trim().toUpperCase();
  if (!['STANDARD', 'COMFORT', 'XL'].includes(chosenCategory)) {
    throw {
      statusCode: 400,
      code: 'INVALID_VEHICLE_CATEGORY',
      message: `Invalid vehicle category '${vehicleCategory || vehicleTier}'. Supported categories are STANDARD, COMFORT, and XL.`,
    };
  }

  let pLat = parseCoordinate(pickupLat);
  let pLng = parseCoordinate(pickupLng);
  let dLat = parseCoordinate(destLat);
  let dLng = parseCoordinate(destLng);

  // If coordinates are missing, resolve from address text
  if (isNaN(pLat) || isNaN(pLng)) {
    const resolvedPickup = await geocodeAddress(pickupAddress);
    if (!resolvedPickup) {
      throw {
        statusCode: 400,
        code: 'INVALID_PICKUP',
        message: `Could not resolve pickup location '${pickupAddress}'. Select a place returned by location search or try a more specific address.`,
      };
    }
    pLat = resolvedPickup.latitude;
    pLng = resolvedPickup.longitude;
  }

  if (isNaN(dLat) || isNaN(dLng)) {
    const resolvedDest = await geocodeAddress(destAddress);
    if (!resolvedDest) {
      throw {
        statusCode: 400,
        code: 'INVALID_DESTINATION',
        message: `Could not resolve destination location '${destAddress}'. Select a place returned by location search or try a more specific address.`,
      };
    }
    dLat = resolvedDest.latitude;
    dLng = resolvedDest.longitude;
  }

  // Calculate actual driving route
  const route = await calculateRoadRoute({
    pickupLat: pLat,
    pickupLng: pLng,
    destLat: dLat,
    destLng: dLng,
    pickupDetails: { name: pickupAddress, territory: pickupTerritory },
    destDetails: { name: destAddress, territory: destTerritory },
    includeGeometry: true,
  });

  // Calculate tier fare from actual distance
  const fare = calculateFareFromDistance(route.distanceKm, chosenCategory);

  return {
    pickupAddress: pickupAddress || 'Selected Pickup Location',
    destAddress: destAddress || 'Selected Destination Location',
    pickupZone: route.pickupTerritory,
    destZone: route.destTerritory,
    pickupCoords: { latitude: pLat, longitude: pLng },
    destCoords: { latitude: dLat, longitude: dLng },
    vehicleTier: fare.vehicleTier,
    vehicleCategory: fare.vehicleCategory,
    distanceKm: route.distanceKm,
    estimatedDurationMin: route.estimatedDurationMin,
    ...(route.routeGeometry ? { routeGeometry: route.routeGeometry } : {}),
    baseFare: fare.baseFare,
    ratePerKm: fare.ratePerKm,
    minFare: fare.minFare,
    totalFare: fare.totalFare,
  };
}

/**
 * Booking.bookRide() implementation derived from UML and SRS REQ-018 to REQ-023
 * Persists selected addresses, coordinates, actual route distance, duration, and fare in MySQL.
 */
export async function createBooking({
  userId = 1,
  pickupAddress,
  pickupLat,
  pickupLng,
  pickupTerritory,
  destAddress,
  destLat,
  destLng,
  destTerritory,
  vehicleTier,
  vehicleCategory,
}) {
  if (!pickupAddress || typeof pickupAddress !== 'string' || !pickupAddress.trim()) {
    throw { statusCode: 400, code: 'INVALID_PICKUP', message: 'Pickup address is required.' };
  }
  if (!destAddress || typeof destAddress !== 'string' || !destAddress.trim()) {
    throw { statusCode: 400, code: 'INVALID_DESTINATION', message: 'Destination address is required.' };
  }

  const chosenCategory = String(vehicleCategory || vehicleTier || '').trim().toUpperCase();
  if (!['STANDARD', 'COMFORT', 'XL'].includes(chosenCategory)) {
    throw {
      statusCode: 400,
      code: 'INVALID_VEHICLE_CATEGORY',
      message: `Vehicle category is required and must be one of 'STANDARD', 'COMFORT', or 'XL'.`,
    };
  }

  let pLat = parseCoordinate(pickupLat);
  let pLng = parseCoordinate(pickupLng);
  let dLat = parseCoordinate(destLat);
  let dLng = parseCoordinate(destLng);

  if (isNaN(pLat) || isNaN(pLng)) {
    const geocoded = await geocodeAddress(pickupAddress.trim());
    if (!geocoded) {
      throw {
        statusCode: 400,
        code: 'INVALID_PICKUP',
        message: `Unable to locate pickup address '${pickupAddress}'. Please select a verified place.`,
      };
    }
    pLat = geocoded.latitude;
    pLng = geocoded.longitude;
  }

  if (isNaN(dLat) || isNaN(dLng)) {
    const geocoded = await geocodeAddress(destAddress.trim());
    if (!geocoded) {
      throw {
        statusCode: 400,
        code: 'INVALID_DESTINATION',
        message: `Unable to locate destination address '${destAddress}'. Please select a verified place.`,
      };
    }
    dLat = geocoded.latitude;
    dLng = geocoded.longitude;
  }

  // Calculate actual driving route through the routing API
  const routeInfo = await calculateRoadRoute({
    pickupLat: pLat,
    pickupLng: pLng,
    destLat: dLat,
    destLng: dLng,
    pickupDetails: { name: pickupAddress, territory: pickupTerritory },
    destDetails: { name: destAddress, territory: destTerritory },
  });

  const fareInfo = calculateFareFromDistance(routeInfo.distanceKm, chosenCategory);

  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Insert Pickup Location with captured latitude and longitude
    const [pickupResult] = await connection.query(
      `INSERT INTO locations (address, service_zone, latitude, longitude) VALUES (?, ?, ?, ?)`,
      [pickupAddress.trim(), routeInfo.pickupTerritory, pLat, pLng]
    );
    const pickupLocId = pickupResult.insertId;

    // 2. Insert Destination Location with captured latitude and longitude
    const [destResult] = await connection.query(
      `INSERT INTO locations (address, service_zone, latitude, longitude) VALUES (?, ?, ?, ?)`,
      [destAddress.trim(), routeInfo.destTerritory, dLat, dLng]
    );
    const destLocId = destResult.insertId;

    // 3. Insert Route with actual road distance and duration
    const [routeResult] = await connection.query(
      `INSERT INTO routes (pickup_location_id, dest_location_id, distance_km, estimated_duration_min)
       VALUES (?, ?, ?, ?)`,
      [pickupLocId, destLocId, routeInfo.distanceKm, routeInfo.estimatedDurationMin]
    );
    const routeId = routeResult.insertId;

    // 4. Insert Booking (Initial state: REQUESTED as per BookingStatus enum)
    const [bookingResult] = await connection.query(
      `INSERT INTO bookings (
         user_id, route_id, pickup_address, dest_address,
         pickup_zone, dest_zone, vehicle_tier, status, total_fare,
         base_fare, rate_per_km
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'REQUESTED', ?, ?, ?)`,
      [
        userId,
        routeId,
        pickupAddress.trim(),
        destAddress.trim(),
        routeInfo.pickupTerritory,
        routeInfo.destTerritory,
        chosenCategory,
        fareInfo.totalFare,
        fareInfo.baseFare,
        fareInfo.ratePerKm,
      ]
    );
    const bookingId = bookingResult.insertId;

    await connection.commit();

    return await getBookingById(bookingId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Booking.getBookingStatus() implementation with joined location coordinates
 */
export async function getBookingById(bookingId) {
  const pool = getDbPool();
  const [rows] = await pool.query(
    `SELECT 
       b.booking_id,
       b.user_id,
       u.name AS passenger_name,
       u.phone_no AS passenger_phone,
       b.driver_id,
       ud.name AS driver_name,
       ud.phone_no AS driver_phone,
       d.license_no AS driver_license,
       d.vehicle_no AS driver_vehicle_no,
       d.vehicle_model AS driver_vehicle_model,
       d.vehicle_category AS driver_vehicle_category,
       d.vehicle_color AS driver_vehicle_color,
       d.passenger_capacity AS driver_vehicle_capacity,
       d.vehicle_approval_status AS driver_vehicle_status,
       d.rating AS driver_rating,
       b.pickup_address,
       b.dest_address,
       b.pickup_zone,
       b.dest_zone,
       b.vehicle_tier,
       b.vehicle_tier AS vehicle_category,
       b.status,
       b.payment_status,
       b.total_fare,
       b.base_fare,
       b.rate_per_km,
       b.cancellation_reason,
       b.cancellation_fee,
       b.cancelled_at,
       b.completed_at,
       b.booking_date,
       b.created_at,
       r.distance_km,
       r.estimated_duration_min,
       loc_p.latitude AS pickup_latitude,
       loc_p.longitude AS pickup_longitude,
       loc_d.latitude AS dest_latitude,
       loc_d.longitude AS dest_longitude,
       pay.payment_id,
       pay.payment_method,
       pay.payment_status AS transaction_payment_status,
       pay.cash_collection_status,
       pay.cash_collected_at,
       pay.cash_collected_by_driver_id,
       pay.transaction_id,
       pay.payment_date,
       rat.rating_id,
       rat.rating AS rider_rating,
       rat.comments AS rider_comments,
       rat.created_at AS rating_created_at
     FROM bookings b
     JOIN users u ON b.user_id = u.user_id
     LEFT JOIN driver_profiles d ON b.driver_id = d.driver_id
     LEFT JOIN users ud ON d.user_id = ud.user_id
     LEFT JOIN routes r ON b.route_id = r.route_id
     LEFT JOIN locations loc_p ON r.pickup_location_id = loc_p.location_id
     LEFT JOIN locations loc_d ON r.dest_location_id = loc_d.location_id
     LEFT JOIN payments pay ON pay.payment_id = (
       SELECT candidate.payment_id
       FROM payments candidate
       WHERE candidate.booking_id = b.booking_id
         AND (
           candidate.payment_status = 'SUCCESS'
           OR (
             candidate.payment_method = 'Cash'
             AND (
               candidate.cash_collection_status = 'OUTSTANDING'
               OR candidate.cash_collection_status IS NULL
             )
           )
         )
       ORDER BY (
                  candidate.payment_method = 'Cash'
                  AND (
                    candidate.cash_collection_status = 'OUTSTANDING'
                    OR candidate.cash_collection_status IS NULL
                  )
                ) DESC,
                (candidate.payment_status = 'SUCCESS') DESC,
                candidate.payment_date DESC,
                candidate.payment_id DESC
       LIMIT 1
     )
     LEFT JOIN ratings rat ON b.booking_id = rat.booking_id
     WHERE b.booking_id = ?`,
    [bookingId]
  );

  if (!rows || rows.length === 0) {
    throw { statusCode: 404, code: 'BOOKING_NOT_FOUND', message: `Booking ID ${bookingId} was not found.` };
  }

  return rows[0];
}

/**
 * Retrieve fresh driver coordinates for the owning rider's active booking only.
 */
export async function getBookingTracking({
  bookingId,
  userId,
  includeRouteGeometry = false,
}) {
  const pool = getDbPool();
  const [rows] = await pool.query(
    `SELECT b.status,
            b.driver_id IS NOT NULL AS has_assigned_driver,
            d.current_latitude,
            d.current_longitude,
            d.location_fix_timestamp_ms,
            pickup_location.latitude AS pickup_latitude,
            pickup_location.longitude AS pickup_longitude,
            destination_location.latitude AS dest_latitude,
            destination_location.longitude AS dest_longitude
     FROM bookings b
     LEFT JOIN driver_profiles d ON b.driver_id = d.driver_id
     LEFT JOIN routes r ON b.route_id = r.route_id
     LEFT JOIN locations pickup_location ON r.pickup_location_id = pickup_location.location_id
     LEFT JOIN locations destination_location ON r.dest_location_id = destination_location.location_id
     WHERE b.booking_id = ? AND b.user_id = ?
     LIMIT 1`,
    [bookingId, userId]
  );

  if (rows.length === 0) {
    throw {
      statusCode: 404,
      code: 'BOOKING_NOT_FOUND',
      message: 'Booking not found.',
    };
  }

  const booking = rows[0];
  const latitude = Number(booking.current_latitude);
  const longitude = Number(booking.current_longitude);
  const rawFixTimestampMs = booking.location_fix_timestamp_ms;
  const fixTimestampMs = typeof rawFixTimestampMs === 'number'
    ? rawFixTimestampMs
    : typeof rawFixTimestampMs === 'string' && /^[0-9]+$/.test(rawFixTimestampMs)
      ? Number(rawFixTimestampMs)
      : NaN;
  const now = Date.now();
  const isActiveRide = booking.status === 'CONFIRMED' || booking.status === 'ONGOING';
  const hasValidCoordinates =
    booking.current_latitude !== null &&
    booking.current_longitude !== null &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180;
  const hasFreshFix =
    (typeof rawFixTimestampMs === 'number' || typeof rawFixTimestampMs === 'string') &&
    Number.isSafeInteger(fixTimestampMs) &&
    fixTimestampMs > 0 &&
    fixTimestampMs >= now - 5 * 60 * 1000 &&
    fixTimestampMs <= now + 30 * 1000;
  const available =
    Boolean(booking.has_assigned_driver) &&
    isActiveRide &&
    hasValidCoordinates &&
    hasFreshFix;

  const tracking = {
    status: booking.status,
    available,
    fresh: available,
    latitude: available ? latitude : null,
    longitude: available ? longitude : null,
    fix_timestamp_ms: available ? fixTimestampMs : null,
  };

  const pickupLatitude = Number(booking.pickup_latitude);
  const pickupLongitude = Number(booking.pickup_longitude);
  const destinationLatitude = Number(booking.dest_latitude);
  const destinationLongitude = Number(booking.dest_longitude);
  const hasValidRouteCoordinates =
    booking.pickup_latitude !== null &&
    booking.pickup_latitude !== undefined &&
    booking.pickup_longitude !== null &&
    booking.pickup_longitude !== undefined &&
    booking.dest_latitude !== null &&
    booking.dest_latitude !== undefined &&
    booking.dest_longitude !== null &&
    booking.dest_longitude !== undefined &&
    Number.isFinite(pickupLatitude) &&
    pickupLatitude >= -90 &&
    pickupLatitude <= 90 &&
    Number.isFinite(pickupLongitude) &&
    pickupLongitude >= -180 &&
    pickupLongitude <= 180 &&
    Number.isFinite(destinationLatitude) &&
    destinationLatitude >= -90 &&
    destinationLatitude <= 90 &&
    Number.isFinite(destinationLongitude) &&
    destinationLongitude >= -180 &&
    destinationLongitude <= 180;

  if (
    includeRouteGeometry &&
    Boolean(booking.has_assigned_driver) &&
    isActiveRide &&
    hasValidRouteCoordinates
  ) {
    try {
      const route = await calculateRoadRoute({
        pickupLat: pickupLatitude,
        pickupLng: pickupLongitude,
        destLat: destinationLatitude,
        destLng: destinationLongitude,
        includeGeometry: true,
      });

      if (route.routeGeometry) {
        tracking.route_geometry = route.routeGeometry;
      }
    } catch (err) {
      console.warn(
        `[Booking Tracking] Route geometry unavailable for booking ${bookingId}:`,
        err.code || err.message
      );
    }
  }

  return tracking;
}

/**
 * List bookings for a passenger rider
 */
export async function listBookings({ userId = 1, limit = 20, offset = 0 } = {}) {
  const pool = getDbPool();
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const [rows] = await pool.query(
    `SELECT 
       b.booking_id,
       b.user_id,
       b.driver_id,
       ud.name AS driver_name,
       ud.phone_no AS driver_phone,
       d.license_no AS driver_license,
       d.vehicle_no AS driver_vehicle_no,
       d.vehicle_model AS driver_vehicle_model,
       d.vehicle_category AS driver_vehicle_category,
       d.vehicle_color AS driver_vehicle_color,
       d.passenger_capacity AS driver_vehicle_capacity,
       d.vehicle_approval_status AS driver_vehicle_status,
       d.rating AS driver_rating,
       b.pickup_address,
       b.dest_address,
       b.pickup_zone,
       b.dest_zone,
       b.vehicle_tier,
       b.vehicle_tier AS vehicle_category,
       b.status,
       b.payment_status,
       b.total_fare,
       b.base_fare,
       b.rate_per_km,
       b.cancellation_reason,
       b.cancellation_fee,
       b.cancelled_at,
       b.completed_at,
       b.booking_date,
       r.distance_km,
       r.estimated_duration_min,
       loc_p.latitude AS pickup_latitude,
       loc_p.longitude AS pickup_longitude,
       loc_d.latitude AS dest_latitude,
       loc_d.longitude AS dest_longitude,
       pay.payment_id,
       pay.payment_method,
       pay.payment_status AS transaction_payment_status,
       pay.cash_collection_status,
       pay.cash_collected_at,
       pay.cash_collected_by_driver_id,
       pay.transaction_id,
       pay.payment_date,
       rat.rating_id,
       rat.rating AS rider_rating,
       rat.comments AS rider_comments,
       rat.created_at AS rating_created_at
     FROM bookings b
     LEFT JOIN driver_profiles d ON b.driver_id = d.driver_id
     LEFT JOIN users ud ON d.user_id = ud.user_id
     LEFT JOIN routes r ON b.route_id = r.route_id
     LEFT JOIN locations loc_p ON r.pickup_location_id = loc_p.location_id
     LEFT JOIN locations loc_d ON r.dest_location_id = loc_d.location_id
     LEFT JOIN payments pay ON pay.payment_id = (
       SELECT candidate.payment_id
       FROM payments candidate
       WHERE candidate.booking_id = b.booking_id
         AND (
           candidate.payment_status = 'SUCCESS'
           OR (
             candidate.payment_method = 'Cash'
             AND (
               candidate.cash_collection_status = 'OUTSTANDING'
               OR candidate.cash_collection_status IS NULL
             )
           )
         )
       ORDER BY (
                  candidate.payment_method = 'Cash'
                  AND (
                    candidate.cash_collection_status = 'OUTSTANDING'
                    OR candidate.cash_collection_status IS NULL
                  )
                ) DESC,
                (candidate.payment_status = 'SUCCESS') DESC,
                candidate.payment_date DESC,
                candidate.payment_id DESC
       LIMIT 1
     )
     LEFT JOIN ratings rat ON b.booking_id = rat.booking_id
     WHERE b.user_id = ?
     ORDER BY b.booking_date DESC
     LIMIT ? OFFSET ?`,
    [userId, parsedLimit, parsedOffset]
  );

  const [countResult] = await pool.query(
    `SELECT COUNT(*) AS total FROM bookings WHERE user_id = ?`,
    [userId]
  );

  return {
    bookings: rows,
    total: countResult[0]?.total || 0,
    limit: parsedLimit,
    offset: parsedOffset,
  };
}

/**
 * Booking.cancelRide() implementation derived from SRS REQ-024 to REQ-028
 * Evaluates predefined cancellation fee rules:
 * - Free cancellation if booking is still in REQUESTED state (no driver dispatched)
 * - Free cancellation if cancelled within 2 minutes of booking creation
 * - Flat ₹50.00 cancellation fee if passenger cancels after driver has confirmed and grace period has elapsed
 */
export async function cancelBooking(bookingId, { reason = 'Cancelled by passenger before pickup' } = {}) {
  const booking = await getBookingById(bookingId);

  if (booking.status === 'CANCELLED') {
    throw { statusCode: 400, code: 'ALREADY_CANCELLED', message: 'This ride booking has already been cancelled.' };
  }

  if (booking.status === 'COMPLETED') {
    throw { statusCode: 400, code: 'CANNOT_CANCEL_COMPLETED', message: 'Cannot cancel a ride that has already been completed.' };
  }

  if (booking.status === 'ONGOING') {
    throw { statusCode: 400, code: 'CANNOT_CANCEL_ONGOING', message: 'Cannot cancel a ride that is already in progress.' };
  }

  // Calculate cancellation fee based on predefined business rules (REQ-027)
  let cancellationFee = 0.00;
  if (booking.status === 'CONFIRMED') {
    const bookingTime = new Date(booking.created_at || booking.booking_date).getTime();
    const elapsedSeconds = (Date.now() - bookingTime) / 1000;
    // 2-minute grace threshold: ₹0 if within 120s; flat ₹50.00 fee if cancelled late after driver commitment
    if (elapsedSeconds > 120) {
      cancellationFee = 50.00;
    }
  }

  const pool = getDbPool();
  const [result] = await pool.query(
    `UPDATE bookings 
     SET status = 'CANCELLED',
         cancellation_reason = ?,
         cancellation_fee = ?,
         cancelled_at = NOW()
     WHERE booking_id = ? AND status = ?`,
    [reason, cancellationFee, bookingId, booking.status]
  );

  if (result.affectedRows !== 1) {
    throw {
      statusCode: 409,
      code: 'RIDE_STATUS_CONFLICT',
      message: 'Ride status changed before the booking could be cancelled.',
    };
  }

  return await getBookingById(bookingId);
}
