import { getDbPool } from '../config/db.js';

// Approved operational service territories across Mumbai Metropolitan Region
export const ALLOWED_SERVICE_ZONES = [
  'Mumbai City',
  'Mumbai Suburban',
  'Palghar district',
  'Thane district',
  'Kalyan-Dombivli',
  'Navi Mumbai',
];

// Tier pricing parameters derived from SRS REQ-020 and REQ-021
export const TIER_RATES = {
  STANDARD: { baseFare: 50, ratePerKm: 15, minFare: 70 },
  COMFORT: { baseFare: 80, ratePerKm: 22, minFare: 110 },
  XL: { baseFare: 130, ratePerKm: 32, minFare: 180 },
  standard: { baseFare: 50, ratePerKm: 15, minFare: 70 },
  comfort: { baseFare: 80, ratePerKm: 22, minFare: 110 },
  xl: { baseFare: 130, ratePerKm: 32, minFare: 180 },
};

// Mumbai Metropolitan Region (MMR) Geographic Boundary Box
const MMR_BOUNDS = {
  minLat: 18.70,
  maxLat: 20.25,
  minLon: 72.65,
  maxLon: 73.35,
};

// Curated high-frequency MMR transport hubs & landmarks for instant autocomplete
const MMR_LANDMARK_PRESETS = [
  {
    name: 'Gateway of India, Colaba',
    address: 'Apollo Bandar, Colaba, Mumbai, Maharashtra 400001',
    latitude: 18.9220,
    longitude: 72.8347,
    territory: 'Mumbai City',
  },
  {
    name: 'Chhatrapati Shivaji Maharaj Terminus (CST)',
    address: 'Fort, Mumbai, Maharashtra 400001',
    latitude: 18.9401,
    longitude: 72.8358,
    territory: 'Mumbai City',
  },
  {
    name: 'Marine Drive Promenade',
    address: 'Netaji Subhash Chandra Bose Road, Mumbai, Maharashtra 400020',
    latitude: 18.9432,
    longitude: 72.8230,
    territory: 'Mumbai City',
  },
  {
    name: 'Dadar Western Railway Station',
    address: 'Dadar West, Mumbai, Maharashtra 400028',
    latitude: 19.0180,
    longitude: 72.8444,
    territory: 'Mumbai City',
  },
  {
    name: 'Worli Sea Face',
    address: 'Worli, Mumbai, Maharashtra 400018',
    latitude: 19.0068,
    longitude: 72.8159,
    territory: 'Mumbai City',
  },
  {
    name: 'Bandra Kurla Complex (BKC)',
    address: 'G Block BKC, Bandra East, Mumbai, Maharashtra 400051',
    latitude: 19.0607,
    longitude: 72.8547,
    territory: 'Mumbai Suburban',
  },
  {
    name: 'Chhatrapati Shivaji Maharaj International Airport (T2)',
    address: 'Sahar, Andheri East, Mumbai, Maharashtra 400099',
    latitude: 19.0896,
    longitude: 72.8656,
    territory: 'Mumbai Suburban',
  },
  {
    name: 'Andheri Metro Station',
    address: 'Andheri West, Mumbai, Maharashtra 400058',
    latitude: 19.1197,
    longitude: 72.8468,
    territory: 'Mumbai Suburban',
  },
  {
    name: 'Powai Lake Promenade',
    address: 'Hiranandani Gardens, Powai, Mumbai, Maharashtra 400076',
    latitude: 19.1176,
    longitude: 72.9056,
    territory: 'Mumbai Suburban',
  },
  {
    name: 'Borivali Railway Station',
    address: 'Borivali West, Mumbai, Maharashtra 400092',
    latitude: 19.2288,
    longitude: 72.8541,
    territory: 'Mumbai Suburban',
  },
  {
    name: 'Thane Railway Station (SATIS)',
    address: 'Thane West, Thane, Maharashtra 400601',
    latitude: 19.1869,
    longitude: 72.9755,
    territory: 'Thane district',
  },
  {
    name: 'Viviana Mall, Thane',
    address: 'Eastern Express Highway, Thane West, Maharashtra 400606',
    latitude: 19.2091,
    longitude: 72.9714,
    territory: 'Thane district',
  },
  {
    name: 'Mira Road Station',
    address: 'Mira Road East, Mira Bhayandar, Maharashtra 401107',
    latitude: 19.2812,
    longitude: 72.8560,
    territory: 'Thane district',
  },
  {
    name: 'Vashi Plaza / Bus Station',
    address: 'Sector 17, Vashi, Navi Mumbai, Maharashtra 400703',
    latitude: 19.0768,
    longitude: 72.9982,
    territory: 'Navi Mumbai',
  },
  {
    name: 'CBD Belapur Station Complex',
    address: 'Sector 11, CBD Belapur, Navi Mumbai, Maharashtra 400614',
    latitude: 19.0185,
    longitude: 73.0401,
    territory: 'Navi Mumbai',
  },
  {
    name: 'Kharghar Central Park',
    address: 'Sector 23, Kharghar, Navi Mumbai, Maharashtra 410210',
    latitude: 19.0436,
    longitude: 73.0682,
    territory: 'Navi Mumbai',
  },
  {
    name: 'Kalyan Junction Railway Station',
    address: 'Kalyan West, Kalyan-Dombivli, Maharashtra 421301',
    latitude: 19.2364,
    longitude: 73.1306,
    territory: 'Kalyan-Dombivli',
  },
  {
    name: 'Dombivli Railway Station',
    address: 'Dombivli East, Kalyan-Dombivli, Maharashtra 421201',
    latitude: 19.2184,
    longitude: 73.0867,
    territory: 'Kalyan-Dombivli',
  },
  {
    name: 'Vasai Road Railway Station',
    address: 'Vasai West, Palghar District, Maharashtra 401202',
    latitude: 19.3822,
    longitude: 72.8322,
    territory: 'Palghar district',
  },
  {
    name: 'Virar Railway Station',
    address: 'Virar West, Palghar District, Maharashtra 401303',
    latitude: 19.4554,
    longitude: 72.8105,
    territory: 'Palghar district',
  },
  {
    name: 'Palghar Railway Station',
    address: 'Palghar West, Palghar District, Maharashtra 401404',
    latitude: 19.6967,
    longitude: 72.7656,
    territory: 'Palghar district',
  },
];

/**
 * Validates whether a territory string is one of the 6 approved service zones
 */
export function isValidServiceZone(zone) {
  if (!zone || typeof zone !== 'string') return false;
  const normalized = zone.trim().toLowerCase();
  return ALLOWED_SERVICE_ZONES.some(
    (allowed) => allowed.toLowerCase() === normalized
  );
}

/**
 * Determines and validates the service territory from coordinates and place details.
 * Returns one of the 6 canonical territory names, or null if outside GoRide coverage.
 */
export function detectServiceTerritory(lat, lon, details = {}) {
  const numericLat = Number(lat);
  const numericLon = Number(lon);

  if (isNaN(numericLat) || isNaN(numericLon)) {
    return null;
  }

  // 1. Strict MMR boundary check
  if (
    numericLat < MMR_BOUNDS.minLat ||
    numericLat > MMR_BOUNDS.maxLat ||
    numericLon < MMR_BOUNDS.minLon ||
    numericLon > MMR_BOUNDS.maxLon
  ) {
    return null; // Outside GoRide operational territory
  }

  // Check if explicit validated territory is already provided in details
  if (details.territory && isValidServiceZone(details.territory)) {
    return details.territory;
  }

  // 2. Textual context matching from address/geocoder metadata
  const textContext = [
    details.name,
    details.street,
    details.locality,
    details.district,
    details.city,
    details.county,
    details.suburb,
    details.state_district,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    textContext.includes('kalyan') ||
    textContext.includes('dombivli') ||
    textContext.includes('thakurli') ||
    textContext.includes('titwala') ||
    textContext.includes('kdmc')
  ) {
    return 'Kalyan-Dombivli';
  }

  if (
    textContext.includes('mira bhayandar') ||
    textContext.includes('mira road') ||
    textContext.includes('bhayandar') ||
    textContext.includes('bhiwandi') ||
    textContext.includes('ulhasnagar') ||
    textContext.includes('ambernath') ||
    textContext.includes('badlapur') ||
    textContext.includes('thane')
  ) {
    return 'Thane district';
  }

  if (
    textContext.includes('navi mumbai') ||
    textContext.includes('vashi') ||
    textContext.includes('nerul') ||
    textContext.includes('belapur') ||
    textContext.includes('kharghar') ||
    textContext.includes('panvel') ||
    textContext.includes('airoli') ||
    textContext.includes('ghansoli') ||
    textContext.includes('kopar khairane') ||
    textContext.includes('seawoods') ||
    textContext.includes('ulwe') ||
    textContext.includes('dronagiri')
  ) {
    return 'Navi Mumbai';
  }

  if (
    textContext.includes('vasai') ||
    textContext.includes('virar') ||
    textContext.includes('nalasopara') ||
    textContext.includes('naigaon') ||
    textContext.includes('palghar') ||
    textContext.includes('boisar') ||
    textContext.includes('dahanu') ||
    textContext.includes('wada') ||
    textContext.includes('jawhar')
  ) {
    return 'Palghar district';
  }

  if (
    textContext.includes('mumbai city') ||
    textContext.includes('colaba') ||
    textContext.includes('fort') ||
    textContext.includes('nariman point') ||
    textContext.includes('marine drive') ||
    textContext.includes('cst') ||
    textContext.includes('churchgate') ||
    textContext.includes('byculla') ||
    textContext.includes('dadar') ||
    textContext.includes('worli') ||
    textContext.includes('parel') ||
    textContext.includes('lower parel') ||
    textContext.includes('mahim') ||
    textContext.includes('sion')
  ) {
    return 'Mumbai City';
  }

  if (
    textContext.includes('mumbai suburban') ||
    textContext.includes('bandra') ||
    textContext.includes('bkc') ||
    textContext.includes('kurla') ||
    textContext.includes('andheri') ||
    textContext.includes('juhu') ||
    textContext.includes('santacruz') ||
    textContext.includes('vile parle') ||
    textContext.includes('powai') ||
    textContext.includes('ghatkopar') ||
    textContext.includes('vikhroli') ||
    textContext.includes('bhandup') ||
    textContext.includes('mulund') ||
    textContext.includes('chembur') ||
    textContext.includes('trombay') ||
    textContext.includes('goregaon') ||
    textContext.includes('malad') ||
    textContext.includes('kandivali') ||
    textContext.includes('borivali') ||
    textContext.includes('dahisar')
  ) {
    return 'Mumbai Suburban';
  }

  // 3. Geographic bounding heuristics inside Mumbai MMR
  // Mumbai City (Island City: South of Mahim/Sion)
  if (numericLat < 19.04 && numericLon >= 72.78 && numericLon <= 72.89) {
    return 'Mumbai City';
  }

  // Mumbai Suburban (North of Mahim/Sion up to Dahisar/Mulund)
  if (numericLat >= 19.04 && numericLat <= 19.27 && numericLon >= 72.78 && numericLon <= 72.96) {
    return 'Mumbai Suburban';
  }

  // Thane district (Thane city, Majiwada, Ghodbunder, Kalwa, Mumbra)
  if (numericLat >= 19.16 && numericLat <= 19.35 && numericLon >= 72.92 && numericLon <= 73.05) {
    return 'Thane district';
  }
  // Mira-Bhayandar (western belt of Thane district)
  if (numericLat >= 19.26 && numericLat <= 19.34 && numericLon >= 72.82 && numericLon <= 72.91) {
    return 'Thane district';
  }

  // Navi Mumbai (Airoli down to CBD Belapur, Kharghar, Panvel)
  if (numericLon >= 72.97 && numericLon <= 73.18 && numericLat >= 18.88 && numericLat < 19.16) {
    return 'Navi Mumbai';
  }

  // Kalyan-Dombivli (Central railway belt east of Thane)
  if (numericLon >= 73.06 && numericLon <= 73.25 && numericLat >= 19.18 && numericLat <= 19.32) {
    return 'Kalyan-Dombivli';
  }

  // Palghar district (Vasai-Virar belt & northern district)
  if ((numericLat >= 19.32 && numericLon >= 72.70 && numericLon <= 73.20) || (numericLon < 72.90 && numericLat >= 19.32)) {
    return 'Palghar district';
  }

  // Fallback within valid MMR coordinate boundary defaults to Thane district
  return 'Thane district';
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

  const pLat = Number(pickupLat);
  const pLng = Number(pickupLng);
  const dLat = Number(destLat);
  const dLng = Number(destLng);

  if (isNaN(pLat) || isNaN(pLng) || isNaN(dLat) || isNaN(dLng)) {
    throw {
      statusCode: 400,
      code: 'INVALID_COORDINATES',
      message: 'Valid pickup and destination geographic coordinates (latitude and longitude) are required.',
    };
  }

  // Validate that both coordinates are inside GoRide's approved service territories
  const pickupTerritory = detectServiceTerritory(pLat, pLng, pickupDetails);
  const destTerritory = detectServiceTerritory(dLat, dLng, destDetails);

  if (!pickupTerritory) {
    throw {
      statusCode: 400,
      code: 'OUT_OF_SERVICE_AREA',
      message: `Pickup coordinates (${pLat.toFixed(4)}, ${pLng.toFixed(4)}) are outside GoRide's supported service area (${ALLOWED_SERVICE_ZONES.join(', ')}).`,
    };
  }

  if (!destTerritory) {
    throw {
      statusCode: 400,
      code: 'OUT_OF_SERVICE_AREA',
      message: `Destination coordinates (${dLat.toFixed(4)}, ${dLng.toFixed(4)}) are outside GoRide's supported service area (${ALLOWED_SERVICE_ZONES.join(', ')}).`,
    };
  }

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

  const routeData = await response.json();
  if (routeData.code !== 'Ok' || !routeData.routes || routeData.routes.length === 0) {
    throw {
      statusCode: 404,
      code: 'NO_DRIVING_ROUTE_FOUND',
      message: 'No drivable road route could be calculated between the selected origin and destination coordinates.',
    };
  }

  const primary = routeData.routes[0];
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
 * Search places and landmarks across Mumbai MMR with location autocomplete.
 * Merges high-frequency preset hubs with live OpenStreetMap/Photon geocoding.
 */
export async function searchPlaces(query) {
  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return [];
  }

  const cleanQuery = query.trim().toLowerCase();
  const results = [];
  const seenNames = new Set();

  // 1. Fast match against curated MMR landmark presets
  for (const preset of MMR_LANDMARK_PRESETS) {
    if (
      preset.name.toLowerCase().includes(cleanQuery) ||
      preset.address.toLowerCase().includes(cleanQuery) ||
      preset.territory.toLowerCase().includes(cleanQuery)
    ) {
      results.push({
        placeId: `preset-${preset.name.replace(/\s+/g, '-').toLowerCase()}`,
        name: preset.name,
        address: preset.address,
        latitude: preset.latitude,
        longitude: preset.longitude,
        territory: preset.territory,
      });
      seenNames.add(preset.name.toLowerCase());
    }
  }

  // 2. Query live Photon geocoder (bounded to Mumbai MMR)
  const geocodingBase = process.env.GEOCODING_API_URL?.trim() || 'https://photon.komoot.io/api';
  try {
    const photonUrl = `${geocodingBase.replace(/\/$/, '')}/?q=${encodeURIComponent(query.trim())}&limit=8&bbox=72.6,18.7,73.4,20.3`;
    const res = await fetch(photonUrl, {
      headers: { 'User-Agent': 'GoRide/1.0' },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.features)) {
        for (const f of data.features) {
          const props = f.properties || {};
          const coords = f.geometry?.coordinates;
          if (!coords || coords.length < 2) continue;

          const lon = coords[0];
          const lat = coords[1];
          const territory = detectServiceTerritory(lat, lon, props);

          // Only include results that resolve to a valid GoRide service territory
          if (!territory) continue;

          const placeName = props.name || props.street || props.locality || query;
          const addressParts = [
            props.name,
            props.street,
            props.locality,
            props.district,
            props.city || territory,
            props.postcode,
          ].filter(Boolean);

          const fullAddress = Array.from(new Set(addressParts)).join(', ');
          const lowerName = placeName.toLowerCase();

          if (!seenNames.has(lowerName)) {
            seenNames.add(lowerName);
            results.push({
              placeId: `osm-${props.osm_type || 'p'}-${props.osm_id || Math.random()}`,
              name: placeName,
              address: fullAddress || `${placeName}, ${territory}`,
              latitude: lat,
              longitude: lon,
              territory,
            });
          }
        }
      }
    }
  } catch (geoErr) {
    // If external geocoder is unreachable, presets still provide instant fallback
  }

  return results.slice(0, 10);
}

/**
 * Geocode a freeform address string into geographic coordinates and territory
 */
export async function geocodeAddress(addressString) {
  if (!addressString || typeof addressString !== 'string') return null;

  // Check presets first
  const clean = addressString.trim().toLowerCase();
  const matchedPreset = MMR_LANDMARK_PRESETS.find(
    (p) =>
      clean.includes(p.name.toLowerCase()) ||
      clean.includes(p.address.toLowerCase()) ||
      p.name.toLowerCase().includes(clean)
  );

  if (matchedPreset) {
    return {
      address: matchedPreset.address,
      latitude: matchedPreset.latitude,
      longitude: matchedPreset.longitude,
      territory: matchedPreset.territory,
    };
  }

  // Query live geocoding service
  const geocodingBase = process.env.GEOCODING_API_URL?.trim() || 'https://photon.komoot.io/api';
  try {
    const photonUrl = `${geocodingBase.replace(/\/$/, '')}/?q=${encodeURIComponent(addressString)}&limit=1&bbox=72.6,18.7,73.4,20.3`;
    const res = await fetch(photonUrl, {
      headers: { 'User-Agent': 'GoRide/1.0' },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = await res.json();
      const f = data.features?.[0];
      if (f && f.geometry?.coordinates) {
        const lon = f.geometry.coordinates[0];
        const lat = f.geometry.coordinates[1];
        const territory = detectServiceTerritory(lat, lon, f.properties || {});
        if (territory) {
          return {
            address: addressString,
            latitude: lat,
            longitude: lon,
            territory,
          };
        }
      }
    }
  } catch (err) {
    // Geocoding request failed
  }

  return null;
}

/**
 * Calculate distance, duration, and fare estimation based on actual coordinates and road route.
 * Replaces old fixed territory-to-territory distance matrix.
 */
export async function estimateFare({
  pickupAddress,
  pickupLat,
  pickupLng,
  destAddress,
  destLat,
  destLng,
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

  let pLat = Number(pickupLat);
  let pLng = Number(pickupLng);
  let dLat = Number(destLat);
  let dLng = Number(destLng);

  // If coordinates are missing, resolve from address text
  if (isNaN(pLat) || isNaN(pLng)) {
    const resolvedPickup = await geocodeAddress(pickupAddress);
    if (!resolvedPickup) {
      throw {
        statusCode: 400,
        code: 'INVALID_PICKUP',
        message: `Could not resolve pickup location '${pickupAddress}'. Please select a specific address or landmark in Mumbai MMR.`,
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
        message: `Could not resolve destination location '${destAddress}'. Please select a specific address or landmark in Mumbai MMR.`,
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
    pickupDetails: { name: pickupAddress },
    destDetails: { name: destAddress },
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
  destAddress,
  destLat,
  destLng,
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

  let pLat = Number(pickupLat);
  let pLng = Number(pickupLng);
  let dLat = Number(destLat);
  let dLng = Number(destLng);

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
    pickupDetails: { name: pickupAddress },
    destDetails: { name: destAddress },
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
