import { useState, useCallback, useRef } from 'react';
import { TrajectoryLeg, Waypoint, AnimationState, NavigationCommand, PropulsionDirection } from '../types';
import { getPointOnCatmullRom, getHeadingOnCatmullRom } from './useTrajectoryCalculations';

export const useAnimation = (trajectoryLegs: TrajectoryLeg[], waypoints: Waypoint[], playbackSpeed: number) => {
    const [isAnimating, setIsAnimating] = useState(false);
    const [animationState, setAnimationState] = useState<AnimationState | null>(null);

    const animationFrameId = useRef<number | null>(null);
    const playbackSpeedRef = useRef(playbackSpeed);
    playbackSpeedRef.current = playbackSpeed;
    const animationData = useRef({ lastTimestamp: 0, scaledElapsed: 0 });

    const calculateAnimationState = useCallback((progress: number, totalDuration: number): AnimationState | null => {
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
                    return { position: leg.start, heading, speed: 0 };
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
                
                return { position, heading, speed: leg.speed };
            }
            accumulatedTime = legEndTime;
        }
        // Fallback for the very end
        const lastLeg = trajectoryLegs[trajectoryLegs.length-2];
        if (lastLeg) {
            return { position: lastLeg.end, heading: lastLeg.endHeading, speed: 0 };
        }
        return null;
    }, [trajectoryLegs, waypoints]);

    const toggleAnimation = useCallback(() => {
        if (isAnimating) {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
            setIsAnimating(false);
            setAnimationState(null);
        } else {
            const totalDuration = trajectoryLegs.reduce((sum, leg) => sum + leg.time, 0);
            if (totalDuration === 0) return;

            setIsAnimating(true);
            animationData.current = { lastTimestamp: 0, scaledElapsed: 0 };
            
            const animate = (timestamp: number) => {
                if (!animationData.current.lastTimestamp) {
                    animationData.current.lastTimestamp = timestamp;
                }
                const delta = (timestamp - animationData.current.lastTimestamp) / 1000;
                animationData.current.lastTimestamp = timestamp;

                animationData.current.scaledElapsed += delta * playbackSpeedRef.current;
                
                const progress = Math.min(animationData.current.scaledElapsed / totalDuration, 1);
                
                const newState = calculateAnimationState(progress, totalDuration);
                if(newState) {
                    setAnimationState(newState);
                }

                if (progress < 1) {
                    animationFrameId.current = requestAnimationFrame(animate);
                } else {
                    setIsAnimating(false);
                    // Keep final state for a moment before clearing
                    setTimeout(() => setAnimationState(null), 1000);
                }
            };
            animationFrameId.current = requestAnimationFrame(animate);
        }
    }, [isAnimating, trajectoryLegs, calculateAnimationState]);

    return {
        isAnimating,
        animationState,
        toggleAnimation,
    };
};
