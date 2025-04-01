// Add satellite info display element to DOM
const infoDiv = document.createElement("div");
infoDiv.id = "satelliteInfo";
infoDiv.style.position = "absolute";
infoDiv.style.top = "30px";
infoDiv.style.left = "10px";
infoDiv.style.padding = "10px";
infoDiv.style.backgroundColor = "rgba(0,0,0,0.7)";
infoDiv.style.color = "white";
infoDiv.style.borderRadius = "5px";
infoDiv.style.fontFamily = "monospace";
infoDiv.style.display = "none";
document.body.appendChild(infoDiv);

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
const starGeometry = new THREE.SphereGeometry(50000, 64, 64); // Large sphere
const starMaterial = new THREE.MeshBasicMaterial({
  map: starTexture,
  side: THREE.BackSide, // Render texture inside the sphere
});
const starField = new THREE.Mesh(starGeometry, starMaterial);
scene.add(starField);

// --- Sun setup ---
const SUN_DISTANCE = 23481; // 1 AU / 6371
const SUN_SIZE = 109; // sun radius / 6371 (~109x size of earth)

const sunGeometry = new THREE.SphereGeometry(SUN_SIZE, 32, 32);
const sunTexture = textureLoader.load("assets/sun.jpg");
const sunMaterial = new THREE.MeshBasicMaterial({
  map: sunTexture,
});
const sun = new THREE.Mesh(sunGeometry, sunMaterial);

sun.position.set(SUN_DISTANCE, 0, 0); // Sun in +X direction, adjust as needed

scene.add(sun);

const sunlight = new THREE.DirectionalLight(0xffffff, 1.5);
sunlight.position.set(SUN_DISTANCE, 0, 0); // Same as Sun's position
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
const earthGeometry = new THREE.SphereGeometry(1, 64, 64); // Increased segments for smoother sphere
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

raycaster.params.Points.threshold = 0.02;

// --- Satellite Data and Rendering Placeholder ---
let tleData = []; // Initialize as empty array
let satellites;
let satGeometry;
const MAX_SATELLITES = 20000; // Pre-allocated buffer size
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
  console.log("Starting satellite data fetch...");
  try {
    // Fetch raw TLE text data
    const text = await fetchTLE();

    // Parse TLE text into objects
    const lines = text.trim().split("\n");
    const parsedTleData = [];
    for (let i = 0; i < lines.length; i += 3) {
      if (lines[i + 1] && lines[i + 2]) {
        const tleLine1 = lines[i + 1].trim();
        // Robust NORAD ID extraction
        const match = tleLine1.match(/^1\s+(\d+)/);
        const noradId = match ? match[1] : null;
        if (noradId) {
          parsedTleData.push({
            OBJECT_NAME: lines[i].trim(),
            TLE_LINE1: tleLine1,
            TLE_LINE2: lines[i + 2].trim(),
            NORAD_ID: noradId,
          });
        } else {
          console.warn(`Could not parse NORAD ID from TLE line 1: ${tleLine1}`);
        }
      }
    }
    console.log(`Parsed ${parsedTleData.length} TLE entries.`);

    if (parsedTleData.length > MAX_SATELLITES) {
      console.warn(
        `Loaded ${parsedTleData.length} satellites, but buffer is only ${MAX_SATELLITES}. Truncating.`
      );
      tleData = parsedTleData.slice(0, MAX_SATELLITES);
    } else {
      tleData = parsedTleData;
    }

    // Now that TLE data is ready, send it to the worker for initial position calculation
    updatePositions();
  } catch (error) {
    console.error("Satellite initialization error:", error);
    // Handle error appropriately, e.g., show a message to the user
  }
}

// Function to request position updates from the worker
function updatePositions() {
  // Only send data if we actually have TLEs loaded
  if (tleData && tleData.length > 0) {
    console.log(
      `Requesting position update for ${
        tleData.length
      } satellites at time: ${currentTime.toISOString()}`
    );
    // Send the *entire* current TLE dataset and the desired time
    // The worker will process this and send back results incrementally
    worker.postMessage({
      type: "CALCULATE_POSITIONS", // Add a type for clarity
      tleData: tleData, // Send the full data set
      time: currentTime.toISOString(), // Send time as ISO string
    });
  } else {
    console.log("Skipping position update: TLE data not yet loaded.");
  }
}

// Function to request a satellite's trajectory from the worker
function requestTrajectory(satelliteIndex) {
  if (tleData && tleData[satelliteIndex]) {
    console.log(
      `Requesting trajectory for satellite: ${tleData[satelliteIndex].OBJECT_NAME}`
    );

    // Display satellite info
    const satellite = tleData[satelliteIndex];
    document.getElementById("satelliteInfo").innerHTML = `
            <div>Name: ${satellite.OBJECT_NAME}</div>
            <div>NORAD ID: ${satellite.NORAD_ID}</div>
        `;
    document.getElementById("satelliteInfo").style.display = "block";

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
    scene.remove(currentTrajectory);
    currentTrajectory = null;
  }
  document.getElementById("satelliteInfo").style.display = "none";
}

function clearSelectedTrajectory() {
  if (selectedTrajectory) {
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
    color: 0x00ffff,
    transparent: true,
    opacity: 0.8,
  });

  highlightedSatellite = new THREE.Mesh(highlightGeometry, highlightMaterial);

  // Position the highlight at the satellite position
  highlightedSatellite.position.set(
    satGeometry.attributes.position.array[index * 3],
    satGeometry.attributes.position.array[index * 3 + 1],
    satGeometry.attributes.position.array[index * 3 + 2]
  );

  scene.add(highlightedSatellite);

  // Update the satellite info display
  if (tleData[index]) {
    document.getElementById("satelliteInfo").innerHTML = `
            <div>Name: ${tleData[index].OBJECT_NAME}</div>
            <div>NORAD ID: ${tleData[index].NORAD_ID}</div>
        `;
    document.getElementById("satelliteInfo").style.display = "block";
  }
}

function resetHighlight() {
  if (highlightedSatellite) {
    scene.remove(highlightedSatellite);
    highlightedSatellite = null;
    highlightedIndex = -1;
  }
}

function selectSatellite(index) {
  // Store the index for comparison
  selectedIndex = index;

  // Create a highlighted point
  const selectionGeometry = new THREE.SphereGeometry(0.02, 16, 16);
  const selectionMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0.8,
  });

  selectedSatellite = new THREE.Mesh(selectionGeometry, selectionMaterial);

  // Position the highlight at the satellite position
  selectedSatellite.position.set(
    satGeometry.attributes.position.array[index * 3],
    satGeometry.attributes.position.array[index * 3 + 1],
    satGeometry.attributes.position.array[index * 3 + 2]
  );

  scene.add(selectedSatellite);
}

function resetSelection() {
  if (selectedSatellite) {
    scene.remove(selectedSatellite);
    selectedSatellite = null;
    selectedIndex = -1;
  }
}

// --- Time controls ---
document.getElementById("forward").addEventListener("click", () => {
  isRealTime = false;
  document.getElementById("play").textContent = "Play Realtime";
  stepTime(1);
});
document.getElementById("backward").addEventListener("click", () => {
  isRealTime = false;
  document.getElementById("play").textContent = "Play Realtime";
  stepTime(-1);
});
document.getElementById("play").addEventListener("click", () => {
  isRealTime = !isRealTime;
  document.getElementById("play").textContent = isRealTime
    ? "Pause"
    : "Play Realtime";
  if (isRealTime) {
    // When switching to real-time, update immediately
    currentTime = new Date();
    updatePositions();
  }
});

function stepTime(direction) {
  // Step by 10 minutes for noticeable change
  currentTime = new Date(currentTime.getTime() + direction * 60 * 1000);
  updatePositions(); // Request new positions for the new time
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

  if (intersects.length > 0 && intersects[0].object != earth) {
    // We hit a satellite
    const index = intersects[0].index;

    // Only process if it's a different satellite than currently highlighted
    if (index !== highlightedIndex) {
      // Remove previous highlight if any
      resetHighlight();

      // Highlight the new satellite
      highlightSatellite(index);

      // Request trajectory for this satellite
      requestTrajectory(index);
    }
  } else if (highlightedSatellite) {
    // No intersection but we have a highlight - clear it
    resetHighlight();
    clearTrajectory(); // Only clear the hover trajectory, not the selected one
  }
}

window.addEventListener("mousedown", onMouseDown, false);

function onMouseDown(event) {
  if (highlightedSatellite) {
    if (highlightedIndex != selectedIndex) {
      resetSelection();
      selectSatellite(highlightedIndex);
      requestTrajectory(selectedIndex);
    }
  }
}

let lastUpdateTime = new Date();
const updateIntervalMs = 500;

// --- Animation loop ---
function animate() {
  requestAnimationFrame(animate);

  if (isRealTime) {
    const now = new Date();
    const elapsedTimeMs = now - lastUpdateTime;

    // Update positions if half a second has passed and if initial data is loaded or TLE data exists
    if (elapsedTimeMs >= updateIntervalMs && tleData.length > 0) {
      currentTime = now;
      updatePositions();

      lastUpdateTime = now; // Update the last update time
    }
  }

  // Update position of the highlighted satellite if it exists
  if (highlightedSatellite && highlightedIndex >= 0) {
    highlightedSatellite.position.set(
      satGeometry.attributes.position.array[highlightedIndex * 3],
      satGeometry.attributes.position.array[highlightedIndex * 3 + 1],
      satGeometry.attributes.position.array[highlightedIndex * 3 + 2]
    );
  }

  // Update position of the selected satellite if it exists
  if (selectedSatellite && selectedIndex >= 0) {
    selectedSatellite.position.set(
      satGeometry.attributes.position.array[selectedIndex * 3],
      satGeometry.attributes.position.array[selectedIndex * 3 + 1],
      satGeometry.attributes.position.array[selectedIndex * 3 + 2]
    );
  }

  // Update time display regardless
  document.getElementById("time").textContent = currentTime.toUTCString();

  controls.update(); // required if controls.enableDamping or controls.autoRotate are set to true
  renderer.render(scene, camera);
}

// --- Start the application ---
// 1. Start rendering loop immediately (shows Earth)
animate();

// 2. Start fetching and processing satellite data in the background
initSatellites(); // This is async, won't block rendering

// Initial UI state for play button
document.getElementById("play").textContent = "Play Realtime";
