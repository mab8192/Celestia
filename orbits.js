import * as config from "./config.js";

// Standard gravitational parameter (GM) for the Sun (km^3/s^2)
const GM_SUN = 1.32712440018e11;

// --- Orbital Elements (J2000 Epoch) ---
// Source: NASA JPL SSD (https://ssd.jpl.nasa.gov/planets/approx_pos.html)
// a: Semi-major axis (AU)
// e: Eccentricity
// I: Inclination (degrees)
// L: Mean longitude (degrees) = longitude of ascending node (Ω) + argument of periapsis (ω) + mean anomaly (M)
// peri: Longitude of perihelion (degrees) = Ω + ω
// node: Longitude of ascending node (Ω) (degrees)
// M: Mean anomaly at J2000 epoch (degrees) - Can be derived from L, peri, node if needed, but often L is used directly.
// Note: For simplicity, we'll use L, peri, node directly for position calculation based on time.
// Rates of change are also provided by JPL for higher accuracy, but we'll start with J2000 constants.

const orbitalElements = {
    sun: { GM: GM_SUN }, // Sun is the central body
    mercury: { a: 0.387098, e: 0.205630, I: 7.00487, L: 252.25084, peri: 77.45645, node: 48.33167 },
    venus: { a: 0.723332, e: 0.006773, I: 3.39471, L: 181.97973, peri: 131.53298, node: 76.68069 },
    earth: { a: 1.000000, e: 0.016710, I: 0.00005, L: 100.46435, peri: 102.94719, node: -11.26064 }, // Node is often given as 0 or undefined for ecliptic plane ref.
    // Moon requires geocentric elements
    moon: {
        a_geo: 384400, // Semi-major axis (km) relative to Earth
        e_geo: 0.0549,  // Eccentricity relative to Earth
        I_geo: 5.145,   // Inclination to ecliptic (degrees)
        // Mean longitude, longitude of perigee, longitude of ascending node are complex and time-dependent.
        // Simplified approach or dedicated lunar theory (like ELP) needed for accuracy.
        // For now, placeholder:
        L_geo: 0, peri_geo: 0, node_geo: 0,
        GM_Earth: 3.986004418e5 // km^3/s^2
    },
    mars: { a: 1.523662, e: 0.093412, I: 1.85061, L: -4.553432, peri: -23.943629, node: 49.57854 },
    jupiter: { a: 5.203363, e: 0.048393, I: 1.30530, L: 34.396441, peri: 14.75385, node: 100.55615 },
    saturn: { a: 9.537070, e: 0.054151, I: 2.48446, L: 49.944322, peri: 92.43194, node: 113.71504 },
    uranus: { a: 19.191264, e: 0.047168, I: 0.76986, L: 313.23218, peri: 170.96424, node: 74.22988 },
    neptune: { a: 30.068963, e: 0.008586, I: 1.76917, L: -55.120029, peri: 44.97135, node: 131.72169 },
    pluto: { a: 39.481686, e: 0.248808, I: 17.14175, L: 238.92904, peri: 224.06892, node: 110.30347 }
};

// Helper function to convert degrees to radians
function toRadians(degrees) {
    return degrees * Math.PI / 180;
}

// Helper function to solve Kepler's equation: M = E - e * sin(E)
// Using Newton-Raphson iteration
function solveKepler(M, e) {
    let E = M; // Initial guess
    let delta = 1;
    const tolerance = 1e-8; // Iteration tolerance
    let maxIterations = 100;
    let i = 0;

    while (Math.abs(delta) > tolerance && i < maxIterations) {
        delta = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        E -= delta;
        i++;
    }
    // Consider adding error handling if maxIterations is reached
    return E;
}

/**
 * Calculates the Heliocentric Ecliptic position (X, Y, Z) of a planet.
 * @param {string} planetName - Name of the planet (e.g., 'earth', 'mars').
 * @param {Date} date - The date/time for which to calculate the position.
 * @returns {THREE.Vector3} Position vector in AU (Ecliptic coordinates).
 */
export function getPlanetPosition(planetName, date) {
    const elements = orbitalElements[planetName];
    if (!elements) {
        console.error(`Orbital elements for ${planetName} not found.`);
        return new THREE.Vector3();
    }

    // Time difference from J2000 epoch (January 1, 2000, 12:00 TT)
    const J2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
    const secondsSinceJ2000 = (date.getTime() - J2000.getTime()) / 1000;
    const daysSinceJ2000 = secondsSinceJ2000 / (24 * 60 * 60);
    const centuriesSinceJ2000 = daysSinceJ2000 / 36525;

    // --- Calculate Orbital Elements for the given date ---
    // For higher accuracy, apply rates of change per century (cy) - simplified here
    // Example for Mercury's Mean Longitude (L): L = 252.25084 + 149472.67411 * cy (degrees)
    // For now, we use the constant J2000 values for simplicity.
    const a = elements.a; // AU
    const e = elements.e;
    const I = toRadians(elements.I);
    const L = toRadians(elements.L); // Mean Longitude (rad) at J2000
    const peri = toRadians(elements.peri); // Longitude of Perihelion (rad) at J2000
    const node = toRadians(elements.node); // Longitude of Ascending Node (rad) at J2000

    // Argument of Periapsis (ω)
    const w = peri - node;

    // Mean anomaly (M) at J2000
    // M = L - peri; // This is approximate; L includes node as well.
    // A better way: Calculate n (mean motion) and propagate M from epoch.
    const n = Math.sqrt(GM_SUN / Math.pow(a * config.AU * 1000, 3)); // Mean motion (rad/s)
    const M0 = L - peri; // Mean anomaly at epoch J2000 (approx)
    const M = (M0 + n * secondsSinceJ2000) % (2 * Math.PI); // Mean anomaly at date

    // Eccentric Anomaly (E) - Solve Kepler's Equation M = E - e*sin(E)
    const E = solveKepler(M, e);

    // True Anomaly (ν)
    const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));

    // Heliocentric distance (r)
    const r = a * (1 - e * Math.cos(E)); // Distance in AU

    // --- Position in Orbital Plane (relative to focus/Sun) ---
    // x_orb points towards perihelion
    const x_orb = r * Math.cos(nu);
    const y_orb = r * Math.sin(nu);

    // --- Rotate to Ecliptic Coordinates ---
    // Rotate by argument of periapsis (w), then inclination (I), then longitude of ascending node (node)
    const cos_w = Math.cos(w);
    const sin_w = Math.sin(w);
    const cos_I = Math.cos(I);
    const sin_I = Math.sin(I);
    const cos_node = Math.cos(node);
    const sin_node = Math.sin(node);

    // Ecliptic coordinates (X, Y, Z) - Sun at origin
    // X positive towards vernal equinox, Y 90 deg East in ecliptic plane, Z normal to ecliptic
    const X = r * (cos_node * (cos_w * Math.cos(nu) - sin_w * Math.sin(nu)) - sin_node * (sin_w * Math.cos(nu) + cos_w * Math.sin(nu)) * cos_I);
    const Y = r * (sin_node * (cos_w * Math.cos(nu) - sin_w * Math.sin(nu)) + cos_node * (sin_w * Math.cos(nu) + cos_w * Math.sin(nu)) * cos_I);
    const Z = r * (sin_I * (sin_w * Math.cos(nu) + cos_w * Math.sin(nu)));

    // Return position in AU, standard Heliocentric Ecliptic coordinates:
    // X: Towards Vernal Equinox
    // Y: 90 degrees East along the Ecliptic plane
    // Z: Towards North Ecliptic Pole
    return new THREE.Vector3(X, Z, Y);
}

/**
 * Approximates the Geocentric Ecliptic position (X, Y, Z) of the Moon.
 * NOTE: This uses a highly simplified model (circular orbit in Earth's ecliptic plane)
 * and does not account for inclination, eccentricity, or perturbations.
 * For accurate lunar positioning, a dedicated library implementing lunar theory (e.g., ELP) is required.
 * @param {Date} date - The date/time for which to calculate the position.
 * @returns {THREE.Vector3} Heliocentric position vector of the Moon in AU.
 */
export function getMoonPosition(date) {
    const elements = orbitalElements.moon;

    // --- Simplified Circular Orbit around Earth in Ecliptic Plane ---
    // This is NOT accurate but provides a basic moving Moon.
    const J2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
    const secondsSinceJ2000 = (date.getTime() - J2000.getTime()) / 1000;

    // Mean motion of Moon around Earth (approx 27.32 days period)
    const meanMotionMoon = 2 * Math.PI / (27.321661 * 24 * 3600); // rad/s
    const meanLongitudeMoon = (elements.L_geo + meanMotionMoon * secondsSinceJ2000) % (2 * Math.PI); // Placeholder initial longitude

    // Assuming circular orbit in ecliptic plane for simplicity
    const r_geo_km = elements.a_geo;
    const r_geo_au = r_geo_km / config.AU;

    const x_geo = r_geo_au * Math.cos(meanLongitudeMoon); // Geocentric X (AU)
    const y_geo = r_geo_au * Math.sin(meanLongitudeMoon); // Geocentric Y (AU)
    const z_geo = 0; // Simplified to ecliptic plane

    // Convert geocentric ecliptic (simplified) to a vector
    const moonGeoEcliptic = new THREE.Vector3(x_geo, z_geo, y_geo);

    // Return the calculated geocentric position relative to Earth (in AU)
    return moonGeoEcliptic;
}
