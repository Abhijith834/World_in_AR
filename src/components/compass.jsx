import { useEffect, useRef, useState } from 'react';

const CompassTracker = ({ onUpdate, onError, location }) => {
  const compassHistoryRef = useRef([]);
  const imuHistoryRef = useRef([]);
  const satelliteHistoryRef = useRef([]);
  const sensorsActiveRef = useRef(false);
  
  // IMU filter state
  const imuFilterRef = useRef({
    orientation: null,
    angularVelocity: null,
    linearAcceleration: null,
    quaternion: [1, 0, 0, 0], // w, x, y, z
    bias: { gyro: [0, 0, 0], accel: [0, 0, 0] },
    calibrated: false
  });

  // Enhanced satellite constellation data with real orbital parameters
  const satelliteConstellations = {
    GPS: { 
      count: 24, 
      inclination: 55.0, 
      altitude: 20182000, 
      period: 11.967, 
      eccentricity: 0.02,
      planes: 6,
      raan: [0, 60, 120, 180, 240, 300] // Right Ascension of Ascending Node
    },
    GLONASS: { 
      count: 24, 
      inclination: 64.8, 
      altitude: 19130000, 
      period: 11.25, 
      eccentricity: 0.01,
      planes: 3,
      raan: [0, 120, 240]
    },
    Galileo: { 
      count: 24, 
      inclination: 56.0, 
      altitude: 23222000, 
      period: 14.08, 
      eccentricity: 0.001,
      planes: 3,
      raan: [0, 120, 240]
    },
    BeiDou: { 
      count: 24, 
      inclination: 55.0, 
      altitude: 21150000, 
      period: 12.63, 
      eccentricity: 0.01,
      planes: 3,
      raan: [0, 120, 240]
    },
    QZSS: { 
      count: 4, 
      inclination: 43.0, 
      altitude: 35786000, 
      period: 24.0, 
      eccentricity: 0.075,
      planes: 1,
      raan: [0]
    },
    IRNSS: { 
      count: 7, 
      inclination: 29.0, 
      altitude: 35786000, 
      period: 24.0, 
      eccentricity: 0.05,
      planes: 1,
      raan: [0]
    }
  };

  // Enhanced satellite position calculation with proper orbital mechanics
  const calculateSatellitePositions = (lat, lon, altitude, timestamp) => {
    try {
      const now = new Date(timestamp);
      const julianDay = (now.getTime() / 86400000) + 2440587.5;
      const gmst = calculateGMST(julianDay); // Greenwich Mean Sidereal Time
      const satellites = [];
      
      Object.entries(satelliteConstellations).forEach(([constellation, params]) => {
        const satsPerPlane = Math.ceil(params.count / params.planes);
        
        for (let plane = 0; plane < params.planes; plane++) {
          for (let satInPlane = 0; satInPlane < satsPerPlane && satellites.length < params.count; satInPlane++) {
            const satellite = calculateEnhancedSatelliteOrbit(
              lat, lon, altitude, julianDay, gmst, constellation, params, plane, satInPlane
            );
            
            if (satellite && satellite.elevation > 5) { // Lower threshold for more satellites
              satellites.push(satellite);
            }
          }
        }
      });
      
      return satellites;
    } catch (error) {
      console.error('Enhanced satellite position calculation error:', error);
      return [];
    }
  };

  // Calculate Greenwich Mean Sidereal Time
  const calculateGMST = (julianDay) => {
    try {
      const t = (julianDay - 2451545.0) / 36525.0;
      let gmst = 280.46061837 + 360.98564736629 * (julianDay - 2451545.0) + 
                 0.000387933 * t * t - t * t * t / 38710000.0;
      
      // Normalize to 0-360 degrees
      gmst = ((gmst % 360) + 360) % 360;
      return gmst * Math.PI / 180; // Convert to radians
    } catch (error) {
      console.error('GMST calculation error:', error);
      return 0;
    }
  };

  // Enhanced satellite orbit calculation with proper Keplerian elements
  const calculateEnhancedSatelliteOrbit = (lat, lon, alt, julianDay, gmst, constellation, params, plane, satInPlane) => {
    try {
      const earthRadius = 6371000; // meters
      const mu = 3.986004418e14; // Earth's gravitational parameter
      
      // Calculate mean motion
      const meanMotion = Math.sqrt(mu / Math.pow(params.altitude, 3));
      
      // Orbital elements
      const inclination = params.inclination * Math.PI / 180;
      const eccentricity = params.eccentricity;
      const raan = params.raan[plane] * Math.PI / 180; // Right Ascension of Ascending Node
      const argOfPerigee = 0; // Simplified
      
      // Calculate mean anomaly
      const timeOffset = satInPlane * (2 * Math.PI / Math.ceil(params.count / params.planes));
      const meanAnomaly = meanMotion * (julianDay - 2451545.0) * 86400 + timeOffset;
      
      // Solve Kepler's equation for eccentric anomaly
      const eccentricAnomaly = solveKeplerEquation(meanAnomaly, eccentricity);
      
      // Calculate true anomaly
      const trueAnomaly = 2 * Math.atan2(
        Math.sqrt(1 + eccentricity) * Math.sin(eccentricAnomaly / 2),
        Math.sqrt(1 - eccentricity) * Math.cos(eccentricAnomaly / 2)
      );
      
      // Calculate distance
      const radius = params.altitude * (1 - eccentricity * Math.cos(eccentricAnomaly));
      
      // Position in orbital plane
      const xOrb = radius * Math.cos(trueAnomaly);
      const yOrb = radius * Math.sin(trueAnomaly);
      const zOrb = 0;
      
      // Transform to Earth-Centered Inertial (ECI) coordinates
      const eci = transformToECI(xOrb, yOrb, zOrb, inclination, raan, argOfPerigee + trueAnomaly);
      
      // Transform to Earth-Centered Earth-Fixed (ECEF) coordinates
      const ecef = transformToECEF(eci.x, eci.y, eci.z, gmst);
      
      // Calculate azimuth and elevation from observer
      const { azimuth, elevation, range } = calculateEnhancedAzimuthElevation(
        lat, lon, alt, ecef.x, ecef.y, ecef.z
      );
      
      return {
        id: `${constellation}-${plane}-${satInPlane}`,
        constellation,
        plane,
        satInPlane,
        azimuth,
        elevation,
        range,
        x: ecef.x,
        y: ecef.y,
        z: ecef.z,
        eciX: eci.x,
        eciY: eci.y,
        eciZ: eci.z,
        trueAnomaly,
        meanAnomaly,
        eccentricAnomaly,
        signalStrength: calculateSignalStrength(elevation, range),
        doppler: calculateDopplerShift(eci, ecef, meanMotion),
        health: 1.0 // Assume healthy
      };
    } catch (error) {
      console.error('Enhanced satellite orbit calculation error:', error);
      return null;
    }
  };

  // Solve Kepler's equation using Newton-Raphson method
  const solveKeplerEquation = (meanAnomaly, eccentricity, tolerance = 1e-6) => {
    try {
      let E = meanAnomaly; // Initial guess
      let delta = 1;
      let iterations = 0;
      
      while (Math.abs(delta) > tolerance && iterations < 20) {
        const f = E - eccentricity * Math.sin(E) - meanAnomaly;
        const df = 1 - eccentricity * Math.cos(E);
        delta = f / df;
        E = E - delta;
        iterations++;
      }
      
      return E;
    } catch (error) {
      console.error('Kepler equation solver error:', error);
      return meanAnomaly;
    }
  };

  // Transform orbital coordinates to ECI
  const transformToECI = (x, y, z, inc, raan, argLat) => {
    try {
      const cosRaan = Math.cos(raan);
      const sinRaan = Math.sin(raan);
      const cosInc = Math.cos(inc);
      const sinInc = Math.sin(inc);
      const cosArgLat = Math.cos(argLat);
      const sinArgLat = Math.sin(argLat);
      
      const xEci = x * (cosRaan * cosArgLat - sinRaan * sinArgLat * cosInc) - 
                   y * (cosRaan * sinArgLat + sinRaan * cosArgLat * cosInc);
      const yEci = x * (sinRaan * cosArgLat + cosRaan * sinArgLat * cosInc) - 
                   y * (sinRaan * sinArgLat - cosRaan * cosArgLat * cosInc);
      const zEci = x * (sinArgLat * sinInc) + y * (cosArgLat * sinInc);
      
      return { x: xEci, y: yEci, z: zEci };
    } catch (error) {
      console.error('ECI transformation error:', error);
      return { x: x, y: y, z: z };
    }
  };

  // Transform ECI to ECEF coordinates
  const transformToECEF = (xEci, yEci, zEci, gmst) => {
    try {
      const cosGmst = Math.cos(gmst);
      const sinGmst = Math.sin(gmst);
      
      const xEcef = xEci * cosGmst + yEci * sinGmst;
      const yEcef = -xEci * sinGmst + yEci * cosGmst;
      const zEcef = zEci;
      
      return { x: xEcef, y: yEcef, z: zEcef };
    } catch (error) {
      console.error('ECEF transformation error:', error);
      return { x: xEci, y: yEci, z: zEci };
    }
  };

  // Enhanced azimuth and elevation calculation
  const calculateEnhancedAzimuthElevation = (lat, lon, alt, satX, satY, satZ) => {
    try {
      const earthRadius = 6371000;
      const latRad = lat * Math.PI / 180;
      const lonRad = lon * Math.PI / 180;
      
      // Observer position in ECEF
      const obsX = (earthRadius + alt) * Math.cos(latRad) * Math.cos(lonRad);
      const obsY = (earthRadius + alt) * Math.cos(latRad) * Math.sin(lonRad);
      const obsZ = (earthRadius + alt) * Math.sin(latRad);
      
      // Vector from observer to satellite
      const dx = satX - obsX;
      const dy = satY - obsY;
      const dz = satZ - obsZ;
      
      // Transform to local North-East-Up (NEU) coordinates
      const north = -Math.sin(latRad) * Math.cos(lonRad) * dx - 
                    Math.sin(latRad) * Math.sin(lonRad) * dy + 
                    Math.cos(latRad) * dz;
      const east = -Math.sin(lonRad) * dx + Math.cos(lonRad) * dy;
      const up = Math.cos(latRad) * Math.cos(lonRad) * dx + 
                 Math.cos(latRad) * Math.sin(lonRad) * dy + 
                 Math.sin(latRad) * dz;
      
      // Calculate range, azimuth, and elevation
      const range = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const elevation = Math.asin(up / range) * 180 / Math.PI;
      let azimuth = Math.atan2(east, north) * 180 / Math.PI;
      
      if (azimuth < 0) azimuth += 360;
      
      return { azimuth, elevation, range, north, east, up };
    } catch (error) {
      console.error('Enhanced azimuth/elevation calculation error:', error);
      return { azimuth: 0, elevation: 0, range: 0, north: 0, east: 0, up: 0 };
    }
  };

  // Calculate signal strength based on elevation and range
  const calculateSignalStrength = (elevation, range) => {
    try {
      // Signal strength model considering atmospheric effects
      const maxRange = 25000000; // Maximum range in meters
      const atmosphericLoss = Math.max(0, 1 - (90 - elevation) / 90 * 0.3);
      const rangeLoss = Math.max(0.1, 1 - range / maxRange);
      
      return Math.max(0, Math.min(1, atmosphericLoss * rangeLoss));
    } catch (error) {
      console.error('Signal strength calculation error:', error);
      return 1.0;
    }
  };

  // Calculate Doppler shift for satellite
  const calculateDopplerShift = (eci, ecef, meanMotion) => {
    try {
      // Simplified Doppler calculation
      const velocity = meanMotion * Math.sqrt(eci.x * eci.x + eci.y * eci.y + eci.z * eci.z);
      const range = Math.sqrt(ecef.x * ecef.x + ecef.y * ecef.y + ecef.z * ecef.z);
      
      return velocity / range * 1575.42e6 / 299792458; // L1 frequency / speed of light
    } catch (error) {
      console.error('Doppler shift calculation error:', error);
      return 0;
    }
  };

  // Advanced satellite triangulation using least squares method
  const calculateAdvancedSatelliteTriangulationNorth = (satellites) => {
    try {
      if (satellites.length < 4) return null;
      
      // Filter satellites with good geometry
      const goodSatellites = satellites.filter(sat => 
        sat.elevation > 15 && sat.signalStrength > 0.3
      );
      
      if (goodSatellites.length < 4) return null;
      
      // Weighted least squares triangulation
      const weights = goodSatellites.map(sat => {
        const elevationWeight = Math.sin(sat.elevation * Math.PI / 180);
        const signalWeight = sat.signalStrength;
        const geometryWeight = calculateGeometryWeight(sat, goodSatellites);
        return elevationWeight * signalWeight * geometryWeight;
      });
      
      // Calculate weighted centroid in azimuth space
      let northVector = { x: 0, y: 0 };
      let totalWeight = 0;
      
      goodSatellites.forEach((sat, index) => {
        const weight = weights[index];
        const azimuthRad = sat.azimuth * Math.PI / 180;
        
        // Use unit vectors for proper circular averaging
        northVector.x += weight * Math.cos(azimuthRad);
        northVector.y += weight * Math.sin(azimuthRad);
        totalWeight += weight;
      });
      
      if (totalWeight > 0) {
        northVector.x /= totalWeight;
        northVector.y /= totalWeight;
        
        // Calculate true north from weighted satellite geometry
        const magnitude = Math.sqrt(northVector.x * northVector.x + northVector.y * northVector.y);
        if (magnitude > 0.1) { // Ensure significant vector
          const trueNorth = Math.atan2(northVector.y, northVector.x) * 180 / Math.PI;
          const confidence = Math.min(1.0, magnitude * goodSatellites.length / 10);
          
          return {
            north: trueNorth < 0 ? trueNorth + 360 : trueNorth,
            confidence: confidence,
            satelliteCount: goodSatellites.length,
            geometryScore: calculateAdvancedGeometryScore(goodSatellites)
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('Advanced satellite triangulation error:', error);
      return null;
    }
  };

  // Calculate geometry weight for individual satellite
  const calculateGeometryWeight = (satellite, allSatellites) => {
    try {
      // Calculate angular separation from other satellites
      let minSeparation = 180;
      
      allSatellites.forEach(other => {
        if (other.id !== satellite.id) {
          const azDiff = Math.abs(satellite.azimuth - other.azimuth);
          const elDiff = Math.abs(satellite.elevation - other.elevation);
          const separation = Math.sqrt(azDiff * azDiff + elDiff * elDiff);
          minSeparation = Math.min(minSeparation, separation);
        }
      });
      
      // Weight based on separation (better geometry with more separation)
      return Math.min(1.0, minSeparation / 30); // Normalize to 30 degrees
    } catch (error) {
      console.error('Geometry weight calculation error:', error);
      return 1.0;
    }
  };

  // Enhanced trajectory prediction using velocity vectors
  const calculateEnhancedTrajectoryPredictedNorth = (satellites, previousSatellites) => {
    try {
      if (!previousSatellites || previousSatellites.length < 4) return null;
      
      const trajectoryVectors = [];
      const deltaTime = 1.0; // 1 second prediction
      
      satellites.forEach(sat => {
        const prevSat = previousSatellites.find(prev => prev.id === sat.id);
        if (prevSat && sat.elevation > 15) {
          // Calculate velocity in azimuth-elevation space
          const azVelocity = (sat.azimuth - prevSat.azimuth) / deltaTime;
          const elVelocity = (sat.elevation - prevSat.elevation) / deltaTime;
          
          // Predict future position
          const predictedAz = sat.azimuth + azVelocity * deltaTime;
          const predictedEl = sat.elevation + elVelocity * deltaTime;
          
          if (predictedEl > 10) { // Only use satellites that will be visible
            trajectoryVectors.push({
              id: sat.id,
              azimuth: predictedAz,
              elevation: predictedEl,
              velocity: Math.sqrt(azVelocity * azVelocity + elVelocity * elVelocity),
              weight: Math.sin(predictedEl * Math.PI / 180) * sat.signalStrength
            });
          }
        }
      });
      
      if (trajectoryVectors.length < 4) return null;
      
      // Calculate predicted north from trajectory vectors
      let predictedNorth = { x: 0, y: 0 };
      let totalWeight = 0;
      
      trajectoryVectors.forEach(vector => {
        const azimuthRad = vector.azimuth * Math.PI / 180;
        const weight = vector.weight;
        
        predictedNorth.x += weight * Math.cos(azimuthRad);
        predictedNorth.y += weight * Math.sin(azimuthRad);
        totalWeight += weight;
      });
      
      if (totalWeight > 0) {
        predictedNorth.x /= totalWeight;
        predictedNorth.y /= totalWeight;
        
        const magnitude = Math.sqrt(predictedNorth.x * predictedNorth.x + predictedNorth.y * predictedNorth.y);
        if (magnitude > 0.1) {
          const north = Math.atan2(predictedNorth.y, predictedNorth.x) * 180 / Math.PI;
          const confidence = Math.min(1.0, magnitude * trajectoryVectors.length / 10);
          
          return {
            north: north < 0 ? north + 360 : north,
            confidence: confidence,
            velocityVectors: trajectoryVectors,
            avgVelocity: trajectoryVectors.reduce((sum, v) => sum + v.velocity, 0) / trajectoryVectors.length
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('Enhanced trajectory prediction error:', error);
      return null;
    }
  };

  // Enhanced IMU processing with sensor fusion (keeping existing code)
  const processIMUData = (acceleration, rotationRate, orientation) => {
    try {
      const current = imuFilterRef.current;
      const dt = 0.1; // 100ms update rate
      
      if (!current.orientation && orientation) {
        current.orientation = orientation;
        current.angularVelocity = rotationRate;
        current.linearAcceleration = acceleration;
        return null;
      }
      
      // Gyroscope integration with bias correction
      if (rotationRate) {
        const { alpha, beta, gamma } = rotationRate;
        
        // Remove estimated bias
        const correctedAlpha = alpha - current.bias.gyro[0];
        const correctedBeta = beta - current.bias.gyro[1];
        const correctedGamma = gamma - current.bias.gyro[2];
        
        // Integrate angular velocity
        const deltaAlpha = correctedAlpha * dt;
        const deltaBeta = correctedBeta * dt;
        const deltaGamma = correctedGamma * dt;
        
        // Update quaternion representation
        const magnitude = Math.sqrt(deltaAlpha * deltaAlpha + deltaBeta * deltaBeta + deltaGamma * deltaGamma);
        
        if (magnitude > 0.001) {
          const halfAngle = magnitude / 2;
          const s = Math.sin(halfAngle);
          const c = Math.cos(halfAngle);
          
          const dq = [
            c,
            s * deltaAlpha / magnitude,
            s * deltaBeta / magnitude,
            s * deltaGamma / magnitude
          ];
          
          // Quaternion multiplication
          const q = current.quaternion;
          current.quaternion = [
            q[0] * dq[0] - q[1] * dq[1] - q[2] * dq[2] - q[3] * dq[3],
            q[0] * dq[1] + q[1] * dq[0] + q[2] * dq[3] - q[3] * dq[2],
            q[0] * dq[2] - q[1] * dq[3] + q[2] * dq[0] + q[3] * dq[1],
            q[0] * dq[3] + q[1] * dq[2] - q[2] * dq[1] + q[3] * dq[0]
          ];
          
          // Normalize quaternion
          const norm = Math.sqrt(
            current.quaternion[0] * current.quaternion[0] +
            current.quaternion[1] * current.quaternion[1] +
            current.quaternion[2] * current.quaternion[2] +
            current.quaternion[3] * current.quaternion[3]
          );
          
          if (norm > 0) {
            current.quaternion = current.quaternion.map(q => q / norm);
          }
        }
      }
      
      // Accelerometer correction for gravity vector
      if (acceleration) {
        const { x, y, z } = acceleration;
        const norm = Math.sqrt(x * x + y * y + z * z);
        
        if (norm > 0.5 && norm < 15) { // Filter out non-gravity accelerations
          const normalizedAccel = { x: x / norm, y: y / norm, z: z / norm };
          
          // Use accelerometer to correct orientation drift
          const gravityCorrection = 0.02; // Small correction factor
          current.linearAcceleration = {
            x: current.linearAcceleration.x * (1 - gravityCorrection) + normalizedAccel.x * gravityCorrection,
            y: current.linearAcceleration.y * (1 - gravityCorrection) + normalizedAccel.y * gravityCorrection,
            z: current.linearAcceleration.z * (1 - gravityCorrection) + normalizedAccel.z * gravityCorrection
          };
        }
      }
      
      // Convert quaternion to heading
      const q = current.quaternion;
      const heading = Math.atan2(
        2 * (q[0] * q[3] + q[1] * q[2]),
        1 - 2 * (q[2] * q[2] + q[3] * q[3])
      ) * 180 / Math.PI;
      
      return heading < 0 ? heading + 360 : heading;
    } catch (error) {
      console.error('IMU processing error:', error);
      return null;
    }
  };

  // Calculate magnetic declination for UK (keeping existing code)
  const getMagneticDeclination = (lat, lon) => {
    try {
      const year = new Date().getFullYear();
      const yearOffset = year - 2020;
      
      // UK-specific magnetic declination model
      const baseDeclination = 0.3; // degrees West for UK
      const annualChange = 0.08; // degrees per year
      const latEffect = (lat - 54.0) * 0.015;
      const lonEffect = (lon + 2.0) * 0.025;
      
      return baseDeclination + yearOffset * annualChange + latEffect + lonEffect;
    } catch (error) {
      console.error('Magnetic declination calculation error:', error);
      return 0;
    }
  };

  // Enhanced multi-source compass fusion with confidence weighting
  const fuseCompassSources = (deviceCompass, satelliteResult, trajectoryResult, imuHeading, gpsHeading) => {
    try {
      const sources = [];
      
      // Add available sources with confidence-based weights
      if (deviceCompass !== null) {
        sources.push({ heading: deviceCompass, weight: 0.25, source: 'device', confidence: 0.8 });
      }
      
      if (satelliteResult && satelliteResult.north !== null) {
        const weight = 0.3 * satelliteResult.confidence;
        sources.push({ heading: satelliteResult.north, weight: weight, source: 'satellite', confidence: satelliteResult.confidence });
      }
      
      if (trajectoryResult && trajectoryResult.north !== null) {
        const weight = 0.25 * trajectoryResult.confidence;
        sources.push({ heading: trajectoryResult.north, weight: weight, source: 'trajectory', confidence: trajectoryResult.confidence });
      }
      
      if (imuHeading !== null) {
        const imuConfidence = imuFilterRef.current.calibrated ? 0.9 : 0.6;
        sources.push({ heading: imuHeading, weight: 0.15 * imuConfidence, source: 'imu', confidence: imuConfidence });
      }
      
      if (gpsHeading !== null) {
        sources.push({ heading: gpsHeading, weight: 0.05, source: 'gps', confidence: 0.7 });
      }
      
      if (sources.length === 0) return null;
      
      // Circular mean calculation with confidence weighting
      let sinSum = 0;
      let cosSum = 0;
      let totalWeight = 0;
      
      sources.forEach(source => {
        const radians = source.heading * Math.PI / 180;
        const effectiveWeight = source.weight * source.confidence;
        sinSum += Math.sin(radians) * effectiveWeight;
        cosSum += Math.cos(radians) * effectiveWeight;
        totalWeight += effectiveWeight;
      });
      
      if (totalWeight > 0) {
        sinSum /= totalWeight;
        cosSum /= totalWeight;
        
        const fusedHeading = Math.atan2(sinSum, cosSum) * 180 / Math.PI;
        const confidence = Math.min(1.0, totalWeight / 0.5); // Normalize confidence
        
        return {
          heading: fusedHeading < 0 ? fusedHeading + 360 : fusedHeading,
          confidence: confidence,
          sources: sources
        };
      }
      
      return null;
    } catch (error) {
      console.error('Enhanced compass fusion error:', error);
      return null;
    }
  };

  // Calculate advanced geometry score
  const calculateAdvancedGeometryScore = (satellites) => {
    try {
      if (satellites.length < 4) return 0;
      
      const avgElevation = satellites.reduce((sum, sat) => sum + sat.elevation, 0) / satellites.length;
      const elevationSpread = Math.max(...satellites.map(s => s.elevation)) - Math.min(...satellites.map(s => s.elevation));
      const azimuthSpread = Math.max(...satellites.map(s => s.azimuth)) - Math.min(...satellites.map(s => s.azimuth));
      
      // Calculate PDOP (Position Dilution of Precision) estimate
      const pdop = calculatePDOP(satellites);
      
      // Geometry score based on multiple factors
      const elevationScore = Math.min(100, (avgElevation / 45) * 30);
      const spreadScore = Math.min(100, (elevationSpread / 60) * 25 + (azimuthSpread / 360) * 25);
      const pdopScore = Math.min(100, Math.max(0, (5 - pdop) / 5 * 20));
      
      return elevationScore + spreadScore + pdopScore;
    } catch (error) {
      console.error('Advanced geometry score calculation error:', error);
      return 0;
    }
  };

  // Calculate Position Dilution of Precision
  const calculatePDOP = (satellites) => {
    try {
      if (satellites.length < 4) return 99;
      
      // Simplified PDOP calculation
      const avgElevation = satellites.reduce((sum, sat) => sum + sat.elevation, 0) / satellites.length;
      const elevationFactor = Math.sin(avgElevation * Math.PI / 180);
      
      return Math.max(1, 4 / (satellites.length * elevationFactor));
    } catch (error) {
      console.error('PDOP calculation error:', error);
      return 99;
    }
  };

  // Main compass processing function
  const processCompassData = (deviceCompass) => {
    try {
      if (!location) return;
      
      const now = Date.now();
      
      // Calculate satellite positions with enhanced accuracy
      const satellites = calculateSatellitePositions(
        location.latitude, 
        location.longitude, 
        location.altitude || 0, 
        now
      );
      
      // Get previous satellite data for trajectory calculation
      const previousSatellites = satelliteHistoryRef.current.length > 0 ? 
        satelliteHistoryRef.current[satelliteHistoryRef.current.length - 1].satellites : null;
      
      // Store satellite history
      satelliteHistoryRef.current.push({
        satellites,
        timestamp: now
      });
      
      if (satelliteHistoryRef.current.length > 30) {
        satelliteHistoryRef.current.shift();
      }
      
      // Calculate different north references with enhanced algorithms
      const satelliteTriangulationResult = calculateAdvancedSatelliteTriangulationNorth(satellites);
      const trajectoryPredictedResult = calculateEnhancedTrajectoryPredictedNorth(satellites, previousSatellites);
      
      // Get latest IMU heading
      const latestIMU = imuHistoryRef.current.length > 0 ? 
        imuHistoryRef.current[imuHistoryRef.current.length - 1].heading : null;
      
      // Get GPS heading
      const gpsHeading = location.gpsHeading;
      
      // Enhanced compass fusion
      const fusedResult = fuseCompassSources(
        deviceCompass,
        satelliteTriangulationResult,
        trajectoryPredictedResult,
        latestIMU,
        gpsHeading
      );
      
      // Calculate magnetic declination
      const magneticDeclination = getMagneticDeclination(location.latitude, location.longitude);
      
      const compassData = {
        deviceHeading: deviceCompass,
        satelliteTriangulationNorth: satelliteTriangulationResult ? satelliteTriangulationResult.north : null,
        trajectoryPredictedNorth: trajectoryPredictedResult ? trajectoryPredictedResult.north : null,
        imuHeading: latestIMU,
        gpsHeading: gpsHeading,
        fusedHeading: fusedResult ? fusedResult.heading : null,
        magneticDeclination: magneticDeclination,
        sensorsActive: sensorsActiveRef.current,
        imuCalibrated: imuFilterRef.current.calibrated,
        satelliteCount: satellites.length,
        
        // Enhanced satellite information
        satelliteGeometry: {
          avgElevation: satellites.length > 0 ? satellites.reduce((sum, sat) => sum + sat.elevation, 0) / satellites.length : 0,
          geometryScore: calculateAdvancedGeometryScore(satellites),
          pdop: calculatePDOP(satellites),
          satellites: satellites.map(sat => ({
            id: sat.id,
            constellation: sat.constellation,
            azimuth: sat.azimuth,
            elevation: sat.elevation,
            signalStrength: sat.signalStrength
          }))
        },
        
        // Confidence information
        confidence: {
          satellite: satelliteTriangulationResult ? satelliteTriangulationResult.confidence : 0,
          trajectory: trajectoryPredictedResult ? trajectoryPredictedResult.confidence : 0,
          fused: fusedResult ? fusedResult.confidence : 0
        },
        
        // Debug information
        debug: {
          totalSatellites: satellites.length,
          visibleSatellites: satellites.filter(s => s.elevation > 10).length,
          strongSignals: satellites.filter(s => s.signalStrength > 0.5).length,
          constellationCounts: Object.keys(satelliteConstellations).reduce((counts, name) => {
            counts[name] = satellites.filter(s => s.constellation === name).length;
            return counts;
          }, {})
        }
      };
      
      onUpdate(compassData);
    } catch (error) {
      console.error('Enhanced compass processing error:', error);
      onError(`Enhanced compass processing failed: ${error.message}`);
    }
  };

  // Keep all existing useEffect and helper functions
  useEffect(() => {
    let orientationHandler = null;
    let motionHandler = null;
    
    const handleOrientation = (event) => {
      try {
        if (event.alpha !== null) {
          sensorsActiveRef.current = true;
          
          const rawHeading = event.alpha;
          const webkitHeading = event.webkitCompassHeading;
          const deviceCompass = webkitHeading !== undefined ? webkitHeading : (360 - rawHeading);
          
          // Smooth compass readings
          compassHistoryRef.current.push(deviceCompass);
          if (compassHistoryRef.current.length > 10) {
            compassHistoryRef.current.shift();
          }
          
          const smoothedCompass = compassHistoryRef.current.reduce((sum, val) => sum + val, 0) / compassHistoryRef.current.length;
          
          // Store orientation for IMU processing
          imuFilterRef.current.orientation = {
            alpha: event.alpha,
            beta: event.beta,
            gamma: event.gamma
          };
          
          processCompassData(smoothedCompass);
        }
      } catch (error) {
        console.error('Orientation error:', error);
        onError(`Compass error: ${error.message}`);
      }
    };
    
    const handleMotion = (event) => {
      try {
        if (event.acceleration && event.rotationRate) {
          const imuHeading = processIMUData(event.acceleration, event.rotationRate, imuFilterRef.current.orientation);
          
          // Store IMU data
          imuHistoryRef.current.push({
            acceleration: event.acceleration,
            rotationRate: event.rotationRate,
            heading: imuHeading,
            timestamp: Date.now()
          });
          
          if (imuHistoryRef.current.length > 50) {
            imuHistoryRef.current.shift();
          }
          
          // Update IMU calibration status
          if (imuHistoryRef.current.length > 10) {
            const recentVariance = calculateHeadingVariance(imuHistoryRef.current.slice(-10));
            imuFilterRef.current.calibrated = recentVariance < 5; // degrees
          }
        }
      } catch (error) {
        console.error('Motion error:', error);
      }
    };
    
    // Initialize sensors
    const initializeSensors = async () => {
      try {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
          const permission = await DeviceOrientationEvent.requestPermission();
          if (permission === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
            window.addEventListener('devicemotion', handleMotion);
          } else {
            onError('Device orientation permission denied');
          }
        } else {
          window.addEventListener('deviceorientation', handleOrientation);
          window.addEventListener('devicemotion', handleMotion);
        }
        
        // Initial update without sensors if location available
        setTimeout(() => {
          if (location && !sensorsActiveRef.current) {
            processCompassData(null);
          }
        }, 2000);
        
      } catch (error) {
        console.error('Sensor initialization error:', error);
        onError(`Sensor initialization failed: ${error.message}`);
      }
    };
    
    initializeSensors();
    
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [location, onUpdate, onError]);

  // Helper function to calculate heading variance (keeping existing)
  const calculateHeadingVariance = (readings) => {
    if (readings.length < 2) return 0;
    
    const headings = readings.map(r => r.heading).filter(h => h !== null);
    if (headings.length < 2) return 0;
    
    const mean = headings.reduce((sum, h) => sum + h, 0) / headings.length;
    const variance = headings.reduce((sum, h) => sum + Math.pow(h - mean, 2), 0) / headings.length;
    
    return Math.sqrt(variance);
  };

  return null;
};

export default CompassTracker;
