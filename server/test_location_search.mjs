import assert from 'node:assert/strict';

process.env.GEOCODING_API_URL = 'https://geocoder.test/api';
process.env.ROUTING_API_URL = 'https://router.test';

const locations = [
  {
    query: '42 Example Lane, Harborview',
    name: 'Example Lane',
    city: 'Harborview',
    country: 'Australia',
    longitude: 151.2093,
    latitude: -33.8688,
  },
  {
    query: '17 Sample Road, Northbridge',
    name: 'Sample Road',
    city: 'Northbridge',
    country: 'United Kingdom',
    longitude: -0.1276,
    latitude: 51.5072,
  },
];

const geocoderRequests = [];
const routeRequests = [];
let failGeocoder = false;

globalThis.fetch = async (input) => {
  const url = new URL(input);
  if (url.hostname === 'geocoder.test') {
    geocoderRequests.push(url);
    if (failGeocoder) throw new Error('geocoder offline');

    const place = locations.find(({ query }) =>
      url.searchParams.get('q').includes(query)
    );
    return new Response(
      JSON.stringify({
        features: place
          ? [{
              type: 'Feature',
              properties: {
                osm_type: 'W',
                osm_id: place.name,
                name: place.name,
                city: place.city,
                country: place.country,
              },
              geometry: {
                type: 'Point',
                coordinates: [place.longitude, place.latitude],
              },
            }]
          : [],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (url.hostname === 'router.test') {
    routeRequests.push(url);
    const routeCoordinates = url.pathname
      .split('/driving/')[1]
      .split(';')
      .map((point) => point.split(',').map(Number));

    return new Response(
      JSON.stringify({
        code: 'Ok',
        routes: [{
          distance: 2400,
          duration: 420,
          geometry: { type: 'LineString', coordinates: routeCoordinates },
        }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  throw new Error(`Unexpected fetch URL: ${url}`);
};

const { estimateFare, geocodeAddress, searchPlaces } = await import(
  './src/services/bookingService.js'
);

for (const place of locations) {
  const [result] = await searchPlaces(place.query);
  assert.ok(result, `Search returns ${place.query}`);
  assert.equal(result.name, place.name);
  assert.equal(result.territory, place.city);
  assert.equal(result.latitude, place.latitude);
  assert.equal(result.longitude, place.longitude);

  const estimate = await estimateFare({
    pickupAddress: `${place.name}, ${place.city}`,
    pickupLat: result.latitude,
    pickupLng: result.longitude,
    pickupTerritory: result.territory,
    destAddress: `${place.name} destination, ${place.city}`,
    destLat: result.latitude + 0.001,
    destLng: result.longitude + 0.001,
    destTerritory: result.territory,
    vehicleTier: 'STANDARD',
  });

  assert.deepEqual(estimate.pickupCoords, {
    latitude: result.latitude,
    longitude: result.longitude,
  });
  assert.deepEqual(estimate.routeGeometry.coordinates[0], [
    result.longitude,
    result.latitude,
  ]);
  assert.equal(estimate.pickupZone, result.territory);

  const routeCoordinates = routeRequests.at(-1).pathname
    .split('/driving/')[1]
    .split(';')
    .map((point) => point.split(',').map(Number));
  assert.deepEqual(routeCoordinates[0], [result.longitude, result.latitude]);
}

const resolvedAddress = await geocodeAddress(locations[1].query);
assert.equal(resolvedAddress.name, locations[1].name);
assert.equal(resolvedAddress.latitude, locations[1].latitude);
assert.equal(resolvedAddress.longitude, locations[1].longitude);
assert.ok(geocoderRequests.every((url) => !url.searchParams.has('bbox')));
assert.deepEqual(await searchPlaces('location with no geocoder result'), []);
assert.equal(await geocodeAddress('location with no geocoder result'), null);

failGeocoder = true;
await assert.rejects(
  searchPlaces('unresolvable location'),
  (error) => error.code === 'GEOCODING_SERVICE_UNAVAILABLE'
);

console.log('Location search and route coordinate tests passed for two unrelated locations.');
