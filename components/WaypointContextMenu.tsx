import React, { useState, useEffect, useRef } from 'react';
import { Waypoint, PropulsionDirection } from '../types';
import { CloseIcon, TrashIcon, SpeedIcon, ForwardArrowIcon, AsternArrowIcon } from './Icons';

declare const L: any;

interface WaypointContextMenuProps {
  map: any; // Leaflet map instance
  waypoint: Waypoint;
  waypointIndex: number;
  waypointsCount: number;
  mouseEvent: any; // Leaflet mouse event
  onClose: () => void;
  onDelete: (id: number) => void;
  onSpeedChange: (id: number, speed: number) => void;
  onPropulsionChange: (id: number, propulsion: PropulsionDirection) => void;
}

const WaypointContextMenu: React.FC<WaypointContextMenuProps> = ({
  map,
  waypoint,
  waypointIndex,
  waypointsCount,
  mouseEvent,
  onClose,
  onDelete,
  onSpeedChange,
  onPropulsionChange,
}) => {
  const [speed, setSpeed] = useState(waypoint.speedToNext ?? 5.0);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const menuElement = menuRef.current;
    if (menuElement) {
      // Use Leaflet's utility to stop click, double-click, and mousewheel events 
      // from propagating to the map. This is crucial to make the menu's buttons clickable.
      L.DomEvent.disableClickPropagation(menuElement);
      // Also prevent the default browser context menu from appearing on the custom menu.
      L.DomEvent.on(menuElement, 'contextmenu', L.DomEvent.stopPropagation);
    }
    return () => {
      const menuElement = menuRef.current;
      if (menuElement) {
        // Clean up the contextmenu listener to avoid memory leaks
        L.DomEvent.off(menuElement, 'contextmenu', L.DomEvent.stopPropagation);
      }
    };
  }, []);

  useEffect(() => {
    const mapContainer = map.getContainer();
    const containerRect = mapContainer.getBoundingClientRect();
    const menuRect = menuRef.current?.getBoundingClientRect() || { width: 224, height: 210 }; // approx size

    let top = mouseEvent.containerPoint.y;
    let left = mouseEvent.containerPoint.x;

    if (left + menuRect.width > containerRect.width - 10) {
      left = containerRect.width - menuRect.width - 10;
    }
    if (top + menuRect.height > containerRect.height - 10) {
      top = containerRect.height - menuRect.height - 10;
    }
    
    setPosition({ top, left });
  }, [mouseEvent, map]);

  const handleSpeedCommit = (value: number) => {
    onSpeedChange(waypoint.id, value);
  };
  
  const handlePropulsionClick = (propulsion: PropulsionDirection) => {
    onPropulsionChange(waypoint.id, propulsion);
  }

  const handleDeleteClick = () => {
    onDelete(waypoint.id);
    onClose();
  }

  // Waypoints for the final destination don't have a next leg
  const isFinalWaypoint = waypointIndex === waypointsCount - 1;


  return (
    <div
      ref={menuRef}
      style={{ top: position.top, left: position.left }}
      className="absolute z-[2000] w-56 bg-gray-900/80 backdrop-blur-md rounded-lg shadow-2xl border border-gray-600 text-white p-3 space-y-3 animate-fade-in-fast"
    >
      <div className="flex justify-between items-center pb-2 border-b border-gray-700">
        <h3 className="font-bold text-cyan-400">Waypoint {waypointIndex + 1}</h3>
        <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors" aria-label="Close menu">
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>
      
      {!isFinalWaypoint && (
          <>
            {/* Speed Control */}
            <div>
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-300 mb-1.5">
                <SpeedIcon className="w-4 h-4 text-cyan-400" />
                <span>Leg Speed</span>
                </label>
                <div className="flex items-center">
                <input
                    type="number"
                    value={speed}
                    onChange={(e) => setSpeed(Math.max(0, parseFloat(e.target.value) || 0))}
                    onBlur={(e) => handleSpeedCommit(parseFloat(e.target.value))}
                    onKeyDown={(e) => { if(e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    onFocus={(e) => e.target.select()}
                    min="0"
                    step="0.5"
                    className="w-full bg-gray-800 border border-gray-600 rounded-md p-1 text-sm text-right font-mono focus:ring-cyan-500 focus:border-cyan-500"
                    aria-label="Speed for next leg"
                />
                <span className="ml-2 text-gray-400">kn</span>
                </div>
            </div>
            
            {/* Propulsion Control */}
            <div>
                <label className="text-sm font-medium text-gray-300 mb-1.5 block">Propulsion</label>
                <div className="flex rounded-md bg-gray-800 border border-gray-600">
                    <button
                        onClick={() => handlePropulsionClick(PropulsionDirection.FORWARD)}
                        className={`w-1/2 px-2 py-1.5 rounded-l-md text-xs flex items-center justify-center space-x-1.5 transition-colors ${waypoint.propulsionDirection !== PropulsionDirection.ASTERN ? 'bg-cyan-600 text-white' : 'hover:bg-gray-700'}`}
                        aria-pressed={waypoint.propulsionDirection !== PropulsionDirection.ASTERN}
                    >
                        <ForwardArrowIcon className="w-3 h-3" />
                        <span>Forward</span>
                    </button>
                    <button
                        onClick={() => handlePropulsionClick(PropulsionDirection.ASTERN)}
                        className={`w-1/2 px-2 py-1.5 rounded-r-md text-xs flex items-center justify-center space-x-1.5 transition-colors ${waypoint.propulsionDirection === PropulsionDirection.ASTERN ? 'bg-rose-600 text-white' : 'hover:bg-gray-700'}`}
                        aria-pressed={waypoint.propulsionDirection === PropulsionDirection.ASTERN}
                    >
                        <AsternArrowIcon className="w-3 h-3" />
                        <span>Astern</span>
                    </button>
                </div>
            </div>
          </>
      )}


      {/* Delete Button */}
      <button
        onClick={handleDeleteClick}
        className="w-full mt-2 flex items-center justify-center p-2 rounded-md text-red-500 font-semibold transition-colors bg-red-900/30 hover:bg-red-900/60 border border-red-800/50"
      >
        <TrashIcon className="w-4 h-4 mr-2" />
        Delete Waypoint
      </button>
    </div>
  );
};

export default WaypointContextMenu;