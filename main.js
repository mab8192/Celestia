import * as config from "./config.js";
import { searchSatellite } from "./search.js";
import {
  getStarfield,
  getEarth,
  getMoon,
  getSun,
  getMercury,
  getVenus,
  getMars,
  getJupiter,
  getSaturn,
  getUranus,
  getNeptune,
  getPluto,
} from "./celestial.js";
import { getPlanetPosition, getMoonPosition } from "./orbits.js";

// Import tilt constants
const {
  MERCURY_AXIAL_TILT,
  VENUS_AXIAL_TILT,
  EARTH_AXIAL_TILT,
  MARS_AXIAL_TILT,
  JUPITER_AXIAL_TILT,
  SATURN_AXIAL_TILT,
  URANUS_AXIAL_TILT,
  NEPTUNE_AXIAL_TILT,
  PLUTO_AXIAL_TILT,
} = config;

const satelliteInfoPanel = document.getElementById("satelliteInfo");
const selectedSatelliteInfoPanel = document.getElementById(
  "selectedSatelliteInfo"
);

const searchButton = document.getElementById("searchButton");

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100000000
);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
}); // Added antialias for smoother edges
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const sceneOffset = new THREE.Vector3(0, 0, 0);

const starfield = getStarfield();
scene.add(starfield);

const sun = getSun();
scene.add(sun);

const { earth, earthGeometry, earthMaterial } = getEarth();
scene.add(earth);

const moon = getMoon();
scene.add(moon);

const mercury = getMercury();
scene.add(mercury);

const venus = getVenus();
scene.add(venus);

const mars = getMars();
scene.add(mars);

const jupiter = getJupiter();
scene.add(jupiter);

const saturn = getSaturn();
scene.add(saturn);

const uranus = getUranus();
scene.add(uranus);

const neptune = getNeptune();
scene.add(neptune);

const pluto = getPluto();
scene.add(pluto);

// --- Camera controls ---
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.target.set(0, 0, 0);
controls.enablePan = false;
controls.minDistance = config.SUN_RADIUS * config.CAMERA_MIN_DISTANCE_FACTOR;
controls.maxDistance = config.SUN_RADIUS * config.CAMERA_MAX_DISTANCE_FACTOR;
controls.zoomSpeed = 0.5;
controls.rotateSpeed = 0.5;
camera.position.x = 50;
camera.position.y = 50;
camera.position.z = 50;

// --- Raycasting and Interaction ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// --- Reusable Markers (initialized once) ---
let highlightedSatellite = null;
let selectedSatellite = null;

const highlightGeometry = new THREE.SphereGeometry(0.02, 16, 16);
const highlightMaterial = new THREE.MeshBasicMaterial({
  color: config.HIGHLIGHT_COLOR,
  transparent: true,
  opacity: 0.8,
});
highlightedSatellite = new THREE.Mesh(highlightGeometry, highlightMaterial);
highlightedSatellite.visible = false;
earth.add(highlightedSatellite);

const selectionGeometry = new THREE.SphereGeometry(0.025, 16, 16); // Slightly larger
const selectionMaterial = new THREE.MeshBasicMaterial({
  color: config.SELECTION_COLOR,
  transparent: true,
  opacity: 0.9,
});
selectedSatellite = new THREE.Mesh(selectionGeometry, selectionMaterial);
selectedSatellite.visible = false;
earth.add(selectedSatellite);

// --- Keep track of indices ---
let highlightedIndex = -1;
let selectedIndex = -1;

// --- Satellite Data and Rendering Placeholder ---
let tleData = []; // Initialize as empty array
let satellites;
let satelliteCount = 0; // Track how many satellites are actually loaded

// Create an instanced mesh for satellites instead of points
const satelliteGeometry = new THREE.SphereGeometry(0.005, 16, 16); // Small sphere
const satelliteMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
});

// Create instance mesh with maximum capacity
const MAX_INSTANCES = config.MAX_SATELLITES;
satellites = new THREE.InstancedMesh(
  satelliteGeometry,
  satelliteMaterial,
  MAX_INSTANCES
);
satellites.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // Allow updates
satellites.count = 0; // No instances yet
earth.add(satellites); // Add satellites as a child of Earth

// Matrix for position updates
const satelliteMatrix = new THREE.Matrix4();

// --- Trajectories (initialized once) ---
let currentTrajectory = null; // Track the trajectory for the currently highlighted object
let selectedTrajectory = null; // Track the trajectory for the currently selected object

// Create placeholder lines (can use empty geometry initially)
const emptyGeometry = new THREE.BufferGeometry();
const placeholderMaterial = new THREE.LineBasicMaterial({ visible: false }); // Material doesn't matter much here

currentTrajectory = new THREE.Line(emptyGeometry, placeholderMaterial.clone());
currentTrajectory.visible = false;
earth.add(currentTrajectory);

selectedTrajectory = new THREE.Line(
  emptyGeometry.clone(),
  placeholderMaterial.clone()
);
selectedTrajectory.visible = false;
earth.add(selectedTrajectory);

// --- Global State ---
let currentTime = new Date();
let isRealTime = false;

// --- Web worker ---
const worker = new Worker("propagation_worker.js");

// --- ADDED: Rotation for Earth and Satellites ---
const earthSystemRotationAxis = new THREE.Vector3(0, 1, 0); // Y-axis
const earthSystemRotationAngle = Math.PI / 2;
const earthSystemRotationQuaternion = new THREE.Quaternion().setFromAxisAngle(
  earthSystemRotationAxis,
  earthSystemRotationAngle
);
const satelliteRelativePosition = new THREE.Vector3(); // Reusable vector for rotation

// Modified worker message handler
worker.onmessage = (e) => {
  const {
    type,
    batchPositions,
    startIndex,
    count,
    satelliteIndex,
    trajectoryPoints,
  } = e.data;

  const earthPos = earth.position;

  if (type === "POSITIONS_UPDATE") {
    // Ensure we don't write past the buffer
    if (startIndex + count > config.MAX_SATELLITES) {
      console.warn("Received more satellite data than allocated buffer size.");
      return;
    }

    // Update instance matrices for each satellite
    for (let i = 0; i < count; i++) {
      const instanceIndex = startIndex + i;

      // --- ADDED: Rotate satellite position relative to Earth ---
      // Get original relative position from worker data
      satelliteRelativePosition.set(
        batchPositions[i].x,
        batchPositions[i].y,
        batchPositions[i].z
      );

      // Set position using the ORIGINAL vector from worker (relative to Earth)
      satelliteMatrix.makeTranslation(
        satelliteRelativePosition.x,
        satelliteRelativePosition.y,
        satelliteRelativePosition.z
      );

      // Apply to the instanced mesh
      satellites.setMatrixAt(instanceIndex, satelliteMatrix);
    }

    // Ensure matrix updates are applied
    satellites.instanceMatrix.needsUpdate = true;

    // Update total count if needed
    const newTotalCount = startIndex + count;
    if (newTotalCount > satellites.count) {
      satellites.count = newTotalCount;
      satelliteCount = newTotalCount;
    }

    // Update selected/highlighted satellite info panel and marker positions
    if (selectedIndex !== -1) {
      displayInfoPanel(selectedIndex, selectedSatelliteInfoPanel);
      if (selectedSatellite) {
        // Get position from instanced mesh
        satellites.getMatrixAt(selectedIndex, satelliteMatrix);
        const position = new THREE.Vector3();
        position.setFromMatrixPosition(satelliteMatrix);
        selectedSatellite.position.copy(position);
      }

      // Update selected trajectory
      requestTrajectory(selectedIndex);
    }
    if (highlightedIndex !== -1) {
      // Update marker position
      if (highlightedSatellite) {
        // Get position from instanced mesh
        satellites.getMatrixAt(highlightedIndex, satelliteMatrix);
        const position = new THREE.Vector3();
        position.setFromMatrixPosition(satelliteMatrix);
        highlightedSatellite.position.copy(position);
      }

      // Update highlighted trajectory
      requestTrajectory(highlightedIndex);
    }
  } else if (type === "TRAJECTORY_DATA") {
    // Received orbital trajectory data

    if (satelliteIndex === selectedIndex && selectedTrajectory) {
      // Trajectory is for the currently SELECTED satellite
      // Dispose old geometry and material
      if (selectedTrajectory.geometry) selectedTrajectory.geometry.dispose();
      if (selectedTrajectory.material) selectedTrajectory.material.dispose();

      // Create new geometry/material and assign to existing line
      const newGeoMat = buildTrajectoryLine(
        trajectoryPoints,
        config.SELECTION_COLOR
      );
      selectedTrajectory.geometry = newGeoMat.geometry;
      selectedTrajectory.material = newGeoMat.material;
      selectedTrajectory.visible = true; // Make it visible
    } else if (satelliteIndex === highlightedIndex && currentTrajectory) {
      // Trajectory is for the currently HIGHLIGHTED (hovered) satellite
      // Only update if the highlight is still active for this index
      // Dispose old geometry and material
      if (currentTrajectory.geometry) currentTrajectory.geometry.dispose();
      if (currentTrajectory.material) currentTrajectory.material.dispose();

      // Create new geometry/material and assign to existing line
      const newGeoMat = buildTrajectoryLine(
        trajectoryPoints,
        config.HIGHLIGHT_COLOR
      );
      currentTrajectory.geometry = newGeoMat.geometry;
      currentTrajectory.material = newGeoMat.material;
      currentTrajectory.visible = true; // Make it visible
    }
  }
};

worker.onerror = (error) => {
  console.error("Error in web worker:", error);
};

function buildTrajectoryLine(points, color) {
  const lineGeometry = new THREE.BufferGeometry();
  const linePositions = new Float32Array(points.length * 3);
  const lineAlphas = new Float32Array(points.length); // Stores per-vertex alpha

  for (let i = 0; i < points.length; i++) {
    // Set positions
    linePositions[i * 3] = points[i].x;
    linePositions[i * 3 + 1] = points[i].y;
    linePositions[i * 3 + 2] = points[i].z;

    // Compute opacity: starts at 1 and fades to 0.4
    lineAlphas[i] = 1 - (i / (points.length - 1)) * 0.6;
  }

  lineGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(linePositions, 3)
  );
  lineGeometry.setAttribute("alpha", new THREE.BufferAttribute(lineAlphas, 1));

  // Custom shader material to apply fading opacity
  const lineMaterial = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
    },
    vertexShader: `
            attribute float alpha;
            varying float vAlpha;
            void main() {
                vAlpha = alpha;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
    fragmentShader: `
            uniform vec3 color;
            varying float vAlpha;
            void main() {
                gl_FragColor = vec4(color, vAlpha);
            }
        `,
    transparent: true,
  });

  return {
    geometry: lineGeometry,
    material: lineMaterial,
  };
}

async function fetchTLE() {
  const CACHE_KEY = "tle_data";
  const TIMESTAMP_KEY = "tle_timestamp";
  const MAX_AGE = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

  const cachedTLE = localStorage.getItem(CACHE_KEY);
  const cachedTimestamp = localStorage.getItem(TIMESTAMP_KEY);

  if (
    cachedTLE &&
    cachedTimestamp &&
    Date.now() - parseInt(cachedTimestamp) < MAX_AGE
  ) {
    console.log("Using cached TLE data.");
    return cachedTLE;
  }

  console.log("Fetching new TLE data...");
  try {
    const response = await fetch(
      "https://celestrak.com/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"
    );
    if (!response.ok)
      throw new Error(`Failed to fetch TLE data: ${response.statusText}`);

    const text = await response.text();
    localStorage.setItem(CACHE_KEY, text);
    localStorage.setItem(TIMESTAMP_KEY, Date.now().toString());

    console.log("TLE data fetched and cached.");
    return text;
  } catch (error) {
    console.error(error);
    return cachedTLE || ""; // Fallback to cached data if available
  }
}

// --- TLE Initialization (Asynchronous) ---
async function initTLEs() {
  try {
    // Fetch raw TLE text data
    const text = await fetchTLE();

    // Parse TLE text into objects
    const lines = text.trim().split("\n");
    const parsedTleData = [];
    for (let i = 0; i < lines.length; i += 3) {
      // Ensure we have all three lines for a complete TLE set
      if (lines[i + 1] && lines[i + 2]) {
        const tleLine0 = lines[i].trim(); // Satellite Name
        const tleLine1 = lines[i + 1].trim();
        const tleLine2 = lines[i + 2].trim();

        // Extract NORAD Catalog ID from Line 1
        let noradId = null;
        if (tleLine1.startsWith("1 ")) {
          noradId = parseInt(tleLine1.substring(2, 7));
        } else {
          console.warn(`Could not parse NORAD ID from TLE line 1: ${tleLine1}`);
        }

        if (noradId !== null && !isNaN(noradId)) {
          parsedTleData.push({
            OBJECT_NAME: tleLine0,
            TLE_LINE1: tleLine1,
            TLE_LINE2: tleLine2,
            NORAD_CAT_ID: noradId,
          });
        } else {
          console.warn(
            `Skipping TLE entry due to missing/invalid NORAD ID. Name: ${tleLine0}`
          );
        }
      }
    }
    console.log(`Parsed ${parsedTleData.length} TLE entries.`);

    tleData = parsedTleData; // Assign parsed data

    // Limit satellites if necessary
    if (tleData.length > config.MAX_SATELLITES) {
      console.warn(
        `TLE data (${tleData.length}) exceeds MAX_SATELLITES (${config.MAX_SATELLITES}). Truncating.`
      );
      tleData = tleData.slice(0, config.MAX_SATELLITES);
    }

    // Initial position calculation
    updatePositions();
  } catch (error) {
    console.error("Error initializing satellites:", error);
  }
}

// Renamed function: Calculates and returns HTML for satellite info
function calculateSatelliteInfoHTML(index) {
  const satelliteData = tleData[index];
  if (!satelliteData) {
    return null; // Indicate no data
  }

  try {
    const satrec = satellite.twoline2satrec(
      satelliteData.TLE_LINE1,
      satelliteData.TLE_LINE2
    );

    // Calculate orbital parameters
    const semiMajorAxisKm = satrec.a * config.EARTH_RADIUS_KM;
    const apogeeKm =
      semiMajorAxisKm * (1 + satrec.ecco) - config.EARTH_RADIUS_KM;
    const perigeeKm =
      semiMajorAxisKm * (1 - satrec.ecco) - config.EARTH_RADIUS_KM;
    const inclinationDeg = satrec.inclo * (180 / Math.PI); // Convert radians to degrees
    const periodMin = (2 * Math.PI) / satrec.no; // Period in minutes

    // Calculate current Lat/Lon/Alt based on global currentTime
    const gmst = satellite.gstime(currentTime);
    const positionAndVelocity = satellite.propagate(satrec, currentTime);

    let lat = 0,
      lon = 0,
      alt = 0;
    if (positionAndVelocity && positionAndVelocity.position) {
      const positionEciKm = positionAndVelocity.position;
      const positionGd = satellite.eciToGeodetic(positionEciKm, gmst);
      // latitude and longitude are provided in radians by eciToGeodetic
      lat = positionGd.latitude * (180 / Math.PI); // Convert radians to degrees
      lon = positionGd.longitude * (180 / Math.PI); // Convert radians to degrees
      // Ensure longitude is in the range -180 to +180
      while (lon < -180) {
        lon += 360;
      }
      while (lon > 180) {
        lon -= 360;
      }
      alt = positionGd.height;
    } else {
      // console.warn("Could not propagate satellite:", satelliteData.OBJECT_NAME);
      // Return null or error HTML if propagation fails? For now, show zeros.
    }

    // Format the info display HTML
    const infoHTML = `
            <div><span>Name:</span> ${satelliteData.OBJECT_NAME}</div>
            <div><span>NORAD ID:</span> ${satelliteData.NORAD_CAT_ID}</div>
            <hr style="border-color: #555; margin: 8px 0;">
            <div><span>Altitude:</span> ${alt.toFixed(2)} km</div>
            <div><span>Latitude:</span> ${lat.toFixed(4)}°</div>
            <div><span>Longitude:</span> ${lon.toFixed(4)}°</div>
            <hr style="border-color: #555; margin: 8px 0;">
            <div><span>Apogee:</span> ${apogeeKm.toFixed(2)} km</div>
            <div><span>Perigee:</span> ${perigeeKm.toFixed(2)} km</div>
            <div><span>Inclination:</span> ${inclinationDeg.toFixed(2)}°</div>
            <div><span>Period:</span> ${periodMin.toFixed(2)} min</div>
        `;
    return infoHTML; // Return the HTML string
  } catch (error) {
    console.error(
      "Error calculating satellite info for:",
      satelliteData.OBJECT_NAME,
      error
    );
    return `<div>Error loading info for ${satelliteData.OBJECT_NAME}</div>`; // Return error HTML
  }
}

// New function to display info in a specific panel
function displayInfoPanel(index, panelElement) {
  if (index < 0 || index >= tleData.length || !panelElement) {
    if (panelElement) panelElement.style.display = "none";
    return;
  }

  const infoHTML = calculateSatelliteInfoHTML(index);

  if (infoHTML) {
    panelElement.innerHTML = infoHTML;
    panelElement.style.display = "block";
  } else {
    panelElement.style.display = "none"; // Hide if no data/error
  }
}

function updatePositions() {
  // --- Update Celestial Body Positions using orbits.js ---
  const scaleFactor = config.AU * config.SCALE; // Combined factor: AU -> km -> scene scale

  // Calculate ABSOLUTE positions (AU, Heliocentric Ecliptic) first
  const mercuryPosAU = getPlanetPosition("mercury", currentTime);
  const venusPosAU = getPlanetPosition("venus", currentTime);
  const earthPosAU = getPlanetPosition("earth", currentTime); // Heliocentric AU
  const marsPosAU = getPlanetPosition("mars", currentTime);
  const jupiterPosAU = getPlanetPosition("jupiter", currentTime);
  const saturnPosAU = getPlanetPosition("saturn", currentTime);
  const uranusPosAU = getPlanetPosition("uranus", currentTime);
  const neptunePosAU = getPlanetPosition("neptune", currentTime);
  const plutoPosAU = getPlanetPosition("pluto", currentTime); // Note: Pluto needs appropriate elements
  const moonGeoPosAU = getMoonPosition(currentTime); // Get GEOCENTRIC Moon position in AU

  // Apply scale to get ABSOLUTE scaled heliocentric positions
  const mercuryAbsPos = mercuryPosAU.multiplyScalar(scaleFactor);
  const venusAbsPos = venusPosAU.multiplyScalar(scaleFactor);
  const earthAbsPos = earthPosAU.multiplyScalar(scaleFactor);
  const marsAbsPos = marsPosAU.multiplyScalar(scaleFactor);
  const jupiterAbsPos = jupiterPosAU.multiplyScalar(scaleFactor);
  const saturnAbsPos = saturnPosAU.multiplyScalar(scaleFactor);
  const uranusAbsPos = uranusPosAU.multiplyScalar(scaleFactor);
  const neptuneAbsPos = neptunePosAU.multiplyScalar(scaleFactor);
  const plutoAbsPos = plutoPosAU.multiplyScalar(scaleFactor);

  // Apply the CURRENT sceneOffset to the ABSOLUTE positions to get final scene position
  // Sun is always at the heliocentric origin (0,0,0) before offset
  sun.position.copy(new THREE.Vector3(0, 0, 0)).add(sceneOffset);
  mercury.position.copy(mercuryAbsPos).add(sceneOffset);
  venus.position.copy(venusAbsPos).add(sceneOffset);
  earth.position.copy(earthAbsPos).add(sceneOffset);
  mars.position.copy(marsAbsPos).add(sceneOffset);
  jupiter.position.copy(jupiterAbsPos).add(sceneOffset);
  saturn.position.copy(saturnAbsPos).add(sceneOffset);
  uranus.position.copy(uranusAbsPos).add(sceneOffset);
  neptune.position.copy(neptuneAbsPos).add(sceneOffset);
  pluto.position.copy(plutoAbsPos).add(sceneOffset);

  // --- Update Axial Rotations ---
  const J2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
  const elapsedDays =
    (currentTime.getTime() - J2000.getTime()) / (1000 * 60 * 60 * 24);

  // Helper function to apply rotation and tilt
  function applyRotationAndTilt(body, siderealPeriodDays, axialTiltDegrees) {
    const dailyRotationAngle = (elapsedDays / siderealPeriodDays) * 2 * Math.PI;
    const tiltAngleRadians = THREE.MathUtils.degToRad(axialTiltDegrees);

    // Create quaternions for daily rotation (around Y) and tilt (around Z)
    const dailyRotationQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      dailyRotationAngle
    );
    const tiltQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      tiltAngleRadians
    );

    // Combine rotations: Apply daily rotation first, then tilt
    // The order matters: tiltQuat.multiply(dailyRotationQuat) means apply dailyRotationQuat then tiltQuat
    const combinedQuat = new THREE.Quaternion().multiplyQuaternions(
      tiltQuat,
      dailyRotationQuat
    );

    // Apply the combined rotation to the body
    body.setRotationFromQuaternion(combinedQuat);
  }

  // Apply rotations to planets
  // Earth: Special handling due to gmst and initial rotation offset needed for texture
  const gmst = satellite.gstime(currentTime);
  const earthDailyRotationAngle = gmst; // Earth's rotation relative to vernal equinox
  const earthTiltAngleRadians = THREE.MathUtils.degToRad(EARTH_AXIAL_TILT);

  // Quaternions for each component
  const earthDailyRotationQuat = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    earthDailyRotationAngle
  );
  const earthTiltQuat = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    earthTiltAngleRadians
  );
  // Re-introduce the initial correction rotation (already defined globally)
  const initialCorrectionQuat = new THREE.Quaternion().setFromAxisAngle(
    earthSystemRotationAxis,
    earthSystemRotationAngle
  );

  // Combine: Apply daily rotation, then initial correction, then tilt.
  // Order: tilt * initial * daily
  const earthCombinedQuat = new THREE.Quaternion()
    .multiplyQuaternions(earthTiltQuat, initialCorrectionQuat) // Apply tilt after initial correction
    .multiply(earthDailyRotationQuat); // Apply initial correction after daily rotation

  earth.setRotationFromQuaternion(earthCombinedQuat);

  applyRotationAndTilt(mercury, 58.65, MERCURY_AXIAL_TILT);
  applyRotationAndTilt(venus, -243.02, VENUS_AXIAL_TILT); // Retrograde
  applyRotationAndTilt(mars, 1.026, MARS_AXIAL_TILT);
  applyRotationAndTilt(jupiter, 0.414, JUPITER_AXIAL_TILT);
  applyRotationAndTilt(saturn, 0.444, SATURN_AXIAL_TILT);
  applyRotationAndTilt(uranus, -0.718, URANUS_AXIAL_TILT); // Retrograde
  applyRotationAndTilt(neptune, 0.671, NEPTUNE_AXIAL_TILT);
  applyRotationAndTilt(pluto, -6.387, PLUTO_AXIAL_TILT); // Retrograde (Dwarf Planet)

  // --- Calculate final Moon position ---
  // Scale the geocentric moon vector (AU) to scene scale
  const moonGeoScaled = moonGeoPosAU.multiplyScalar(scaleFactor);
  // Add the scaled geocentric vector to Earth's FINAL scene position (which includes offset)
  moon.position.copy(earth.position).add(moonGeoScaled);

  // Moon: Tidal locking - always face Earth
  // Need to handle the case where moon and earth are at the same position briefly during setup
  if (!moon.position.equals(earth.position)) {
    // Calculate the direction vector from Moon to Earth
    const lookTarget = new THREE.Vector3().subVectors(
      earth.position,
      moon.position
    );
    // Create a quaternion representing the rotation to look at the target
    const quaternion = new THREE.Quaternion();
    // Assuming the Moon's "face" (texture front) is along its +Z axis initially.
    // We need to adjust the 'up' vector if the default lookAt causes unwanted roll.
    // A common 'up' is the world Y axis, but might need adjustment based on orbital plane.
    // For simplicity, let's use the world Y axis first.
    const up = new THREE.Vector3(0, 1, 0); // World Y axis
    quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      lookTarget.normalize()
    );
    moon.setRotationFromQuaternion(quaternion);
  }

  // --- Request satellite position updates from the worker ---
  // Only send data if we actually have TLEs loaded
  if (tleData && tleData.length > 0) {
    // Send the *entire* current TLE dataset and the desired time
    // The worker will process this and send back results incrementally
    // Worker calculates relative to Earth ECI, main thread adds to earth.position
    // Since earth.position is now correctly offset, this should work.
    worker.postMessage({
      type: "CALCULATE_POSITIONS", // Add a type for clarity
      tleData: tleData, // Send the full data set
      time: currentTime.toISOString(), // Send time as ISO string
    });
  }
}

// Function to request a satellite's trajectory from the worker
function requestTrajectory(satelliteIndex) {
  if (tleData && tleData[satelliteIndex]) {
    // Request trajectory calculation from worker
    worker.postMessage({
      type: "CALCULATE_TRAJECTORY",
      satelliteIndex: satelliteIndex,
      tle: tleData[satelliteIndex],
      startTime: currentTime.toISOString(),
      points: 100, // Number of points to calculate for the orbit
    });
  }
}

// Function to clear trajectory when not hovering
function clearTrajectory() {
  if (currentTrajectory) {
    // currentTrajectory.geometry.dispose(); // Dispose geometry <-- REMOVE
    // currentTrajectory.material.dispose(); // Dispose material <-- REMOVE
    // earth.remove(currentTrajectory); // Explicitly remove from Earth <-- REMOVE
    currentTrajectory.visible = false; // Just hide
    // currentTrajectory = null; // <-- Don't nullify
  }
  document.getElementById("satelliteInfo").style.display = "none";
}

function clearSelectedTrajectory() {
  if (selectedTrajectory) {
    // selectedTrajectory.geometry.dispose(); // Dispose geometry <-- REMOVE
    // selectedTrajectory.material.dispose(); // Dispose material <-- REMOVE
    // earth.remove(selectedTrajectory); // Explicitly remove from Earth <-- REMOVE
    selectedTrajectory.visible = false; // Just hide
    // selectedTrajectory = null; // <-- Don't nullify
  }
}

// --- Functions for highlighting satellites on hover ---
function highlightSatellite(index) {
  // Store the index for comparison
  highlightedIndex = index;

  // Position the existing highlight marker
  updateMarkerPosition(highlightedSatellite, index);
  highlightedSatellite.visible = true; // Make it visible

  // Update the satellite info display using the specific panel
  displayInfoPanel(index, satelliteInfoPanel);
}

function resetHighlight() {
  if (highlightedSatellite) {
    // earth.remove(highlightedSatellite); // <-- Don't remove, just hide
    highlightedSatellite.visible = false;
    // highlightedSatellite = null; // <-- Don't nullify
    highlightedIndex = -1;

    // Clear the hover trajectory
    clearTrajectory();

    // Hide hover info panel
    satelliteInfoPanel.style.display = "none";
  }
}

function selectSatellite(index) {
  // Reset previous selection effects first
  clearSelection();

  // Store the index for comparison
  selectedIndex = index;

  // Position the existing selection marker
  updateMarkerPosition(selectedSatellite, index);
  selectedSatellite.visible = true; // Make it visible

  // Update the selected satellite info display
  displayInfoPanel(index, selectedSatelliteInfoPanel);
  // Hide hover panel when selecting
  satelliteInfoPanel.style.display = "none";

  requestTrajectory(selectedIndex);
}

function clearSelection() {
  if (selectedSatellite) {
    // earth.remove(selectedSatellite); // <-- Don't remove, just hide
    selectedSatellite.visible = false;
    // selectedSatellite = null; // <-- Don't nullify
    selectedIndex = -1;
    // Hide selected info panel
    selectedSatelliteInfoPanel.style.display = "none";
    // Also hide hover trajectory (if any) associated with previous selection hover
    clearSelectedTrajectory();
  }
}

// --- ADDED: Helper function to update marker positions ---
// Reads the current position from the buffer
function updateMarkerPosition(markerMesh, satelliteIndex) {
  if (markerMesh && satelliteIndex >= 0 && satelliteIndex < satelliteCount) {
    satellites.getMatrixAt(satelliteIndex, satelliteMatrix);
    const position = new THREE.Vector3();
    position.setFromMatrixPosition(satelliteMatrix);
    markerMesh.position.copy(position);
  }
}

// --- Time controls ---
document.getElementById("forward").addEventListener("click", () => {
  isRealTime = false;
  document.getElementById("play").textContent = "▶"; // Set to Play icon
  stepTime(1);
});
document.getElementById("backward").addEventListener("click", () => {
  isRealTime = false;
  document.getElementById("play").textContent = "▶"; // Set to Play icon
  stepTime(-1);
});
document.getElementById("play").addEventListener("click", () => {
  isRealTime = !isRealTime;
  document.getElementById("play").textContent = isRealTime
    ? "⏸︎" // Pause icon
    : "⏵︎"; // Play icon
  if (isRealTime) {
    // When switching to real-time, update immediately
    currentTime = new Date();
    updatePositions(); // This will update selected info panel if needed
  }
});

function stepTime(direction) {
  // Step by 10 minutes for noticeable change
  currentTime = new Date(currentTime.getTime() + direction * 60 * 10 * 1000);
  updatePositions(); // Request new positions and update selected info panel
}

// Make sure renderer stays the right size
window.addEventListener("resize", onWindowResize, false);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Update mouse position for raycasting
window.addEventListener("mousemove", onMouseMove, false);

function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Raycast against Earth recursively, which includes satellites and markers
  const intersects = raycaster.intersectObject(earth, true);

  // --- Find first non-occluded hits ---
  let satelliteInstanceIndex = -1;
  let hoveringVisibleMarker = false;

  for (const intersect of intersects) {
    // If we hit the Earth mesh, stop processing further intersections (occlusion)
    if (intersect.object === earth) {
      break;
    }

    // Check for first hit on the instanced mesh (if not found yet)
    if (
      satelliteInstanceIndex === -1 &&
      intersect.object === satellites &&
      intersect.instanceId !== undefined
    ) {
      satelliteInstanceIndex = intersect.instanceId;
    }

    // Check if we hit the *currently visible* highlight marker
    if (
      highlightedSatellite.visible &&
      intersect.object === highlightedSatellite
    ) {
      hoveringVisibleMarker = true;
    }

    // Optimization: if we found both possible valid hits, we can stop early
    // (Since Earth check happens first, these hits are guaranteed to be non-occluded)
    if (satelliteInstanceIndex !== -1 && hoveringVisibleMarker) {
      break;
    }
  }

  // --- Decide Action (based on non-occluded hits found *before* hitting Earth) ---
  let finalAction = "reset"; // Default action
  let interactionPoint = null; // World point of interaction
  let potentialHitObject = null;

  // Find first non-occluded hit (satellite or marker)
  for (const intersect of intersects) {
    if (intersect.object === earth) break; // Stop if Earth is hit

    if (intersect.object === satellites && intersect.instanceId !== undefined) {
      finalAction = "highlight";
      potentialHitObject = intersect.object;
      interactionPoint = intersect.point;
      satelliteInstanceIndex = intersect.instanceId; // Keep track of index for logic later
      break; // Satellite found, highest priority
    }
    if (
      intersect.object === highlightedSatellite &&
      highlightedSatellite.visible
    ) {
      finalAction = "keep";
      potentialHitObject = intersect.object;
      interactionPoint = intersect.point;
      // Don't break, satellite might be closer
    }
  }

  // --- Occlusion Check using secondary raycast ---
  let isOccluded = false;
  if (interactionPoint && potentialHitObject) {
    // Only check if we found a potential target
    const camPos = camera.position;
    const distanceToTarget = camPos.distanceTo(interactionPoint);

    // Create ray from camera *towards* the interaction point
    const occlusionRaycaster = new THREE.Raycaster();
    const direction = new THREE.Vector3()
      .subVectors(interactionPoint, camPos)
      .normalize();
    occlusionRaycaster.set(camPos, direction);

    // Raycast *only* against the earth mesh (non-recursive)
    const earthIntersects = occlusionRaycaster.intersectObject(earth, false);

    if (earthIntersects.length > 0) {
      const distanceToEarthHit = earthIntersects[0].distance;
      // If Earth is hit closer than the target object (add small tolerance)
      if (distanceToEarthHit < distanceToTarget - 0.001) {
        isOccluded = true;
        finalAction = "reset"; // Override action if occluded
      }
    }
  }

  // --- Execute Final Action ---
  if (finalAction === "highlight") {
    // Verify we still have the index (should be guaranteed if action is highlight)
    if (
      satelliteInstanceIndex !== -1 &&
      satelliteInstanceIndex !== highlightedIndex
    ) {
      resetHighlight();
      highlightSatellite(satelliteInstanceIndex);
      if (satelliteInstanceIndex !== selectedIndex) {
        requestTrajectory(satelliteInstanceIndex);
      }
    }
    // If index matches highlightedIndex, do nothing
  } else if (finalAction === "keep") {
    // Do nothing - marker was hit directly and wasn't occluded
  } else {
    // finalAction === 'reset'
    resetHighlight();
  }
}

window.addEventListener("mousedown", onMouseDown, false);

function onMouseDown(event) {
  // If we clicked on a highlighted satellite that isn't already selected
  if (highlightedIndex !== -1 && highlightedIndex !== selectedIndex) {
    // Clear previous selection marker and trajectory
    clearSelection();
    // Select the new one
    selectSatellite(highlightedIndex);
  }
}

searchButton.addEventListener("click", () => {
  const foundIndex = searchSatellite(tleData);

  if (foundIndex !== -1) {
    console.log(
      `Found satellite: ${tleData[foundIndex].OBJECT_NAME} (Index: ${foundIndex})`
    );

    clearSelection();
    selectSatellite(foundIndex);
    requestTrajectory(foundIndex);
    searchInput.value = "";
  } else {
    console.log(`Satellite matching "${searchTerm}" not found.`);
    alert(`Satellite matching "${searchTerm}" not found.`);
    clearSelection();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearSelection();
  }
});

// --- Camera Target Tracking ---
let cameraTargetObject = sun; // Default target is the Sun object
const targetObjects = {
  // Map for easy lookup
  sun: sun,
  mercury: mercury,
  venus: venus,
  earth: earth,
  moon: moon,
  mars: mars,
  jupiter: jupiter,
  saturn: saturn,
  uranus: uranus,
  neptune: neptune,
  pluto: pluto,
};
const targetButtons = document.querySelectorAll("#target-controls button");

// --- Tooltip Management ---
const planetTooltips = {};
Object.keys(targetObjects).forEach((planetName) => {
  const tooltipId = `tooltip-${planetName}`;
  const element = document.getElementById(tooltipId);

  if (element) {
    planetTooltips[planetName] = element;
    // Add double-click listener
    element.addEventListener("dblclick", () => {
      console.log(`Double-clicking ${planetName}`);
      setCameraTarget(planetName);
    });
  } else {
    console.warn(`Tooltip element not found for ID: ${tooltipId}`);
  }
});

// Function to set the active target
function setCameraTarget(targetName) {
  const newTargetObject = targetObjects[targetName]; // The mesh object

  console.log(`Setting camera target to: ${targetName}`);
  cameraTargetObject = newTargetObject; // Keep track of the object

  // Update button active states
  targetButtons.forEach((button) => {
    if (button.dataset.target === targetName) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });

  // --- Calculate the ABSOLUTE (un-offset) world position of the new target ---
  const scaleFactor = config.AU * config.SCALE;
  let targetAbsolutePosition;

  if (targetName === "sun") {
    targetAbsolutePosition = new THREE.Vector3(0, 0, 0); // Sun is heliocentric origin
  } else if (targetName === "moon") {
    const earthPosAU = getPlanetPosition("earth", currentTime); // Heliocentric Earth AU
    const moonGeoPosAU = getMoonPosition(currentTime); // Geocentric Moon AU
    const moonHelioAU = earthPosAU.clone().add(moonGeoPosAU); // Calculate Heliocentric Moon AU here
    targetAbsolutePosition = moonHelioAU.multiplyScalar(scaleFactor); // Scaled Heliocentric
  } else {
    // For planets
    const planetPosAU = getPlanetPosition(targetName, currentTime); // Heliocentric AU
    targetAbsolutePosition = planetPosAU.multiplyScalar(scaleFactor); // Scaled Heliocentric
  }

  // --- Calculate Offsets ---
  // Determine the new offset vector required to center the target
  const newOffset = targetAbsolutePosition.clone().negate();
  // Calculate the change in offset from the previous state
  const deltaOffset = newOffset.clone().sub(sceneOffset);

  // --- Adjust Camera and Controls ---
  const objRadius = newTargetObject.geometry.boundingSphere.radius;
  // Calculate new camera distance relative to the target's radius
  const newDistance = objRadius * 5; // Use a factor of the radius for distance

  // Calculate the desired camera position relative to the target's ABSOLUTE position
  const cameraOffsetVector = new THREE.Vector3(
    newDistance,
    newDistance / 2,
    newDistance
  );
  const desiredCameraPositionAbsolute = targetAbsolutePosition
    .clone()
    .add(cameraOffsetVector);

  // 1. Update controls target to the new target's ABSOLUTE position first
  controls.target.copy(targetAbsolutePosition);
  // 2. Then apply the new offset to place the controls target at the scene origin
  controls.target.add(newOffset);

  // 3. Set camera position (absolute relative to target, then add new offset)
  camera.position.copy(desiredCameraPositionAbsolute);
  camera.position.add(newOffset);

  // 4. Update min/max distance for controls based on the object's radius
  controls.minDistance = objRadius * config.CAMERA_MIN_DISTANCE_FACTOR;
  // Increase max distance significantly when focused on smaller objects like moon/planets
  const maxDistFactor =
    targetName === "sun" || targetName === "jupiter" || targetName === "saturn"
      ? config.CAMERA_MAX_DISTANCE_FACTOR
      : config.CAMERA_MAX_DISTANCE_FACTOR * 10;
  controls.maxDistance = objRadius * maxDistFactor;

  // 5. Update the global sceneOffset variable *BEFORE* calling updatePositions
  sceneOffset.copy(newOffset);

  // 6. Force control update to recognize new target and position
  controls.update();

  // --- Adjust Existing Scene Elements ---
  // Apply the deltaOffset to markers to keep them in the correct relative position
  if (highlightedSatellite) {
    highlightedSatellite.position.add(deltaOffset);
  }
  if (selectedSatellite) {
    selectedSatellite.position.add(deltaOffset);
  }

  // Clear trajectories as they are relative to the old frame/offset
  clearTrajectory();
  clearSelectedTrajectory();
  // If a satellite was selected, re-request its trajectory in the new frame
  if (selectedIndex !== -1) {
    requestTrajectory(selectedIndex);
  }

  // 7. Update all object positions based on the *new* sceneOffset
  // This recalculates all celestial body positions with the new offset applied.
  updatePositions();
}

// Add event listeners to target buttons
targetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setCameraTarget(button.dataset.target);
  });
});

// Set initial active button state
document
  .querySelector('#target-controls button[data-target="sun"]')
  .classList.add("active");

let lastUpdateTime = new Date();
function update() {
  // Update controls
  controls.update();

  // Update positions and selected info if in real-time mode
  if (isRealTime) {
    const now = new Date();
    const elapsedTimeMs = now - lastUpdateTime;

    if (
      elapsedTimeMs >= config.REALTIME_UPDATE_INTERVAL_MS &&
      tleData.length > 0
    ) {
      currentTime = now;
      updatePositions();
      lastUpdateTime = now;
    }
  } else if (currentTime != lastUpdateTime) {
    updatePositions();
    lastUpdateTime = currentTime;
  }
}

function render() {
  document.getElementById("time").textContent = currentTime.toLocaleString();

  // Update Earth shader uniforms for correct lighting and cloud animation
  if (earth.material.uniforms) {
    // Check if uniforms exist
    // Sun's world position (scene origin)
    const sunWorldPosition = sun.position;
    earth.material.uniforms.sunPosition.value.copy(sunWorldPosition);

    // Time for cloud animation
    earth.material.uniforms.time.value = performance.now() / 1000.0;
  }

  // Update planet tooltips
  updatePlanetTooltips();

  renderer.render(scene, camera);
}

// --- Animation Loop ---
function animate() {
  update();
  render();

  requestAnimationFrame(animate);
}

// --- Start the application ---
// 1. Start rendering loop immediately (shows Earth)
animate();

// 2. Start fetching and processing satellite data in the background
initTLEs(); // This is async, won't block rendering

// Function to update planet tooltips
function updatePlanetTooltips() {
  const width = renderer.domElement.clientWidth;
  const height = renderer.domElement.clientHeight;
  const cameraPosition = camera.position; // Cache camera position

  Object.keys(targetObjects).forEach((planetName) => {
    const planet = targetObjects[planetName];
    const tooltip = planetTooltips[planetName];

    if (!planet || !tooltip) return; // Skip if planet or tooltip missing

    // Hide tooltip if it's the current camera target
    if (planet === cameraTargetObject) {
      tooltip.style.display = "none";
      return;
    }

    // Calculate screen position
    const worldPosition = new THREE.Vector3();
    planet.getWorldPosition(worldPosition); // Get world position

    // Check if the planet is roughly behind the camera (simple check)
    const vectorToPlanet = worldPosition.clone().sub(cameraPosition);
    if (camera.getWorldDirection(new THREE.Vector3()).dot(vectorToPlanet) < 0) {
      tooltip.style.display = "none";
      return;
    }

    // Project to screen space
    const screenPosition = worldPosition.clone().project(camera);

    // Convert NDC (-1 to +1) to screen coordinates (pixels)
    const screenX = (screenPosition.x * 0.5 + 0.5) * width;
    const screenY = (-screenPosition.y * 0.5 + 0.5) * height;

    // Check if the projected point is within the screen bounds (NDC z check handles points behind camera)
    const isBehindCamera = screenPosition.z > 1.0;
    const isOnScreen =
      screenX >= 0 &&
      screenX <= width &&
      screenY >= 0 &&
      screenY <= height &&
      !isBehindCamera;

    if (isOnScreen) {
      tooltip.style.left = `${screenX}px`;
      tooltip.style.top = `${screenY}px`;
      tooltip.style.display = "block";
    } else {
      tooltip.style.display = "none";
    }
  });
}
