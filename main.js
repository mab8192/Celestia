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
let highlightedSatellite = null;
let highlightedIndex = -1;
let selectedSatellite = null;
let selectedIndex = -1;

// --- Satellite Data and Rendering Placeholder ---
let tleData = []; // Initialize as empty array
let satellites;
let satelliteCount = 0; // Track how many satellites are actually loaded

// Create an instanced mesh for satellites instead of points
const satelliteGeometry = new THREE.SphereGeometry(0.005, 16, 16); // Small sphere
const satelliteMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff
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
scene.add(satellites);

// Matrix for position updates
const satelliteMatrix = new THREE.Matrix4();

// --- Trajectories ---
let currentTrajectory = null; // Track the trajectory for the currently highlighted object
let selectedTrajectory = null; // Track the trajectory for the currently selected object

// --- Global State ---
let currentTime = new Date();
let isRealTime = false;
let initialDataLoaded = false; // Flag to track if initial load is done

// --- Web worker ---
const worker = new Worker("propagation_worker.js");

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

  // Temporary vectors for calculations
  const satEciKm = new THREE.Vector3();
  const satEclipticKm = new THREE.Vector3();

  if (type === "POSITIONS_UPDATE") {
    // Ensure we don't write past the buffer
    if (startIndex + count > config.MAX_SATELLITES) {
      console.warn("Received more satellite data than allocated buffer size.");
      return;
    }

    // Update instance matrices for each satellite
    for (let i = 0; i < count; i++) {
      const instanceIndex = startIndex + i;

      // Set position (relative to Earth)
      satelliteMatrix.makeTranslation(
        batchPositions[i].x + earthPos.x,
        batchPositions[i].y + earthPos.y,
        batchPositions[i].z + earthPos.z
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
    }
    if (highlightedIndex !== -1) {
      // Update marker position, but info panel is handled by hover
      if (highlightedSatellite) {
        // Get position from instanced mesh
        satellites.getMatrixAt(highlightedIndex, satelliteMatrix);
        const position = new THREE.Vector3();
        position.setFromMatrixPosition(satelliteMatrix);
        highlightedSatellite.position.copy(position);
      }
    }
  } else if (type === "TRAJECTORY_DATA") {
    // Received orbital trajectory data

    // Move trajectory points so they're around earth
    trajectoryPoints.forEach((point) => {
      point.x += earthPos.x;
      point.y += earthPos.y;
      point.z += earthPos.z;
    });

    if (satelliteIndex === selectedIndex) {
      // Trajectory is for the currently SELECTED satellite
      if (selectedTrajectory) {
        selectedTrajectory.geometry.dispose();
        selectedTrajectory.material.dispose();
        scene.remove(selectedTrajectory);
      }
      selectedTrajectory = buildTrajectoryLine(
        trajectoryPoints,
        config.SELECTION_COLOR
      ); // Use selection color
      scene.add(selectedTrajectory);
    } else if (satelliteIndex === highlightedIndex) {
      // Trajectory is for the currently HIGHLIGHTED (hovered) satellite
      // Only add if the highlight is still active for this index
      if (currentTrajectory) {
        currentTrajectory.geometry.dispose();
        currentTrajectory.material.dispose();
        scene.remove(currentTrajectory);
      }
      currentTrajectory = buildTrajectoryLine(
        trajectoryPoints,
        config.HIGHLIGHT_COLOR
      ); // Use highlight color
      scene.add(currentTrajectory);
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

  return new THREE.Line(lineGeometry, lineMaterial);
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
  const moonPosAU = getMoonPosition(currentTime, earthPosAU); // Geocentric AU

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

  // --- Moon Position Calculation Refinement ---
  // Convert moon's geocentric AU position to heliocentric AU
  const moonHelioAU = earthPosAU.clone().add(moonPosAU);
  // Scale moon's heliocentric position
  const moonAbsPosScaled = moonHelioAU.multiplyScalar(scaleFactor);

  // Apply the CURRENT sceneOffset to the ABSOLUTE positions to get final scene position
  // Sun is always at the heliocentric origin (0,0,0) before offset
  sun.position.copy(new THREE.Vector3(0,0,0)).add(sceneOffset);
  mercury.position.copy(mercuryAbsPos).add(sceneOffset);
  venus.position.copy(venusAbsPos).add(sceneOffset);
  earth.position.copy(earthAbsPos).add(sceneOffset); // Earth's final position in the scene
  mars.position.copy(marsAbsPos).add(sceneOffset);
  jupiter.position.copy(jupiterAbsPos).add(sceneOffset);
  saturn.position.copy(saturnAbsPos).add(sceneOffset);
  uranus.position.copy(uranusAbsPos).add(sceneOffset);
  neptune.position.copy(neptuneAbsPos).add(sceneOffset);
  pluto.position.copy(plutoAbsPos).add(sceneOffset);
  moon.position.copy(moonAbsPosScaled).add(sceneOffset); // Use scaled heliocentric position


  // --- Update Axial Rotations ---
  // Earth rotation based on GMST, adjusted for initial texture alignment (+Z axis)
  const gmst = satellite.gstime(currentTime);
  earth.rotation.y = gmst + Math.PI / 2;

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

  // Approximate rotations for other planets (can be refined with precise periods)
  // Calculate rotation based on elapsed time since an arbitrary epoch (e.g., J2000)
  const J2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
  const elapsedDays =
    (currentTime.getTime() - J2000.getTime()) / (1000 * 60 * 60 * 24);

  // Rotation = (elapsedDays / siderealPeriodDays) * 2 * PI
  // Note: Need to check initial tilt axes in celestial.js for consistency
  mercury.rotation.y = (elapsedDays / 58.65) * 2 * Math.PI;
  venus.rotation.y = (elapsedDays / -243.02) * 2 * Math.PI; // Retrograde
  mars.rotation.y = (elapsedDays / 1.026) * 2 * Math.PI;
  jupiter.rotation.y = (elapsedDays / 0.414) * 2 * Math.PI;
  saturn.rotation.y = (elapsedDays / 0.444) * 2 * Math.PI;
  uranus.rotation.y = (elapsedDays / -0.718) * 2 * Math.PI; // Retrograde
  neptune.rotation.y = (elapsedDays / 0.671) * 2 * Math.PI;
  pluto.rotation.y = (elapsedDays / -6.387) * 2 * Math.PI; // Retrograde (Dwarf Planet)

  // --- End Celestial Body Updates ---

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
    currentTrajectory.geometry.dispose(); // Dispose geometry
    currentTrajectory.material.dispose(); // Dispose material
    scene.remove(currentTrajectory);
    currentTrajectory = null;
  }
  document.getElementById("satelliteInfo").style.display = "none";
}

function clearSelectedTrajectory() {
  if (selectedTrajectory) {
    selectedTrajectory.geometry.dispose(); // Dispose geometry
    selectedTrajectory.material.dispose(); // Dispose material
    scene.remove(selectedTrajectory);
    selectedTrajectory = null;
  }
}

// --- Functions for highlighting satellites on hover ---
function highlightSatellite(index) {
  // Store the index for comparison
  highlightedIndex = index;

  // Create a highlighted point
  const highlightGeometry = new THREE.SphereGeometry(0.02, 16, 16);
  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ffff, // Cyan for hover highlight
    transparent: true,
    opacity: 0.8,
  });

  highlightedSatellite = new THREE.Mesh(highlightGeometry, highlightMaterial);

  // Position the highlight at the satellite position
  satellites.getMatrixAt(index, satelliteMatrix);
  const satPosition = new THREE.Vector3();
  satPosition.setFromMatrixPosition(satelliteMatrix);
  highlightedSatellite.position.copy(satPosition);

  scene.add(highlightedSatellite);

  // Update the satellite info display using the specific panel
  displayInfoPanel(index, satelliteInfoPanel);

  // --- ADDED: Update marker position immediately on highlight/select ---
  // This ensures the marker appears instantly before the worker responds
  updateMarkerPosition(highlightedSatellite, index);
}

function resetHighlight() {
  if (highlightedSatellite) {
    scene.remove(highlightedSatellite);
    highlightedSatellite = null;
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

  // Create a highlighted point
  const selectionGeometry = new THREE.SphereGeometry(0.025, 16, 16); // Slightly larger
  const selectionMaterial = new THREE.MeshBasicMaterial({
    color: 0xffaa00, // Orange/Yellow for selection
    transparent: true,
    opacity: 0.9,
  });

  selectedSatellite = new THREE.Mesh(selectionGeometry, selectionMaterial);

  // Position the selection marker at the satellite position
  satellites.getMatrixAt(index, satelliteMatrix);
  const satPosition = new THREE.Vector3();
  satPosition.setFromMatrixPosition(satelliteMatrix);
  selectedSatellite.position.copy(satPosition);

  scene.add(selectedSatellite);

  // Update the selected satellite info display
  displayInfoPanel(index, selectedSatelliteInfoPanel);
  // Hide hover panel when selecting
  satelliteInfoPanel.style.display = "none";

  requestTrajectory(selectedIndex);

  // --- ADDED: Update marker position immediately on highlight/select ---
  // This ensures the marker appears instantly before the worker responds
  updateMarkerPosition(selectedSatellite, index);
}

function clearSelection() {
  if (selectedSatellite) {
    scene.remove(selectedSatellite);
    selectedSatellite = null;
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
    ? "⏸" // Pause icon
    : "▶"; // Play icon
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

  // Raycasting
  raycaster.setFromCamera(mouse, camera);

  // Calculate objects intersecting the picking ray
  const intersects = raycaster.intersectObjects([satellites, earth], true);

  let currentHoverIndex = -1; // Track index hovered this frame

  if (intersects.length > 0 && intersects[0].object !== earth) {
    // We hit a satellite - instanced meshes return instanceId
    const index = intersects[0].instanceId;
    currentHoverIndex = index;

    // Only process if it's a different satellite than currently highlighted
    if (index !== highlightedIndex) {
      resetHighlight(); // Remove previous highlight
      highlightSatellite(index); // Highlight the new satellite
      if (index !== selectedIndex) {
        // Don't request hover trajectory if it's already selected
        requestTrajectory(index); // Request hover trajectory
      }
    }
  } else {
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
Object.keys(targetObjects).forEach(planetName => {
    const tooltipId = `tooltip-${planetName}`;
    const element = document.getElementById(tooltipId);

    if (element) {
        planetTooltips[planetName] = element;
        // Add double-click listener
        element.addEventListener('dblclick', () => {
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

  if (targetName === 'sun') {
      targetAbsolutePosition = new THREE.Vector3(0, 0, 0); // Sun is heliocentric origin
  } else if (targetName === 'moon') {
      const earthPosAU = getPlanetPosition("earth", currentTime);
      const moonPosAU = getMoonPosition(currentTime, earthPosAU); // Geocentric AU
      const moonHelioAU = earthPosAU.clone().add(moonPosAU); // Heliocentric AU
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
  const cameraOffsetVector = new THREE.Vector3(newDistance, newDistance / 2, newDistance);
  const desiredCameraPositionAbsolute = targetAbsolutePosition.clone().add(cameraOffsetVector);

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
  const maxDistFactor = (targetName === 'sun' || targetName === 'jupiter' || targetName === 'saturn')
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

    Object.keys(targetObjects).forEach(planetName => {
        const planet = targetObjects[planetName];
        const tooltip = planetTooltips[planetName];

        if (!planet || !tooltip) return; // Skip if planet or tooltip missing

        // Hide tooltip if it's the current camera target
        if (planet === cameraTargetObject) {
            tooltip.style.display = 'none';
            return;
        }

        // Calculate screen position
        const worldPosition = new THREE.Vector3();
        planet.getWorldPosition(worldPosition); // Get world position

        // Check if the planet is roughly behind the camera (simple check)
        const vectorToPlanet = worldPosition.clone().sub(cameraPosition);
        if (camera.getWorldDirection(new THREE.Vector3()).dot(vectorToPlanet) < 0) {
             tooltip.style.display = 'none';
             return;
        }

        // Project to screen space
        const screenPosition = worldPosition.clone().project(camera);

        // Convert NDC (-1 to +1) to screen coordinates (pixels)
        const screenX = (screenPosition.x * 0.5 + 0.5) * width;
        const screenY = (-screenPosition.y * 0.5 + 0.5) * height;

        // Check if the projected point is within the screen bounds (NDC z check handles points behind camera)
        const isBehindCamera = screenPosition.z > 1.0;
        const isOnScreen = screenX >= 0 && screenX <= width && screenY >= 0 && screenY <= height && !isBehindCamera;

        if (isOnScreen) {
            tooltip.style.left = `${screenX}px`;
            tooltip.style.top = `${screenY}px`;
            tooltip.style.display = 'block';
        } else {
            tooltip.style.display = 'none';
        }
    });
}
