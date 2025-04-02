import * as config from "./config.js";

// Get UI elements for search
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');

const satelliteInfoPanel = document.getElementById('satelliteInfo');
const selectedSatelliteInfoPanel = document.getElementById('selectedSatelliteInfo');

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100000
);
const textureLoader = new THREE.TextureLoader();
const renderer = new THREE.WebGLRenderer({ antialias: true }); // Added antialias for smoother edges
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Starfield setup
const starTexture = textureLoader.load("assets/universe.png");
const starGeometry = new THREE.SphereGeometry(config.STARFIELD_SPHERE_RADIUS, config.PLANET_GEOMETRY_DETAIL, config.PLANET_GEOMETRY_DETAIL); // Large sphere
const starMaterial = new THREE.MeshBasicMaterial({
  map: starTexture,
  side: THREE.BackSide, // Render texture inside the sphere
});
const starField = new THREE.Mesh(starGeometry, starMaterial);
scene.add(starField);

// --- Sun setup ---
const sunGeometry = new THREE.SphereGeometry(config.SUN_RADIUS, config.SUN_GEOMETRY_DETAIL / 2, config.SUN_GEOMETRY_DETAIL / 2);
const sunTexture = textureLoader.load("assets/sun.jpg");
const sunMaterial = new THREE.MeshBasicMaterial({
  map: sunTexture,
});
const sun = new THREE.Mesh(sunGeometry, sunMaterial);

sun.position.set(config.SUN_DISTANCE, 0, 0); // Sun in +X direction, adjust as needed

scene.add(sun);

const sunlight = new THREE.DirectionalLight(0xffffff, 1.5);
sunlight.position.set(config.SUN_DISTANCE, 0, 0); // Same as Sun's position
sunlight.castShadow = true; // Enable shadows (optional)
scene.add(sunlight);

// --- Earth Setup ---
const dayTexture = textureLoader.load("assets/earth.jpg");
const nightTexture = textureLoader.load("assets/earth_night.jpg");
const normalMap = textureLoader.load("assets/earth_normal.tif");
const specularMap = textureLoader.load("assets/earth_specular.tif");
const earthMaterial = new THREE.ShaderMaterial({
  uniforms: {
    dayTexture: { value: dayTexture },
    nightTexture: { value: nightTexture },
    normalMap: { value: normalMap },
    specularMap: { value: specularMap },
    sunPosition: { value: sun.position }, // Sun's position as Vector3
    modelMatrix: { value: new THREE.Matrix4() }, // Earth's model matrix
    cameraViewMatrix: { value: new THREE.Matrix4() }, // View matrix
  },
  vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;

        void main() {
            vUv = uv;

            // Calculate normal in world space
            vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

            // Calculate vertex position in world space
            vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
  fragmentShader: `
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform sampler2D normalMap;
        uniform sampler2D specularMap;
        uniform vec3 sunPosition;
        uniform mat4 modelMatrix;
        uniform mat4 cameraViewMatrix;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;

        void main() {
            // Calculate light direction in world space
            vec3 lightDir = normalize(sunPosition - vWorldPosition);

            // Use the world-space normal for lighting calculation
            float intensity = max(dot(vNormal, lightDir), 0.0);

            // Blend between night and day textures based on light intensity
            vec4 dayColor = texture2D(dayTexture, vUv);
            vec4 nightColor = texture2D(nightTexture, vUv);
            vec4 color = mix(nightColor, dayColor, intensity);

            // Apply normal mapping for more detailed lighting
            vec3 normalMapValue = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;

            // Simple specular highlight using the normal map
            float specular = 0.0;
            if (intensity > 0.0) {
                // Transform normal from tangent space to world space (simplified)
                vec3 worldNormal = normalize(vNormal + normalMapValue.x * vec3(1.0, 0.0, 0.0) + normalMapValue.y * vec3(0.0, 1.0, 0.0));

                // Calculate view direction
                vec3 viewDir = normalize(-vWorldPosition);

                // Calculate reflection vector
                vec3 reflectDir = reflect(-lightDir, worldNormal);

                // Calculate specular component
                float specularStrength = texture2D(specularMap, vUv).r;
                specular = pow(max(dot(viewDir, reflectDir), 0.0), 32.0) * specularStrength;
            }

            // Add specular to final color
            gl_FragColor = vec4(color.rgb + vec3(specular), 1.0);
        }
    `,
  vertexColors: true,
});
const earthGeometry = new THREE.SphereGeometry(1, config.PLANET_GEOMETRY_DETAIL, config.PLANET_GEOMETRY_DETAIL); // Increased segments for smoother sphere
const earth = new THREE.Mesh(earthGeometry, earthMaterial);
earth.rotation.z = THREE.MathUtils.degToRad(23.5); // tilt at 23.5 deg

earth.castShadow = true;
earth.receiveShadow = true;
renderer.shadowMap.enabled = true; // Enable shadow rendering
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows

scene.add(earth);

// --- Camera controls ---
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05; // Smoother damping
controls.target.set(0, 0, 0);
controls.enablePan = false;
controls.minDistance = 1.5;
controls.maxDistance = 50;
camera.position.x = 10;
camera.position.y = 10;
camera.position.z = 10; // Start further back

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
const MAX_SATELLITES = config.MAX_SATELLITES; // Pre-allocated buffer size
let satelliteCount = 0; // Track how many satellites are actually loaded

const positions = new Float32Array(MAX_SATELLITES * 3); // x, y, z for each
positions.fill(0.0);

satGeometry = new THREE.BufferGeometry();
satGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

const satMaterial = new THREE.PointsMaterial({
  size: 0.01,
  color: 0xffffff,
  sizeAttenuation: true, // Points get smaller further away
});

satellites = new THREE.Points(satGeometry, satMaterial);
scene.add(satellites); // Add the empty container to the scene

const axesHelper = new THREE.AxesHelper( 5 );
scene.add( axesHelper );

// --- Trajectories ---
let currentTrajectory = null; // Track the trajectory for the currently highlighted object
let selectedTrajectory = null; // Track the trajectory for the currently selected object

// --- Global State ---
let currentTime = new Date();
let isRealTime = false;
let initialDataLoaded = false; // Flag to track if initial load is done

// --- Web worker ---
const worker = new Worker("worker.js");

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
    if (startIndex + count > MAX_SATELLITES) {
      console.warn("Received more satellite data than allocated buffer size.");
      return;
    }

    // Update the positions buffer at the correct offset
    for (let i = 0; i < count; i++) {
      const bufferIndex = (startIndex + i) * 3;
      satGeometry.attributes.position.array[bufferIndex] = batchPositions[i].x;
      satGeometry.attributes.position.array[bufferIndex + 1] =
        batchPositions[i].y;
      satGeometry.attributes.position.array[bufferIndex + 2] =
        batchPositions[i].z;
    }

    // Mark the buffer segment as needing update
    satGeometry.attributes.position.needsUpdate = true;

    // Increase the number of satellites to draw
    // Ensure we only update if this batch increases the count
    const newTotalCount = startIndex + count;
    if (newTotalCount > satGeometry.drawRange.count) {
      satGeometry.setDrawRange(0, newTotalCount);
      satelliteCount = newTotalCount; // Update global count
    }

    // Update bounding sphere
    satGeometry.computeBoundingSphere();

    // If this message contains the last batch of the initial load
    if (satelliteCount === tleData.length) {
      initialDataLoaded = true;
      console.log(`Finished loading initial ${satelliteCount} satellites.`);
    }
  } else if (type === "TRAJECTORY_DATA") {
    // Received orbital trajectory data - create a line from it
    if (satelliteIndex === selectedIndex) {
      if (selectedTrajectory) scene.remove(selectedTrajectory);
      console.log("Adding selected trajectory");
      selectedTrajectory = buildTrajectoryLine(trajectoryPoints, 0xff0000);
      scene.add(selectedTrajectory);
    } else {
      if (currentTrajectory) scene.remove(currentTrajectory);
      currentTrajectory = buildTrajectoryLine(trajectoryPoints, 0x00ffff);
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

// --- Satellite Initialization (Asynchronous) ---
async function initSatellites() {
  try {
    // Fetch raw TLE text data
    const text = await fetchTLE();

    // Parse TLE text into objects
    const lines = text.trim().split("\n");
    const parsedTleData = [];
    for (let i = 0; i < lines.length; i += 3) {
      // Ensure we have all three lines for a complete TLE set
      if (lines[i + 1] && lines[i + 2]) {
        const tleLine0 = lines[i].trim();      // Satellite Name
        const tleLine1 = lines[i + 1].trim();
        const tleLine2 = lines[i + 2].trim();

        // Extract NORAD Catalog ID from Line 1 (positions 3-7, 1-based index)
        // Check if the line starts with '1 ' to be more robust
        let noradId = null;
        if (tleLine1.startsWith('1 ')) {
            noradId = parseInt(tleLine1.substring(2, 7));
        } else {
            console.warn(`Could not parse NORAD ID from TLE line 1: ${tleLine1}`);
        }

        // Only add if we successfully parsed the NORAD ID
        if (noradId !== null && !isNaN(noradId)) {
            parsedTleData.push({
                OBJECT_NAME: tleLine0,
                TLE_LINE1: tleLine1,
                TLE_LINE2: tleLine2,
                NORAD_CAT_ID: noradId, // Use NORAD_CAT_ID consistently
            });
        } else {
             console.warn(`Skipping TLE entry due to missing/invalid NORAD ID. Name: ${tleLine0}`);
        }
      }
    }
    console.log(`Parsed ${parsedTleData.length} TLE entries.`);

    // Assign parsed data to the global tleData variable
    tleData = parsedTleData;

    // Limit the number of satellites if necessary
    if (tleData.length > MAX_SATELLITES) {
        console.warn(`TLE data (${tleData.length}) exceeds MAX_SATELLITES (${MAX_SATELLITES}). Truncating.`);
        tleData = tleData.slice(0, MAX_SATELLITES);
    }

    // Initial position calculation
    updatePositions();

    initialDataLoaded = true; // Mark initial data as loaded

    // Add event listeners for search *after* data is loaded and parsed
    searchButton.addEventListener('click', searchSatellite);
    searchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            searchSatellite();
        }
    });

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
        const satrec = satellite.twoline2satrec(satelliteData.TLE_LINE1, satelliteData.TLE_LINE2);

        // Calculate orbital parameters
        const semiMajorAxisKm = (satrec.a * config.EARTH_RADIUS_KM);
        const apogeeKm = semiMajorAxisKm * (1 + satrec.ecco) - config.EARTH_RADIUS_KM;
        const perigeeKm = semiMajorAxisKm * (1 - satrec.ecco) - config.EARTH_RADIUS_KM;
        const inclinationDeg = satrec.inclo * (180 / Math.PI); // Convert radians to degrees
        const periodMin = (2 * Math.PI) / satrec.no; // Period in minutes

        // Calculate current Lat/Lon/Alt based on global currentTime
        const gmst = satellite.gstime(currentTime);
        const positionAndVelocity = satellite.propagate(satrec, currentTime);

        let lat = 0, lon = 0, alt = 0;
        if (positionAndVelocity && positionAndVelocity.position) {
            const positionEciKm = positionAndVelocity.position;
            const positionGd = satellite.eciToGeodetic(positionEciKm, gmst);
            // latitude and longitude are provided in radians by eciToGeodetic
            lat = positionGd.latitude * (180 / Math.PI); // Convert radians to degrees
            lon = positionGd.longitude * (180 / Math.PI); // Convert radians to degrees
            // Ensure longitude is in the range -180 to +180
            while (lon < -180) { lon += 360; }
            while (lon > 180) { lon -= 360; }
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
        console.error("Error calculating satellite info for:", satelliteData.OBJECT_NAME, error);
        return `<div>Error loading info for ${satelliteData.OBJECT_NAME}</div>`; // Return error HTML
    }
}

// New function to display info in a specific panel
function displayInfoPanel(index, panelElement) {
    if (index < 0 || index >= tleData.length || !panelElement) {
        if(panelElement) panelElement.style.display = 'none';
        return;
    }

    const infoHTML = calculateSatelliteInfoHTML(index);

    if (infoHTML) {
        panelElement.innerHTML = infoHTML;
        panelElement.style.display = 'block';
    } else {
        panelElement.style.display = 'none'; // Hide if no data/error
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

    // Update selected satellite info panel when positions are updated
    if (selectedIndex !== -1) {
        displayInfoPanel(selectedIndex, selectedSatelliteInfoPanel);
    }

  } else {
    // console.log("Skipping position update: TLE data not yet loaded.");
  }
}

// Function to request a satellite's trajectory from the worker
function requestTrajectory(satelliteIndex) {
  if (tleData && tleData[satelliteIndex]) {
    console.log(
      `Requesting trajectory for satellite: ${tleData[satelliteIndex].OBJECT_NAME}`
    );

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
    // Hide hover info panel
    satelliteInfoPanel.style.display = "none";
  }
}

function selectSatellite(index) {
    // Reset previous selection effects first
    resetSelection();

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
    satelliteInfoPanel.style.display = 'none';
}

function resetSelection() {
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
  document.getElementById("play").textContent = "▶️"; // Set to Play icon
  stepTime(1);
});
document.getElementById("backward").addEventListener("click", () => {
  isRealTime = false;
  document.getElementById("play").textContent = "▶️"; // Set to Play icon
  stepTime(-1);
});
document.getElementById("play").addEventListener("click", () => {
  isRealTime = !isRealTime;
  document.getElementById("play").textContent = isRealTime
    ? "⏸️" // Pause icon
    : "▶️"; // Play icon
  if (isRealTime) {
    // When switching to real-time, update immediately
    currentTime = new Date();
    updatePositions(); // This will update selected info panel if needed
  }
});

function stepTime(direction) {
  // Step by 10 minutes for noticeable change
  currentTime = new Date(currentTime.getTime() + direction * 60 * 1000);
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
      if (index !== selectedIndex) { // Don't request hover trajectory if it's already selected
          requestTrajectory(index); // Request hover trajectory
      }
    }
  }

  // If no satellite is hovered in this frame, but one was highlighted previously, reset highlight
  if (currentHoverIndex === -1 && highlightedIndex !== -1) {
      resetHighlight();
      // Only clear the hover trajectory, not the selected one
      if (currentTrajectory) {
        scene.remove(currentTrajectory);
        currentTrajectory = null;
      }
  }
}

window.addEventListener("mousedown", onMouseDown, false);

function onMouseDown(event) {
  // If we clicked on a highlighted satellite that isn't already selected
  if (highlightedIndex !== -1 && highlightedIndex !== selectedIndex) {
      // Clear previous selection marker and trajectory
      resetSelection();
      // Select the new one
      selectSatellite(highlightedIndex);
      // Request its trajectory (as the selected trajectory)
      requestTrajectory(selectedIndex);
      // Clear the temporary hover trajectory
      if (currentTrajectory) {
        scene.remove(currentTrajectory);
        currentTrajectory = null;
      }
  }
}

let lastUpdateTime = new Date();
const updateIntervalMs = 500;

// --- Animation loop ---
function animate() {
  requestAnimationFrame(animate);

  // Update positions and selected info if in real-time mode
  if (isRealTime) {
    const now = new Date();
    const elapsedTimeMs = now - lastUpdateTime;

    // Update positions if half a second has passed and if initial data is loaded or TLE data exists
    if (elapsedTimeMs >= updateIntervalMs && tleData.length > 0) {
      currentTime = now;
      updatePositions(); // Will also update selected info panel
      lastUpdateTime = now; // Update the last update time
    }
  }

  // Update position of the highlighted satellite mesh if it exists
  if (highlightedSatellite && highlightedIndex >= 0 && highlightedIndex < satelliteCount) {
    highlightedSatellite.position.set(
      satGeometry.attributes.position.array[highlightedIndex * 3],
      satGeometry.attributes.position.array[highlightedIndex * 3 + 1],
      satGeometry.attributes.position.array[highlightedIndex * 3 + 2]
    );
  }

  // Update position of the selected satellite mesh if it exists
  if (selectedSatellite && selectedIndex >= 0 && selectedIndex < satelliteCount) {
    selectedSatellite.position.set(
      satGeometry.attributes.position.array[selectedIndex * 3],
      satGeometry.attributes.position.array[selectedIndex * 3 + 1],
      satGeometry.attributes.position.array[selectedIndex * 3 + 2]
    );
     // Update info panel in animation loop ONLY IF not updating frequently via time changes
     // Since we update in updatePositions/stepTime, this might be redundant unless time is paused
     // Let's keep it simple and rely on updates triggered by time changes for now.
     // If needed later: displayInfoPanel(selectedIndex, selectedSatelliteInfoPanel);
  }

  // Update time display regardless
  document.getElementById("time").textContent = currentTime.toUTCString();

  // --- Earth Rotation ---
  // Calculate Earth's rotation based on the current time
  const hours = currentTime.getUTCHours();
  const minutes = currentTime.getUTCMinutes();
  const seconds = currentTime.getUTCSeconds();
  const milliseconds = currentTime.getUTCMilliseconds();

  // Calculate fraction of the day elapsed in UTC (0 to 1)
  const fractionOfDay = (hours + minutes / 60 + seconds / 3600 + milliseconds / 3600000) / 24;

  // Calculate rotation angle in radians (2 * PI for a full rotation)
  // Assuming 0 rotation corresponds to midnight UTC, prime meridian facing away from the sun direction along the Z-axis perhaps.
  // Rotation increases eastward.
  const earthRotationY = fractionOfDay * 2 * Math.PI;

  // Apply the rotation around the Y axis (axis of rotation)
  // Add Math.PI (180 degrees) to correct the initial texture map orientation
  earth.rotation.y = earthRotationY + Math.PI;
  // Note: The existing earth.rotation.z sets the axial tilt.

  controls.update(); // required if controls.enableDamping or controls.autoRotate are set to true
  renderer.render(scene, camera);
}

// --- Start the application ---
// 1. Start rendering loop immediately (shows Earth)
animate();

// 2. Start fetching and processing satellite data in the background
initSatellites(); // This is async, won't block rendering

// Initial UI state for play button
document.getElementById("play").textContent = "▶️"; // Start with Play icon

// --- Search Functionality ---
function searchSatellite() {
    if (!tleData || tleData.length === 0) {
        console.warn("Satellite data not yet loaded for search.");
        return;
    }

    const searchTerm = searchInput.value.trim().toLowerCase();
    if (!searchTerm) return; // Do nothing if search is empty

    const foundIndex = tleData.findIndex(sat => {
        const nameMatch = sat.OBJECT_NAME && sat.OBJECT_NAME.toLowerCase().includes(searchTerm);
        // Ensure NORAD_CAT_ID is treated as a string for comparison
        const noradIdMatch = sat.NORAD_CAT_ID && String(sat.NORAD_CAT_ID).includes(searchTerm);
        return nameMatch || noradIdMatch;
    });

    if (foundIndex !== -1) {
        console.log(`Found satellite: ${tleData[foundIndex].OBJECT_NAME} (Index: ${foundIndex})`);
        // Before selecting, reset any previous selection
        resetSelection();
        selectSatellite(foundIndex);
        // Request trajectory for the newly selected satellite
        requestTrajectory(foundIndex);
        // Optional: Add camera focus logic here if desired
    } else {
        console.log(`Satellite matching "${searchTerm}" not found.`);
        alert(`Satellite matching "${searchTerm}" not found.`); // Basic user feedback
        resetSelection(); // Clear any previous selection if not found
    }
}

