importScripts(
  "https://cdnjs.cloudflare.com/ajax/libs/satellite.js/4.0.0/satellite.min.js"
);

// Configuration constant (replace import)
const SCALE = 1 / 6371; // Define SCALE directly, copied from config.js (can't import because reasons)

// Set batch size for processing
const BATCH_SIZE = 500;

// Process messages from main thread
onmessage = function (e) {
  const { type } = e.data;

  if (type === "CALCULATE_POSITIONS") {
    calculatePositions(e.data);
  } else if (type === "CALCULATE_TRAJECTORY") {
    calculateTrajectory(e.data);
  } else {
    console.error("Invalid request type: " + type);
  }
};

// Helper function to get orbital period
if (typeof satellite !== "undefined" && !satellite.getOrbitPeriod) {
  satellite.getOrbitPeriod = function (satrec) {
    // Get the mean motion in radians per minute
    const meanMotion = satrec.no;

    // Convert to orbital period in minutes
    return meanMotion === 0 ? 0 : (2 * Math.PI) / meanMotion;
  };
}

// Calculate positions for all satellites
function calculatePositions(data) {
  const { tleData, time } = data;
  const date = new Date(time);

  // Process satellites in batches to prevent blocking
  for (let i = 0; i < tleData.length; i += BATCH_SIZE) {
    // Calculate this batch
    const batchSize = Math.min(BATCH_SIZE, tleData.length - i);
    const batchPositions = [];

    for (let j = 0; j < batchSize; j++) {
      const satIndex = i + j;
      if (satIndex >= tleData.length) break;

      const satData = tleData[satIndex];
      batchPositions.push(calculateSatellitePosition(satData, date));
    }

    // Return this batch of results
    postMessage({
      type: "POSITIONS_UPDATE",
      batchPositions: batchPositions,
      startIndex: i,
      count: batchPositions.length,
    });
  }
}

// Calculate a single satellite's position
function calculateSatellitePosition(satData, date) {
  try {
    const satrec = satellite.twoline2satrec(
      satData.TLE_LINE1,
      satData.TLE_LINE2
    );
    const positionAndVelocity = satellite.propagate(satrec, date);

    // Check for error
    if (
      typeof positionAndVelocity === "string" ||
      !positionAndVelocity.position
    ) {
      return { x: 0, y: 0, z: 0 }; // Return origin if error
    }

    const positionEci = positionAndVelocity.position;

    // Convert km to scene units and flip coordinates as needed for three.js
    return {
      x: positionEci.x * SCALE,
      y: positionEci.z * SCALE, // Flip y/z for three.js coordinate system
      z: -positionEci.y * SCALE,
    };
  } catch (error) {
    console.error(
      "Error calculating position for satellite:",
      satData.OBJECT_NAME,
      error
    );
    return { x: 0, y: 0, z: 0 }; // Return origin if error
  }
}

// Calculate a satellite's orbital trajectory
function calculateTrajectory(data) {
  const { tle, satelliteIndex, startTime, points } = data;
  const startDate = new Date(startTime);
  const trajectoryPoints = [];

  try {
    // Parse the TLE data
    const satrec = satellite.twoline2satrec(tle.TLE_LINE1, tle.TLE_LINE2);

    // Get the orbital period in minutes
    const meanMotion = satellite.getOrbitPeriod(satrec); // in minutes

    // Calculate positions along the orbit
    const timeStep = meanMotion / points; // minutes

    for (let i = 0; i <= points; i++) {
      // Calculate time for this point
      const pointTime = new Date(
        startDate.getTime() + i * timeStep * 60 * 1000
      );

      // Calculate position
      const positionAndVelocity = satellite.propagate(satrec, pointTime);

      if (positionAndVelocity.position) {
        const positionEci = positionAndVelocity.position;

        trajectoryPoints.push({
          x: positionEci.x * SCALE,
          y: positionEci.z * SCALE, // Flip y/z for three.js
          z: -positionEci.y * SCALE,
        });
      }
    }

    // Send complete trajectory back to main thread
    postMessage({
      type: "TRAJECTORY_DATA",
      satelliteIndex: satelliteIndex,
      trajectoryPoints: trajectoryPoints,
    });
  } catch (error) {
    console.error("Error calculating trajectory:", error);
    // Send back empty trajectory
    postMessage({
      type: "TRAJECTORY_DATA",
      trajectoryPoints: [],
    });
  }
}
