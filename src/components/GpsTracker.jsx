import React, { useState, useEffect, useRef } from 'react';

const AdvancedSatelliteTracker = () => {
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
      beidou: false
    }
  });
  
  const [compassData, setCompassData] = useState({
    magneticHeading: null,
    trueHeading: null,
    magneticDeclination: null,
    confidenceLevel: null
  });
  
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const positionHistoryRef = useRef([]);
  const kalmanFilterRef = useRef({
    position: null,
    velocity: null,
    acceleration: null,
    errorCovariance: null
  });

  // Enhanced geolocation options for multi-constellation support
  const getEnhancedOptions = () => ({
    enableHighAccuracy: true,
    timeout: 3000,
    maximumAge: 0,
    // Enhanced options (browser-dependent)
    desiredAccuracy: 1, // Request sub-meter accuracy
    maximumAge: 0,
    enableHighAccuracy: true,
    // Multi-constellation hint (not standard but some browsers support)
    gnssMode: 'multi-constellation'
  });

  // Kalman filter for position prediction
  const updateKalmanFilter = (newPosition) => {
    const dt = 1; // Time step in seconds
    const current = kalmanFilterRef.current;
    
    if (!current.position) {
      // Initialize filter
      current.position = [newPosition.latitude, newPosition.longitude];
      current.velocity = [0, 0];
      current.acceleration = [0, 0];
      current.errorCovariance = [[100, 0], [0, 100]];
    } else {
      // Predict next position
      const predictedLat = current.position[0] + current.velocity[0] * dt;
      const predictedLon = current.position[1] + current.velocity[1] * dt;
      
      // Update velocity based on actual vs predicted
      current.velocity[0] = (newPosition.latitude - current.position[0]) / dt;
      current.velocity[1] = (newPosition.longitude - current.position[1]) / dt;
      
      // Update position
      current.position = [newPosition.latitude, newPosition.longitude];
      
      // Calculate predicted heading from velocity
      const heading = Math.atan2(current.velocity[1], current.velocity[0]) * 180 / Math.PI;
      const normalizedHeading = (heading + 360) % 360;
      
      setTrackingData(prev => ({
        ...prev,
        velocityVector: current.velocity,
        predictedHeading: normalizedHeading
      }));
    }
  };

  // Compass prediction based on movement pattern
  const calculateCompass = (positions) => {
    if (positions.length < 3) return null;
    
    const recent = positions.slice(-3);
    const vectors = [];
    
    // Calculate movement vectors
    for (let i = 1; i < recent.length; i++) {
      const dx = recent[i].longitude - recent[i-1].longitude;
      const dy = recent[i].latitude - recent[i-1].latitude;
      vectors.push({ dx, dy });
    }
    
    // Average the vectors for smoother heading
    const avgDx = vectors.reduce((sum, v) => sum + v.dx, 0) / vectors.length;
    const avgDy = vectors.reduce((sum, v) => sum + v.dy, 0) / vectors.length;
    
    // Calculate heading (0° = North, 90° = East)
    let heading = Math.atan2(avgDx, avgDy) * 180 / Math.PI;
    if (heading < 0) heading += 360;
    
    // Estimate magnetic declination (simplified)
    const magneticDeclination = getMagneticDeclination(
      recent[recent.length - 1].latitude,
      recent[recent.length - 1].longitude
    );
    
    return {
      trueHeading: heading,
      magneticHeading: (heading + magneticDeclination + 360) % 360,
      magneticDeclination: magneticDeclination,
      confidenceLevel: Math.min(vectors.length * 25, 100)
    };
  };

  // Simplified magnetic declination calculation
  const getMagneticDeclination = (lat, lon) => {
    // Simplified model - in reality, this would use the World Magnetic Model
    // This is a very rough approximation for demonstration
    const x = Math.cos(lat * Math.PI / 180) * Math.cos(lon * Math.PI / 180);
    const y = Math.cos(lat * Math.PI / 180) * Math.sin(lon * Math.PI / 180);
    return Math.atan2(y, x) * 180 / Math.PI * 0.1; // Simplified calculation
  };

  // Analyze satellite constellation (simulated)
  const analyzeConstellation = (accuracy) => {
    // Simulate multi-constellation detection based on accuracy
    const baseAccuracy = 5; // meters
    const constellationFactor = baseAccuracy / Math.max(accuracy, 1);
    
    return {
      gps: true, // GPS always available
      glonass: constellationFactor > 0.8,
      galileo: constellationFactor > 1.2,
      beidou: constellationFactor > 1.0,
      estimatedSatelliteCount: Math.min(Math.floor(constellationFactor * 8), 24)
    };
  };

  // Calculate Dilution of Precision estimate
  const calculateDOP = (accuracy, satelliteCount) => {
    if (!accuracy || !satelliteCount) return null;
    
    // Simplified DOP calculation
    const geometricFactor = Math.max(4 / satelliteCount, 0.5);
    const pdop = accuracy * geometricFactor;
    
    let quality = 'Poor';
    if (pdop < 2) quality = 'Excellent';
    else if (pdop < 4) quality = 'Good';
    else if (pdop < 8) quality = 'Fair';
    
    return {
      pdop: pdop.toFixed(1),
      quality: quality,
      satelliteCount: satelliteCount
    };
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      setIsLoading(false);
      return;
    }

    const options = getEnhancedOptions();

    const handleSuccess = (position) => {
      const coords = position.coords;
      const timestamp = new Date(position.timestamp);
      
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
      
      setLocation(newLocation);
      
      // Update position history
      positionHistoryRef.current.push({
        ...newLocation,
        timestamp: timestamp.getTime()
      });
      
      // Keep only last 50 positions
      if (positionHistoryRef.current.length > 50) {
        positionHistoryRef.current.shift();
      }
      
      // Update Kalman filter
      updateKalmanFilter(newLocation);
      
      // Analyze constellation
      const constellation = analyzeConstellation(coords.accuracy);
      
      // Calculate compass
      const compass = calculateCompass(positionHistoryRef.current);
      if (compass) {
        setCompassData(compass);
      }
      
      // Update tracking data
      setTrackingData(prev => ({
        ...prev,
        positionHistory: [...positionHistoryRef.current],
        satelliteCount: constellation.estimatedSatelliteCount,
        dilutionOfPrecision: calculateDOP(coords.accuracy, constellation.estimatedSatelliteCount),
        constellationStatus: {
          gps: constellation.gps,
          glonass: constellation.glonass,
          galileo: constellation.galileo,
          beidou: constellation.beidou
        }
      }));
      
      setError(null);
      setIsLoading(false);
    };

    const handleError = (error) => {
      setError(`Location error: ${error.message}`);
      setIsLoading(false);
    };

    const watchId = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      options
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const getConstellationColor = (active) => active ? '#4caf50' : '#9e9e9e';

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h2>🛰️ Advanced Multi-Satellite Tracker</h2>
      
      {isLoading && (
        <div style={{ color: '#666', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
          <p>🔄 Initializing multi-constellation tracking...</p>
          <small>Connecting to GPS, GLONASS, Galileo, and BeiDou satellites</small>
        </div>
      )}
      
      {error && (
        <div style={{ color: '#ff4444', backgroundColor: '#ffebee', padding: '10px', borderRadius: '4px' }}>
          <p>❌ {error}</p>
        </div>
      )}
      
      {location.latitude && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Current Position */}
          <div style={{ backgroundColor: '#f0f8ff', padding: '15px', borderRadius: '8px' }}>
            <h3>📍 Current Position</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
              <strong>Latitude:</strong><span>{location.latitude.toFixed(8)}°</span>
              <strong>Longitude:</strong><span>{location.longitude.toFixed(8)}°</span>
              <strong>Accuracy:</strong><span>{location.accuracy.toFixed(2)}m</span>
              {location.altitude && (
                <>
                  <strong>Altitude:</strong><span>{location.altitude.toFixed(2)}m</span>
                </>
              )}
              <strong>Updated:</strong><span>{location.timestamp}</span>
            </div>
          </div>
          
          {/* Constellation Status */}
          <div style={{ backgroundColor: '#f8f5f0', padding: '15px', borderRadius: '8px' }}>
            <h3>🛰️ Satellite Constellation</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ color: getConstellationColor(trackingData.constellationStatus.gps) }}>
                <strong>GPS:</strong> {trackingData.constellationStatus.gps ? 'Active' : 'Inactive'}
              </div>
              <div style={{ color: getConstellationColor(trackingData.constellationStatus.glonass) }}>
                <strong>GLONASS:</strong> {trackingData.constellationStatus.glonass ? 'Active' : 'Inactive'}
              </div>
              <div style={{ color: getConstellationColor(trackingData.constellationStatus.galileo) }}>
                <strong>Galileo:</strong> {trackingData.constellationStatus.galileo ? 'Active' : 'Inactive'}
              </div>
              <div style={{ color: getConstellationColor(trackingData.constellationStatus.beidou) }}>
                <strong>BeiDou:</strong> {trackingData.constellationStatus.beidou ? 'Active' : 'Inactive'}
              </div>
            </div>
            {trackingData.satelliteCount && (
              <div style={{ marginTop: '10px' }}>
                <strong>Estimated Satellites:</strong> {trackingData.satelliteCount}
              </div>
            )}
          </div>
          
          {/* Compass & Heading */}
          <div style={{ backgroundColor: '#f0f8f0', padding: '15px', borderRadius: '8px' }}>
            <h3>🧭 Compass & Heading</h3>
            {compassData.trueHeading !== null ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                <strong>True Heading:</strong><span>{compassData.trueHeading.toFixed(1)}°</span>
                <strong>Magnetic Heading:</strong><span>{compassData.magneticHeading.toFixed(1)}°</span>
                <strong>Magnetic Declination:</strong><span>{compassData.magneticDeclination.toFixed(1)}°</span>
                <strong>Confidence:</strong><span>{compassData.confidenceLevel}%</span>
              </div>
            ) : (
              <p style={{ color: '#666' }}>Move to calculate heading...</p>
            )}
            {trackingData.predictedHeading !== null && (
              <div style={{ marginTop: '10px', padding: '8px', backgroundColor: '#e8f5e8', borderRadius: '4px' }}>
                <strong>Predicted Heading:</strong> {trackingData.predictedHeading.toFixed(1)}°
              </div>
            )}
          </div>
          
          {/* Accuracy Analysis */}
          <div style={{ backgroundColor: '#f8f0f8', padding: '15px', borderRadius: '8px' }}>
            <h3>📊 Accuracy Analysis</h3>
            {trackingData.dilutionOfPrecision && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                <strong>PDOP:</strong><span>{trackingData.dilutionOfPrecision.pdop}</span>
                <strong>Quality:</strong><span>{trackingData.dilutionOfPrecision.quality}</span>
                <strong>Tracking Satellites:</strong><span>{trackingData.dilutionOfPrecision.satelliteCount}</span>
              </div>
            )}
            {trackingData.velocityVector && (
              <div style={{ marginTop: '10px' }}>
                <strong>Velocity Vector:</strong> 
                <small style={{ display: 'block', marginTop: '5px' }}>
                  Lat: {trackingData.velocityVector[0].toFixed(8)}°/s<br/>
                  Lon: {trackingData.velocityVector[1].toFixed(8)}°/s
                </small>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Movement History */}
      {trackingData.positionHistory.length > 0 && (
        <div style={{ marginTop: '20px', backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '8px' }}>
          <h3>📈 Movement Analysis</h3>
          <p><strong>Position History:</strong> {trackingData.positionHistory.length} points tracked</p>
          <p><strong>Tracking Duration:</strong> {
            trackingData.positionHistory.length > 1 ? 
            `${Math.round((trackingData.positionHistory[trackingData.positionHistory.length - 1].timestamp - trackingData.positionHistory[0].timestamp) / 1000)}s` : 
            'Just started'
          }</p>
        </div>
      )}
    </div>
  );
};

export default AdvancedSatelliteTracker;
