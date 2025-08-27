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
  if (p1.lat === p2.lat && p1.lng === p2.lng) {
    return 0; // Or handle as an edge case, e.g., return previous bearing
  }
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

// --- SPLINE HELPER FUNCTIONS ---
function catmullRomSpline(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

function catmullRomSplineDerivative(t: number, p0: number, p1: number, p2: number, p3: number): number {
    const t2 = t * t;
    return 0.5 * (
        (-p0 + p2) +
        2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t +
        3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t2
    );
}

export function getPointOnCatmullRom(t: number, p0: GeoPoint, p1: GeoPoint, p2: GeoPoint, p3: GeoPoint): GeoPoint {
  const lat = catmullRomSpline(t, p0.lat, p1.lat, p2.lat, p3.lat);
  const lng = catmullRomSpline(t, p0.lng, p1.lng, p2.lng, p3.lng);
  return { lat, lng };
}

export function getHeadingOnCatmullRom(t: number, p0: GeoPoint, p1: GeoPoint, p2: GeoPoint, p3: GeoPoint): number {
    const currentPoint = getPointOnCatmullRom(t, p0, p1, p2, p3);
    const dLat = catmullRomSplineDerivative(t, p0.lat, p1.lat, p2.lat, p3.lat);
    const dLng = catmullRomSplineDerivative(t, p0.lng, p1.lng, p2.lng, p3.lng);

    const metersPerDegLat = 111132.954;
    const metersPerDegLng = 111320 * Math.cos(toRad(currentPoint.lat));
    
    const dy_m = dLat * metersPerDegLat;
    const dx_m = dLng * metersPerDegLng;

    const angleRad = Math.atan2(dx_m, dy_m);
    return (angleRad * 180 / Math.PI + 360) % 360;
}
// --- END SPLINE HELPERS ---

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

    const trajectoryLegs: TrajectoryLeg[] = [];
    let previousCourse: number | null = null;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const start = waypoints[i];
      const end = waypoints[i + 1];

      // --- Course (Straight Leg Properties) ---
      const distance = getDistance(start, end);
      const course = getBearing(start, end);

      // --- Curve Properties ---
      const p0 = waypoints[i - 1] || start;
      const p1 = start;
      const p2 = end;
      const p3 = waypoints[i + 2] || end;
      const curveDistance = calculateCurveLength(p0, p1, p2, p3);

      // --- Speed and Time ---
      const speedKnots = start.speedToNext ?? 5.0; // Default to 5 knots if not set
      const speedMps = speedKnots * 0.514444; // 1 knot = 0.514444 m/s
      const timeSeconds = speedMps > 0 ? curveDistance / speedMps : 0;

      // --- Heading (Tangential Bearing for ship orientation) ---
      // The tangent at `start` (p1) is parallel to the vector from p0 to p2.
      const heading = getBearing(p0, p2);

      // --- Command, Turn Angle, and Violation ---
      let command: NavigationCommand;
      let turnAngle = 0;
      
      if (i === 0) {
        command = NavigationCommand.START;
      } else {
        const courseIn = previousCourse!;
        const courseOut = course;

        let angle = courseOut - courseIn;
        if (angle > 180) angle -= 360;
        if (angle < -180) angle += 360;
        turnAngle = angle;

        if (turnAngle > TURN_THRESHOLD) {
          command = NavigationCommand.PORT;
        } else if (turnAngle < -TURN_THRESHOLD) {
          command = NavigationCommand.STARBOARD;
        } else {
          command = NavigationCommand.STRAIGHT;
        }
      }

      // --- Turn Radius Violation ---
      let turnRadiusViolation = false;
      // Only check for violation on actual turns (not the start or straight segments)
      if (command === NavigationCommand.PORT || command === NavigationCommand.STARBOARD) {
        const turnRadiusMeters = calculateTurnRadius(p0, p1, p2, p3);
        turnRadiusViolation = turnRadiusMeters < ship.turningRadius;
      }

      trajectoryLegs.push({
        id: start.id,
        start,
        end,
        distance: distance,
        curveDistance,
        course: course,
        heading: heading,
        command,
        turnAngle,
        turnRadiusViolation,
        speed: speedKnots,
        time: timeSeconds,
      });

      previousCourse = course;
    }

    // Add a final entry for the end of the plan.
    if (waypoints.length > 0) {
      const lastWaypoint = waypoints[waypoints.length - 1];
      const previousWaypoint = waypoints.length > 1 ? waypoints[waypoints.length - 2] : null;
      
      // At the final point, the heading should align with the course of the final approach.
      const finalCourseAndHeading = previousWaypoint ? getBearing(previousWaypoint, lastWaypoint) : 0;

      trajectoryLegs.push({
        id: lastWaypoint.id,
        start: lastWaypoint,
        end: lastWaypoint,
        distance: 0,
        curveDistance: 0,
        course: finalCourseAndHeading,
        heading: finalCourseAndHeading,
        command: NavigationCommand.END,
        turnAngle: 0,
        turnRadiusViolation: false,
        speed: 0,
        time: 0,
      });
    }

    return trajectoryLegs;
  }, [waypoints, ship]);
};