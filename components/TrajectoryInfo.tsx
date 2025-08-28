import React from 'react';
import { TrajectoryLeg, NavigationCommand, PropulsionDirection } from '../types';
import { PortIcon, StarboardIcon, StraightIcon, StartIcon, EndIcon, TrashIcon, WarningIcon, SpeedIcon, TimeIcon, ForwardArrowIcon, AsternArrowIcon } from './Icons';

interface TrajectoryInfoProps {
  legs: TrajectoryLeg[];
  onDeleteWaypoint: (id: number) => void;
  onLegHover: (id: number | null) => void;
  onSpeedChange: (waypointId: number, speed: number) => void;
  onPropulsionChange: (waypointId: number, propulsion: PropulsionDirection) => void;
}

const CommandDisplay: React.FC<{ command: NavigationCommand; angle: number; violation: boolean; }> = ({ command, angle, violation }) => {
  const Icon = {
    [NavigationCommand.START]: StartIcon,
    [NavigationCommand.PORT]: PortIcon,
    [NavigationCommand.STARBOARD]: StarboardIcon,
    [NavigationCommand.STRAIGHT]: StraightIcon,
    [NavigationCommand.END]: EndIcon,
  }[command];

  const color = {
    [NavigationCommand.START]: 'text-green-400',
    [NavigationCommand.PORT]: 'text-red-400',
    [NavigationCommand.STARBOARD]: 'text-green-400',
    [NavigationCommand.STRAIGHT]: 'text-blue-400',
    [NavigationCommand.END]: 'text-yellow-400',
  }[command];

  const showAngle = command === NavigationCommand.PORT || command === NavigationCommand.STARBOARD;

  return (
    <div className={`flex items-center space-x-2 font-semibold ${color}`}>
      {violation && <WarningIcon className="w-5 h-5 text-red-500" title="Turning radius violation" />}
      <Icon className="w-5 h-5" />
      <span>{command}</span>
      {showAngle && <span className="text-xs text-gray-400">({Math.abs(angle).toFixed(1)}°)</span>}
    </div>
  );
};

function formatTime(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) {
    return '00:00:00';
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const pad = (num: number) => num.toString().padStart(2, '0');

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}


const TrajectoryInfo: React.FC<TrajectoryInfoProps> = ({ legs, onDeleteWaypoint, onLegHover, onSpeedChange, onPropulsionChange }) => {
  const actualLegs = legs.filter(leg => leg.command !== NavigationCommand.END);
  const totalLineDistance = actualLegs.reduce((sum, leg) => sum + leg.distance, 0);
  const totalCurveDistance = actualLegs.reduce((sum, leg) => sum + leg.curveDistance, 0);
  const totalTimeSeconds = legs.reduce((sum, leg) => sum + (leg.time || 0), 0);

  return (
    <div className="flex flex-col">
      {legs.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-500 py-10">
          <p>Click "Plot Waypoints" to start.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {legs.map((leg, index) => (
            <li
              key={leg.id}
              onMouseEnter={() => onLegHover(leg.id)}
              onMouseLeave={() => onLegHover(null)}
              className={`bg-gray-800 p-3 rounded-md border-l-4 flex justify-between items-start group transition-colors hover:bg-gray-700/80 ${leg.turnRadiusViolation ? 'border-l-red-500' : 'border-l-gray-700'}`}
              title={leg.turnRadiusViolation ? 'Warning: Turn is too sharp for the ship\'s minimum turning radius.' : ''}
            >
              <div className="flex-grow">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white">
                    {leg.command === NavigationCommand.END ? `Waypoint ${index + 1}` : `Leg ${index + 1}`}
                  </span>
                  <CommandDisplay command={leg.command} angle={leg.turnAngle} violation={!!leg.turnRadiusViolation} />
                </div>
                {leg.command !== NavigationCommand.END && (
                  <>
                    <div className="mt-2 pt-2 border-t border-gray-700/50 space-y-1 text-sm text-gray-400">
                        <div className="flex justify-between items-center">
                            <span>Line Distance</span>
                            <span className="font-mono text-gray-200">{leg.distance.toFixed(1)} m</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span>Curve Distance</span>
                            <span className="font-mono text-gray-200">{leg.curveDistance.toFixed(1)} m</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span>Course (Bearing)</span>
                            <span className="font-mono text-gray-200">{leg.course.toFixed(1)}°</span>
                        </div>
                         <div className="flex justify-between items-center">
                            <span>Headings</span>
                            <span className="font-mono text-gray-200">{leg.startHeading.toFixed(1)}° → {leg.endHeading.toFixed(1)}°</span>
                        </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-600/50 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                          <SpeedIcon className="w-5 h-5 text-cyan-400" />
                          <input
                              type="number"
                              value={leg.speed}
                              onChange={(e) => onSpeedChange(leg.id, Math.max(0, parseFloat(e.target.value) || 0))}
                              onFocus={(e) => e.target.select()}
                              min="0"
                              step="0.5"
                              className="w-16 bg-gray-900 border border-gray-600 rounded-md p-1 text-sm text-right font-mono text-white focus:ring-cyan-500 focus:border-cyan-500"
                              aria-label={`Speed for leg ${index + 1}`}
                          />
                          <span className="text-gray-400 text-sm">kn</span>
                      </div>
                      <div className="flex items-center space-x-2 text-sm">
                          {leg.pivotTime > 0 && <span className="text-amber-400 font-mono text-xs">(+{leg.pivotTime}s pivot)</span>}
                          <TimeIcon className="w-5 h-5 text-cyan-400" />
                          <span className="font-mono text-gray-200">{formatTime(leg.time)}</span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm text-gray-400">Propulsion:</span>
                        <div className="flex rounded-md bg-gray-900 border border-gray-600">
                            <button
                                onClick={() => onPropulsionChange(leg.id, PropulsionDirection.FORWARD)}
                                className={`px-3 py-1 rounded-l-md text-sm flex items-center space-x-2 transition-colors ${leg.propulsion === PropulsionDirection.FORWARD ? 'bg-cyan-600 text-white' : 'hover:bg-gray-700'}`}
                                aria-pressed={leg.propulsion === PropulsionDirection.FORWARD}
                                title="Set forward propulsion for this leg"
                            >
                                <ForwardArrowIcon className="w-4 h-4" />
                                <span>Forward</span>
                            </button>
                            <button
                                onClick={() => onPropulsionChange(leg.id, PropulsionDirection.ASTERN)}
                                className={`px-3 py-1 rounded-r-md text-sm flex items-center space-x-2 transition-colors ${leg.propulsion === PropulsionDirection.ASTERN ? 'bg-rose-600 text-white' : 'hover:bg-gray-700'}`}
                                aria-pressed={leg.propulsion === PropulsionDirection.ASTERN}
                                title="Set astern (backward) propulsion for this leg"
                            >
                                <AsternArrowIcon className="w-4 h-4" />
                                <span>Astern</span>
                            </button>
                        </div>
                    </div>
                  </>
                )}
              </div>
              {leg.command !== NavigationCommand.END && (
               <button
                  onClick={() => onDeleteWaypoint(leg.id)}
                  className="ml-4 flex-shrink-0 p-2 text-gray-500 hover:text-red-500 hover:bg-gray-700 rounded-full transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Delete Waypoint ${index + 1}`}
                  title={`Delete Waypoint ${index + 1}`}
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {legs.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <h3 className="text-md font-semibold text-cyan-400 mb-2">Totals</h3>
          <div className="text-sm text-gray-300 grid grid-cols-2 gap-x-4 gap-y-1">
            <span>Total Line:</span>
            <span className="font-mono text-right font-bold">{totalLineDistance.toFixed(1)} m</span>
            <span>Total Curve:</span>
            <span className="font-mono text-right font-bold">{totalCurveDistance.toFixed(1)} m</span>
            <span>Total Time:</span>
            <span className="font-mono text-right font-bold">{formatTime(totalTimeSeconds)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrajectoryInfo;