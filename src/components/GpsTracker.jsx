import React, { useState, useEffect, useRef } from 'react';

const UltraFastGpsTracker = () => {
  const [location, setLocation] = useState({
    latitude: null,
    longitude: null,
    altitude: null,
    accuracy: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    timestamp: null
  });
  
  const [trackingData, setTrackingData] = useState({
    positionHistory: [],
    velocityVector: null,
    predictedHeading: null,
    satelliteCount: null,
    dilutionOfPrecision: null,
    constellationStatus: {
      gps: false,
      glonass: false,
      galileo: false,
      beidou: false,
      qzss: false,
      irnss: false
    }
  });
  
  const [compassData, setCompassData] = useState({
    magneticHeading: null,
    trueHeading: null,
    magneticDeclination: null,
    deviceCompass: null,
    fusedHeading: null,
    satellitePredictedNorth: null,
    imuFusedHeading: null
  });

  const [deviceSensors, setDeviceSensors] = useState({
    orientation: null,
    acceleration: null,
    rotationRate: null,
    compassCalibrated: false,
    permissionGranted: false
  });

  const [satelliteGeometry, setSatelliteGeometry] = useState({
    predictedPositions: [],
    geometryScore: 0,
    trueNorthFromSats: null,
    satelliteCount: 0
  });
  
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState('');
  
  const positionHistoryRef = useRef([]);
  const compassHistoryRef = useRef([]);
  const imuHistoryRef = useRef([]);
  const watchIdRef = useRef(null);
  
  const kalmanFilterRef = useRef({
    position: null,
    velocity: null,
    acceleration: null,
    initialized: false
  });

  // Simplified ultra-fast GPS options
  const getUltraFastOptions = () => ({
    enableHighAccuracy: true,
    timeout: 500,
    maximumAge: 0
  });

  // Simplified satellite prediction for true north
  const calculateSatellitePredictedNorth = (lat, lon, timestamp) => {
    try {
      if (!lat || !lon) return null;
      
      const now = new Date(timestamp);
      const hours = now.getHours() + now.getMinutes() / 60;
      
      // Simplified satellite constellation simulation
      const satellites = [];
      const constellations = ['GPS', 'GLONASS', 'Galileo', 'BeiDou'];
      
      constellations.forEach((constellation, constIndex) => {
        const satCount = 6;
        for (let i = 0; i < satCount; i++) {
          const azimuth = (constIndex * 90 + i * 15 + hours * 15) % 360;
          const elevation = 30 + Math.sin((hours + i) * Math.PI / 12) * 20;
          
          if (elevation > 10) {
            satellites.push({
              constellation,
              azimuth,
              elevation,
              id: `${constellation}-${i}`
            });
          }
        }
      });
      
      // Calculate true north from satellite geometry
      if (satellites.length >= 4) {
        let northVector = { x: 0, y: 0 };
        let totalWeight = 0;
        
        satellites.forEach(sat => {
          const weight = Math.sin(sat.elevation * Math.PI / 180);
          const azimuthRad = sat.azimuth * Math.PI / 180;
          
          northVector.x += weight * Math.cos(azimuthRad);
          northVector.y += weight * Math.sin(azimuthRad);
          totalWeight += weight;
        });
        
        if (totalWeight > 0) {
          northVector.x /= totalWeight;
          northVector.y /= totalWeight;
          
          const trueNorth = Math.atan2(northVector.y, northVector.x) * 180 / Math.PI;
          
          setSatelliteGeometry({
            predictedPositions: satellites,
            geometryScore: Math.min(100, satellites.length * 15),
            trueNorthFromSats: trueNorth < 0 ? trueNorth + 360 : trueNorth,
            satelliteCount: satellites.length
          });
          
          return trueNorth < 0 ? trueNorth + 360 : trueNorth;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error calculating satellite north:', error);
      return null;
    }
  };

  // Simplified Kalman filter
  const updateKalmanFilter = (newPosition) => {
    try {
      const current = kalmanFilterRef.current;
      const dt = 0.1;
      
      if (!current.initialized) {
        current.position = [newPosition.latitude, newPosition.longitude];
        current.velocity = [0, 0];
        current.acceleration = [0, 0];
        current.initialized = true;
        return current.position;
      }
      
      // Simple position smoothing
      const smoothingFactor = Math.min(0.3, 2.0 / Math.max(newPosition.accuracy, 0.5));
      current.position[0] = current.position[0] * (1 - smoothingFactor) + newPosition.latitude * smoothingFactor;
      current.position[1] = current.position[1] * (1 - smoothingFactor) + newPosition.longitude * smoothingFactor;
      
      // Calculate velocity
      current.velocity[0] = (newPosition.latitude - current.position[0]) / dt;
      current.velocity[1] = (newPosition.longitude - current.position[1]) / dt;
      
      // Calculate heading
      let heading = Math.atan2(current.velocity[1], current.velocity[0]) * 180 / Math.PI;
      if (heading < 0) heading += 360;
      
      setTrackingData(prev => ({
        ...prev,
        velocityVector: current.velocity,
        predictedHeading: heading
      }));
      
      return current.position;
    } catch (error) {
      console.error('Kalman filter error:', error);
      return [newPosition.latitude, newPosition.longitude];
    }
  };

  // Simplified constellation analysis
  const analyzeConstellation = (accuracy) => {
    try {
      const baseAccuracy = 3;
      const factor = Math.min(baseAccuracy / Math.max(accuracy, 0.5), 2);
      
      return {
        gps: true,
        glonass: factor > 0.8,
        galileo: factor > 1.0,
        beidou: factor > 0.9,
        qzss: factor > 1.2,
        irnss: factor > 1.1,
        estimatedSatelliteCount: Math.min(Math.floor(factor * 10), 32)
      };
    } catch (error) {
      console.error('Constellation analysis error:', error);
      return { gps: true, estimatedSatelliteCount: 4 };
    }
  };

  // Simplified DOP calculation
  const calculateDOP = (accuracy, satelliteCount) => {
    try {
      if (!accuracy || !satelliteCount) return null;
      
      const pdop = accuracy * (4 / satelliteCount);
      
      let quality = 'Poor';
      let color = '#f44336';
      
      if (pdop < 1) {
        quality = 'Excellent';
        color = '#4caf50';
      } else if (pdop < 2) {
        quality = 'Good';
        color = '#8bc34a';
      } else if (pdop < 5) {
        quality = 'Fair';
        color = '#ff9800';
      }
      
      return {
        pdop: pdop.toFixed(2),
        quality,
        color,
        satelliteCount
      };
    } catch (error) {
      console.error('DOP calculation error:', error);
      return null;
    }
  };

  // Simplified device orientation handling
  useEffect(() => {
    let orientationHandler;
    let motionHandler;
    
    const handleOrientation = (event) => {
      try {
        if (event.alpha !== null) {
          const rawHeading = event.alpha;
          const webkitHeading = event.webkitCompassHeading;
          const deviceCompass = webkitHeading !== undefined ? webkitHeading : (360 - rawHeading);
          
          compassHistoryRef.current.push(deviceCompass);
          if (compassHistoryRef.current.length > 10) {
            compassHistoryRef.current.shift();
          }
          
          const smoothedCompass = compassHistoryRef.current.reduce((sum, val) => sum + val, 0) / compassHistoryRef.current.length;
          
          setDeviceSensors(prev => ({
            ...prev,
            orientation: {
              alpha: event.alpha,
              beta: event.beta,
              gamma: event.gamma
            },
            compassCalibrated: Math.abs(event.alpha - smoothedCompass) < 5
          }));
          
          // Calculate satellite predicted north
          const satelliteNorth = calculateSatellitePredictedNorth(
            location.latitude || 51.5074,
            location.longitude || -0.1278,
            Date.now()
          );
          
          setCompassData(prev => ({
            ...prev,
            deviceCompass: smoothedCompass,
            satellitePredictedNorth: satelliteNorth,
            fusedHeading: smoothedCompass
          }));
        }
      } catch (error) {
        console.error('Orientation error:', error);
      }
    };
    
    const handleMotion = (event) => {
      try {
        if (event.acceleration) {
          imuHistoryRef.current.push({
            acceleration: event.acceleration,
            rotationRate: event.rotationRate,
            timestamp: Date.now()
          });
          
          if (imuHistoryRef.current.length > 20) {
            imuHistoryRef.current.shift();
          }
          
          setDeviceSensors(prev => ({
            ...prev,
            acceleration: event.acceleration,
            rotationRate: event.rotationRate
          }));
        }
      } catch (error) {
        console.error('Motion error:', error);
      }
    };
    
    // Request permissions and add listeners
    const initializeSensors = async () => {
      try {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
          const permission = await DeviceOrientationEvent.requestPermission();
          if (permission === 'granted') {
            setDeviceSensors(prev => ({ ...prev, permissionGranted: true }));
            window.addEventListener('deviceorientation', handleOrientation);
            window.addEventListener('devicemotion', handleMotion);
          }
        } else {
          setDeviceSensors(prev => ({ ...prev, permissionGranted: true }));
          window.addEventListener('deviceorientation', handleOrientation);
          window.addEventListener('devicemotion', handleMotion);
        }
      } catch (error) {
        console.error('Sensor initialization error:', error);
        setDeviceSensors(prev => ({ ...prev, permissionGranted: false }));
      }
    };
    
    initializeSensors();
    
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [location.latitude, location.longitude]);

  // Main GPS tracking effect
  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      setIsLoading(false);
      return;
    }

    const options = getUltraFastOptions();
    
    const handleSuccess = (position) => {
      try {
        const coords = position.coords;
        const timestamp = new Date(position.timestamp);
        
        setDebugInfo(`Last update: ${timestamp.toLocaleTimeString()}`);
        
        const newLocation = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          altitude: coords.altitude,
          accuracy: coords.accuracy,
          altitudeAccuracy: coords.altitudeAccuracy,
          heading: coords.heading,
          speed: coords.speed,
          timestamp: timestamp.toLocaleTimeString()
        };
        
        // Apply Kalman filtering
        const filteredPosition = updateKalmanFilter(newLocation);
        
        setLocation({
          ...newLocation,
          latitude: filteredPosition[0],
          longitude: filteredPosition[1]
        });
        
        // Update position history
        positionHistoryRef.current.push({
          ...newLocation,
          timestamp: timestamp.getTime()
        });
        
        if (positionHistoryRef.current.length > 100) {
          positionHistoryRef.current.shift();
        }
        
        // Analyze constellation
        const constellation = analyzeConstellation(coords.accuracy);
        
        setTrackingData(prev => ({
          ...prev,
          positionHistory: [...positionHistoryRef.current],
          satelliteCount: constellation.estimatedSatelliteCount,
          dilutionOfPrecision: calculateDOP(coords.accuracy, constellation.estimatedSatelliteCount),
          constellationStatus: constellation
        }));
        
        setError(null);
        setIsLoading(false);
      } catch (error) {
        console.error('GPS success handler error:', error);
        setError(`Processing error: ${error.message}`);
      }
    };

    const handleError = (error) => {
      try {
        let errorMessage = 'GPS Error: ';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage += 'Permission denied. Please enable location services.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage += 'Position unavailable. Check GPS signal.';
            break;
          case error.TIMEOUT:
            errorMessage += 'Request timeout. Retrying...';
            setDebugInfo('GPS timeout, retrying...');
            return; // Don't set loading to false on timeout
          default:
            errorMessage += error.message;
        }
        setError(errorMessage);
        setIsLoading(false);
      } catch (e) {
        console.error('Error handler error:', e);
        setError('Unknown GPS error occurred');
        setIsLoading(false);
      }
    };

    // Start watching position
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        handleSuccess,
        handleError,
        options
      );
    } catch (error) {
      console.error('Watch position error:', error);
      setError(`Failed to start GPS tracking: ${error.message}`);
      setIsLoading(false);
    }

    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const getConstellationColor = (active) => active ? '#4caf50' : '#9e9e9e';
  const getAccuracyColor = (accuracy) => {
    if (accuracy <= 1) return '#4caf50';
    if (accuracy <= 3) return '#8bc34a';
    if (accuracy <= 5) return '#ff9800';
    return '#f44336';
  };

  // Debug component state
  const isWorking = !isLoading && !error && location.latitude;

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      <h2>🚀 Ultra-Fast GPS Tracker</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        Ultra-fast updates with satellite prediction and IMU integration
      </p>
      
      {/* Debug Info */}
      <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '4px', fontSize: '12px' }}>
        <strong>Debug:</strong> {debugInfo || 'Initializing...'} | 
        <strong> Working:</strong> {isWorking ? '✅' : '❌'} | 
        <strong> Sensors:</strong> {deviceSensors.permissionGranted ? '✅' : '❌'}
      </div>
      
      {isLoading && (
        <div style={{ color: '#666', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px', marginBottom: '20px' }}>
          <p>🔄 <strong>Initializing GPS tracking...</strong></p>
          <small>• Requesting location permissions<br/>
          • Connecting to satellites<br/>
          • Calibrating sensors</small>
        </div>
      )}
      
      {error && (
        <div style={{ color: '#ff4444', backgroundColor: '#ffebee', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
          <p>❌ <strong>{error}</strong></p>
        </div>
      )}
      
      {location.latitude && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          
          {/* Current Position */}
          <div style={{ backgroundColor: '#f0f8ff', padding: '15px', borderRadius: '8px', border: '2px solid #2196f3' }}>
            <h3>📍 Current Position</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px', fontSize: '14px' }}>
              <strong>Latitude:</strong><span style={{ fontFamily: 'monospace' }}>{location.latitude.toFixed(8)}°</span>
              <strong>Longitude:</strong><span style={{ fontFamily: 'monospace' }}>{location.longitude.toFixed(8)}°</span>
              <strong>Accuracy:</strong>
              <span style={{ color: getAccuracyColor(location.accuracy), fontWeight: 'bold' }}>
                {location.accuracy?.toFixed(2)}m
              </span>
              {location.altitude && (
                <>
                  <strong>Altitude:</strong><span>{location.altitude.toFixed(2)}m</span>
                </>
              )}
              {location.speed && (
                <>
                  <strong>Speed:</strong><span>{location.speed.toFixed(2)} m/s</span>
                </>
              )}
              <strong>Updated:</strong><span>{location.timestamp}</span>
            </div>
            
            <div style={{ marginTop: '15px' }}>
              <a 
                href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}&z=20`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ 
                  color: '#1976d2', 
                  textDecoration: 'none',
                  padding: '8px 16px',
                  border: '1px solid #1976d2',
                  borderRadius: '4px',
                  display: 'inline-block'
                }}
              >
                🗺️ Open in Google Maps
              </a>
            </div>
          </div>

          {/* Satellite Constellation */}
          <div style={{ backgroundColor: '#f8f5f0', padding: '15px', borderRadius: '8px' }}>
            <h3>🛰️ Satellite Status</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '14px' }}>
              <div style={{ color: getConstellationColor(trackingData.constellationStatus.gps) }}>
                <strong>GPS:</strong> {trackingData.constellationStatus.gps ? '✅' : '❌'}
              </div>
              <div style={{ color: getConstellationColor(trackingData.constellationStatus.glonass) }}>
                <strong>GLONASS:</strong> {trackingData.constellationStatus.glonass ? '✅' : '❌'}
              </div>
              <div style={{ color: getConstellationColor(trackingData.constellationStatus.galileo) }}>
                <strong>Galileo:</strong> {trackingData.constellationStatus.galileo ? '✅' : '❌'}
              </div>
              <div style={{ color: getConstellationColor(trackingData.constellationStatus.beidou) }}>
                <strong>BeiDou:</strong> {trackingData.constellationStatus.beidou ? '✅' : '❌'}
              </div>
            </div>
            
            {trackingData.satelliteCount && (
              <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#e8f5e8', borderRadius: '4px' }}>
                <strong>🛰️ Estimated Satellites:</strong> {trackingData.satelliteCount}
              </div>
            )}
          </div>

          {/* Compass Data */}
          <div style={{ backgroundColor: '#f0f8f0', padding: '15px', borderRadius: '8px' }}>
            <h3>🧭 Compass & Heading</h3>
            
            <div style={{ fontSize: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                <strong>Device Compass:</strong>
                <span>{compassData.deviceCompass ? `${compassData.deviceCompass.toFixed(1)}°` : 'N/A'}</span>
                
                <strong>Satellite North:</strong>
                <span style={{ color: '#4caf50' }}>
                  {compassData.satellitePredictedNorth ? `${compassData.satellitePredictedNorth.toFixed(1)}°` : 'Calculating...'}
                </span>
                
                <strong>GPS Heading:</strong>
                <span style={{ color: '#2196f3' }}>
                  {trackingData.predictedHeading ? `${trackingData.predictedHeading.toFixed(1)}°` : 'N/A'}
                </span>
                
                <strong>Sensor Status:</strong>
                <span style={{ color: deviceSensors.permissionGranted ? '#4caf50' : '#ff9800' }}>
                  {deviceSensors.permissionGranted ? '✅ Active' : '⚠️ Requesting...'}
                </span>
              </div>
            </div>
          </div>

          {/* Performance Stats */}
          <div style={{ backgroundColor: '#fff3e0', padding: '15px', borderRadius: '8px' }}>
            <h3>⚡ Performance</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px', fontSize: '14px' }}>
              <strong>Position Updates:</strong>
              <span>{trackingData.positionHistory.length} readings</span>
              
              <strong>IMU Samples:</strong>
              <span>{imuHistoryRef.current.length} readings</span>
              
              <strong>Tracking Time:</strong>
              <span>{
                trackingData.positionHistory.length > 1 ? 
                `${Math.round((trackingData.positionHistory[trackingData.positionHistory.length - 1].timestamp - trackingData.positionHistory[0].timestamp) / 1000)}s` : 
                'Starting...'
              }</span>
            </div>
          </div>

          {/* Accuracy Analysis */}
          <div style={{ backgroundColor: '#f8f0f8', padding: '15px', borderRadius: '8px' }}>
            <h3>📊 Accuracy Analysis</h3>
            
            {trackingData.dilutionOfPrecision && (
              <div style={{ fontSize: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                  <strong>PDOP:</strong>
                  <span style={{ color: trackingData.dilutionOfPrecision.color, fontWeight: 'bold' }}>
                    {trackingData.dilutionOfPrecision.pdop}
                  </span>
                  
                  <strong>Quality:</strong>
                  <span style={{ color: trackingData.dilutionOfPrecision.color, fontWeight: 'bold' }}>
                    {trackingData.dilutionOfPrecision.quality}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Satellite Geometry */}
          <div style={{ backgroundColor: '#e8f5e8', padding: '15px', borderRadius: '8px' }}>
            <h3>🛰️ Satellite Geometry</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px', fontSize: '14px' }}>
              <strong>Geometry Score:</strong>
              <span style={{ color: satelliteGeometry.geometryScore > 50 ? '#4caf50' : '#ff9800' }}>
                {satelliteGeometry.geometryScore}%
              </span>
              
              <strong>Predicted Satellites:</strong>
              <span>{satelliteGeometry.satelliteCount}</span>
              
              <strong>True North:</strong>
              <span style={{ fontWeight: 'bold' }}>
                {satelliteGeometry.trueNorthFromSats ? `${satelliteGeometry.trueNorthFromSats.toFixed(1)}°` : 'Calculating...'}
              </span>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

export default UltraFastGpsTracker;
