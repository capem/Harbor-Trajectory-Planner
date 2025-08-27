import { useMemo } from 'react';
import { Waypoint, TrajectoryLeg, NavigationCommand, GeoPoint, Ship } from '../types';

const TURN_THRESHOLD = 5; // degrees

// --- GEO HELPER FUNCTIONS ---
const R = 6371e3; // Earth's radius in metres

function toRad(deg: number): number {
  return deg * Math.PI / 180;
}

function getDistance(p1: GeoPoint, p2: GeoPoint): number {
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);
  const deltaLat = toRad(p2.lat - p1.lat);
  const deltaLng = toRad(p2.lng - p1.lng);

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
}

function getBearing(p1: GeoPoint, p2: GeoPoint): number {
  const lat1 = toRad(p1.lat);
  const lng1 = toRad(p1.lng);
  const lat2 = toRad(p2.lat);
  const lng2 = toRad(p2.lng);

  const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
  const theta = Math.atan2(y, x);
  const brng = (theta * 180 / Math.PI + 360) % 360; // in degrees
  return brng;
}
// --- END GEO HELPERS ---

// Helper function for Catmull-Rom spline interpolation (alpha = 0.5)
function catmullRom(t: number, p0: number, p1: number, p2: number, p3: number): number {
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
  );
}

function getPointOnCatmullRom(t: number, p0: GeoPoint, p1: GeoPoint, p2: GeoPoint, p3: GeoPoint): GeoPoint {
  const lat = catmullRom(t, p0.lat, p1.lat, p2.lat, p3.lat);
  const lng = catmullRom(t, p0.lng, p1.lng, p2.lng, p3.lng);
  return { lat, lng };
}

function calculateCurveLength(p0: GeoPoint, p1: GeoPoint, p2: GeoPoint, p3: GeoPoint, segments: number = 20): number {
  let length = 0;
  let prevPoint = getPointOnCatmullRom(0, p0, p1, p2, p3);

  for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const currentPoint = getPointOnCatmullRom(t, p0, p1, p2, p3);
      length += getDistance(prevPoint, currentPoint);
      prevPoint = currentPoint;
  }
  return length;
}

// Calculate radius of curvature for the Catmull-Rom spline in meters (approximation)
function calculateTurnRadius(p0: GeoPoint, p1: GeoPoint, p2: GeoPoint, p3: GeoPoint): number {
    // First derivatives at t=0 (in degrees per t)
    const lng_prime = 0.5 * (p2.lng - p0.lng);
    const lat_prime = 0.5 * (p2.lat - p0.lat);

    // Second derivatives at t=0 (in degrees per t^2)
    const lng_double_prime = 2 * p0.lng - 5 * p1.lng + 4 * p2.lng - p3.lng;
    const lat_double_prime = 2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat;
    
    // Convert derivatives to meters/t and meters/t^2 at point p1
    const metersPerDegLat = 111132.954;
    const metersPerDegLng = 111320 * Math.cos(toRad(p1.lat));
    
    const x_prime = lng_prime * metersPerDegLng;
    const y_prime = lat_prime * metersPerDegLat;
    const x_double_prime = lng_double_prime * metersPerDegLng;
    const y_double_prime = lat_double_prime * metersPerDegLat;
    
    const numerator = Math.pow(x_prime * x_prime + y_prime * y_prime, 1.5);
    const denominator = Math.abs(x_prime * y_double_prime - y_prime * x_double_prime);

    if (denominator < 1e-6) {
        return Infinity;
    }

    return numerator / denominator;
}


export const useTrajectoryCalculations = (waypoints: Waypoint[], ship: Ship): TrajectoryLeg[] => {
  return useMemo(() => {
    if (waypoints.length < 2) {
      return [];
    }

    // 1. Calculate basic properties for each leg.
    const legs: Omit<TrajectoryLeg, 'command' | 'turnAngle' | 'turnRadiusViolation'>[] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const start = waypoints[i];
      const end = waypoints[i + 1];

      const distance = getDistance(start, end);
      const bearing = getBearing(start, end);
      
      const p0 = waypoints[i - 1] || start;
      const p1 = start;
      const p2 = end;
      const p3 = waypoints[i + 2] || end;
      const curveDistance = calculateCurveLength(p0, p1, p2, p3);

      legs.push({
        id: start.id,
        start,
        end,
        distance,
        curveDistance,
        bearing,
      });
    }

    // 2. Determine command, turn angle, and violations.
    let trajectoryLegs: TrajectoryLeg[] = legs.map((leg, i) => {
      if (i === 0) {
        return {
          ...leg,
          command: NavigationCommand.START,
          turnAngle: 0,
          turnRadiusViolation: false,
        };
      }

      const previousLeg = legs[i - 1];
      const bearingIn = previousLeg.bearing;
      const bearingOut = leg.bearing;

      let turnAngle = bearingOut - bearingIn;
      if (turnAngle > 180) turnAngle -= 360;
      if (turnAngle < -180) turnAngle += 360;

      let command: NavigationCommand;
      if (turnAngle > TURN_THRESHOLD) {
        command = NavigationCommand.PORT;
      } else if (turnAngle < -TURN_THRESHOLD) {
        command = NavigationCommand.STARBOARD;
      } else {
        command = NavigationCommand.STRAIGHT;
      }

      // Calculate turn radius violation at the start of this leg (which is waypoints[i])
      const p0 = waypoints[i - 1];
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      const p3 = waypoints[i + 2] || p2; // Repeat last point if at the end
      
      const turnRadiusMeters = calculateTurnRadius(p0, p1, p2, p3);
      const turnRadiusViolation = turnRadiusMeters < ship.turningRadius;

      return {
        ...leg,
        command,
        turnAngle,
        turnRadiusViolation,
      };
    });

    // 3. Add a final entry for the end of the plan.
    if (waypoints.length > 0) {
      const lastWaypoint = waypoints[waypoints.length - 1];
      const lastLeg = legs[legs.length - 1];
      trajectoryLegs.push({
        id: lastWaypoint.id,
        start: lastWaypoint,
        end: lastWaypoint,
        distance: 0,
        curveDistance: 0,
        bearing: lastLeg ? lastLeg.bearing : 0,
        command: NavigationCommand.END,
        turnAngle: 0,
        turnRadiusViolation: false,
      });
    }

    return trajectoryLegs;
  }, [waypoints, ship]);
};