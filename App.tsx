import React, { useState, useCallback } from 'react';
import { Waypoint, Ship, TrajectoryLeg, GeoPoint, SavedPlan } from './types';
import Controls from './components/Controls';
import PlanningCanvas from './components/PlanningCanvas';
import TrajectoryInfo from './components/TrajectoryInfo';
import { useTrajectoryCalculations } from './hooks/useTrajectoryCalculations';
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


const App: React.FC = () => {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [ship, setShip] = useState<Ship>({ length: 150, beam: 25, turningRadius: 300 });
  const [zoomToFitTrigger, setZoomToFitTrigger] = useState(0);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [isPlotting, setIsPlotting] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    controls: true,
    plan: true,
  });
  const [hoveredLegId, setHoveredLegId] = useState<number | null>(null);

  const trajectoryLegs: TrajectoryLeg[] = useTrajectoryCalculations(waypoints, ship);

  const handleAddWaypoint = useCallback((point: GeoPoint) => {
    const newWaypoint: Waypoint = {
      ...point,
      id: Date.now(),
    };
    setWaypoints(prev => [...prev, newWaypoint]);
  }, []);

  const handleUpdateWaypoint = useCallback((id: number, point: GeoPoint) => {
    setWaypoints(prev =>
      prev.map(wp => (wp.id === id ? { ...wp, lat: point.lat, lng: point.lng } : wp))
    );
  }, []);

  const handleDeleteWaypoint = useCallback((id: number) => {
    setWaypoints(prev => prev.filter(wp => wp.id !== id));
  }, []);

  const handleClear = useCallback(() => {
    setWaypoints([]);
    setIsPlotting(false);
    setIsMeasuring(false);
  }, []);

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
          setShip({ turningRadius: 300, ...plan.ship });
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
  }, []);

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

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-200 font-sans">
      <header className="bg-gray-800 shadow-lg z-10 p-2">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold text-cyan-400">Harbor Ship Trajectory Planner</h1>
          <a href="https://github.com/google/aistudio-apps" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
            <GithubIcon className="w-6 h-6" />
          </a>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-1/4 min-w-[350px] max-w-[450px] bg-gray-800 p-4 flex flex-col space-y-4">
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
              <TrajectoryInfo legs={trajectoryLegs} onDeleteWaypoint={handleDeleteWaypoint} onLegHover={setHoveredLegId} />
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
          />
        </main>
      </div>
    </div>
  );
};

export default App;