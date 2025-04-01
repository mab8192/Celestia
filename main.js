// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Earth
const earthGeometry = new THREE.SphereGeometry(1, 32, 32);
const earthTexture = new THREE.TextureLoader().load('assets/earth.jpg', undefined, (err) => {
    console.error('Failed to load Earth texture:', err);
});
const earthMaterial = new THREE.MeshBasicMaterial({ map: earthTexture });
const earth = new THREE.Mesh(earthGeometry, earthMaterial);
scene.add(earth);

// Camera controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0); // Always target the center of the Earth
controls.enablePan = false; // Disable panning to prevent moving the target
controls.minDistance = 2; // Prevent zooming too close
controls.maxDistance = 20; // Prevent zooming too far
camera.position.z = 10;

// Satellite data and rendering
let tleData, metadata, satellites, geometry, visibilities;
const activeLayers = new Set();
let currentTime = new Date();
let isRealTime = false;

async function initSatellites() {
    try {
        // Fetch raw TLE text data
        const response = await fetch('https://celestrak.com/NORAD/elements/gp.php?GROUP=active&FORMAT=tle');
        if (!response.ok) throw new Error('Failed to fetch TLE data');
        const text = await response.text();

        // Parse TLE text into objects
        const lines = text.trim().split('\n');
        tleData = [];
        for (let i = 0; i < lines.length; i += 3) {
            if (lines[i + 1] && lines[i + 2]) {
                tleData.push({
                    OBJECT_NAME: lines[i].trim(),
                    TLE_LINE1: lines[i + 1].trim(),
                    TLE_LINE2: lines[i + 2].trim()
                });
            }
        }

        // Load metadata
        const metaResponse = await fetch('assets/satellites.json');
        if (!metaResponse.ok) throw new Error('Failed to fetch metadata');
        metadata = await metaResponse.json();

        // tleData = tleData.slice(0, 1000); // Limit for performance
        metadata.forEach((m, i) => m.index = i);

        const satelliteCount = tleData.length;
        const positions = new Float32Array(satelliteCount * 3);
        visibilities = new Float32Array(satelliteCount);
        visibilities.fill(1);

        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('visibility', new THREE.BufferAttribute(visibilities, 1));

        const material = new THREE.PointsMaterial({ size: 0.02, color: 0xffffff });
        material.onBeforeCompile = (shader) => {
            shader.vertexShader = `
                attribute float visibility;
                ${shader.vertexShader}
            `.replace(
                'gl_PointSize = size;',
                'gl_PointSize = visibility > 0.5 ? size : 0.0;'
            );
        };

        satellites = new THREE.Points(geometry, material);
        scene.add(satellites);

        updatePositions();
    } catch (error) {
        console.error('Initialization error:', error);
    }
}

// Web worker
const worker = new Worker('worker.js');
worker.onmessage = (e) => {
    const positions = e.data;
    for (let i = 0; i < positions.length; i++) {
        geometry.attributes.position.array[i * 3] = positions[i].x;
        geometry.attributes.position.array[i * 3 + 1] = positions[i].y;
        geometry.attributes.position.array[i * 3 + 2] = positions[i].z;
    }
    geometry.attributes.position.needsUpdate = true;
};

function updatePositions() {
    worker.postMessage({ tleData, time: currentTime });
}

// Time controls
document.getElementById('forward').addEventListener('click', () => {
    isRealTime = false;
    stepTime(1);
});
document.getElementById('backward').addEventListener('click', () => {
    isRealTime = false;
    stepTime(-1);
});
document.getElementById('play').addEventListener('click', () => {
    isRealTime = !isRealTime;
});

function stepTime(direction) {
    currentTime = new Date(currentTime.getTime() + direction * 60 * 1000);
    updatePositions();
}

// Layer toggling
document.querySelectorAll('#layers input').forEach(input => {
    input.addEventListener('change', () => {
        if (input.checked) activeLayers.add(input.value);
        else activeLayers.delete(input.value);
        updateVisibility();
    });
});

function updateVisibility() {
    for (let i = 0; i < tleData.length; i++) {
        const sat = metadata[i] || {};
        const isVisible = activeLayers.size === 0 ||
            activeLayers.has(sat.COUNTRY) ||
            activeLayers.has(sat.OPERATOR);
        visibilities[i] = isVisible ? 1 : 0;
    }
    geometry.attributes.visibility.needsUpdate = true;
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    if (isRealTime) {
        currentTime = new Date();
        updatePositions();
    }
    document.getElementById('time').textContent = currentTime.toUTCString();
    controls.update();
    renderer.render(scene, camera);
}

// Start
initSatellites().then(animate);