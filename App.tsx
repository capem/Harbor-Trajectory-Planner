import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Waypoint, Ship, TrajectoryLeg, GeoPoint, SavedPlan, AnimationState, NavigationCommand, PropulsionDirection, AppSettings, MapTileLayer } from './types';
import Controls from './components/Controls';
import PlanningCanvas from './components/PlanningCanvas';
import TrajectoryInfo from './components/TrajectoryInfo';
import SettingsModal from './components/SettingsModal';
import { useTrajectoryCalculations, getPointOnCatmullRom, getHeadingOnCatmullRom } from './hooks/useTrajectoryCalculations';
import { GithubIcon, ChevronDownIcon, SettingsIcon, ListIcon } from './components/Icons';

const AccordionSection: React.FC<{ title: string; icon: React.ReactNode; isOpen: boolean; onToggle: () => void; children: React.ReactNode; className?: string; }> = ({ title, icon, isOpen, onToggle, children, className = '' }) => (
    // This is now a flex container that can fill height
    <div className={`bg-gray-900/70 rounded-lg overflow-hidden border border-gray-700/50 flex flex-col ${className}`}>
      <button onClick={onToggle} className="w-full flex justify-between items-center p-4 bg-gray-800/50 hover:bg-gray-700/50 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 flex-shrink-0">
        <div className="flex items-center space-x-3">
          {icon}
          <h2 className="text-md font-semibold text-cyan-400">{title}</h2>
        </div>
        <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {/* This div will grow and handles the animation using grid-template-rows */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'} flex-1 min-h-0`}>
        <div className="overflow-y-auto"> {/* This inner div provides the scrolling */}
          <div className="p-4 border-t border-gray-700/50">
            {children}
          </div>
        </div>
      </div>
    </div>
);

export const MAP_TILE_LAYERS: MapTileLayer[] = [
  { id: 'osm', name: 'OpenStreetMap', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
  { id: 'satellite', name: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community' },
  { id: 'dark', name: 'Dark Matter', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' },
];

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
  const [zoomToFitTrigger, setZoomToFitTrigger] = useState(0);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [isPlotting, setIsPlotting] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    controls: true,
    plan: true,
  });
  const [hoveredLegId, setHoveredLegId] = useState<number | null>(null);

  // Animation State
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationState, setAnimationState] = useState<AnimationState | null>(null);

  const animationFrameId = useRef<number | null>(null);
  
  const trajectoryLegs: TrajectoryLeg[] = useTrajectoryCalculations(waypoints, ship, settings.pivotDuration);
  const selectedMapLayer = MAP_TILE_LAYERS.find(l => l.id === settings.mapTileLayerId) || MAP_TILE_LAYERS[0];


  const calculateAnimationState = useCallback((progress: number, totalDuration: number) => {
      const currentTime = progress * totalDuration;
      let accumulatedTime = 0;

      for (let i = 0; i < trajectoryLegs.length; i++) {
          const leg = trajectoryLegs[i];
          if (leg.command === NavigationCommand.END) continue;
          
          const legEndTime = accumulatedTime + leg.time;

          if (currentTime <= legEndTime || i === trajectoryLegs.length - 2 /* Last actual leg */) {
              const timeIntoLeg = currentTime - accumulatedTime;

              // Handle pivoting phase
              if (timeIntoLeg < leg.pivotTime) {
                  const pivotProgress = leg.pivotTime > 0 ? timeIntoLeg / leg.pivotTime : 1;
                  const prevLeg = i > 0 ? trajectoryLegs[i-1] : null;
                  const startPivotHeading = prevLeg ? prevLeg.endHeading : leg.startHeading;
                  const endPivotHeading = leg.startHeading;
                  
                  let angleDiff = endPivotHeading - startPivotHeading;
                  if (angleDiff > 180) angleDiff -= 360;
                  if (angleDiff < -180) angleDiff += 360;

                  const heading = startPivotHeading + angleDiff * pivotProgress;
                  return { position: leg.start, heading };
              }
              
              // Handle movement phase
              const moveTime = leg.time - leg.pivotTime;
              const timeIntoMove = timeIntoLeg - leg.pivotTime;
              const legProgress = moveTime > 0 ? timeIntoMove / moveTime : 1;
              
              const prevPropulsion = waypoints[i-1]?.propulsionDirection ?? PropulsionDirection.FORWARD;
              const p0 = (i > 0 && leg.propulsion === prevPropulsion) ? waypoints[i-1] : waypoints[i];
              const p1 = waypoints[i];
              const p2 = waypoints[i+1];
              const nextPropulsion = waypoints[i+1]?.propulsionDirection ?? PropulsionDirection.FORWARD;
              const p3 = (waypoints[i+2] && nextPropulsion === leg.propulsion) ? waypoints[i+2] : waypoints[i+1];
              
              const position = getPointOnCatmullRom(legProgress, p0, p1, p2, p3);
              let heading = getHeadingOnCatmullRom(legProgress, p0, p1, p2, p3);
              if (leg.propulsion === PropulsionDirection.ASTERN) {
                  heading = (heading + 180) % 360;
              }
              
              return { position, heading };
          }
          accumulatedTime = legEndTime;
      }
      // Fallback for the very end
      const lastLeg = trajectoryLegs[trajectoryLegs.length-2];
      if (lastLeg) {
          return { position: lastLeg.end, heading: lastLeg.endHeading };
      }
      return null;
  }, [trajectoryLegs, waypoints]);

  const handleAnimateToggle = useCallback(() => {
    if (isAnimating) {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
        }
        setIsAnimating(false);
        setAnimationState(null);
    } else {
        const totalDuration = trajectoryLegs.reduce((sum, leg) => sum + leg.time, 0);
        if (totalDuration === 0) return;

        // Scale duration for better viewing, e.g., max 15 seconds
        const playbackSpeed = Math.max(1, totalDuration / 15);
        
        let startTime: number | null = null;
        setIsAnimating(true);
        
        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const elapsed = (timestamp - startTime) / 1000; // in seconds
            
            const scaledElapsed = elapsed * playbackSpeed;
            const progress = Math.min(scaledElapsed / totalDuration, 1);
            
            const newState = calculateAnimationState(progress, totalDuration);
            if(newState) {
                setAnimationState(newState);
            }

            if (progress < 1) {
                animationFrameId.current = requestAnimationFrame(animate);
            } else {
                setIsAnimating(false);
                setTimeout(() => setAnimationState(null), 1000);
            }
        };
        animationFrameId.current = requestAnimationFrame(animate);
    }
  }, [isAnimating, trajectoryLegs, calculateAnimationState]);
  
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
    setWaypoints([]);
    setShip(settings.defaultShip);
    setIsPlotting(false);
    setIsMeasuring(false);
  }, [settings.defaultShip]);

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
  }, [settings.defaultShip]);

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
    <div className="flex flex-col h-screen bg-gray-900 text-gray-200 font-sans">
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
        <aside className="w-1/4 min-w-[350px] max-w-[450px] bg-gray-800 p-4 flex flex-col space-y-4 z-10">
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
              onAnimateToggle={handleAnimateToggle}
              isAnimating={isAnimating}
              hasPlan={waypoints.length > 1}
              onResetShipToDefaults={() => setShip(settings.defaultShip)}
            />
          </AccordionSection>
          <div className="flex-1 flex flex-col min-h-0">
            <AccordionSection
                className="h-full"
                title="Trajectory Plan"
                icon={<ListIcon className="w-5 h-5 text-cyan-400" />}
                isOpen={openSections.plan}
                onToggle={() => toggleSection('plan')}
            >
              <TrajectoryInfo legs={trajectoryLegs} onDeleteWaypoint={handleDeleteWaypoint} onLegHover={setHoveredLegId} onSpeedChange={handleSpeedChange} onPropulsionChange={handlePropulsionChange}/>
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
            legs={trajectoryLegs}
            zoomToFitTrigger={zoomToFitTrigger}
            isMeasuring={isMeasuring}
            isPlotting={isPlotting}
            hoveredLegId={hoveredLegId}
            animationState={animationState}
            mapTileLayer={selectedMapLayer}
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
