import React, { useEffect } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet';
import { MapPin } from 'lucide-react';
import EmptyState from './EmptyState';
import 'leaflet/dist/leaflet.css';

const isValidLatitudeLongitude = (latitude, longitude) =>
  typeof latitude === 'number' &&
  Number.isFinite(latitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  typeof longitude === 'number' &&
  Number.isFinite(longitude) &&
  longitude >= -180 &&
  longitude <= 180;

const getDriverPosition = (coordinates) => {
  if (!coordinates || !isValidLatitudeLongitude(coordinates.latitude, coordinates.longitude)) {
    return null;
  }

  return [coordinates.latitude, coordinates.longitude];
};

const getRoutePositions = (geometry) => {
  if (
    geometry?.type !== 'LineString' ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length < 2 ||
    !geometry.coordinates.every(
      (coordinate) =>
        Array.isArray(coordinate) &&
        coordinate.length >= 2 &&
        isValidLatitudeLongitude(coordinate[1], coordinate[0])
    )
  ) {
    return [];
  }

  return geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]);
};

function MapViewport({ positions }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(positions, { padding: [32, 32], maxZoom: 16 });
    } else if (positions.length === 1) {
      map.setView(positions[0], 15);
    }
  }, [map, positions]);

  return null;
}

export default function LiveRideMap({
  driverCoordinates = null,
  routeGeometry = null,
  className = '',
}) {
  const driverPosition = getDriverPosition(driverCoordinates);
  const routePositions = getRoutePositions(routeGeometry);
  const mapPositions = [
    ...(driverPosition ? [driverPosition] : []),
    ...routePositions,
  ];

  if (mapPositions.length === 0) {
    return (
      <div className={`h-72 w-full ${className}`}>
        <EmptyState
          icon={MapPin}
          title="Map data unavailable"
          description="A valid driver location or road route is not available yet."
          className="h-full border-0"
        />
      </div>
    );
  }

  return (
    <div className={`h-72 w-full overflow-hidden rounded-lg border border-theme-border sm:h-80 ${className}`}>
      <MapContainer
        center={mapPositions[0]}
        zoom={13}
        scrollWheelZoom
        className="h-full w-full"
      >
        <MapViewport positions={mapPositions} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {routePositions.length >= 2 && (
          <Polyline
            positions={routePositions}
            pathOptions={{ color: '#8B5CF6', weight: 5, opacity: 0.85 }}
          />
        )}
        {driverPosition && (
          <CircleMarker
            center={driverPosition}
            radius={9}
            pathOptions={{ color: '#FFFFFF', weight: 2, fillColor: '#7C3AED', fillOpacity: 1 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
