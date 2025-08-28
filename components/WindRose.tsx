import React, { useEffect, useRef } from 'react';
import { EnvironmentalFactors } from '../types';

declare const L: any;

interface WindRoseProps {
    map: any;
    environmentalFactors: EnvironmentalFactors;
}

const WindRose: React.FC<WindRoseProps> = ({ map, environmentalFactors }) => {
    const controlRef = useRef<any>(null);
    const { speed, direction } = environmentalFactors.wind;

    useEffect(() => {
        if (!map) return;

        const WindRoseControl = L.Control.extend({
            onAdd: function() {
                const container = L.DomUtil.create('div', 'leaflet-control-windrose bg-gray-900/60 backdrop-blur-sm rounded-full border border-gray-600 shadow-lg');
                container.style.width = '80px';
                container.style.height = '80px';
                container.style.position = 'relative';
                
                // Wind direction is where it comes FROM.
                // A 0° (North) wind blows towards 180° (South). The arrow should point south.
                // The arrow SVG points UP, so we rotate it by `direction + 180` degrees.
                const arrowRotation = direction + 180;

                container.innerHTML = `
                    <div class="absolute inset-0 text-gray-400 font-bold text-xs" style="pointer-events: none;">
                        <span style="position: absolute; top: 4px; left: 50%; transform: translateX(-50%);">N</span>
                    </div>
                    <div class="wind-arrow-container" style="position: absolute; inset: 0; transform: rotate(${arrowRotation}deg);">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-full h-full text-cyan-400 opacity-80 p-2">
                            <path d="M12 22 V 2 M 12 2 l 5 5 M 12 2 l -5 5" />
                        </svg>
                    </div>
                    <div class="wind-speed-display absolute inset-0 flex flex-col items-center justify-center text-white" style="pointer-events: none;">
                         <span class="font-mono font-bold text-lg">${speed.toFixed(1)}</span>
                         <span class="text-xs -mt-1 text-gray-300">kn</span>
                    </div>
                `;
                L.DomEvent.disableClickPropagation(container);
                return container;
            },
            onRemove: function() {}
        });

        if (controlRef.current) {
            map.removeControl(controlRef.current);
        }
        
        if (speed > 0) {
            const newControl = new WindRoseControl({ position: 'topright' });
            map.addControl(newControl);
            controlRef.current = newControl;
        } else {
            controlRef.current = null;
        }

        return () => {
            if (controlRef.current && map?.removeControl) {
                try {
                    map.removeControl(controlRef.current);
                } catch (e) {}
                controlRef.current = null;
            }
        };
    }, [map, speed, direction]);

    return null; // Renders via Leaflet, not React
};

export default WindRose;
