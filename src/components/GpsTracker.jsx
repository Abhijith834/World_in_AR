import React, { useState, useEffect } from 'react';
import LocationTracker from './location';
import CompassTracker from './compass';

const GpsTracker = () => {
  const [location, setLocation] = useState(null);
  const [compass, setCompass] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Handle location updates
  const handleLocationUpdate = (locationData) => {
    setLocation(locationData);
    setIsLoading(false);
    setError(null);
  };

  // Handle compass updates
  const handleCompassUpdate = (compassData) => {
    setCompass(compassData);
  };

  // Handle errors
  const handleError = (errorMessage) => {
    setError(errorMessage);
    setIsLoading(false);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h2>🚀 GPS Tracker</h2>
      
      {/* Hidden tracker components */}
      <LocationTracker 
        onUpdate={handleLocationUpdate}
        onError={handleError}
      />
      
      <CompassTracker 
        onUpdate={handleCompassUpdate}
        onError={handleError}
        location={location}
      />
      
      {/* Loading state */}
      {isLoading && (
        <div style={{ padding: '20px', backgroundColor: '#f0f0f0', borderRadius: '8px' }}>
          <p>🔄 Getting your location...</p>
        </div>
      )}
      
      {/* Error state */}
      {error && (
        <div style={{ padding: '20px', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '8px' }}>
          <p>❌ {error}</p>
        </div>
      )}
      
      {/* Location data */}
      {location && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginTop: '20px' }}>
          
          {/* Position Card */}
          <div style={{ padding: '20px', backgroundColor: '#e3f2fd', borderRadius: '8px' }}>
            <h3>📍 Position</h3>
            <p><strong>Latitude:</strong> {location.latitude.toFixed(6)}°</p>
            <p><strong>Longitude:</strong> {location.longitude.toFixed(6)}°</p>
            <p><strong>Accuracy:</strong> {location.accuracy.toFixed(1)}m</p>
            {location.altitude && <p><strong>Altitude:</strong> {location.altitude.toFixed(1)}m</p>}
            {location.speed && <p><strong>Speed:</strong> {location.speed.toFixed(1)} m/s</p>}
            <p><strong>Updated:</strong> {location.timestamp}</p>
            
            <a 
              href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ 
                color: '#1976d2', 
                textDecoration: 'none',
                padding: '8px 16px',
                border: '1px solid #1976d2',
                borderRadius: '4px',
                display: 'inline-block',
                marginTop: '10px'
              }}
            >
              🗺️ View on Google Maps
            </a>
          </div>
          
          {/* Compass Card */}
          <div style={{ padding: '20px', backgroundColor: '#e8f5e8', borderRadius: '8px' }}>
            <h3>🧭 Compass</h3>
            {compass ? (
              <div>
                <p><strong>Device Heading:</strong> {compass.deviceHeading ? `${compass.deviceHeading.toFixed(1)}°` : 'N/A'}</p>
                <p><strong>GPS Heading:</strong> {compass.gpsHeading ? `${compass.gpsHeading.toFixed(1)}°` : 'N/A'}</p>
                <p><strong>Satellite North:</strong> {compass.satelliteNorth ? `${compass.satelliteNorth.toFixed(1)}°` : 'Calculating...'}</p>
                <p><strong>Sensors:</strong> {compass.sensorsActive ? '✅ Active' : '❌ Inactive'}</p>
              </div>
            ) : (
              <p>🔄 Initializing compass...</p>
            )}
          </div>
          
          {/* Stats Card */}
          <div style={{ padding: '20px', backgroundColor: '#fff3e0', borderRadius: '8px' }}>
            <h3>📊 Stats</h3>
            <p><strong>Updates:</strong> {location.updateCount || 0}</p>
            <p><strong>Satellites:</strong> {location.satelliteCount || 'Unknown'}</p>
            <p><strong>Quality:</strong> {location.quality || 'Unknown'}</p>
          </div>
          
        </div>
      )}
    </div>
  );
};

export default GpsTracker;
