import React, { useState, useEffect, useCallback } from 'react';
import { AppSettings, Ship } from '../types';
import { MAP_TILE_LAYERS } from '../App';
import { CloseIcon, SettingsIcon } from './Icons';

interface SettingsModalProps {
    currentSettings: AppSettings;
    onSave: (newSettings: AppSettings) => void;
    onClose: () => void;
}

const SettingsInput: React.FC<{ label: string; value: number; onChange: (value: number) => void; unit: string; helpText?: string; min?: number; step?: number; }> = ({ label, value, onChange, unit, helpText, min = 0, step = 1 }) => (
  <div>
    <div className="grid grid-cols-2 items-center gap-x-4">
        <label className="block text-sm font-medium text-gray-400">{label}</label>
        <div className="flex items-center">
        <input
            type="number"
            value={value}
            min={min}
            step={step}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            className="w-full bg-gray-900 border border-gray-600 rounded-md p-1 text-sm text-white focus:ring-cyan-500 focus:border-cyan-500"
        />
        <span className="ml-2 text-gray-400">{unit}</span>
        </div>
    </div>
    {helpText && <p className="text-xs text-gray-500 mt-1 col-span-2">{helpText}</p>}
  </div>
);

const SectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 className="text-md font-semibold text-cyan-400 border-b border-gray-700 pb-2 mb-4">{children}</h3>
);


const SettingsModal: React.FC<SettingsModalProps> = ({ currentSettings, onSave, onClose }) => {
    const [settings, setSettings] = useState<AppSettings>(currentSettings);

    const handleShipChange = (field: keyof Ship, value: number) => {
        setSettings(prev => ({ ...prev, defaultShip: { ...prev.defaultShip, [field]: value } }));
    };
    
    const handleSave = () => {
        onSave(settings);
    };

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            onClose();
        }
    }, [onClose]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]);


    return (
        <div 
            className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-[5000]" 
            aria-modal="true" 
            role="dialog"
            aria-labelledby="settings-modal-title"
        >
            <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-lg max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-gray-700">
                    <div className="flex items-center space-x-3">
                        <SettingsIcon className="w-6 h-6 text-cyan-400" />
                        <h2 id="settings-modal-title" className="text-lg font-semibold text-white">Application Settings</h2>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors" aria-label="Close settings">
                        <CloseIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6 overflow-y-auto">
                    <div>
                        <SectionHeader>Default Ship</SectionHeader>
                        <div className="space-y-3">
                            <SettingsInput label="Length" value={settings.defaultShip.length} onChange={val => handleShipChange('length', val)} unit="m" />
                            <SettingsInput label="Beam" value={settings.defaultShip.beam} onChange={val => handleShipChange('beam', val)} unit="m" />
                            <SettingsInput label="Min Turning Radius" value={settings.defaultShip.turningRadius} onChange={val => handleShipChange('turningRadius', val)} unit="m" />
                        </div>
                    </div>

                    <div>
                        <SectionHeader>Default Waypoint</SectionHeader>
                         <div className="space-y-3">
                            <SettingsInput label="Leg Speed" value={settings.defaultSpeed} onChange={val => setSettings({...settings, defaultSpeed: val})} unit="knots" min={0.1} step={0.1} />
                        </div>
                    </div>
                    
                    <div>
                        <SectionHeader>Calculations</SectionHeader>
                         <div className="space-y-3">
                            <SettingsInput label="Pivot Duration" value={settings.pivotDuration} onChange={val => setSettings({...settings, pivotDuration: val})} unit="sec" helpText="Time to turn when switching propulsion." />
                        </div>
                    </div>
                    
                    <div>
                        <SectionHeader>Visuals</SectionHeader>
                        <div role="radiogroup" aria-labelledby="map-style-label">
                            <span id="map-style-label" className="block text-sm font-medium text-gray-400 mb-2">Map Style</span>
                            <div className="grid grid-cols-3 gap-2">
                                {MAP_TILE_LAYERS.map(layer => (
                                    <button 
                                        key={layer.id}
                                        role="radio"
                                        aria-checked={settings.mapTileLayerId === layer.id}
                                        onClick={() => setSettings({...settings, mapTileLayerId: layer.id})}
                                        className={`p-2 text-center rounded-md text-sm font-semibold transition-all duration-200 border-2 ${settings.mapTileLayerId === layer.id ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'}`}
                                    >
                                        {layer.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="flex justify-end items-center p-4 border-t border-gray-700 bg-gray-800/50 space-x-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-md text-white font-semibold bg-gray-600 hover:bg-gray-500 transition-colors">
                        Cancel
                    </button>
                     <button onClick={handleSave} className="px-4 py-2 rounded-md text-white font-semibold bg-cyan-600 hover:bg-cyan-500 transition-colors">
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;