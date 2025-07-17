import { useEffect, useRef } from 'react';

const LocationTracker = ({ onUpdate, onError }) => {
  const watchIdRef = useRef(null);
  const intervalIdRef = useRef(null);
  const updateCountRef = useRef(0);
  const positionHistoryRef = useRef([]);
  const lastPositionRef = useRef(null);
  const lastGpsUpdateRef = useRef(0);

  // Simple position smoothing (much more reliable than Kalman)
  const smoothPosition = (newPos, previousPos, accuracy) => {
    try {
      if (!previousPos || !newPos.latitude || !newPos.longitude) {
        return {
          latitude: newPos.latitude,
          longitude: newPos.longitude
        };
      }

      // Check for valid coordinates
      if (isNaN(newPos.latitude) || isNaN(newPos.longitude)) {
        return {
          latitude: previousPos.latitude,
          longitude: previousPos.longitude
        };
      }

      // Simple smoothing factor based on accuracy
      const smoothingFactor = Math.min(0.5, 10.0 / Math.max(accuracy, 1));
      
      const smoothedLat = previousPos.latitude * (1 - smoothingFactor) + newPos.latitude * smoothingFactor;
      const smoothedLon = previousPos.longitude * (1 - smoothingFactor) + newPos.longitude * smoothingFactor;

      // Validate smoothed coordinates
      if (isNaN(smoothedLat) || isNaN(smoothedLon)) {
        return {
          latitude: newPos.latitude,
          longitude: newPos.longitude
        };
      }

      return {
        latitude: smoothedLat,
        longitude: smoothedLon
      };
    } catch (error) {
      console.error('Position smoothing error:', error);
      return {
        latitude: newPos.latitude,
        longitude: newPos.longitude
      };
    }
  };

  // Calculate movement metrics safely
  const calculateMovementMetrics = (currentPos, previousPos) => {
    try {
      if (!previousPos || !currentPos || 
          !currentPos.latitude || !currentPos.longitude ||
          !previousPos.latitude || !previousPos.longitude) {
        return {
          gpsHeading: null,
          calculatedSpeed: 0,
          distance: 0
        };
      }

      const deltaLat = currentPos.latitude - previousPos.latitude;
      const deltaLon = currentPos.longitude - previousPos.longitude;
      const deltaTime = (currentPos.timestamp - previousPos.timestamp) / 1000; // seconds

      if (deltaTime <= 0) {
        return {
          gpsHeading: null,
          calculatedSpeed: 0,
          distance: 0
        };
      }

      // Convert to approximate meters
      const latToMeters = 111320; // meters per degree latitude
      const lonToMeters = 111320 * Math.cos(currentPos.latitude * Math.PI / 180);
      
      const deltaLatM = deltaLat * latToMeters;
      const deltaLonM = deltaLon * lonToMeters;
      
      const distance = Math.sqrt(deltaLatM * deltaLatM + deltaLonM * deltaLonM);
      const speed = distance / deltaTime; // m/s

      let heading = null;
      if (distance > 0.5) { // Only calculate heading if moved significantly
        heading = Math.atan2(deltaLonM, deltaLatM) * 180 / Math.PI;
        if (heading < 0) heading += 360;
      }

      return {
        gpsHeading: heading,
        calculatedSpeed: speed,
        distance: distance
      };
    } catch (error) {
      console.error('Movement calculation error:', error);
      return {
        gpsHeading: null,
        calculatedSpeed: 0,
        distance: 0
      };
    }
  };

  // Process GPS position update
  const processGPSPosition = (position) => {
    try {
      const coords = position.coords;
      const now = Date.now();
      
      // Validate coordinates
      if (!coords.latitude || !coords.longitude || 
          isNaN(coords.latitude) || isNaN(coords.longitude)) {
        console.error('Invalid GPS coordinates:', coords);
        return null;
      }

      updateCountRef.current += 1;
      lastGpsUpdateRef.current = now;

      // Apply simple smoothing
      const smoothed = smoothPosition(
        { latitude: coords.latitude, longitude: coords.longitude },
        lastPositionRef.current,
        coords.accuracy
      );

      // Calculate movement metrics
      const movementMetrics = calculateMovementMetrics(
        { ...smoothed, timestamp: now },
        lastPositionRef.current
      );

      // Store position history
      const positionEntry = {
        lat: smoothed.latitude,
        lon: smoothed.longitude,
        accuracy: coords.accuracy,
        timestamp: now
      };
      
      positionHistoryRef.current.push(positionEntry);
      
      // Keep last 20 positions for 100ms updates
      if (positionHistoryRef.current.length > 20) {
        positionHistoryRef.current.shift();
      }

      // Estimate satellite count
      const satelliteCount = coords.accuracy < 3 ? 'Excellent (12+)' :
                           coords.accuracy < 5 ? 'Very Good (8-12)' :
                           coords.accuracy < 10 ? 'Good (6-8)' :
                           coords.accuracy < 20 ? 'Fair (4-6)' : 'Poor (3-4)';

      // Quality assessment
      const quality = coords.accuracy < 3 ? 'Exceptional' :
                     coords.accuracy < 5 ? 'Excellent' :
                     coords.accuracy < 10 ? 'Good' :
                     coords.accuracy < 20 ? 'Fair' : 'Poor';

      const locationData = {
        latitude: smoothed.latitude,
        longitude: smoothed.longitude,
        altitude: coords.altitude,
        accuracy: coords.accuracy,
        altitudeAccuracy: coords.altitudeAccuracy,
        heading: coords.heading,
        speed: coords.speed,
        timestamp: new Date().toLocaleTimeString(),
        updateCount: updateCountRef.current,
        updateRate: '10.0 Hz',
        
        // Movement data
        gpsHeading: movementMetrics.gpsHeading,
        calculatedSpeed: movementMetrics.calculatedSpeed,
        
        // Satellite data
        satelliteCount: satelliteCount,
        quality: quality,
        
        // Status
        isRealGPS: true,
        predicted: false
      };

      // Store current position for next calculation
      lastPositionRef.current = {
        latitude: smoothed.latitude,
        longitude: smoothed.longitude,
        timestamp: now,
        accuracy: coords.accuracy
      };

      return locationData;
    } catch (error) {
      console.error('GPS position processing error:', error);
      return null;
    }
  };

  // Simple position prediction for interpolation
  const predictPosition = () => {
    try {
      if (!lastPositionRef.current || positionHistoryRef.current.length < 2) {
        return null;
      }

      const now = Date.now();
      const timeSinceLastGPS = now - lastGpsUpdateRef.current;

      // Only predict if it's been more than 100ms since last GPS update
      if (timeSinceLastGPS < 100) {
        return null;
      }

      // Get recent positions for trend calculation
      const recentPositions = positionHistoryRef.current.slice(-3);
      if (recentPositions.length < 2) {
        return null;
      }

      // Calculate simple velocity from recent positions
      const latest = recentPositions[recentPositions.length - 1];
      const previous = recentPositions[recentPositions.length - 2];
      
      const deltaTime = (latest.timestamp - previous.timestamp) / 1000;
      if (deltaTime <= 0) {
        return null;
      }

      const velocityLat = (latest.lat - previous.lat) / deltaTime;
      const velocityLon = (latest.lon - previous.lon) / deltaTime;

      // Predict position
      const predictTime = timeSinceLastGPS / 1000; // seconds
      const predictedLat = latest.lat + velocityLat * predictTime;
      const predictedLon = latest.lon + velocityLon * predictTime;

      // Validate predicted coordinates
      if (isNaN(predictedLat) || isNaN(predictedLon)) {
        return null;
      }

      return {
        latitude: predictedLat,
        longitude: predictedLon,
        altitude: lastPositionRef.current.altitude,
        accuracy: lastPositionRef.current.accuracy * (1 + predictTime), // Degrade accuracy
        timestamp: new Date().toLocaleTimeString(),
        updateCount: updateCountRef.current,
        updateRate: '10.0 Hz',
        
        // Status
        isRealGPS: false,
        predicted: true,
        predictionTime: predictTime
      };
    } catch (error) {
      console.error('Position prediction error:', error);
      return null;
    }
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      onError('Geolocation is not supported by this browser');
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0
    };

    const handleSuccess = (position) => {
      try {
        const locationData = processGPSPosition(position);
        if (locationData) {
          onUpdate(locationData);
        }
      } catch (error) {
        console.error('GPS success handler error:', error);
        onError(`GPS processing failed: ${error.message}`);
      }
    };

    const handleError = (error) => {
      let errorMessage = 'GPS Error: ';
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage += 'Permission denied. Please enable location services.';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage += 'Position unavailable. Check your GPS signal.';
          break;
        case error.TIMEOUT:
          errorMessage += 'Request timeout. Trying again...';
          return; // Don't report timeout as error
        default:
          errorMessage += `Unknown error: ${error.message}`;
      }
      onError(errorMessage);
    };

    // Start GPS tracking
    watchIdRef.current = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      options
    );

    // High-frequency update interval (100ms)
    intervalIdRef.current = setInterval(() => {
      try {
        // If we have a position, either use new GPS data or predict
        if (lastPositionRef.current) {
          const predictedData = predictPosition();
          if (predictedData) {
            onUpdate(predictedData);
          }
        }
      } catch (error) {
        console.error('High-frequency update error:', error);
      }
    }, 100);

    // Cleanup
    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, [onUpdate, onError]);

  return null;
};

export default LocationTracker;
