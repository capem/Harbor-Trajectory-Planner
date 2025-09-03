// components/Accordion.tsx

import React, { useEffect, useRef } from 'react';
import { ChevronDownIcon } from './Icons';

export const AccordionSection: React.FC<{ title: string; icon: React.ReactNode; isOpen: boolean; onToggle: () => void; children: React.ReactNode; className?: string; }> = ({ title, icon, isOpen, onToggle, children, className = '' }) => {
    const contentWrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const node = contentWrapperRef.current;
        if (!node) return;

        const handleTransitionEnd = (event: TransitionEvent) => {
            if (event.propertyName === 'grid-template-rows' && isOpen) {
                node.style.overflowY = 'auto';
            }
        };

        if (isOpen) {
            node.addEventListener('transitionend', handleTransitionEnd, { once: true });
        } else {
            node.style.overflowY = 'hidden';
        }

        return () => {
            node.removeEventListener('transitionend', handleTransitionEnd);
        };
    }, [isOpen]);

    return (
        <div className={`bg-gray-900/70 rounded-lg overflow-hidden border border-gray-700/50 flex flex-col transition-all duration-300 ease-in-out ${className}`}>
            <button onClick={onToggle} className="w-full flex justify-between items-center p-4 bg-gray-800/50 hover:bg-gray-700/50 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 flex-shrink-0">
                <div className="flex items-center space-x-3">
                    {icon}
                    <h2 className="text-md font-semibold text-cyan-400">{title}</h2>
                </div>
                <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            <div
                ref={contentWrapperRef}
                style={{ overflowY: 'hidden', scrollbarGutter: 'stable' }}
                className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'} flex-1 min-h-0`}
            >
                <div className="min-h-0">
                    <div className="p-4 border-t border-gray-700/50">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
};
