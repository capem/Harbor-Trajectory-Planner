import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Waypoint, Ship, TrajectoryLeg, GeoPoint, SavedPlan, AppSettings, PropulsionDirection, EnvironmentalFactors, WaypointShape } from './types';
import PlanningCanvas from './components/PlanningCanvas';
import TrajectoryInfo from './components/TrajectoryInfo';
import SettingsModal from './components/SettingsModal';
import { useTrajectoryCalculations } from './hooks/useTrajectoryCalculations';
import { useAnimation } from './hooks/useAnimation';
import { GithubIcon, SettingsIcon, ListIcon, WindIcon, PlotIcon, PlayIcon, TrashIcon, ImportIcon, ExportIcon, MeasureIcon, StopIcon, ChevronDoubleDownIcon, ChevronDoubleUpIcon } from './components/Icons';
import { AccordionSection } from './components/Accordion';
import { MAP_TILE_LAYERS } from './constants';
import EnvironmentControls from './components/EnvironmentControls';

// Helper components moved from the former Controls.tsx
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


const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>({
    defaultShip: { length: 150, beam: 25, turningRadius: 300 },
    defaultSpeed: 5.0,
    pivotDuration: 30,
    mapTileLayerId: 'dark',
    waypointSettings: {
      color: '#0ea5e9', // sky-500
      shape: WaypointShape.CIRCLE,
      size: 12,
    },
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [ship, setShip] = useState<Ship>(settings.defaultShip);
  const [environmentalFactors, setEnvironmentalFactors] = useState<EnvironmentalFactors>({
    driftEnabled: false,
    wind: { speed: 0, direction: 0 },
    current: { speed: 0, direction: 0 },
  });
  const [zoomToFitTrigger, setZoomToFitTrigger] = useState(0);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [isPlotting, setIsPlotting] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    configuration: false,
    editor: false,
    details: false,
    simulation: false,
  });
  const [hoveredLegId, setHoveredLegId] = useState<number | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
  const trajectoryLegs: TrajectoryLeg[] = useTrajectoryCalculations(waypoints, ship, settings.pivotDuration, environmentalFactors);
  const { isAnimating, animationState, toggleAnimation } = useAnimation(trajectoryLegs, waypoints, playbackSpeed);
  
  const selectedMapLayer = MAP_TILE_LAYERS.find(l => l.id === settings.mapTileLayerId) || MAP_TILE_LAYERS[0];
  
  // Logic moved from Controls.tsx
  const planFileInputRef = useRef<HTMLInputElement>(null);
  const disableActions = isAnimating;

  useEffect(() => {
    // When settings change the default ship, update the current ship if it's still the same as the old default.
    // This avoids overwriting user's temporary changes to the current ship.
    const oldDefaultShip = settings.defaultShip;
    if (ship.length === oldDefaultShip.length && ship.beam === oldDefaultShip.beam && ship.turningRadius === oldDefaultShip.turningRadius) {
      setShip(settings.defaultShip);
    }
  }, [settings.defaultShip]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPlotting(false);
        setIsMeasuring(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
  
  const handleAddWaypoint = useCallback((point: GeoPoint) => {
    const newWaypoint: Waypoint = {
      ...point,
      id: Date.now(),
      speedToNext: settings.defaultSpeed,
      propulsionDirection: PropulsionDirection.FORWARD,
    };
    setWaypoints(prev => [...prev, newWaypoint]);
  }, [settings.defaultSpeed]);

  const handleUpdateWaypoint = useCallback((id: number, point: GeoPoint) => {
    setWaypoints(prev =>
      prev.map(wp => (wp.id === id ? { ...wp, lat: point.lat, lng: point.lng } : wp))
    );
  }, []);

  const handleDeleteWaypoint = useCallback((id: number) => {
    setWaypoints(prev => prev.filter(wp => wp.id !== id));
  }, []);

  const handleSpeedChange = useCallback((waypointId: number, speed: number) => {
    setWaypoints(prev =>
      prev.map(wp => (wp.id === waypointId ? { ...wp, speedToNext: speed } : wp))
    );
  }, []);

  const handlePropulsionChange = useCallback((waypointId: number, propulsion: PropulsionDirection) => {
    setWaypoints(prev => 
      prev.map(wp => (wp.id === waypointId ? { ...wp, propulsionDirection: propulsion } : wp))
    );
  }, []);

  const handleClear = useCallback(() => {
    if (isAnimating) toggleAnimation(); // Stop animation before clearing
    setWaypoints([]);
    setShip(settings.defaultShip);
    setIsPlotting(false);
    setIsMeasuring(false);
  }, [settings.defaultShip, isAnimating, toggleAnimation]);

  const handleExportPlan = useCallback(() => {
    const plan: SavedPlan = { waypoints, ship };
    const jsonString = JSON.stringify(plan, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trajectory-plan.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [waypoints, ship]);

  const handleImportPlan = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const plan: SavedPlan = JSON.parse(text);

        if (plan.waypoints && plan.ship) {
          if (isAnimating) toggleAnimation(); // Stop animation
          setWaypoints(plan.waypoints);
          setShip({ ...settings.defaultShip, ...plan.ship });
          setZoomToFitTrigger(c => c + 1);
          setIsPlotting(false);
          setIsMeasuring(false);
        } else {
          alert('Invalid plan file format.');
        }
      } catch (error) {
        console.error('Failed to parse plan file:', error);
        alert('Failed to read or parse the plan file.');
      }
    };
    reader.readAsText(file);
  }, [settings.defaultShip, isAnimating, toggleAnimation]);

  const handleToggleMeasure = useCallback(() => {
    if (!isMeasuring) setIsPlotting(false);
    setIsMeasuring(prev => !prev);
  }, [isMeasuring]);

  const handleTogglePlotting = useCallback(() => {
    if (!isPlotting) setIsMeasuring(false);
    setIsPlotting(prev => !prev);
  }, [isPlotting]);
  
  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const anySectionOpen = Object.values(openSections).some(isOpen => isOpen);

  const handleToggleAllSections = () => {
      const newOpenState = !anySectionOpen;
      setOpenSections({
          configuration: newOpenState,
          editor: newOpenState,
          details: newOpenState,
          simulation: newOpenState,
      });
  };

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    setIsSettingsOpen(false);
  }

  const handlePlanFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImportPlan(file);
    }
    event.target.value = ''; // Reset file input
  }, [handleImportPlan]);
  
  const triggerPlanFileInput = useCallback(() => {
    planFileInputRef.current?.click();
  }, []);

  // Playback speed input logic
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
    setPlaybackSpeed(closestSpeed);
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
      setPlaybackSpeed(speedSteps[newIndex]);
  };
  
  const currentSpeedIndex = speedSteps.indexOf(playbackSpeed);


  return (
    <div className="flex flex-col h-screen font-sans">
      <header className="bg-gray-800 shadow-lg z-20 p-2">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold text-cyan-400">Harbor Ship Trajectory Planner</h1>
          <div className="flex items-center space-x-4">
             <button onClick={() => setIsSettingsOpen(true)} className="text-gray-400 hover:text-white transition-colors" title="Open Settings">
                <SettingsIcon className="w-6 h-6" />
             </button>
             <a href="https://github.com/google/aistudio-apps" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors" title="View on GitHub">
                <GithubIcon className="w-6 h-6" />
             </a>
          </div>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-1/4 min-w-[350px] max-w-[450px] bg-gray-800 p-4 flex flex-col z-10">
          <div className="flex justify-end mb-2">
              <button
                  onClick={handleToggleAllSections}
                  className="flex items-center space-x-1 text-xs text-cyan-400 hover:text-cyan-300 hover:underline focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded px-1"
                  title={anySectionOpen ? 'Collapse all sections' : 'Expand all sections'}
              >
                  {anySectionOpen ? (
                      <ChevronDoubleUpIcon className="w-4 h-4" />
                  ) : (
                      <ChevronDoubleDownIcon className="w-4 h-4" />
                  )}
                  <span>{anySectionOpen ? 'Collapse All' : 'Expand All'}</span>
              </button>
          </div>
          <div className="flex-1 min-h-0 flex flex-col space-y-4">
            <AccordionSection
                title="Configuration"
                icon={<SettingsIcon className="w-5 h-5 text-cyan-400" />}
                isOpen={openSections.configuration}
                onToggle={() => toggleSection('configuration')}
            >
              <div className="space-y-6">
                  <div>
                      <div className="flex justify-between items-center border-b border-gray-700 pb-2 mb-4">
                          <h3 className="text-sm font-semibold text-gray-300">Ship</h3>
                          <button 
                              onClick={() => setShip(settings.defaultShip)}
                              className="text-xs text-cyan-400 hover:text-cyan-300 hover:underline disabled:text-gray-500 disabled:no-underline disabled:cursor-not-allowed"
                              title="Reset the current ship's configuration to the saved defaults."
                              disabled={disableActions}
                          >
                              Reset to Defaults
                          </button>
                      </div>
                      <div className="space-y-3">
                          <ControlInput label="Ship Length" value={ship.length} onChange={(val) => setShip({ ...ship, length: val })} unit="m" />
                          <ControlInput label="Ship Beam" value={ship.beam} onChange={(val) => setShip({ ...ship, beam: val })} unit="m" />
                          <ControlInput label="Min Turning Radius" value={ship.turningRadius} onChange={(val) => setShip({ ...ship, turningRadius: val })} unit="m" />
                      </div>
                  </div>
                  <div className="border-b border-gray-700/50"></div>
                  <div>
                       <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center space-x-2">
                          <WindIcon className="w-5 h-5" />
                          <span>Environment</span>
                       </h3>
                       <EnvironmentControls
                          environmentalFactors={environmentalFactors}
                          setEnvironmentalFactors={setEnvironmentalFactors}
                       />
                  </div>
              </div>
            </AccordionSection>
            
            <AccordionSection
              title="Plan Editor"
              icon={<PlotIcon className="w-5 h-5 text-cyan-400" />}
              isOpen={openSections.editor}
              onToggle={() => toggleSection('editor')}
            >
              <div className="space-y-4">
                  <div className="flex">
                      <ActionButton onClick={handleTogglePlotting} title="Toggle waypoint plotting mode. Click on the map to add waypoints." disabled={disableActions} isActive={isPlotting} className={`relative flex-1 rounded-r-none ${isPlotting ? 'bg-sky-600 z-10' : 'bg-gray-700 hover:bg-gray-600'}`}>
                          <PlotIcon className="w-5 h-5 mr-2" />
                          Plot Waypoints
                      </ActionButton>
                      <ActionButton onClick={handleToggleMeasure} title="Activate measurement tool. Click two points on the map to measure the distance." disabled={disableActions} isActive={isMeasuring} className={`relative flex-1 rounded-l-none border-l border-gray-800 ${isMeasuring ? 'bg-cyan-600 z-10' : 'bg-gray-700 hover:bg-gray-600'}`}>
                          <MeasureIcon className="w-5 h-5 mr-2" />
                          Measure
                      </ActionButton>
                  </div>
                  <ActionButton onClick={handleClear} className="w-full bg-transparent border border-red-700 text-red-500 hover:bg-red-900/50 hover:text-red-400" title="Remove all waypoints and clear the current plan. This action cannot be undone." disabled={waypoints.length === 0 || disableActions}>
                      <TrashIcon className="w-5 h-5 mr-2" />
                      Clear Plan
                  </ActionButton>
              </div>
            </AccordionSection>

            <AccordionSection
                title="Trajectory Details"
                icon={<ListIcon className="w-5 h-5 text-cyan-400" />}
                isOpen={openSections.details}
                onToggle={() => toggleSection('details')}
                className={openSections.details ? "flex-1 min-h-0" : ""}
            >
              <TrajectoryInfo legs={trajectoryLegs} onDeleteWaypoint={handleDeleteWaypoint} onLegHover={setHoveredLegId} onSpeedChange={handleSpeedChange} onPropulsionChange={handlePropulsionChange}/>
            </AccordionSection>
            
             <AccordionSection
                title="Simulation & I/O"
                icon={<PlayIcon className="w-5 h-5 text-cyan-400" />}
                isOpen={openSections.simulation}
                onToggle={() => toggleSection('simulation')}
            >
               <div className="space-y-6">
                  <div>
                      <h3 className="text-sm font-semibold text-gray-300 mb-4">Simulation</h3>
                      <ActionButton onClick={toggleAnimation} className={`w-full ${isAnimating ? "bg-amber-600 hover:bg-amber-500" : "bg-teal-600 hover:bg-teal-500"}`} title={isAnimating ? "Stop the trajectory animation" : "Animate the ship's trajectory"} disabled={waypoints.length < 2}>
                          {isAnimating ? <StopIcon className="w-5 h-5 mr-2" /> : <PlayIcon className="w-5 h-5 mr-2" />}
                          {isAnimating ? 'Stop Animation' : 'Animate Plan'}
                      </ActionButton>
                      <div className="mt-3">
                          <label className="block text-xs font-medium text-gray-400 mb-2">Playback Speed</label>
                          <div className="flex items-center space-x-3">
                              <input type="range" min="0" max={speedSteps.length - 1} step="1" value={currentSpeedIndex} onChange={handleSliderChange} className="w-full speed-slider" list="speed-markers" title={`Current speed: ${playbackSpeed}x`}/>
                              <datalist id="speed-markers">
                                  {speedSteps.map((s, i) => <option key={s} value={i} label={`${s}x`}></option>)}
                              </datalist>
                              <div className="flex items-center">
                                  <input type="number" value={speedInput} onChange={(e) => setSpeedInput(e.target.value)} onBlur={commitSpeedChange} onKeyDown={handleInputKeyDown} className="w-16 bg-gray-900 border border-gray-600 rounded-md p-1 text-sm text-right font-mono text-white focus:ring-cyan-500 focus:border-cyan-500" aria-label="Playback speed"/>
                                  <span className="ml-1.5 text-gray-400 font-semibold">x</span>
                              </div>
                          </div>
                      </div>
                  </div>
                  <div className="border-b border-gray-700/50"></div>
                  <div>
                       <h3 className="text-sm font-semibold text-gray-300 mb-4">Plan Management</h3>
                       <input type="file" ref={planFileInputRef} onChange={handlePlanFileChange} className="hidden" accept=".json,application/json" />
                       <div className="grid grid-cols-2 gap-3">
                           <ActionButton onClick={triggerPlanFileInput} className="bg-slate-600 hover:bg-slate-500" title="Import a previously saved trajectory plan (.json file)." disabled={disableActions}>
                               <ImportIcon className="w-5 h-5 mr-2" />
                               Import
                           </ActionButton>
                           <ActionButton onClick={handleExportPlan} className="bg-slate-600 hover:bg-slate-500" title="Save the current waypoints and ship configuration to a JSON file." disabled={waypoints.length === 0 || disableActions}>
                               <ExportIcon className="w-5 h-5 mr-2" />
                               Export
                           </ActionButton>
                       </div>
                  </div>
               </div>
            </AccordionSection>
          </div>
        </aside>
        <main className="flex-1 bg-gray-700 relative">
          <PlanningCanvas
            waypoints={waypoints}
            ship={ship}
            onAddWaypoint={handleAddWaypoint}
            onUpdateWaypoint={handleUpdateWaypoint}
            onDeleteWaypoint={handleDeleteWaypoint}
            onSpeedChange={handleSpeedChange}
            onPropulsionChange={handlePropulsionChange}
            legs={trajectoryLegs}
            zoomToFitTrigger={zoomToFitTrigger}
            isMeasuring={isMeasuring}
            isPlotting={isPlotting}
            hoveredLegId={hoveredLegId}
            animationState={animationState}
            mapTileLayer={selectedMapLayer}
            environmentalFactors={environmentalFactors}
            pivotDuration={settings.pivotDuration}
            waypointSettings={settings.waypointSettings}
          />
        </main>
      </div>
       {isSettingsOpen && (
        <SettingsModal 
          currentSettings={settings}
          onSave={handleSaveSettings}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
