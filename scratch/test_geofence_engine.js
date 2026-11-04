import { calculateDistanceMeters, isPointInPolygon } from '../src/services/geofence.service.js';

console.log('Testing Geofence Distance Math...');

// Test 1: Haversine distance between two known points in Nagpur (approx 500m apart)
const p1 = { lat: 21.1286332, lng: 79.1037043 };
const p2 = { lat: 21.1320000, lng: 79.1037043 }; // ~374 meters north
const distance = calculateDistanceMeters(p1.lat, p1.lng, p2.lat, p2.lng);
console.log(`Distance between p1 and p2: ${distance.toFixed(1)} meters (Expected ~374m)`);
if (Math.abs(distance - 374) < 10) {
  console.log('✅ Distance calculation test passed!');
} else {
  console.error('❌ Distance calculation test failed!');
}

// Test 2: Point in Polygon test
const squarePolygon = [
  { lat: 21.120, lng: 79.100 },
  { lat: 21.130, lng: 79.100 },
  { lat: 21.130, lng: 79.110 },
  { lat: 21.120, lng: 79.110 },
];

const insidePoint = { lat: 21.125, lng: 79.105 };
const outsidePoint = { lat: 21.150, lng: 79.105 };

const isInside = isPointInPolygon(insidePoint, squarePolygon);
const isOutside = !isPointInPolygon(outsidePoint, squarePolygon);

if (isInside && isOutside) {
  console.log('✅ Point-in-Polygon test passed!');
} else {
  console.error('❌ Point-in-Polygon test failed!');
}

