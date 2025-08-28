import React, { useState, useCallback, useEffect } from 'react';
import { Waypoint, Ship, TrajectoryLeg, GeoPoint, SavedPlan, AppSettings, PropulsionDirection, EnvironmentalFactors } from './types';
import Controls from './components/Controls';
import PlanningCanvas from './components/PlanningCanvas';
import TrajectoryInfo from './components/TrajectoryInfo';
import SettingsModal from './components/SettingsModal';
import { useTrajectoryCalculations } from './hooks/useTrajectoryCalculations';
import { useAnimation } from './hooks/useAnimation';
import { GithubIcon, SettingsIcon, ListIcon, WindIcon } from './components/Icons';
import { AccordionSection } from './components/Accordion';
import { MAP_TILE_LAYERS } from './constants';
import EnvironmentControls from './components/EnvironmentControls';


const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>({
    defaultShip: { length: 150, beam: 25, turningRadius: 300 },
    defaultSpeed: 5.0,
    pivotDuration: 30,
    mapTileLayerId: 'osm',
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
    controls: true,
    environment: true,
    plan: true,
  });
  const [hoveredLegId, setHoveredLegId] = useState<number | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
  const trajectoryLegs: TrajectoryLeg[] = useTrajectoryCalculations(waypoints, ship, settings.pivotDuration, environmentalFactors);
  const { isAnimating, animationState, toggleAnimation } = useAnimation(trajectoryLegs, waypoints, playbackSpeed);
  
  const selectedMapLayer = MAP_TILE_LAYERS.find(l => l.id === settings.mapTileLayerId) || MAP_TILE_LAYERS[0];

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

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    setIsSettingsOpen(false);
  }

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
        <aside className="w-1/4 min-w-[350px] max-w-[450px] bg-gray-800 p-4 flex flex-col space-y-4 z-10 overflow-y-auto">
          <AccordionSection
              title="Settings & Actions"
              icon={<SettingsIcon className="w-5 h-5 text-cyan-400" />}
              isOpen={openSections.controls}
              onToggle={() => toggleSection('controls')}
          >
            <Controls 
              ship={ship}
              setShip={setShip}
              onClear={handleClear}
              onImportPlan={handleImportPlan}
              onExportPlan={handleExportPlan}
              isMeasuring={isMeasuring}
              onToggleMeasure={handleToggleMeasure}
              isPlotting={isPlotting}
              onTogglePlotting={handleTogglePlotting}
              onAnimateToggle={toggleAnimation}
              isAnimating={isAnimating}
              hasPlan={waypoints.length > 1}
              onResetShipToDefaults={() => setShip(settings.defaultShip)}
              playbackSpeed={playbackSpeed}
              onPlaybackSpeedChange={setPlaybackSpeed}
            />
          </AccordionSection>
          <AccordionSection
            title="Environment"
            icon={<WindIcon className="w-5 h-5 text-cyan-400" />}
            isOpen={openSections.environment}
            onToggle={() => toggleSection('environment')}
          >
            <EnvironmentControls
              environmentalFactors={environmentalFactors}
              setEnvironmentalFactors={setEnvironmentalFactors}
            />
          </AccordionSection>
          <AccordionSection
              title="Trajectory Plan"
              icon={<ListIcon className="w-5 h-5 text-cyan-400" />}
              isOpen={openSections.plan}
              onToggle={() => toggleSection('plan')}
          >
            <TrajectoryInfo legs={trajectoryLegs} onDeleteWaypoint={handleDeleteWaypoint} onLegHover={setHoveredLegId} onSpeedChange={handleSpeedChange} onPropulsionChange={handlePropulsionChange}/>
          </AccordionSection>
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