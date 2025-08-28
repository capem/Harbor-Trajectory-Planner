import React from 'react';
import { EnvironmentalFactors } from '../types';
import { WindIcon, CurrentIcon } from './Icons';

interface EnvironmentControlsProps {
    environmentalFactors: EnvironmentalFactors;
    setEnvironmentalFactors: (factors: EnvironmentalFactors) => void;
}

const DriftInput: React.FC<{
    label: string;
    icon: React.ReactNode;
    speed: number;
    direction: number;
    onSpeedChange: (value: number) => void;
    onDirectionChange: (value: number) => void;
    disabled: boolean;
}> = ({ label, icon, speed, direction, onSpeedChange, onDirectionChange, disabled }) => (
    <div>
        <label className="flex items-center space-x-2 text-sm font-medium text-gray-400 mb-2">
            {icon}
            <span>{label}</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center">
                <input
                    type="number"
                    value={speed}
                    onChange={(e) => onSpeedChange(parseFloat(e.target.value) || 0)}
                    min="0"
                    step="0.1"
                    className="w-full bg-gray-700 border border-gray-600 rounded-md p-1 text-sm text-white focus:ring-cyan-500 focus:border-cyan-500 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed"
                    title={`${label} Speed`}
                    disabled={disabled}
                />
                <span className="ml-2 text-gray-400">kn</span>
            </div>
            <div className="flex items-center">
                <input
                    type="number"
                    value={direction}
                    onChange={(e) => onDirectionChange(parseFloat(e.target.value) || 0)}
                    min="0"
                    max="359"
                    step="1"
                    className="w-full bg-gray-700 border border-gray-600 rounded-md p-1 text-sm text-white focus:ring-cyan-500 focus:border-cyan-500 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed"
                    title={`${label} Direction`}
                    disabled={disabled}
                />
                <span className="ml-2 text-gray-400">°</span>
            </div>
        </div>
    </div>
);


const ToggleSwitch: React.FC<{ label: string, enabled: boolean, onChange: (enabled: boolean) => void }> = ({ label, enabled, onChange }) => (
    <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">{label}</span>
        <button
            onClick={() => onChange(!enabled)}
            className={`${enabled ? 'bg-cyan-600' : 'bg-gray-600'} relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-cyan-500`}
            role="switch"
            aria-checked={enabled}
        >
            <span
                className={`${enabled ? 'translate-x-6' : 'translate-x-1'} inline-block w-4 h-4 transform bg-white rounded-full transition-transform`}
            />
        </button>
    </div>
);


const EnvironmentControls: React.FC<EnvironmentControlsProps> = ({ environmentalFactors, setEnvironmentalFactors }) => {
    const { driftEnabled, current, wind } = environmentalFactors;

    const handleToggle = (enabled: boolean) => {
        setEnvironmentalFactors({ ...environmentalFactors, driftEnabled: enabled });
    };

    return (
        <div className="space-y-4">
            <ToggleSwitch
                label="Enable Drift Simulation"
                enabled={driftEnabled}
                onChange={handleToggle}
            />
            <div className={`space-y-4 pt-4 border-t border-gray-700/50 transition-opacity ${driftEnabled ? 'opacity-100' : 'opacity-50'}`}>
                <DriftInput
                    label="Current"
                    icon={<CurrentIcon className="w-5 h-5 text-cyan-400" />}
                    speed={current.speed}
                    direction={current.direction}
                    onSpeedChange={speed => setEnvironmentalFactors({ ...environmentalFactors, current: { ...current, speed } })}
                    onDirectionChange={direction => setEnvironmentalFactors({ ...environmentalFactors, current: { ...current, direction } })}
                    disabled={!driftEnabled}
                />
                <DriftInput
                    label="Wind"
                    icon={<WindIcon className="w-5 h-5 text-cyan-400" />}
                    speed={wind.speed}
                    direction={wind.direction}
                    onSpeedChange={speed => setEnvironmentalFactors({ ...environmentalFactors, wind: { ...wind, speed } })}
                    onDirectionChange={direction => setEnvironmentalFactors({ ...environmentalFactors, wind: { ...wind, direction } })}
                    disabled={!driftEnabled}
                />
            </div>
        </div>
    );
};

export default EnvironmentControls;
