export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Waypoint extends GeoPoint {
  id: number;
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
  bearing: number;
  command: NavigationCommand;
  turnAngle: number;
  turnRadiusViolation?: boolean;
}

export interface SavedPlan {
  waypoints: Waypoint[];
  ship: Ship;
}