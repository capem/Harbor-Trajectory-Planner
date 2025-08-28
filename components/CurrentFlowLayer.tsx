import React, { useEffect, useRef, useCallback } from 'react';
import { EnvironmentalFactors } from '../types';

declare const L: any;

interface CurrentFlowLayerProps {
    map: any;
    environmentalFactors: EnvironmentalFactors;
}

interface Particle {
    pos: [number, number];
    marker: any;
}

const GRID_SPACING_PX = 80; // Spacing between chevrons in pixels

const CurrentFlowLayer: React.FC<CurrentFlowLayerProps> = ({ map, environmentalFactors }) => {
    const layerRef = useRef<any>(null);
    const particlesRef = useRef<Particle[]>([]);
    const animationFrameId = useRef<number | null>(null);
    const { speed, direction } = environmentalFactors.current;

    const cleanupAnimation = useCallback(() => {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        }
    }, []);
    
    const cleanupLayer = useCallback(() => {
        cleanupAnimation();
        if (layerRef.current && map) {
            map.removeLayer(layerRef.current);
            layerRef.current = null;
        }
        particlesRef.current = [];
    }, [map, cleanupAnimation]);
    
    const initializeParticles = useCallback(() => {
        if (!map || !layerRef.current) return;
        
        layerRef.current.clearLayers();
        particlesRef.current = [];
        
        const mapSize = map.getSize();

        // Current direction is where it comes FROM. A 0° (North) current flows South (180°).
        const flowDirection = (direction + 180) % 360;

        // Our SVG chevron points right (>). To align with a geographic bearing (0=North), we need to adjust.
        // A bearing of 0° (North) should point up, requiring a -90° rotation.
        // A bearing of 90° (East) should point right, requiring a 0° rotation.
        // So, the rotation formula is `bearing - 90`.
        const svgRotation = flowDirection - 90;
        const chevronSvg = `
            <svg viewBox="0 0 10 10" style="transform: rotate(${svgRotation}deg); opacity: 0.7;">
                <path d="M 2 2 L 8 5 L 2 8" stroke="rgba(6, 182, 212, 0.7)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`;
        
        const chevronIcon = L.divIcon({
            html: chevronSvg,
            className: '', // No extra class needed
            iconSize: [18, 18],
            iconAnchor: [9, 9]
        });

        // Create a grid larger than the viewport to make wrapping seamless
        const startBuffer = GRID_SPACING_PX * -2;
        const endBufferX = mapSize.x + GRID_SPACING_PX * 2;
        const endBufferY = mapSize.y + GRID_SPACING_PX * 2;

        for (let x = startBuffer; x < endBufferX; x += GRID_SPACING_PX) {
            for (let y = startBuffer; y < endBufferY; y += GRID_SPACING_PX) {
                const latLng = map.containerPointToLatLng(L.point(x, y));
                const marker = L.marker([latLng.lat, latLng.lng], { icon: chevronIcon, interactive: false, pane: 'overlayPane' }).addTo(layerRef.current);
                particlesRef.current.push({ pos: [latLng.lat, latLng.lng], marker });
            }
        }
    }, [map, direction]);

    useEffect(() => {
        if (!map || speed <= 0) {
            cleanupLayer();
            return;
        }
        
        if (!layerRef.current) {
            // Use 'shadowPane' to render behind markers and paths for better visibility
            layerRef.current = L.layerGroup({ pane: 'shadowPane' }).addTo(map);
        }

        initializeParticles();
        cleanupAnimation();

        let lastTime = performance.now();
        const animate = (currentTime: number) => {
            const deltaTime = (currentTime - lastTime) / 1000;
            lastTime = currentTime;

            const speedMps = speed * 0.514444;
            const flowDirection = (direction + 180) % 360;
            const directionRad = flowDirection * (Math.PI / 180);
            
            // Use center of map for more accurate m-to-degree conversion across the visible area
            const centerLatRad = map.getCenter().lat * (Math.PI / 180);
            const metersPerDegreeLat = 111132;
            const metersPerDegreeLng = metersPerDegreeLat * Math.cos(centerLatRad);
            
            // Calculate velocity in degrees per second
            const velLat = (speedMps * Math.cos(directionRad)) / metersPerDegreeLat;
            const velLng = (speedMps * Math.sin(directionRad)) / metersPerDegreeLng;
            
            const currentBounds = map.getBounds().pad(0.3); // Padded bounds for wrapping logic
            const south = currentBounds.getSouth(), north = currentBounds.getNorth();
            const west = currentBounds.getWest(), east = currentBounds.getEast();
            const latSpan = north - south;
            const lngSpan = east - west;

            particlesRef.current.forEach(p => {
                p.pos[0] += velLat * deltaTime;
                p.pos[1] += velLng * deltaTime;

                // Wrap particles around to the other side to create a continuous flow
                if (velLat > 0 && p.pos[0] > north) p.pos[0] -= latSpan;
                if (velLat < 0 && p.pos[0] < south) p.pos[0] += latSpan;
                if (velLng > 0 && p.pos[1] > east) p.pos[1] -= lngSpan;
                if (velLng < 0 && p.pos[1] < west) p.pos[1] += lngSpan;
                
                p.marker.setLatLng(p.pos);
            });
            animationFrameId.current = requestAnimationFrame(animate);
        };
        animationFrameId.current = requestAnimationFrame(animate);

        map.on('moveend', initializeParticles);

        return () => {
            if (map) {
                map.off('moveend', initializeParticles);
            }
            cleanupLayer();
        };

    }, [map, speed, direction, initializeParticles, cleanupLayer, cleanupAnimation]);

    return null; // Renders via Leaflet, not React
};

export default CurrentFlowLayer;
