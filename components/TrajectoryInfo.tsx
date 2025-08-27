
import React from 'react';
import { TrajectoryLeg, NavigationCommand } from '../types';
import { PortIcon, StarboardIcon, StraightIcon, StartIcon, EndIcon, TrashIcon, WarningIcon } from './Icons';

interface TrajectoryInfoProps {
  legs: TrajectoryLeg[];
  onDeleteWaypoint: (id: number) => void;
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


const TrajectoryInfo: React.FC<TrajectoryInfoProps> = ({ legs, onDeleteWaypoint }) => {
  const actualLegs = legs.filter(leg => leg.command !== NavigationCommand.END);
  const totalLineDistance = actualLegs.reduce((sum, leg) => sum + leg.distance, 0);
  const totalCurveDistance = actualLegs.reduce((sum, leg) => sum + leg.curveDistance, 0);

  return (
    <div className="flex-1 flex flex-col bg-gray-900 rounded-lg p-4 min-h-0">
      <h2 className="text-lg font-semibold text-cyan-400 border-b border-gray-700 pb-2 mb-4">Trajectory Plan</h2>
      <div className="flex-1 overflow-y-auto pr-2">
        {legs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>Click on the map to add waypoints.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {legs.map((leg, index) => (
              <li 
                key={leg.id} 
                className={`bg-gray-800 p-3 rounded-md border-l-4 flex justify-between items-start group ${leg.turnRadiusViolation ? 'border-l-red-500' : 'border-l-gray-700'}`}
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
                            <span>Bearing</span>
                            <span className="font-mono text-gray-200">{leg.bearing.toFixed(1)}°</span>
                        </div>
                    </div>
                  )}
                </div>
                 <button
                    onClick={() => onDeleteWaypoint(leg.id)}
                    className="ml-4 flex-shrink-0 p-2 text-gray-500 hover:text-red-500 hover:bg-gray-700 rounded-full transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                    aria-label={`Delete Waypoint ${index + 1}`}
                    title={`Delete Waypoint ${index + 1}`}
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {legs.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <h3 className="text-md font-semibold text-cyan-400 mb-2">Total Distances</h3>
          <div className="text-sm text-gray-300 grid grid-cols-2 gap-x-4 gap-y-1">
            <span>Total Line:</span>
            <span className="font-mono text-right font-bold">{totalLineDistance.toFixed(1)} m</span>
            <span>Total Curve:</span>
            <span className="font-mono text-right font-bold">{totalCurveDistance.toFixed(1)} m</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrajectoryInfo;
