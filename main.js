import * as config from "./config.js";
import { searchSatellite } from "./search.js";
import {
  getStarfield,
  getEarth,
  getMoon,
  getSun,
  getMoonPosition,
  getMercury,
  getVenus,
  getMars,
  getJupiter,
  getSaturn,
  getUranus,
  getNeptune,
  getPluto,
} from "./celestial.js";

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

const renderer = new THREE.WebGLRenderer({ antialias: true }); // Added antialias for smoother edges
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const starfield = getStarfield();
scene.add(starfield);

const { sun, sunlight } = getSun();
scene.add(sun);
scene.add(sunlight);

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
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);
controls.enablePan = false;
controls.minDistance = 1.5;
controls.maxDistance = 500;
camera.position.x = 10;
camera.position.y = 10;
camera.position.z = 10;

// --- Raycasting and Interaction ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let highlightedSatellite = null;
let highlightedIndex = -1;
let selectedSatellite = null;
let selectedIndex = -1;

raycaster.params.Points.threshold = config.RAYCASTER_POINT_THRESHOLD;

// --- Satellite Data and Rendering Placeholder ---
let tleData = []; // Initialize as empty array
let satellites;
let satGeometry;
let satelliteCount = 0; // Track how many satellites are actually loaded

const positions = new Float32Array(config.MAX_SATELLITES * 3); // x, y, z for each
positions.fill(0.0);

satGeometry = new THREE.BufferGeometry();
satGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

const satMaterial = new THREE.PointsMaterial({
  size: 0.02,
  color: 0xffffff,
  sizeAttenuation: true, // Points get smaller further away
});

satellites = new THREE.Points(satGeometry, satMaterial);
scene.add(satellites); // Add the empty container to the scene

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

  if (type === "POSITIONS_UPDATE") {
    // Ensure we don't write past the buffer
    if (startIndex + count > config.MAX_SATELLITES) {
      console.warn("Received more satellite data than allocated buffer size.");
      return;
    }

    // Update the positions buffer at the correct offset
    const positionsArray = satGeometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const bufferIndex = (startIndex + i) * 3;
      positionsArray[bufferIndex] = batchPositions[i].x;
      positionsArray[bufferIndex + 1] = batchPositions[i].y;
      positionsArray[bufferIndex + 2] = batchPositions[i].z;
    }

    // Mark the buffer segment as needing update
    satGeometry.attributes.position.needsUpdate = true;

    // Update draw range and count
    const newTotalCount = startIndex + count;
    if (newTotalCount > satGeometry.drawRange.count) {
      satGeometry.setDrawRange(0, newTotalCount);
      satelliteCount = newTotalCount;
    }

    // Update bounding sphere
    satGeometry.computeBoundingSphere();

    // If this message contains the last batch of the initial load
    if (!initialDataLoaded && satelliteCount === tleData.length) {
      initialDataLoaded = true;
      console.log(`Finished loading initial ${satelliteCount} satellites.`);
    }

    // Update selected/highlighted satellite info panel and marker positions
    if (selectedIndex !== -1) {
      displayInfoPanel(selectedIndex, selectedSatelliteInfoPanel);
      if (selectedSatellite) {
        // Ensure marker exists
        selectedSatellite.position.set(
          positionsArray[selectedIndex * 3],
          positionsArray[selectedIndex * 3 + 1],
          positionsArray[selectedIndex * 3 + 2]
        );
      }
    }
    if (highlightedIndex !== -1) {
      // Update marker position, but info panel is handled by hover
      if (highlightedSatellite) {
        // Ensure marker exists
        highlightedSatellite.position.set(
          positionsArray[highlightedIndex * 3],
          positionsArray[highlightedIndex * 3 + 1],
          positionsArray[highlightedIndex * 3 + 2]
        );
      }
    }
  } else if (type === "TRAJECTORY_DATA") {
    // Received orbital trajectory data

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
    } else {
      // Trajectory data arrived, but the user is no longer hovering over (or selecting)
      // the satellite it was requested for. Discard the data.
      // console.log(`Discarding stale trajectory data for index ${satelliteIndex}`);
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

    initialDataLoaded = true; // Mark initial data as loaded
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

// Function to request position updates from the worker
function updatePositions() {
  // Only send data if we actually have TLEs loaded
  if (tleData && tleData.length > 0) {
    // console.log( // Reduce console noise
    //   `Requesting position update for ${
    //     tleData.length
    //   } satellites at time: ${currentTime.toISOString()}`
    // );
    // Send the *entire* current TLE dataset and the desired time
    // The worker will process this and send back results incrementally
    worker.postMessage({
      type: "CALCULATE_POSITIONS", // Add a type for clarity
      tleData: tleData, // Send the full data set
      time: currentTime.toISOString(), // Send time as ISO string
    });
  } else {
    // console.log("Skipping position update: TLE data not yet loaded.");
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
  const satPosition = new THREE.Vector3(
    satGeometry.attributes.position.array[index * 3],
    satGeometry.attributes.position.array[index * 3 + 1],
    satGeometry.attributes.position.array[index * 3 + 2]
  );
  highlightedSatellite.position.copy(satPosition);

  scene.add(highlightedSatellite);

  // Update the satellite info display using the specific panel
  displayInfoPanel(index, satelliteInfoPanel);
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
  const satPosition = new THREE.Vector3(
    satGeometry.attributes.position.array[index * 3],
    satGeometry.attributes.position.array[index * 3 + 1],
    satGeometry.attributes.position.array[index * 3 + 2]
  );
  selectedSatellite.position.copy(satPosition);

  scene.add(selectedSatellite);

  // Update the selected satellite info display
  displayInfoPanel(index, selectedSatelliteInfoPanel);
  // Hide hover panel when selecting
  satelliteInfoPanel.style.display = "none";

  requestTrajectory(selectedIndex);
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
  const intersects = raycaster.intersectObjects([satellites, earth]);

  let currentHoverIndex = -1; // Track index hovered this frame

  if (intersects.length > 0 && intersects[0].object != earth) {
    // We hit a satellite
    const index = intersects[0].index;
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

let lastUpdateTime = new Date();

// --- Animation loop ---
const initialMoonFaceDirection = new THREE.Vector3(0, 0, -1); // Assume texture faces -Z locally
const rotationQuaternion = new THREE.Quaternion();
const earthDirection = new THREE.Vector3();

// --- Camera Target Tracking ---
let cameraTargetObject = earth; // Default target is Earth
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
  pluto: pluto
};
const targetButtons = document.querySelectorAll("#target-controls button");

// Function to set the active target
function setCameraTarget(targetName) {
  const newTarget = targetObjects[targetName];
  if (newTarget && newTarget !== cameraTargetObject) {
    console.log(`Setting camera target to: ${targetName}`);
    cameraTargetObject = newTarget;

    // Update button active states
    targetButtons.forEach((button) => {
      if (button.dataset.target === targetName) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    });

    // Adjust camera distance based on target for better initial view (optional)
    let newDistance = 3; // Default for Earth
    if (cameraTargetObject === moon) {
      newDistance = config.MOON_RADIUS * 3;
    } else if (cameraTargetObject === sun) {
      newDistance = config.SUN_RADIUS * 3;
    } else if (cameraTargetObject === mercury) {
      newDistance = config.MERCURY_RADIUS * 3;
    } else if (cameraTargetObject === venus) {
      newDistance = config.VENUS_RADIUS * 3;
    } else if (cameraTargetObject === mars) {
      newDistance = config.MARS_RADIUS * 3;
    } else if (cameraTargetObject === jupiter) {
      newDistance = config.JUPITER_RADIUS * 3;
    } else if (cameraTargetObject === saturn) {
      newDistance = config.SATURN_RADIUS * 3;
    } else if (cameraTargetObject === uranus) {
      newDistance = config.URANUS_RADIUS * 3;
    } else if (cameraTargetObject === neptune) {
      newDistance = config.NEPTUNE_RADIUS * 3;
    } else if (cameraTargetObject === pluto) {
      newDistance = config.PLUTO_RADIUS * 3;
    }

    // Smoothly move camera - more complex, requires tweening library or manual lerp
    // For simplicity, just set the controls target directly (will jump)
    controls.target.copy(cameraTargetObject.position);
    controls.minDistance = newDistance / 2; // Adjust min/max distance too
    controls.maxDistance = newDistance * 10;
    camera.position.set(
      cameraTargetObject.position.x + newDistance,
      cameraTargetObject.position.y + newDistance / 2,
      cameraTargetObject.position.z + newDistance
    ); // Reposition camera
  }
}

// Add event listeners to target buttons
targetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setCameraTarget(button.dataset.target);
  });
});

// Set initial active button state
document
  .querySelector('#target-controls button[data-target="earth"]')
  .classList.add("active");

function animate() {
  requestAnimationFrame(animate);

  const elapsedSeconds = performance.now() / 1000.0; // Get elapsed time in seconds
  earthMaterial.uniforms.time.value = elapsedSeconds; // Update shader time uniform

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
  }

  // --- Moon Position Update ---
  const moonPosKm = getMoonPosition(currentTime);
  moon.position.set(
    moonPosKm.x * config.SCALE, // Scene X = ECI X
    moonPosKm.z * config.SCALE, // Scene Y (up) = ECI Z (north/south)
    -moonPosKm.y * config.SCALE // Scene Z = -ECI Y
  );

  // --- Moon Rotation (Tidal Lock) ---
  // 1. Calculate direction from Moon to Earth (origin)
  earthDirection.copy(moon.position).negate().normalize();

  // 2. Calculate rotation needed to align Moon's initial face (-Z) with Earth direction
  rotationQuaternion.setFromUnitVectors(
    initialMoonFaceDirection,
    earthDirection
  );

  // 3. Apply the rotation
  moon.quaternion.copy(rotationQuaternion);

  // Update position of the highlighted satellite mesh if it exists
  if (
    highlightedSatellite &&
    highlightedIndex >= 0 &&
    highlightedIndex < satelliteCount
  ) {
    highlightedSatellite.position.set(
      satGeometry.attributes.position.array[highlightedIndex * 3],
      satGeometry.attributes.position.array[highlightedIndex * 3 + 1],
      satGeometry.attributes.position.array[highlightedIndex * 3 + 2]
    );
  }

  // Update position of the selected satellite mesh if it exists
  if (
    selectedSatellite &&
    selectedIndex >= 0 &&
    selectedIndex < satelliteCount
  ) {
    selectedSatellite.position.set(
      satGeometry.attributes.position.array[selectedIndex * 3],
      satGeometry.attributes.position.array[selectedIndex * 3 + 1],
      satGeometry.attributes.position.array[selectedIndex * 3 + 2]
    );
  }

  // Update time display regardless
  document.getElementById("time").textContent = currentTime.toLocaleString();

  // --- Earth Rotation ---
  // Calculate GMST angle in radians
  const gmst = satellite.gstime(currentTime);
  // Apply rotation. The texture center (0 deg lon) should align with the meridian indicated by GMST.
  // If the texture center (u=0.5) initially aligns with +Z, a rotation of `gmst` radians
  // around the Y-axis will position the 0-degree meridian correctly relative to the ECI frame.
  // We might need a small offset depending on the initial texture mapping orientation.
  // Let's start with just GMST.
  earth.rotation.y = gmst;

  // Update Sun position
  sunlight.position.copy(sun.position);

  // --- Update Camera Target ---
  if (cameraTargetObject) {
    controls.target.copy(cameraTargetObject.position);
  }

  controls.update();
  renderer.render(scene, camera);
}

// --- Start the application ---
// 1. Start rendering loop immediately (shows Earth)
animate();

// 2. Start fetching and processing satellite data in the background
initTLEs(); // This is async, won't block rendering
