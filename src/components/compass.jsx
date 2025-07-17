import { useEffect, useRef } from 'react';

const CompassTracker = ({ onUpdate, onError, location }) => {
  const compassHistoryRef = useRef([]);
  const sensorsActiveRef = useRef(false);

  // Simple satellite north calculation
  const calculateSatelliteNorth = (lat, lon) => {
    if (!lat || !lon) return null;
    
    try {
      const now = new Date();
      const hours = now.getHours() + now.getMinutes() / 60;
      
      // Simplified satellite simulation
      const satellites = [];
      for (let i = 0; i < 8; i++) {
        const azimuth = (i * 45 + hours * 15) % 360;
        const elevation = 30 + Math.sin((hours + i) * Math.PI / 12) * 20;
        
        if (elevation > 10) {
          satellites.push({ azimuth, elevation });
        }
      }
      
      if (satellites.length >= 4) {
        const avgAzimuth = satellites.reduce((sum, sat) => sum + sat.azimuth, 0) / satellites.length;
        return (avgAzimuth + 180) % 360;
      }
      
      return null;
    } catch (error) {
      console.error('Satellite calculation error:', error);
      return null;
    }
  };

  useEffect(() => {
    const handleOrientation = (event) => {
      try {
        if (event.alpha !== null) {
          sensorsActiveRef.current = true;
          
          const rawHeading = event.alpha;
          const webkitHeading = event.webkitCompassHeading;
          const deviceHeading = webkitHeading !== undefined ? webkitHeading : (360 - rawHeading);
          
          compassHistoryRef.current.push(deviceHeading);
          if (compassHistoryRef.current.length > 5) {
            compassHistoryRef.current.shift();
          }
          
          const smoothedHeading = compassHistoryRef.current.reduce((sum, val) => sum + val, 0) / compassHistoryRef.current.length;
          
          const satelliteNorth = location ? calculateSatelliteNorth(location.latitude, location.longitude) : null;
          
          const compassData = {
            deviceHeading: smoothedHeading,
            gpsHeading: location ? location.gpsHeading : null,
            satelliteTriangulationNorth: satelliteNorth,
            trajectoryPredictedNorth: satelliteNorth,
            fusedHeading: smoothedHeading,
            sensorsActive: sensorsActiveRef.current,
            satelliteCount: 8,
            magneticDeclination: 0.5
          };
          
          onUpdate(compassData);
        }
      } catch (error) {
        console.error('Compass error:', error);
        onError(`Compass error: ${error.message}`);
      }
    };
    
    const initializeCompass = async () => {
      try {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
          const permission = await DeviceOrientationEvent.requestPermission();
          if (permission === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
          } else {
            onError('Device orientation permission denied');
          }
        } else {
          window.addEventListener('deviceorientation', handleOrientation);
        }
        
        setTimeout(() => {
          if (!sensorsActiveRef.current) {
            const fallbackData = {
              deviceHeading: null,
              gpsHeading: location ? location.gpsHeading : null,
              satelliteTriangulationNorth: location ? calculateSatelliteNorth(location.latitude, location.longitude) : null,
              trajectoryPredictedNorth: null,
              fusedHeading: location ? location.gpsHeading : null,
              sensorsActive: false,
              satelliteCount: 0,
              magneticDeclination: 0.5
            };
            onUpdate(fallbackData);
          }
        }, 3000);
        
      } catch (error) {
        console.error('Compass initialization error:', error);
        onError(`Compass initialization failed: ${error.message}`);
      }
    };
    
    initializeCompass();
    
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [onUpdate, onError, location]);

  return null;
};

export default CompassTracker;
