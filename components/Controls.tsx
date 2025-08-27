import React, { useCallback, useRef } from 'react';
import { Ship } from '../types';
import { TrashIcon, ImportIcon, ExportIcon, MeasureIcon } from './Icons';

interface ControlsProps {
  ship: Ship;
  setShip: (ship: Ship) => void;
  onClear: () => void;
  onImportPlan: (file: File) => void;
  onExportPlan: () => void;
  isMeasuring: boolean;
  onToggleMeasure: () => void;
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

const ActionButton: React.FC<{ onClick: () => void; children: React.ReactNode; className?: string, title: string, isActive?: boolean }> = ({ onClick, children, className, title, isActive = false }) => (
  <button
    onClick={onClick}
    title={title}
    className={`w-full flex items-center justify-center p-2 rounded-md text-white font-semibold transition-colors ${className} ${isActive ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-cyan-400' : ''}`}
  >
    {children}
  </button>
);


const Controls: React.FC<ControlsProps> = ({ ship, setShip, onClear, onImportPlan, onExportPlan, isMeasuring, onToggleMeasure }) => {
  const planFileInputRef = useRef<HTMLInputElement>(null);
  
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
    <div className="space-y-4">
      <div className="p-3 bg-gray-900 rounded-lg">
        <h2 className="text-md font-semibold text-cyan-400 border-b border-gray-700 pb-2 mb-3">Configuration</h2>
        <div className="space-y-2">
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
      
      <div className="p-3 bg-gray-900 rounded-lg">
         <h2 className="text-md font-semibold text-cyan-400 border-b border-gray-700 pb-2 mb-3">Actions</h2>
         <input
            type="file"
            ref={planFileInputRef}
            onChange={handlePlanFileChange}
            className="hidden"
            accept=".json,application/json"
         />
         <div className="grid grid-cols-2 gap-3">
            <ActionButton 
                onClick={onToggleMeasure}
                className="bg-cyan-600 hover:bg-cyan-500 col-span-2"
                title="Activate measurement tool. Click two points on the map to measure the distance between them."
                isActive={isMeasuring}
            >
                <MeasureIcon className="w-5 h-5 mr-2" />
                Measure Distance
            </ActionButton>
            <ActionButton onClick={triggerPlanFileInput} className="bg-indigo-600 hover:bg-indigo-500" title="Import a previously saved trajectory plan (.json file).">
                <ImportIcon className="w-5 h-5 mr-2" />
                Import Plan
            </ActionButton>
            <ActionButton onClick={onExportPlan} className="bg-emerald-600 hover:bg-emerald-500" title="Save the current waypoints and ship configuration to a JSON file.">
                <ExportIcon className="w-5 h-5 mr-2" />
                Export Plan
            </ActionButton>
            <ActionButton onClick={onClear} className="bg-red-600 hover:bg-red-500 col-span-2" title="Remove all waypoints and clear the current plan. This action cannot be undone.">
                <TrashIcon className="w-5 h-5 mr-2" />
                Clear Plan
            </ActionButton>
         </div>
      </div>
    </div>
  );
};

export default Controls;