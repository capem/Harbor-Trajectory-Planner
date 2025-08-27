export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Waypoint extends GeoPoint {
  id: number;
  speedToNext?: number; // Speed in knots for the leg starting at this waypoint
}

export interface Ship {
  length: number; // in meters
  beam: number;   // in meters
  turningRadius: number; // in meters
}

export enum NavigationCommand {
  START = 'Start',
  PORT = 'Port',
  STARBOARD = 'Starboard',
  STRAIGHT = 'Straight',
  END = 'End of Plan',
}

export interface TrajectoryLeg {
  id: number;
  start: Waypoint;
  end: Waypoint;
  distance: number; // Straight line distance
  curveDistance: number;
  course: number; // Straight-line bearing between waypoints
  heading: number; // Tangential bearing for ship orientation
  command: NavigationCommand;
  turnAngle: number;
  turnRadiusViolation?: boolean;
  speed: number; // Speed in knots for this leg
  time: number; // Time in seconds for this leg
}

export interface SavedPlan {
  waypoints: Waypoint[];
  ship: Ship;
}