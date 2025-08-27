import React, { useState, useCallback } from 'react';
import { Waypoint, Ship, TrajectoryLeg, GeoPoint, SavedPlan } from './types';
import Controls from './components/Controls';
import PlanningCanvas from './components/PlanningCanvas';
import TrajectoryInfo from './components/TrajectoryInfo';
import { useTrajectoryCalculations } from './hooks/useTrajectoryCalculations';
import { GithubIcon } from './components/Icons';

const App: React.FC = () => {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [ship, setShip] = useState<Ship>({ length: 150, beam: 25, turningRadius: 300 });

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
          // Provide default turningRadius if not in imported file for backward compatibility
          setShip({ turningRadius: 300, ...plan.ship });
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

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-200 font-sans">
      <header className="bg-gray-800 shadow-lg z-10 p-2">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold text-cyan-400">Harbor Ship Trajectory Planner</h1>
          <a href="https://github.com/your-repo" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
            <GithubIcon className="w-6 h-6" />
          </a>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-1/4 min-w-[350px] max-w-[450px] bg-gray-800 p-4 flex flex-col space-y-4">
          <Controls 
            ship={ship}
            setShip={setShip}
            onClear={handleClear}
            onImportPlan={handleImportPlan}
            onExportPlan={handleExportPlan}
          />
          <TrajectoryInfo legs={trajectoryLegs} onDeleteWaypoint={handleDeleteWaypoint} />
        </aside>
        <main className="flex-1 bg-gray-700 relative">
          <PlanningCanvas
            waypoints={waypoints}
            ship={ship}
            onAddWaypoint={handleAddWaypoint}
            onUpdateWaypoint={handleUpdateWaypoint}
            onDeleteWaypoint={handleDeleteWaypoint}
            legs={trajectoryLegs}
          />
        main>
      </div>
    </div>
  );
};

export default App;