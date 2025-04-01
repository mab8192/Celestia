// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true }); // Added antialias for smoother edges
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- Earth Setup (Immediate) ---
const earthGeometry = new THREE.SphereGeometry(1, 64, 64); // Increased segments for smoother sphere
const earthTexture = new THREE.TextureLoader().load('assets/earth.jpg',
    () => {
        console.log('Earth texture loaded successfully.');
        // Texture loaded, maybe force a render if needed, though animate loop handles it
    },
    undefined, // onProgress callback (optional)
    (err) => {
        console.error('Failed to load Earth texture:', err);
        // Use a fallback color if texture fails
        const fallbackMaterial = new THREE.MeshBasicMaterial({ color: 0x224488 }); // Blue fallback
        earth.material = fallbackMaterial;
    }
);
const earthMaterial = new THREE.MeshBasicMaterial({ map: earthTexture });
const earth = new THREE.Mesh(earthGeometry, earthMaterial);
scene.add(earth);

// Camera controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05; // Smoother damping
controls.target.set(0, 0, 0);
controls.enablePan = false;
controls.minDistance = 1.5;
controls.maxDistance = 50;
camera.position.z = 10; // Start further back

// --- Satellite Data and Rendering Placeholder ---
let tleData = []; // Initialize as empty array
let metadata = [];
let satellites;
let geometry;
let visibilities; // If you plan to use this later
const MAX_SATELLITES = 10000; // Pre-allocate buffer size (adjust if needed)
let satelliteCount = 0; // Track how many satellites are actually loaded

const positions = new Float32Array(MAX_SATELLITES * 3); // x, y, z for each
// Initialize positions to NaN or far away so they aren't rendered until ready
positions.fill(0.0);

geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
// Crucially, set draw range to 0 initially. We'll increase it as data comes in.
geometry.setDrawRange(0, 0);

// Add a larger size for points and make them more visible
const material = new THREE.PointsMaterial({
    size: 0.03, // Increased from 0.01 for better visibility and easier hover detection
    color: 0xffffff,
    sizeAttenuation: true // Points get smaller further away
});

satellites = new THREE.Points(geometry, material);
scene.add(satellites); // Add the empty container to the scene

// -- Raycaster for hover detection --
const raycaster = new THREE.Raycaster();
// Increase the threshold for easier selection
raycaster.params.Points.threshold = 0.1; // Increased from 0.05
const mouse = new THREE.Vector2();
let hoveredSatellite = null;
let currentTrajectory = null; // Track the currently displayed trajectory

// --- Global State ---
let currentTime = new Date();
let isRealTime = false;
let initialDataLoaded = false; // Flag to track if initial load is done

// --- Web worker ---
const worker = new Worker('worker.js');

// Modified worker message handler
worker.onmessage = (e) => {
    const { type, batchPositions, startIndex, count, trajectoryPoints } = e.data;

    if (type === 'POSITIONS_UPDATE') {
        // Ensure we don't write past the buffer
        if (startIndex + count > MAX_SATELLITES) {
            console.warn("Received more satellite data than allocated buffer size.");
            return;
        }

        // Update the positions buffer at the correct offset
        for (let i = 0; i < count; i++) {
            const bufferIndex = (startIndex + i) * 3;
            geometry.attributes.position.array[bufferIndex] = batchPositions[i].x;
            geometry.attributes.position.array[bufferIndex + 1] = batchPositions[i].y;
            geometry.attributes.position.array[bufferIndex + 2] = batchPositions[i].z;
        }

        // Mark the buffer segment as needing update
        geometry.attributes.position.needsUpdate = true;

        // Increase the number of satellites to draw
        // Ensure we only update if this batch increases the count
        const newTotalCount = startIndex + count;
        if (newTotalCount > geometry.drawRange.count) {
            geometry.setDrawRange(0, newTotalCount);
            satelliteCount = newTotalCount; // Update global count
        }

        // If this message contains the last batch of the initial load
        if (satelliteCount === tleData.length) {
            initialDataLoaded = true;
            console.log(`Finished loading initial ${satelliteCount} satellites.`);
        }
    } else if (type === 'TRAJECTORY_DATA') {
        // Received orbital trajectory data - create a line from it
        drawTrajectory(trajectoryPoints);
    }
};

worker.onerror = (error) => {
    console.error("Error in web worker:", error);
};

// Function to draw a satellite's trajectory
function drawTrajectory(points) {
    // Remove any existing trajectory line
    if (currentTrajectory) {
        scene.remove(currentTrajectory);
        currentTrajectory = null;
    }

    // Create a new line for the trajectory
    const lineGeometry = new THREE.BufferGeometry();
    const linePositions = new Float32Array(points.length * 3);

    // Fill the buffer with trajectory points
    for (let i = 0; i < points.length; i++) {
        linePositions[i * 3] = points[i].x;
        linePositions[i * 3 + 1] = points[i].y;
        linePositions[i * 3 + 2] = points[i].z;
    }

    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));

    // Create material for the trajectory line
    const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x00ffff,
        linewidth: 2, // Increased from 1 for better visibility
        opacity: 0.8, // Increased from 0.7 for better visibility
        transparent: true
    });

    // Create and add the trajectory line
    currentTrajectory = new THREE.Line(lineGeometry, lineMaterial);
    scene.add(currentTrajectory);
}

// --- Satellite Initialization (Asynchronous) ---
async function initSatellites() {
    console.log("Starting satellite data fetch...");
    try {
        // Fetch raw TLE text data
        const response = await fetch('https://celestrak.com/NORAD/elements/gp.php?GROUP=active&FORMAT=tle');
        if (!response.ok) throw new Error(`Failed to fetch TLE data: ${response.statusText}`);
        const text = await response.text();
        console.log("TLE data fetched.");

        // Parse TLE text into objects
        const lines = text.trim().split('\n');
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
                        NORAD_ID: noradId
                    });
                } else {
                    console.warn(`Could not parse NORAD ID from TLE line 1: ${tleLine1}`);
                }
            }
        }
        console.log(`Parsed ${parsedTleData.length} TLE entries.`);

        if (parsedTleData.length > MAX_SATELLITES) {
            console.warn(`Loaded ${parsedTleData.length} satellites, but buffer is only ${MAX_SATELLITES}. Truncating.`);
            tleData = parsedTleData.slice(0, MAX_SATELLITES);
        } else {
            tleData = parsedTleData;
        }

        // Now that TLE data is ready, send it to the worker for initial position calculation
        updatePositions();

    } catch (error) {
        console.error('Satellite initialization error:', error);
        // Handle error appropriately, e.g., show a message to the user
    }
}

// Function to request position updates from the worker
function updatePositions() {
    // Only send data if we actually have TLEs loaded
    if (tleData && tleData.length > 0) {
        console.log(`Requesting position update for ${tleData.length} satellites at time: ${currentTime.toISOString()}`);
        // Send the *entire* current TLE dataset and the desired time
        // The worker will process this and send back results incrementally
        worker.postMessage({
            type: 'CALCULATE_POSITIONS', // Add a type for clarity
            tleData: tleData, // Send the full data set
            time: currentTime.toISOString() // Send time as ISO string
        });
    } else {
        console.log("Skipping position update: TLE data not yet loaded.");
    }
}

// Function to request a satellite's trajectory from the worker
function requestTrajectory(satelliteIndex) {
    if (tleData && tleData[satelliteIndex]) {
        console.log(`Requesting trajectory for satellite: ${tleData[satelliteIndex].OBJECT_NAME}`);

        // Display satellite info
        const satellite = tleData[satelliteIndex];
        document.getElementById('satelliteInfo').innerHTML = `
            <div>Name: ${satellite.OBJECT_NAME}</div>
            <div>NORAD ID: ${satellite.NORAD_ID}</div>
        `;
        document.getElementById('satelliteInfo').style.display = 'block';

        // Request trajectory calculation from worker
        worker.postMessage({
            type: 'CALCULATE_TRAJECTORY',
            satelliteIndex: satelliteIndex,
            tle: tleData[satelliteIndex],
            startTime: currentTime.toISOString(),
            points: 100 // Number of points to calculate for the orbit
        });
    }
}

// Function to clear trajectory when not hovering
function clearTrajectory() {
    if (currentTrajectory) {
        scene.remove(currentTrajectory);
        currentTrajectory = null;
    }
    document.getElementById('satelliteInfo').style.display = 'none';
}

// --- Time controls ---
document.getElementById('forward').addEventListener('click', () => {
    isRealTime = false;
    document.getElementById('play').textContent = "Play Realtime";
    stepTime(1);
});
document.getElementById('backward').addEventListener('click', () => {
    isRealTime = false;
    document.getElementById('play').textContent = "Play Realtime";
    stepTime(-1);
});
document.getElementById('play').addEventListener('click', () => {
    isRealTime = !isRealTime;
    document.getElementById('play').textContent = isRealTime ? "Pause" : "Play Realtime";
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
window.addEventListener('resize', onWindowResize, false);

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Mouse interaction handlers ---
// Change to use the renderer's domElement for more reliable coordinates
renderer.domElement.addEventListener('mousemove', onMouseMove, false);
renderer.domElement.addEventListener('mouseout', onMouseOut, false);

function onMouseMove(event) {
    // Get mouse coordinates relative to the canvas
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function onMouseOut() {
    // Clear any existing trajectories when mouse leaves the canvas
    clearTrajectory();
    hoveredSatellite = null;
}

// Add satellite info display element to DOM
const infoDiv = document.createElement('div');
infoDiv.id = 'satelliteInfo';
infoDiv.style.position = 'absolute';
infoDiv.style.top = '10px';
infoDiv.style.left = '10px';
infoDiv.style.padding = '10px';
infoDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
infoDiv.style.color = 'white';
infoDiv.style.borderRadius = '5px';
infoDiv.style.fontFamily = 'monospace';
infoDiv.style.display = 'none';
document.body.appendChild(infoDiv);

// Debug mode for raycasting
const debugMode = true;

// --- Animation loop ---
function animate() {
    requestAnimationFrame(animate);

    const now = new Date();
    if (isRealTime) {
        // Update time and request positions only if time changed significantly (e.g., every second)
        if (!currentTime || now.getSeconds() !== currentTime.getSeconds()) {
            currentTime = now;
            // Only update positions if the initial load is complete or TLE data exists
            if (initialDataLoaded || tleData.length > 0) {
                updatePositions();
            }
        }
    }
    // Update time display regardless
    document.getElementById('time').textContent = currentTime.toUTCString();

    // Process hover detection
    // TODO: NOT WORKING
    if (initialDataLoaded && satelliteCount > 0) {
        // Update the picking ray with the camera and mouse position
        raycaster.setFromCamera(mouse, camera);

        // Calculate objects intersecting the picking ray
        const intersects = raycaster.intersectObject(satellites);

        if (intersects.length > 0) {
            // We got a hover!
            const satelliteIndex = intersects[0].index;

            if (debugMode) {
                console.log(`Hover detected on satellite at index: ${satelliteIndex}`);
                console.log(`Position: (${positions[satelliteIndex*3]}, ${positions[satelliteIndex*3+1]}, ${positions[satelliteIndex*3+2]})`);
                console.log(`Distance: ${intersects[0].distance}`);
            }

            // Only update if hovering a new satellite
            if (hoveredSatellite !== satelliteIndex) {
                hoveredSatellite = satelliteIndex;
                requestTrajectory(satelliteIndex);
            }
        } else if (hoveredSatellite !== null) {
            // No longer hovering over any satellite
            clearTrajectory();
            hoveredSatellite = null;
        }
    }

    controls.update(); // required if controls.enableDamping or controls.autoRotate are set to true
    renderer.render(scene, camera);
}

// --- Start the application ---
// 1. Start rendering loop immediately (shows Earth)
animate();

// 2. Start fetching and processing satellite data in the background
initSatellites(); // This is async, won't block rendering

// Initial UI state for play button
document.getElementById('play').textContent = "Play Realtime";