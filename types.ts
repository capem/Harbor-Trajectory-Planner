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

export interface EnvironmentalFactors {
  driftEnabled: boolean;
  wind: {
    speed: number; // knots
    direction: number; // degrees
  };
  current: {
    speed: number; // knots
    direction: number; // degrees
  };
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
  course: number; // Straight-line bearing between waypoints (Course Through Water)
  startHeading: number; // Tangential bearing for ship orientation at the start
  endHeading: number; // Tangential bearing for ship orientation at the end
  command: NavigationCommand;
  turnAngle: number;
  turnRadiusViolation?: boolean;
  speed: number; // Speed in knots for this leg (Speed Through Water)
  time: number; // Time in seconds for this leg (includes pivot time)
  pivotTime: number; // Time in seconds spent pivoting at the start of the leg
  propulsion: PropulsionDirection;
  // Drift-related calculations
  sog?: number; // Speed Over Ground in knots
  cogCourse?: number; // Course Over Ground in degrees
  predictedEnd?: GeoPoint; // The calculated end point of the leg with drift
  courseCorrectionAngle?: number; // Heading change required to maintain original course
}

export interface SavedPlan {
  waypoints: Waypoint[];
  ship: Ship;
}

export interface AnimationState {
  position: GeoPoint;
  heading: number;
  speed: number; // Speed in knots
}

export interface MapTileLayer {
  id: string;
  name: string;
  url: string;
  attribution: string;
}

export enum WaypointShape {
  CIRCLE = 'Circle',
  SQUARE = 'Square',
  DIAMOND = 'Diamond',
}

export interface WaypointSettings {
  color: string;
  shape: WaypointShape;
  size: number;
}

export interface AppSettings {
  defaultShip: Ship;
  defaultSpeed: number;
  pivotDuration: number;
  mapTileLayerId: string;
  waypointSettings: WaypointSettings;
}
