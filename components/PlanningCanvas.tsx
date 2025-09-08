import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Waypoint, Ship, GeoPoint, TrajectoryLeg, NavigationCommand, AnimationState, PropulsionDirection, MapTileLayer, EnvironmentalFactors, WaypointSettings, WaypointShape } from '../types';
import { calculateTrajectory } from '../hooks/useTrajectoryCalculations';
import WaypointContextMenu from './WaypointContextMenu';
import WindRose from './WindRose';
import CurrentFlowLayer from './CurrentFlowLayer';

// Since we don't have @types/leaflet installed from npm, we declare a global L
declare const L: any;

interface PlanningCanvasProps {
  waypoints: Waypoint[];
  ship: Ship;
  onAddWaypoint: (point: GeoPoint) => void;
  onUpdateWaypoint: (id: number, point: GeoPoint) => void;
  onDeleteWaypoint: (id: number) => void;
  onSpeedChange: (waypointId: number, speed: number) => void;
  onPropulsionChange: (waypointId: number, propulsion: PropulsionDirection) => void;
  legs: TrajectoryLeg[];
  zoomToFitTrigger: number;
  isMeasuring: boolean;
  isPlotting: boolean;
  hoveredLegId?: number | null;
  animationState: AnimationState | null;
  mapTileLayer: MapTileLayer;
  environmentalFactors: EnvironmentalFactors;
  pivotDuration: number;
  waypointSettings: WaypointSettings;
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
 * @param heading - The ship's heading in degrees.
 * @returns An array of GeoPoints representing the ship's hull.
 */
function getShipPolygonCoords(center: GeoPoint, length: number, beam: number, heading: number): GeoPoint[] {
    const l = length / 2;
    const b = beam / 2;

    const bowShoulderY = l * 0.5;

    const hullPoints = [
        { x: -b, y: -l },                  // 1. Stern-port
        { x: b, y: -l },                   // 2. Stern-starboard
        { x: b, y: bowShoulderY },         // 3. Bow-shoulder-starboard
        { x: b * 0.5, y: l * 0.9 },        // 4. Bow-curve-point-starboard
        { x: 0, y: l },                    // 5. Bow tip
        { x: -b * 0.5, y: l * 0.9 },       // 6. Bow-curve-point-port
        { x: -b, y: bowShoulderY },         // 7. Bow-shoulder-port
    ];

    return hullPoints.map(point => {
        const distance = Math.sqrt(point.x * point.x + point.y * point.y);
        const angle = toDeg(Math.atan2(point.x, point.y));
        const finalBearing = heading + angle;
        return destinationPoint(center, distance, finalBearing);
    });
}

/**
 * Generates an array of GeoPoints representing an arc.
 * @param center The center of the arc.
 * @param radius The radius in meters.
 * @param startBearing The starting bearing in degrees.
 * @param endBearing The ending bearing in degrees.
 * @param segments The number of segments to approximate the arc.
 * @returns An array of GeoPoints.
 */
function getArcPoints(center: GeoPoint, radius: number, startBearing: number, endBearing: number, segments = 20): GeoPoint[] {
    let angleDiff = endBearing - startBearing;
    if (angleDiff > 180) angleDiff -= 360;
    if (angleDiff < -180) angleDiff += 360;

    const points: GeoPoint[] = [];
    for (let i = 0; i <= segments; i++) {
        const progress = i / segments;
        const currentBearing = startBearing + angleDiff * progress;
        points.push(destinationPoint(center, radius, currentBearing));
    }
    return points;
}


function catmullRom(t: number, p0: number, p1: number, p2: number, p3: number): number {
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
  );
}

const PlanningCanvas: React.FC<PlanningCanvasProps> = ({ 
    waypoints, ship, onAddWaypoint, onUpdateWaypoint, onDeleteWaypoint, 
    onSpeedChange, onPropulsionChange, legs, zoomToFitTrigger, isMeasuring, isPlotting, 
    hoveredLegId, animationState, mapTileLayer, environmentalFactors, pivotDuration, waypointSettings
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);
  const previewLayersRef = useRef<any[]>([]);
  const animationShipRef = useRef<any>(null);
  const speedControlRef = useRef<any>(null);
  
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [contextMenuState, setContextMenuState] = useState<{ waypoint: Waypoint; waypointIndex: number; mouseEvent: any } | null>(null);

  const measureLineRef = useRef<any>(null);
  const measureTooltipRef = useRef<any>(null);
  const measureStartPointRef = useRef<any>(null); 
  
  const plotPreviewLineRef = useRef<any>(null);
  const plotPreviewTooltipRef = useRef<any>(null);

  const predictedPathPoints = useMemo(() => {
    if (!environmentalFactors.driftEnabled || waypoints.length < 1) {
        return waypoints;
    }
    const predictedEnds = legs
        .map(l => l.predictedEnd)
        .filter((p): p is GeoPoint => p !== undefined && p !== null);

    if (predictedEnds.length === waypoints.length - 1) {
        return [waypoints[0], ...predictedEnds];
    }
    return waypoints; // Fallback if arrays are out of sync
  }, [waypoints, legs, environmentalFactors.driftEnabled]);

  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current, { zoomControl: false }).setView([33.6069, -7.6228], 14);
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapRef.current = map;
      setMapInstance(map);

      // Add the custom speed control
      const speedControl = L.control({ position: 'bottomright' });
      speedControl.onAdd = function (map: any) {
          this._div = L.DomUtil.create('div', 'speed-display');
          this._div.style.display = 'none'; // Initially hidden
          return this._div;
      };
      speedControl.update = function (speed?: number) {
          if (speed !== undefined) {
               this._div.innerHTML = `<div class="text-xs text-gray-400">SPEED</div><span class="font-mono text-xl font-bold text-white">${speed.toFixed(1)}</span> <span class="text-sm text-gray-300">kn</span>`;
               this._div.style.display = 'block';
          } else {
               this._div.style.display = 'none';
          }
      };
      speedControl.addTo(map);
      speedControlRef.current = speedControl;
    }
  }, [mapContainerRef]);

  useEffect(() => {
    const map = mapRef.current;
    const mapContainer = mapContainerRef.current;
    if (!map || !mapContainer) return;

    // This observer automatically calls invalidateSize whenever the map container resizes,
    // which is perfect for smoothly handling the sidebar animation.
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });

    resizeObserver.observe(mapContainer);

    return () => {
      resizeObserver.disconnect();
    };
  }, [mapInstance]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    
    if (tileLayerRef.current) {
        map.removeLayer(tileLayerRef.current);
    }
    
    tileLayerRef.current = L.tileLayer(mapTileLayer.url, {
        attribution: mapTileLayer.attribution
    }).addTo(map);

  }, [mapTileLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const closeMenu = () => setContextMenuState(null);
    map.on('click', closeMenu);
    map.on('dragstart', closeMenu);
    return () => {
        map.off('click', closeMenu);
        map.off('dragstart', closeMenu);
    };
  }, [mapRef.current]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (animationState) {
        const { position, heading, speed } = animationState;
        const shipCoords = getShipPolygonCoords(position, ship.length, ship.beam, heading);
        const latLngs = shipCoords.map(p => [p.lat, p.lng]);

        if (animationShipRef.current) {
            animationShipRef.current.setLatLngs(latLngs);
        } else {
            animationShipRef.current = L.polygon(latLngs, {
                color: '#f59e0b',      
                fillColor: '#f59e0b',
                fillOpacity: 0.8,
                weight: 2,
                interactive: false,
                zIndexOffset: 1000
            }).addTo(map);
        }
        if (speedControlRef.current) {
            speedControlRef.current.update(speed);
        }
    } else {
        if (animationShipRef.current) {
            map.removeLayer(animationShipRef.current);
            animationShipRef.current = null;
        }
        if (speedControlRef.current) {
            speedControlRef.current.update(undefined); // Hides it
        }
    }
  }, [animationState, ship.length, ship.beam]);

  useEffect(() => {
    const map = mapRef.current;
    const mapContainer = mapContainerRef.current;
    if (!map || !mapContainer) return;

    map.off('click');
    map.off('mousemove');
    map.off('mouseout');
    mapContainer.classList.remove('plotting-mode', 'measuring-active');

    const cleanupMeasureLayers = () => {
        if (measureLineRef.current) map.removeLayer(measureLineRef.current);
        if (measureTooltipRef.current) map.removeLayer(measureTooltipRef.current);
        measureLineRef.current = null; measureTooltipRef.current = null; measureStartPointRef.current = null;
    }
    const cleanupPlotPreviewLayers = () => {
        if (plotPreviewLineRef.current) map.removeLayer(plotPreviewLineRef.current);
        if (plotPreviewTooltipRef.current) map.removeLayer(plotPreviewTooltipRef.current);
        plotPreviewLineRef.current = null; plotPreviewTooltipRef.current = null;
    }
    
    if (isMeasuring) {
        cleanupPlotPreviewLayers(); map.dragging.disable(); mapContainer.classList.add('measuring-active');
        const handleMeasureClick = (e: any) => {
            if (measureStartPointRef.current) {
                map.off('mousemove'); 
                const finalDistance = getDistance(measureStartPointRef.current, e.latlng);
                measureTooltipRef.current?.setContent(`<strong>Total:</strong> ${finalDistance.toFixed(1)} m`);
                measureLineRef.current?.setStyle({ dashArray: null });
                measureStartPointRef.current = null; 
            } else {
                cleanupMeasureLayers(); measureStartPointRef.current = e.latlng;
                measureLineRef.current = L.polyline([e.latlng, e.latlng], { color: '#FBBF24', weight: 3, dashArray: '5, 10', interactive: false }).addTo(map);
                measureTooltipRef.current = L.tooltip({ permanent: true, direction: 'right', offset: L.point(10, 0), className: 'measurement-tooltip' }).setLatLng(e.latlng).setContent('Measuring...').addTo(map);
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
        cleanupMeasureLayers(); map.dragging.enable(); mapContainer.classList.add('plotting-mode');
        map.on('click', (e: any) => onAddWaypoint({ lat: e.latlng.lat, lng: e.latlng.lng }));
        if (waypoints.length > 0) {
            const lastWaypoint = waypoints[waypoints.length - 1];
            map.on('mousemove', (e: any) => {
                const currentLatLng = e.latlng;
                if (!plotPreviewLineRef.current) {
                    plotPreviewLineRef.current = L.polyline([lastWaypoint, currentLatLng], { color: '#06b6d4', weight: 2, dashArray: '8, 8', interactive: false }).addTo(map);
                } else {
                    plotPreviewLineRef.current.setLatLngs([lastWaypoint, currentLatLng]);
                }
                const distance = getDistance(lastWaypoint, currentLatLng);
                const tooltipContent = `<strong>Dist:</strong> ${distance.toFixed(1)} m`;
                if (!plotPreviewTooltipRef.current) {
                    plotPreviewTooltipRef.current = L.tooltip({ permanent: true, direction: 'right', offset: L.point(15, 0), className: 'measurement-tooltip' }).setLatLng(currentLatLng).setContent(tooltipContent).addTo(map);
                } else {
                    plotPreviewTooltipRef.current.setLatLng(currentLatLng).setContent(tooltipContent);
                }
            });
            map.on('mouseout', cleanupPlotPreviewLayers);
        }
    } else {
        map.dragging.enable(); cleanupMeasureLayers(); cleanupPlotPreviewLayers();
    }
    return () => {
        map.dragging.enable(); map.off('mousemove'); map.off('mouseout');
        cleanupMeasureLayers(); cleanupPlotPreviewLayers();
    };
  }, [isMeasuring, isPlotting, onAddWaypoint, waypoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.forEach(layer => map.removeLayer(layer));
    layersRef.current = [];
    
    const isInteractive = !isMeasuring && !isPlotting && !animationState;

    const waypointMarkers = waypoints.map((wp, index) => {
      const leg = legs.find(l => l.start.id === wp.id);
      const isViolation = leg?.turnRadiusViolation;
      
      const { color, shape, size } = waypointSettings;
      const violationPingSize = size * 1.4;
      
      let shapeClasses = '';
      switch (shape) {
        case WaypointShape.SQUARE:
          shapeClasses = 'rounded-sm';
          break;
        case WaypointShape.DIAMOND:
          shapeClasses = 'transform rotate-45 rounded-sm';
          break;
        case WaypointShape.CIRCLE:
        default:
          shapeClasses = 'rounded-full';
          break;
      }

      const iconHtml = `
        <div class="relative flex items-center justify-center w-full h-full">
          ${isViolation ? `<div class="absolute rounded-full border-2 border-red-500 animate-ping opacity-75" style="width: ${violationPingSize}px; height: ${violationPingSize}px;"></div>` : ''}
          <div class="absolute border-2 border-white shadow-lg ${shapeClasses}" style="width: ${size}px; height: ${size}px; background-color: ${color};"></div>
          <div class="absolute text-center text-white font-bold text-xs" style="text-shadow: 0 0 4px black, 0 0 4px black; bottom: ${size}px;">WP${index + 1}</div>
        </div>`;

      const marker = L.marker([wp.lat, wp.lng], {
        draggable: isInteractive, interactive: isInteractive,
        icon: L.divIcon({ 
          className: 'waypoint-marker', 
          html: iconHtml, 
          iconSize: [size, size], 
          iconAnchor: [size / 2, size / 2] 
        })
      }).addTo(map);

      if (isInteractive) {
        marker.on('dragstart', () => setContextMenuState(null));

        marker.on('drag', (e: any) => {
            previewLayersRef.current.forEach(layer => map.removeLayer(layer));
            previewLayersRef.current = [];

            const newWaypoints = waypoints.map(w => w.id === wp.id ? { ...w, ...e.latlng } : w);
            const previewLegs = calculateTrajectory(newWaypoints, ship, pivotDuration, environmentalFactors);

            // --- Draw Preview Predicted Path (COG) ---
            const driftedWaypoints: GeoPoint[] = [];
            if (newWaypoints.length > 0) {
                driftedWaypoints.push(newWaypoints[0]);
                previewLegs.forEach(leg => { if (leg.predictedEnd) { driftedWaypoints.push(leg.predictedEnd); } });
            }
            if (driftedWaypoints.length > 1) {
                for (let i = 0; i < driftedWaypoints.length - 1; i++) {
                    const p0 = driftedWaypoints[i - 1] || driftedWaypoints[i];
                    const p1 = driftedWaypoints[i];
                    const p2 = driftedWaypoints[i + 1];
                    const p3 = driftedWaypoints[i + 2] || driftedWaypoints[i + 1];
                    const interpolator = (t: number) => ({ lat: catmullRom(t, p0.lat, p1.lat, p2.lat, p3.lat), lng: catmullRom(t, p0.lng, p1.lng, p2.lng, p3.lng) });
                    const segmentPoints = Array.from({ length: 15 }, (_, j) => j / 15).map(interpolator);
                    segmentPoints.push(p2);
                    const line = L.polyline(segmentPoints.map(p => [p.lat, p.lng]), { color: '#f97316', weight: 4, opacity: 0.8, interactive: false, dashArray: '8, 8' }).addTo(map);
                    previewLayersRef.current.push(line);
                }
            }
            // --- Draw Preview Intended Path (CTW) ---
            if (newWaypoints.length > 1) {
                newWaypoints.slice(0, -1).forEach((wp, i) => {
                    const p0 = newWaypoints[i - 1] || newWaypoints[i];
                    const p1 = newWaypoints[i];
                    const p2 = newWaypoints[i + 1];
                    const p3 = newWaypoints[i + 2] || newWaypoints[i + 1];
                    const interpolator = (t: number) => ({ lat: catmullRom(t, p0.lat, p1.lat, p2.lat, p3.lat), lng: catmullRom(t, p0.lng, p1.lng, p2.lng, p3.lng) });
                    const segmentPoints = Array.from({ length: 15 }, (_, j) => j / 15).map(interpolator);
                    segmentPoints.push(p2);
                    const line = L.polyline(segmentPoints.map(p => [p.lat, p.lng]), { color: 'rgba(255, 255, 255, 0.7)', weight: 3, dashArray: '10, 10', interactive: false }).addTo(map);
                    previewLayersRef.current.push(line);
                });
            }
        });

        marker.on('dragend', (e: any) => {
            previewLayersRef.current.forEach(layer => map.removeLayer(layer));
            previewLayersRef.current = [];
            onUpdateWaypoint(wp.id, e.target.getLatLng());
        });

        marker.on('contextmenu', (e: any) => {
            L.DomEvent.preventDefault(e);
            L.DomEvent.stopPropagation(e);
            setContextMenuState({ waypoint: wp, waypointIndex: index, mouseEvent: e });
        });
      }
      return marker;
    });
    layersRef.current.push(...waypointMarkers);

    // --- Predicted Path (COG) ---
    if (predictedPathPoints.length > 1 && environmentalFactors.driftEnabled) {
        for (let i = 0; i < predictedPathPoints.length - 1; i++) {
            // Use the same control point logic as the animation hook to ensure visual consistency.
            // This correctly handles "breaks" in the curve when switching propulsion direction.
            const legPropulsion = waypoints[i]?.propulsionDirection ?? PropulsionDirection.FORWARD;
            const prevLegPropulsion = waypoints[i - 1]?.propulsionDirection ?? PropulsionDirection.FORWARD;
            const nextLegPropulsion = waypoints[i + 1]?.propulsionDirection ?? PropulsionDirection.FORWARD;

            const p1 = predictedPathPoints[i];
            const p2 = predictedPathPoints[i + 1];

            // If propulsion changes at the start of this leg, p0 should be the same as p1 to create a sharp corner.
            const p0 = (i > 0 && legPropulsion === prevLegPropulsion) ? predictedPathPoints[i - 1] : p1;
            // If propulsion changes at the end of this leg, p3 should be the same as p2.
            const p3 = (predictedPathPoints[i + 2] && nextLegPropulsion === legPropulsion) ? predictedPathPoints[i + 2] : p2;

            const interpolator = (t: number) => ({ lat: catmullRom(t, p0.lat, p1.lat, p2.lat, p3.lat), lng: catmullRom(t, p0.lng, p1.lng, p2.lng, p3.lng) });
            const segmentPoints = Array.from({ length: 15 }, (_, j) => j / 15).map(interpolator);
            segmentPoints.push(p2);
            
            layersRef.current.push(L.polyline(segmentPoints.map(p => [p.lat, p.lng]), { color: '#f97316', weight: 4, opacity: 0.8, interactive: false }).addTo(map));
        }
    }


    // --- Intended Path (CTW) & Static Ships ---
    if (waypoints.length > 1) {
        waypoints.slice(0, -1).forEach((wp, i) => {
            const leg = legs[i]; if (!leg) return;
            const isHovered = leg.id === hoveredLegId;

            const start = waypoints[i];
            const end = waypoints[i + 1];
            
            const propulsion = start.propulsionDirection ?? PropulsionDirection.FORWARD;
            const prevPropulsion = waypoints[i-1]?.propulsionDirection ?? PropulsionDirection.FORWARD;
            const isPivotingAtStart = i > 0 && propulsion !== prevPropulsion;
            
            const nextPropulsion = end.propulsionDirection ?? PropulsionDirection.FORWARD;
            
            const p0 = isPivotingAtStart ? start : (waypoints[i - 1] || start);
            const p1 = start;
            const p2 = end;
            const p3 = (waypoints[i+2] && nextPropulsion === propulsion) ? waypoints[i+2] : end;
            
            const interpolator = (t: number) => ({ lat: catmullRom(t, p0.lat, p1.lat, p2.lat, p3.lat), lng: catmullRom(t, p0.lng, p1.lng, p2.lng, p3.lng) });
            const segmentPoints = Array.from({ length: 15 }, (_, i) => i / 15).map(interpolator);
            segmentPoints.push(p2);
            if (isHovered) {
                layersRef.current.push(L.polyline(segmentPoints.map(p => [p.lat, p.lng]), { color: '#06b6d4', weight: 10, opacity: 0.3, interactive: false }).addTo(map));
            }
            layersRef.current.push(L.polyline(segmentPoints.map(p => [p.lat, p.lng]), { color: isHovered ? '#67e8f9' : 'rgba(255, 255, 255, 0.7)', weight: isHovered ? 4 : 3, dashArray: '10, 10', interactive: false }).addTo(map));
            layersRef.current.push(L.polyline([[leg.start.lat, leg.start.lng], [leg.end.lat, leg.end.lng]], { color: isHovered ? '#0891b2' : 'rgba(107, 114, 128, 0.8)', weight: isHovered ? 2 : 1, dashArray: '2, 8', interactive: false }).addTo(map));
        });
    }
    
    // --- Draw Pivot Arcs ---
    const drawArcWithArrow = (center: GeoPoint, radius: number, startBearing: number, endBearing: number, color: string) => {
        const arcPoints = getArcPoints(center, radius, startBearing, endBearing);
        if (arcPoints.length < 2) return;

        // Draw arc line (solid, no dash)
        layersRef.current.push(L.polyline(arcPoints.map(p => [p.lat, p.lng]), {
            color,
            weight: 2,
            interactive: false
        }).addTo(map));

        // Draw arrowhead at the end
        const p_end = arcPoints[arcPoints.length - 1];
        // Arrowhead size in meters, proportional to radius but capped for sanity.
        const arrowLength = Math.min(radius * 0.3, 12);
        const arrowAngle = 30; // degrees from the main line

        // Determine turn direction to calculate the tangent at the end of the arc
        let angleDiff = endBearing - startBearing;
        if (angleDiff > 180) angleDiff -= 360;
        if (angleDiff < -180) angleDiff += 360;

        const tangentBearing = (angleDiff >= 0)
            ? (endBearing + 90 + 360) % 360 // Clockwise turn
            : (endBearing - 90 + 360) % 360; // Counter-clockwise turn

        // Calculate the two points of the arrowhead, pointing backwards from the tangent
        const arrowPoint1 = destinationPoint(p_end, arrowLength, (tangentBearing + 180 - arrowAngle + 360) % 360);
        const arrowPoint2 = destinationPoint(p_end, arrowLength, (tangentBearing + 180 + arrowAngle + 360) % 360);

        // Draw the arrowhead shape
        layersRef.current.push(L.polyline([
            [arrowPoint1.lat, arrowPoint1.lng],
            [p_end.lat, p_end.lng],
            [arrowPoint2.lat, arrowPoint2.lng],
        ], { color, weight: 2, interactive: false }).addTo(map));
    };
    
    legs.forEach((leg, index) => {
        if (leg.pivotTime > 0 && index > 0) {
            const prevLeg = legs[index - 1];
            const pivotCenter = predictedPathPoints[index]; // Pivot happens at the predicted waypoint location
            const radius = ship.length / 2;
            
            const startHeading = prevLeg.endHeading;
            const endHeading = leg.startHeading;
            
            // Bow Arc (Green)
            drawArcWithArrow(pivotCenter, radius, startHeading, endHeading, '#22c55e');

            // Stern Arc (Red)
            drawArcWithArrow(pivotCenter, radius, startHeading + 180, endHeading + 180, '#ef4444');
        }
    });

    if (legs.length > 0 && !animationState) {
      const shipPolygons = legs.map((leg, index) => {
          let color: string;
          switch (leg.command) {
            case NavigationCommand.START:
            case NavigationCommand.STARBOARD:
              color = '#16a34a'; // Green for start and starboard turns
              break;
            case NavigationCommand.PORT:
              color = '#dc2626'; // Red for port turns
              break;
            case NavigationCommand.END:
              color = '#facc15'; // Yellow for final position
              break;
            case NavigationCommand.STRAIGHT:
            default:
              color = '#2563eb'; // Blue for straight
              break;
          }

          // Position is determined from the predicted path points for accuracy
          const shipPosition = predictedPathPoints[index];
          if (!shipPosition) return null;

          // For the final "END" leg, use the heading/correction from the previous leg
          const finalLegState = index > 0 ? legs[index - 1] : leg;
          const heading = leg.command === NavigationCommand.END ? finalLegState.endHeading : leg.startHeading;
          const correction = leg.command === NavigationCommand.END ? finalLegState.courseCorrectionAngle : leg.courseCorrectionAngle;
          
          const correctedHeading = heading + (correction || 0);
          const shipCoords = getShipPolygonCoords(shipPosition, ship.length, ship.beam, correctedHeading);

          return L.polygon(shipCoords.map(p => [p.lat, p.lng]), { 
              color, 
              fillColor: color, 
              fillOpacity: 0.5, 
              weight: 1, 
              interactive: false, 
              zIndexOffset: -1000 
          }).addTo(map);
      }).filter(Boolean);
      layersRef.current.push(...shipPolygons);
    }
  }, [waypoints, ship, legs, onUpdateWaypoint, onDeleteWaypoint, isMeasuring, isPlotting, hoveredLegId, animationState, onPropulsionChange, onSpeedChange, environmentalFactors, pivotDuration, waypointSettings, predictedPathPoints]);
  
  useEffect(() => {
    if (zoomToFitTrigger === 0 || !mapRef.current || waypoints.length === 0) return;
    const bounds = L.latLngBounds(waypoints.map(wp => [wp.lat, wp.lng]));
    mapRef.current.fitBounds(bounds, { padding: [50, 50] });
  }, [zoomToFitTrigger, waypoints.length]);

  return (
    <>
      <div ref={mapContainerRef} className="w-full h-full" />
      {mapInstance && (
        <>
          <WindRose map={mapInstance} environmentalFactors={environmentalFactors} />
          <CurrentFlowLayer map={mapInstance} environmentalFactors={environmentalFactors} />
        </>
      )}
      {contextMenuState && (
        <WaypointContextMenu
            map={mapRef.current}
            waypoint={contextMenuState.waypoint}
            waypointIndex={contextMenuState.waypointIndex}
            waypointsCount={waypoints.length}
            mouseEvent={contextMenuState.mouseEvent}
            onClose={() => setContextMenuState(null)}
            onDelete={onDeleteWaypoint}
            onSpeedChange={onSpeedChange}
            onPropulsionChange={onPropulsionChange}
        />
      )}
    </>
  );
};

export default PlanningCanvas;