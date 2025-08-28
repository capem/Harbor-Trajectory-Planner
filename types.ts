export interface GeoPoint {
  lat: number;
  lng: number;
}

export enum PropulsionDirection {
  FORWARD = 'Forward',
  ASTERN = 'Astern',
}

export interface Waypoint extends GeoPoint {
  id: number;
  speedToNext?: number; // Speed in knots for the leg starting at this waypoint
  propulsionDirection?: PropulsionDirection;
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
  startHeading: number; // Tangential bearing for ship orientation at the start
  endHeading: number; // Tangential bearing for ship orientation at the end
  command: NavigationCommand;
  turnAngle: number;
  turnRadiusViolation?: boolean;
  speed: number; // Speed in knots for this leg
  time: number; // Time in seconds for this leg (includes pivot time)
  pivotTime: number; // Time in seconds spent pivoting at the start of the leg
  propulsion: PropulsionDirection;
}

export interface SavedPlan {
  waypoints: Waypoint[];
  ship: Ship;
}

export interface AnimationState {
  position: GeoPoint;
  heading: number;
}

export interface MapTileLayer {
  id: string;
  name: string;
  url: string;
  attribution: string;
}

export interface AppSettings {
  defaultShip: Ship;
  defaultSpeed: number;
  pivotDuration: number;
  mapTileLayerId: string;
}
