

import React, { useRef, useEffect } from 'react';
import { Waypoint, Ship, GeoPoint, TrajectoryLeg, NavigationCommand } from '../types';

// Since we don't have @types/leaflet installed from npm, we declare a global L
declare const L: any;

interface PlanningCanvasProps {
  waypoints: Waypoint[];
  ship: Ship;
  onAddWaypoint: (point: GeoPoint) => void;
  onUpdateWaypoint: (id: number, point: GeoPoint) => void;
  onDeleteWaypoint: (id: number) => void;
  legs: TrajectoryLeg[];
  zoomToFitTrigger: number;
  isMeasuring: boolean;
  isPlotting: boolean;
}

// --- GEO HELPER FUNCTIONS FOR SHIP VISUALIZATION ---
const R = 6371e3; // Earth's radius in metres

function toRad(deg: number): number {
  return deg * Math.PI / 180;
}

function toDeg(rad: number): number {
  return rad * 180 / Math.PI;
}

function getDistance(p1: GeoPoint, p2: GeoPoint): number {
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);
  const deltaLat = toRad(p2.lat - p1.lat);
  const deltaLng = toRad(p2.lng - p1.lng);

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
}

function getBearing(p1: GeoPoint, p2: GeoPoint): number {
  const lat1 = toRad(p1.lat);
  const lng1 = toRad(p1.lng);
  const lat2 = toRad(p2.lat);
  const lng2 = toRad(p2.lng);

  const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
  const theta = Math.atan2(y, x);
  const brng = (toDeg(theta) + 360) % 360; // in degrees
  return brng;
}

/**
 * Calculates the destination point given a starting point, distance, and bearing.
 * @param point - The starting point { lat, lng }.
 * @param distance - The distance in meters.
 * @param bearing - The bearing in degrees.
 * @returns The destination point { lat, lng }.
 */
function destinationPoint(point: GeoPoint, distance: number, bearing: number): GeoPoint {
    const brng = toRad(bearing);
    const lat1 = toRad(point.lat);
    const lon1 = toRad(point.lng);

    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance / R) +
                          Math.cos(lat1) * Math.sin(distance / R) * Math.cos(brng));
    const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(distance / R) * Math.cos(lat1),
                                  Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2));
    
    return { lat: toDeg(lat2), lng: toDeg(lon2) };
}

/**
 * Calculates the geographic coordinates of a ship polygon with a realistic shape.
 * @param center - The center point of the ship { lat, lng }.
 * @param length - The ship's length in meters.
 * @param beam - The ship's beam (width) in meters.
 * @param bearing - The ship's bearing (heading) in degrees.
 * @returns An array of GeoPoints representing the ship's hull.
 */
function getShipPolygonCoords(center: GeoPoint, length: number, beam: number, bearing: number): GeoPoint[] {
    const l = length / 2;
    const b = beam / 2;

    // The bow curve starts at 50% of the length from the center.
    const bowShoulderY = l * 0.5;

    // Define the ship's hull points in a local coordinate system (y: bow, x: starboard)
    // Ordered for drawing a polygon.
    const hullPoints = [
        { x: -b, y: -l },                  // 1. Stern-port
        { x: b, y: -l },                   // 2. Stern-starboard
        { x: b, y: bowShoulderY },         // 3. Bow-shoulder-starboard
        { x: b * 0.5, y: l * 0.9 },        // 4. Bow-curve-point-starboard (for rounded shape)
        { x: 0, y: l },                    // 5. Bow tip
        { x: -b * 0.5, y: l * 0.9 },       // 6. Bow-curve-point-port (for rounded shape)
        { x: -b, y: bowShoulderY },         // 7. Bow-shoulder-port
    ];

    // Convert local hull points to geographic coordinates
    return hullPoints.map(point => {
        // Calculate distance and angle from the center to the point
        const distance = Math.sqrt(point.x * point.x + point.y * point.y);
        const angle = toDeg(Math.atan2(point.x, point.y));
        
        // Adjust the angle by the ship's bearing
        const finalBearing = bearing + angle;
        
        // Calculate the geographic coordinate of the point
        return destinationPoint(center, distance, finalBearing);
    });
}


// Helper function for Catmull-Rom spline interpolation (alpha = 0.5)
function catmullRom(t: number, p0: number, p1: number, p2: number, p3: number): number {
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
  );
}

const PlanningCanvas: React.FC<PlanningCanvasProps> = ({ waypoints, ship, onAddWaypoint, onUpdateWaypoint, onDeleteWaypoint, legs, zoomToFitTrigger, isMeasuring, isPlotting }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);

  // Refs for measurement tool
  const measureLineRef = useRef<any>(null);
  const measureTooltipRef = useRef<any>(null);
  const measureStartPointRef = useRef<any>(null); // Leaflet LatLng object
  
  // Refs for live plotting preview
  const plotPreviewLineRef = useRef<any>(null);
  const plotPreviewTooltipRef = useRef<any>(null);

  // Initialize map
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current).setView([40.7128, -74.0060], 13); // Default to NYC Harbor
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      mapRef.current = map;
    }
  }, []);

  // Effect to handle mode switching (plotting vs. measuring vs. neutral)
  useEffect(() => {
    const map = mapRef.current;
    const mapContainer = mapContainerRef.current;
    if (!map || !mapContainer) return;

    // --- Always clean up previous listeners before setting new ones ---
    map.off('click');
    map.off('mousemove');
    map.off('mouseout');
    mapContainer.classList.remove('plotting-mode', 'measuring-active');

    // --- Helper cleanup functions ---
    const cleanupMeasureLayers = () => {
        if (measureLineRef.current) map.removeLayer(measureLineRef.current);
        if (measureTooltipRef.current) map.removeLayer(measureTooltipRef.current);
        measureLineRef.current = null;
        measureTooltipRef.current = null;
        measureStartPointRef.current = null;
    }
    
    const cleanupPlotPreviewLayers = () => {
        if (plotPreviewLineRef.current) map.removeLayer(plotPreviewLineRef.current);
        if (plotPreviewTooltipRef.current) map.removeLayer(plotPreviewTooltipRef.current);
        plotPreviewLineRef.current = null;
        plotPreviewTooltipRef.current = null;
    }
    
    if (isMeasuring) {
        cleanupPlotPreviewLayers();
        map.dragging.disable();
        mapContainer.classList.add('measuring-active');

        const handleMeasureClick = (e: any) => {
            if (measureStartPointRef.current) { // Second click
                map.off('mousemove'); 
                const finalDistance = getDistance(measureStartPointRef.current, e.latlng);
                measureTooltipRef.current?.setContent(`<strong>Total:</strong> ${finalDistance.toFixed(1)} m`);
                measureLineRef.current?.setStyle({ dashArray: null });
                measureStartPointRef.current = null; 
            } else { // First click
                cleanupMeasureLayers();
                measureStartPointRef.current = e.latlng;
                measureLineRef.current = L.polyline([e.latlng, e.latlng], {
                    color: '#FBBF24', weight: 3, dashArray: '5, 10', interactive: false,
                }).addTo(map);
                measureTooltipRef.current = L.tooltip({
                    permanent: true, direction: 'right', offset: L.point(10, 0), className: 'measurement-tooltip'
                }).setLatLng(e.latlng).setContent('Measuring...').addTo(map);

                map.on('mousemove', (moveEvent: any) => {
                    if (!measureStartPointRef.current) return;
                    const currentPoint = moveEvent.latlng;
                    measureLineRef.current?.setLatLngs([measureStartPointRef.current, currentPoint]);
                    const distance = getDistance(measureStartPointRef.current, currentPoint);
                    measureTooltipRef.current?.setLatLng(currentPoint).setContent(`Distance: ${distance.toFixed(1)} m`);
                });
            }
        };
        map.on('click', handleMeasureClick);
    } else if (isPlotting) {
        cleanupMeasureLayers();
        map.dragging.enable();
        mapContainer.classList.add('plotting-mode');
        map.on('click', (e: any) => onAddWaypoint({ lat: e.latlng.lat, lng: e.latlng.lng }));
        
        // Add live plot preview logic
        if (waypoints.length > 0) {
            const lastWaypoint = waypoints[waypoints.length - 1];
            map.on('mousemove', (e: any) => {
                const currentLatLng = e.latlng;
                
                if (!plotPreviewLineRef.current) {
                    plotPreviewLineRef.current = L.polyline([lastWaypoint, currentLatLng], {
                        color: '#06b6d4', weight: 2, dashArray: '8, 8', interactive: false,
                    }).addTo(map);
                } else {
                    plotPreviewLineRef.current.setLatLngs([lastWaypoint, currentLatLng]);
                }

                const distance = getDistance(lastWaypoint, currentLatLng);
                const bearing = getBearing(lastWaypoint, currentLatLng);
                const tooltipContent = `
                  <div class="text-left">
                    <div><strong>Distance:</strong> ${distance.toFixed(1)} m</div>
                    <div><strong>Bearing:</strong> ${bearing.toFixed(1)}°</div>
                  </div>
                `;

                if (!plotPreviewTooltipRef.current) {
                    plotPreviewTooltipRef.current = L.tooltip({
                        permanent: true, direction: 'right', offset: L.point(15, 0), className: 'measurement-tooltip'
                    }).setLatLng(currentLatLng).setContent(tooltipContent).addTo(map);
                } else {
                    plotPreviewTooltipRef.current.setLatLng(currentLatLng).setContent(tooltipContent);
                }
            });

            map.on('mouseout', () => {
                cleanupPlotPreviewLayers();
            });
        }
    } else { // Neutral mode
        map.dragging.enable();
        cleanupMeasureLayers();
        cleanupPlotPreviewLayers();
    }

    return () => { // General cleanup on mode change
        map.dragging.enable();
        map.off('click');
        map.off('mousemove');
        map.off('mouseout');
        cleanupMeasureLayers();
        cleanupPlotPreviewLayers();
    };
  }, [isMeasuring, isPlotting, onAddWaypoint, waypoints]);

  // Update map layers when waypoints or measuring state change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous layers
    layersRef.current.forEach(layer => map.removeLayer(layer));
    layersRef.current = [];
    
    const isInteractive = !isMeasuring && !isPlotting;

    // Waypoint Markers
    const waypointMarkers = waypoints.map((wp, index) => {
      const leg = legs.find(l => l.start.id === wp.id);
      const isViolation = leg?.turnRadiusViolation;
      
      const iconHtml = `
        <div class="relative flex items-center justify-center">
          ${isViolation ? '<div class="absolute w-8 h-8 rounded-full border-2 border-red-500 animate-ping opacity-75"></div>' : ''}
          <div class="absolute w-6 h-6 rounded-full bg-sky-500 border-2 border-white shadow-lg"></div>
          <div class="absolute -top-6 text-center text-white font-bold text-sm" style="text-shadow: 0 0 4px black, 0 0 4px black;">WP${index + 1}</div>
        </div>
      `;
      
      const marker = L.marker([wp.lat, wp.lng], {
        draggable: isInteractive,
        interactive: isInteractive,
        icon: L.divIcon({
          className: 'waypoint-marker',
          html: iconHtml,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        })
      }).addTo(map);

      if (isInteractive) {
        marker.on('dragend', (e: any) => {
          onUpdateWaypoint(wp.id, e.target.getLatLng());
        });
        marker.on('contextmenu', () => {
          onDeleteWaypoint(wp.id);
        });
      }
      
      return marker;
    });
    layersRef.current.push(...waypointMarkers);

    if (waypoints.length > 1) {
      // Smooth Trajectory (Catmull-Rom)
      const interpolatedPoints = waypoints.slice(0, -1).flatMap((wp, i) => {
          const p0 = waypoints[i - 1] || waypoints[i];
          const p1 = waypoints[i];
          const p2 = waypoints[i + 1];
          const p3 = waypoints[i + 2] || waypoints[i + 1];
          
          const interpolator = (t: number) => ({
            lat: catmullRom(t, p0.lat, p1.lat, p2.lat, p3.lat),
            lng: catmullRom(t, p0.lng, p1.lng, p2.lng, p3.lng),
          });

          return Array.from({ length: 15 }, (_, i) => i / 15).map(interpolator);
      });
      interpolatedPoints.push(waypoints[waypoints.length-1]);

      const smoothPath = L.polyline(interpolatedPoints.map(p => [p.lat, p.lng]), { color: 'rgba(255, 255, 255, 0.7)', weight: 3, dashArray: '10, 10', interactive: false }).addTo(map);
      layersRef.current.push(smoothPath);
      
      // Straight Path
      const straightPath = L.polyline(waypoints.map(wp => [wp.lat, wp.lng]), { color: 'rgba(56, 189, 248, 0.7)', weight: 2, interactive: false }).addTo(map);
      layersRef.current.push(straightPath);
    }
    
    // Ship Polygons
    if (legs.length > 0) {
        const shipPolygons = legs.map((leg) => {
            let color: string;
            switch (leg.command) {
            case NavigationCommand.START:
                color = '#10B981'; // green-500
                break;
            case NavigationCommand.END:
                color = '#FBBF24'; // yellow-400, consistent with info panel
                break;
            default:
                color = '#3B82F6'; // blue-500 for intermediate points
                break;
            }

            const shipCoords = getShipPolygonCoords(leg.start, ship.length, ship.beam, leg.bearing);
            
            const shipPolygon = L.polygon(shipCoords.map(p => [p.lat, p.lng]), {
                color: color,
                fillColor: color,
                fillOpacity: 0.5,
                weight: 1,
                interactive: false,
                zIndexOffset: -1000
            }).addTo(map);

            return shipPolygon;
        });
        layersRef.current.push(...shipPolygons);
    }
  }, [waypoints, ship, legs, onUpdateWaypoint, onDeleteWaypoint, isMeasuring, isPlotting]);
  
  // Auto-zoom to fit waypoints when a plan is imported
  useEffect(() => {
    if (zoomToFitTrigger === 0 || !mapRef.current || waypoints.length === 0) {
      return;
    }

    const bounds = L.latLngBounds(waypoints.map(wp => [wp.lat, wp.lng]));
    mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    
  }, [zoomToFitTrigger]);

  return (
    <div ref={mapContainerRef} className="w-full h-full" />
  );
};

export default PlanningCanvas;