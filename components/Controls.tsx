import React, { useCallback, useRef, useState, useEffect } from 'react';
import { Ship } from '../types';
import { TrashIcon, ImportIcon, ExportIcon, MeasureIcon, PlotIcon, PlayIcon, StopIcon } from './Icons';


interface ControlsProps {
  ship: Ship;
  setShip: (ship: Ship) => void;
  onClear: () => void;
  onImportPlan: (file: File) => void;
  onExportPlan: () => void;
  isMeasuring: boolean;
  onToggleMeasure: () => void;
  isPlotting: boolean;
  onTogglePlotting: () => void;
  onAnimateToggle: () => void;
  isAnimating: boolean;
  hasPlan: boolean;
  onResetShipToDefaults: () => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
}

const ControlInput: React.FC<{ label: string; value: number; onChange: (value: number) => void; unit: string }> = ({ label, value, onChange, unit }) => (
  <div className="grid grid-cols-2 items-center gap-x-4">
    <label className="block text-sm font-medium text-gray-400">{label}</label>
    <div className="flex items-center">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-gray-700 border border-gray-600 rounded-md p-1 text-sm text-white focus:ring-cyan-500 focus:border-cyan-500"
      />
      <span className="ml-2 text-gray-400">{unit}</span>
    </div>
  </div>
);

const ActionButton: React.FC<{ onClick: () => void; children: React.ReactNode; className?: string, title: string, isActive?: boolean, disabled?: boolean }> = ({ onClick, children, className, title, isActive = false, disabled = false }) => (
  <button
    onClick={onClick}
    title={title}
    disabled={disabled}
    className={`flex items-center justify-center p-2 rounded-md text-white font-semibold transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed ${className} ${isActive ? 'ring-2 ring-offset-2 ring-offset-gray-800 ring-cyan-400' : ''}`}
  >
    {children}
  </button>
);


const Controls: React.FC<ControlsProps> = ({ 
    ship, setShip, onClear, onImportPlan, onExportPlan, 
    isMeasuring, onToggleMeasure, isPlotting, onTogglePlotting,
    onAnimateToggle, isAnimating, hasPlan, onResetShipToDefaults,
    playbackSpeed, onPlaybackSpeedChange
}) => {
  const planFileInputRef = useRef<HTMLInputElement>(null);
  const disableActions = isAnimating;

  const speedSteps = [1, 2, 4, 8, 16, 32, 64, 128, 256];
  const [speedInput, setSpeedInput] = useState(playbackSpeed.toString());

  useEffect(() => {
    setSpeedInput(playbackSpeed.toString());
  }, [playbackSpeed]);

  const commitSpeedChange = () => {
    const desiredSpeed = parseInt(speedInput, 10);
    if (isNaN(desiredSpeed) || desiredSpeed <= 0) {
      setSpeedInput(playbackSpeed.toString()); // revert
      return;
    }
    const closestSpeed = speedSteps.reduce((prev, curr) => 
      Math.abs(curr - desiredSpeed) < Math.abs(prev - desiredSpeed) ? curr : prev
    );
    onPlaybackSpeedChange(closestSpeed);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitSpeedChange();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setSpeedInput(playbackSpeed.toString());
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newIndex = parseInt(e.target.value, 10);
      onPlaybackSpeedChange(speedSteps[newIndex]);
  };
  
  const currentSpeedIndex = speedSteps.indexOf(playbackSpeed);
  
  const handlePlanFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImportPlan(file);
    }
    event.target.value = ''; // Reset file input
  }, [onImportPlan]);
  
  const triggerPlanFileInput = useCallback(() => {
    planFileInputRef.current?.click();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex justify-between items-center border-b border-gray-700 pb-2 mb-4">
          <h3 className="text-sm font-semibold text-gray-300">Ship Configuration</h3>
          <button 
            onClick={onResetShipToDefaults}
            className="text-xs text-cyan-400 hover:text-cyan-300 hover:underline disabled:text-gray-500 disabled:no-underline disabled:cursor-not-allowed"
            title="Reset the current ship's configuration to the saved defaults."
            disabled={disableActions}
          >
            Reset to Defaults
          </button>
        </div>
        <div className="space-y-3">
          <ControlInput
            label="Ship Length"
            value={ship.length}
            onChange={(val) => setShip({ ...ship, length: val })}
            unit="m"
          />
          <ControlInput
            label="Ship Beam"
            value={ship.beam}
            onChange={(val) => setShip({ ...ship, beam: val })}
            unit="m"
          />
          <ControlInput
            label="Min Turning Radius"
            value={ship.turningRadius}
            onChange={(val) => setShip({ ...ship, turningRadius: val })}
            unit="m"
          />
        </div>
      </div>
      
      <div>
         <h3 className="text-sm font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-4">Plan Actions</h3>
         <input
            type="file"
            ref={planFileInputRef}
            onChange={handlePlanFileChange}
            className="hidden"
            accept=".json,application/json"
         />
         <div className="space-y-5">
            {/* Editing Tools Group */}
            <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Editing Tools</label>
                <div className="flex">
                    <ActionButton
                        onClick={onTogglePlotting}
                        title="Toggle waypoint plotting mode. Click on the map to add waypoints."
                        disabled={disableActions}
                        isActive={isPlotting}
                        className={`relative flex-1 rounded-r-none ${isPlotting ? 'bg-sky-600 z-10' : 'bg-gray-700 hover:bg-gray-600'}`}
                    >
                        <PlotIcon className="w-5 h-5 mr-2" />
                        Plot Waypoints
                    </ActionButton>
                    <ActionButton
                        onClick={onToggleMeasure}
                        title="Activate measurement tool. Click two points on the map to measure the distance."
                        disabled={disableActions}
                        isActive={isMeasuring}
                        className={`relative flex-1 rounded-l-none border-l border-gray-800 ${isMeasuring ? 'bg-cyan-600 z-10' : 'bg-gray-700 hover:bg-gray-600'}`}
                    >
                        <MeasureIcon className="w-5 h-5 mr-2" />
                        Measure
                    </ActionButton>
                </div>
            </div>

            {/* Simulation Group */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Simulation</label>
              <ActionButton 
                  onClick={onAnimateToggle}
                  className={`w-full ${isAnimating ? "bg-amber-600 hover:bg-amber-500" : "bg-teal-600 hover:bg-teal-500"}`}
                  title={isAnimating ? "Stop the trajectory animation" : "Animate the ship's trajectory"}
                  disabled={!hasPlan}
              >
                  {isAnimating ? <StopIcon className="w-5 h-5 mr-2" /> : <PlayIcon className="w-5 h-5 mr-2" />}
                  {isAnimating ? 'Stop Animation' : 'Animate Plan'}
              </ActionButton>
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-400 mb-2">Playback Speed</label>
                <div className="flex items-center space-x-3">
                    <input
                        type="range"
                        min="0"
                        max={speedSteps.length - 1}
                        step="1"
                        value={currentSpeedIndex}
                        onChange={handleSliderChange}
                        className="w-full speed-slider"
                        list="speed-markers"
                        title={`Current speed: ${playbackSpeed}x`}
                    />
                    <datalist id="speed-markers">
                        {speedSteps.map((s, i) => <option key={s} value={i} label={`${s}x`}></option>)}
                    </datalist>
                    <div className="flex items-center">
                        <input
                            type="number"
                            value={speedInput}
                            onChange={(e) => setSpeedInput(e.target.value)}
                            onBlur={commitSpeedChange}
                            onKeyDown={handleInputKeyDown}
                            className="w-16 bg-gray-900 border border-gray-600 rounded-md p-1 text-sm text-right font-mono text-white focus:ring-cyan-500 focus:border-cyan-500"
                            aria-label="Playback speed"
                        />
                         <span className="ml-1.5 text-gray-400 font-semibold">x</span>
                    </div>
                </div>
              </div>
            </div>

            {/* Management & Destructive actions group */}
            <div className="pt-2">
              <label className="block text-xs font-medium text-gray-400 mb-2">Plan Management</label>
              <div className="grid grid-cols-2 gap-3">
                  <ActionButton onClick={triggerPlanFileInput} className="bg-slate-600 hover:bg-slate-500" title="Import a previously saved trajectory plan (.json file)." disabled={disableActions}>
                      <ImportIcon className="w-5 h-5 mr-2" />
                      Import
                  </ActionButton>
                  <ActionButton onClick={onExportPlan} className="bg-slate-600 hover:bg-slate-500" title="Save the current waypoints and ship configuration to a JSON file." disabled={!hasPlan || disableActions}>
                      <ExportIcon className="w-5 h-5 mr-2" />
                      Export
                  </ActionButton>
              </div>
               <ActionButton 
                onClick={onClear} 
                className="w-full mt-4 bg-transparent border border-red-700 text-red-500 hover:bg-red-900/50 hover:text-red-400" 
                title="Remove all waypoints and clear the current plan. This action cannot be undone." 
                disabled={!hasPlan || disableActions}
               >
                <TrashIcon className="w-5 h-5 mr-2" />
                Clear Plan
              </ActionButton>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Controls;