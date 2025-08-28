import { useState, useCallback, useRef, useMemo } from 'react';
import { TrajectoryLeg, Waypoint, AnimationState, NavigationCommand, PropulsionDirection, GeoPoint } from '../types';
import { getPointOnCatmullRom, getHeadingOnCatmullRom } from './useTrajectoryCalculations';

export const useAnimation = (trajectoryLegs: TrajectoryLeg[], waypoints: Waypoint[], playbackSpeed: number) => {
    const [isAnimating, setIsAnimating] = useState(false);
    const [animationState, setAnimationState] = useState<AnimationState | null>(null);

    const animationFrameId = useRef<number | null>(null);
    const playbackSpeedRef = useRef(playbackSpeed);
    playbackSpeedRef.current = playbackSpeed;
    const animationData = useRef({ lastTimestamp: 0, scaledElapsed: 0 });

    const predictedPathPoints = useMemo<GeoPoint[]>(() => {
        if (!waypoints.length || !trajectoryLegs.some(l => l.predictedEnd)) {
            return waypoints;
        }

        const predictedEnds = trajectoryLegs
            .map(l => l.predictedEnd)
            .filter((p): p is GeoPoint => p !== undefined);
        
        // There should be one predictedEnd for each leg except the final dummy leg.
        if (waypoints.length > 0 && predictedEnds.length === waypoints.length - 1) {
            return [waypoints[0], ...predictedEnds];
        }

        return waypoints; // Fallback
    }, [trajectoryLegs, waypoints]);


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

                    // Pivot happens at the predicted location of the waypoint.
                    const pivotPosition = predictedPathPoints[i];
                    return { position: pivotPosition, heading, speed: 0 };
                }
                
                // Handle movement phase
                const moveTime = leg.time - leg.pivotTime;
                const timeIntoMove = timeIntoLeg - leg.pivotTime;
                const legProgress = moveTime > 0 ? timeIntoMove / moveTime : 1;
                
                const prevPropulsion = waypoints[i-1]?.propulsionDirection ?? PropulsionDirection.FORWARD;
                const nextPropulsion = waypoints[i+1]?.propulsionDirection ?? PropulsionDirection.FORWARD;

                // --- POSITION CALCULATION (uses predicted path) ---
                const pos_p0 = (i > 0 && leg.propulsion === prevPropulsion) ? predictedPathPoints[i-1] : predictedPathPoints[i];
                const pos_p1 = predictedPathPoints[i];
                const pos_p2 = predictedPathPoints[i+1];
                const pos_p3 = (predictedPathPoints[i+2] && nextPropulsion === leg.propulsion) ? predictedPathPoints[i+2] : predictedPathPoints[i+1];
                const position = getPointOnCatmullRom(legProgress, pos_p0, pos_p1, pos_p2, pos_p3);
                
                // --- HEADING CALCULATION (uses intended path + correction) ---
                const head_p0 = (i > 0 && leg.propulsion === prevPropulsion) ? waypoints[i-1] : waypoints[i];
                const head_p1 = waypoints[i];
                const head_p2 = waypoints[i+1];
                const head_p3 = (waypoints[i+2] && nextPropulsion === leg.propulsion) ? waypoints[i+2] : waypoints[i+1];

                let intendedHeading = getHeadingOnCatmullRom(legProgress, head_p0, head_p1, head_p2, head_p3);
                if (leg.propulsion === PropulsionDirection.ASTERN) {
                    intendedHeading = (intendedHeading + 180) % 360;
                }
                
                // Apply course correction angle for "crabbing"
                const correction = (leg.courseCorrectionAngle && !isNaN(leg.courseCorrectionAngle)) ? leg.courseCorrectionAngle : 0;
                const heading = (intendedHeading + correction + 360) % 360;
                
                return { position, heading, speed: leg.speed };
            }
            accumulatedTime = legEndTime;
        }
        // Fallback for the very end
        const lastLeg = trajectoryLegs[trajectoryLegs.length-2];
        if (lastLeg) {
            const finalPosition = predictedPathPoints[predictedPathPoints.length - 1];
            const correction = (lastLeg.courseCorrectionAngle && !isNaN(lastLeg.courseCorrectionAngle)) ? lastLeg.courseCorrectionAngle : 0;
            const finalHeading = (lastLeg.endHeading + correction + 360) % 360;
            return { position: finalPosition, heading: finalHeading, speed: 0 };
        }
        return null;
    }, [trajectoryLegs, waypoints, predictedPathPoints]);

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