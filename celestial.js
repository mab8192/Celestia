import * as config from "./config.js";

const textureLoader = new THREE.TextureLoader();

export function getStarfield() {
  const starTexture = textureLoader.load("assets/universe.png");
  const starGeometry = new THREE.SphereGeometry(
    config.STARFIELD_SPHERE_RADIUS,
    config.PLANET_GEOMETRY_DETAIL,
    config.PLANET_GEOMETRY_DETAIL
  );
  const starMaterial = new THREE.MeshBasicMaterial({
    map: starTexture,
    side: THREE.BackSide, // Render texture inside the sphere
  });
  const starField = new THREE.Mesh(starGeometry, starMaterial);
  return starField;
}

export function getEarth() {
  const dayTexture = textureLoader.load("assets/earth.jpg");
  const nightTexture = textureLoader.load("assets/earth_night.jpg");
  const normalMap = textureLoader.load("assets/earth_normal.tif");
  const specularMap = textureLoader.load("assets/earth_specular.tif");
  const cloudTexture = textureLoader.load("assets/earth_clouds.jpg");
  cloudTexture.wrapS = THREE.RepeatWrapping; // Set horizontal wrapping to repeat
  cloudTexture.generateMipmaps = false; // Disable mipmaps
  cloudTexture.minFilter = THREE.LinearFilter; // Use linear filtering
  cloudTexture.magFilter = THREE.LinearFilter; // Use linear filtering

  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: {
      dayTexture: { value: dayTexture },
      nightTexture: { value: nightTexture },
      normalMap: { value: normalMap },
      specularMap: { value: specularMap },
      cloudTexture: { value: cloudTexture },
      sunPosition: { value: new THREE.Vector3(config.SUN_DISTANCE, 0, 0) },
      modelMatrix: { value: new THREE.Matrix4() },
      cameraViewMatrix: { value: new THREE.Matrix4() },
      time: { value: 0.0 }, // Add time uniform for cloud movement
    },
    vertexShader: `
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vWorldPosition;

            void main() {
                vUv = uv;
                vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
    fragmentShader: `
            uniform sampler2D dayTexture;
            uniform sampler2D nightTexture;
            uniform sampler2D normalMap;
            uniform sampler2D specularMap;
            uniform sampler2D cloudTexture;
            uniform vec3 sunPosition;
            uniform mat4 modelMatrix;
            uniform mat4 cameraViewMatrix;
            uniform float time; // Time uniform
    
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vWorldPosition;
    
            void main() {
                // Calculate light direction in world space
                vec3 lightDir = normalize(sunPosition - vWorldPosition);
                float intensity = max(dot(vNormal, lightDir), 0.0);
    
                // Blend between night and day textures
                vec4 dayColor = texture2D(dayTexture, vUv);
                vec4 nightColor = texture2D(nightTexture, vUv);
                vec4 baseSurfaceColor = mix(nightColor, dayColor, intensity);
    
                // Calculate cloud UVs using fract() for seamless wrapping
                // Adjust the multiplier (0.005) for desired cloud speed
                vec2 cloudUv = vec2(fract(vUv.x + time * 0.001), vUv.y);
                vec4 cloudColorSample = texture2D(cloudTexture, cloudUv);
    
                // Use the cloud texture's color intensity (e.g., red channel) as alpha
                float cloudAlpha = cloudColorSample.r;
    
                // Blend clouds over the surface color. Make clouds brighter on the lit side.
                vec3 finalSurfaceColor = mix(baseSurfaceColor.rgb, vec3(1.0), cloudAlpha * intensity);
    
                // Apply normal mapping (remains the same)
                vec3 normalMapValue = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
                float specular = 0.0;
                if (intensity > 0.0) {
                    vec3 worldNormal = normalize(vNormal + normalMapValue.x * vec3(1.0, 0.0, 0.0) + normalMapValue.y * vec3(0.0, 1.0, 0.0));
                    vec3 viewDir = normalize(-vWorldPosition);
                    vec3 reflectDir = reflect(-lightDir, worldNormal);
                    float specularStrength = texture2D(specularMap, vUv).r;
                    specular = pow(max(dot(viewDir, reflectDir), 0.0), 32.0) * specularStrength;
                }
    
                // Final color: surface + clouds + specular
                gl_FragColor = vec4(finalSurfaceColor + vec3(specular), 1.0);
            }
        `,
    vertexColors: true,
    transparent: false, // Clouds are blended in, base sphere is opaque
  });
  const earthGeometry = new THREE.SphereGeometry(
    1,
    config.PLANET_GEOMETRY_DETAIL,
    config.PLANET_GEOMETRY_DETAIL
  ); // Increased segments for smoother sphere
  const earth = new THREE.Mesh(earthGeometry, earthMaterial);
  earth.rotation.z = THREE.MathUtils.degToRad(23.5); // tilt at 23.5 deg

  return { earth, earthGeometry, earthMaterial };
}

export function getMoon() {
  const moonTexture = textureLoader.load("assets/moon.jpg");
  const moonGeometry = new THREE.SphereGeometry(
    config.MOON_RADIUS,
    config.MOON_GEOMETRY_DETAIL,
    config.MOON_GEOMETRY_DETAIL
  );
  // Use MeshStandardMaterial for realistic lighting
  const moonMaterial = new THREE.MeshStandardMaterial({
    map: moonTexture,
  });
  const moon = new THREE.Mesh(moonGeometry, moonMaterial);
  return moon;
}

export function getSun() {
  const sunGeometry = new THREE.SphereGeometry(
    config.SUN_RADIUS,
    config.SUN_GEOMETRY_DETAIL / 2,
    config.SUN_GEOMETRY_DETAIL / 2
  );
  const sunTexture = textureLoader.load("assets/sun.jpg");
  const sunMaterial = new THREE.MeshBasicMaterial({
    map: sunTexture,
  });
  const sun = new THREE.Mesh(sunGeometry, sunMaterial);

  sun.position.set(config.SUN_DISTANCE, 0, 0);

  const sunlight = new THREE.DirectionalLight(0xffffff, 1.5);
  sunlight.position.set(sun.position);

  return { sun, sunlight };
}

export function getMercury() {
  const mercuryGeometry = new THREE.SphereGeometry(
    config.MERCURY_RADIUS,
    config.PLANET_GEOMETRY_DETAIL,
    config.PLANET_GEOMETRY_DETAIL
  );

  const mercuryTexture = textureLoader.load("assets/mercury.jpg");
  const mercuryMaterial = new THREE.MeshLambertMaterial({
    map: mercuryTexture,
  });

  const mercury = new THREE.Mesh(mercuryGeometry, mercuryMaterial);
  // Position relative to Earth (origin), Sun at (config.SUN_DISTANCE, 0, 0)
  // Mercury distance: 0.39 AU
  mercury.position.set(config.SUN_DISTANCE * (1 - 0.39), 0, 0);
  return mercury;
}

export function getVenus() {
  const venusGeometry = new THREE.SphereGeometry(
    config.VENUS_RADIUS,
    config.PLANET_GEOMETRY_DETAIL,
    config.PLANET_GEOMETRY_DETAIL
  );

  const venusTexture = textureLoader.load("assets/venus_surface.jpg");
  const venusMaterial = new THREE.MeshLambertMaterial({
    map: venusTexture,
  });

  const venus = new THREE.Mesh(venusGeometry, venusMaterial);
  // Venus distance: 0.72 AU
  venus.position.set(config.SUN_DISTANCE * (1 - 0.72), 0, 0);
  return venus;
}

export function getMars() {
  const marsGeometry = new THREE.SphereGeometry(
    config.MARS_RADIUS,
    config.PLANET_GEOMETRY_DETAIL,
    config.PLANET_GEOMETRY_DETAIL
  );

  const marsTexture = textureLoader.load("assets/mars.jpg");
  const marsMaterial = new THREE.MeshLambertMaterial({
    map: marsTexture,
  });

  const mars = new THREE.Mesh(marsGeometry, marsMaterial);
  // Mars distance: 1.52 AU
  mars.position.set(config.SUN_DISTANCE * (1 - 1.52), 0, 0);
  return mars;
}

export function getJupiter() {
  const jupiterGeometry = new THREE.SphereGeometry(
    config.JUPITER_RADIUS,
    config.PLANET_GEOMETRY_DETAIL,
    config.PLANET_GEOMETRY_DETAIL
  );

  const jupiterTexture = textureLoader.load("assets/jupiter.jpg");
  const jupiterMaterial = new THREE.MeshLambertMaterial({
    map: jupiterTexture,
  });

  const jupiter = new THREE.Mesh(jupiterGeometry, jupiterMaterial);
  // Jupiter distance: 5.20 AU
  jupiter.position.set(config.SUN_DISTANCE * (1 - 5.20), 0, 0);
  return jupiter;
}

export function getSaturn() {
  const saturnGeometry = new THREE.SphereGeometry(
    config.SATURN_RADIUS,
    config.PLANET_GEOMETRY_DETAIL,
    config.PLANET_GEOMETRY_DETAIL
  );

  const saturnTexture = textureLoader.load("assets/saturn.jpg");
  const saturnMaterial = new THREE.MeshLambertMaterial({
    map: saturnTexture,
  });

  const saturn = new THREE.Mesh(saturnGeometry, saturnMaterial);
  // Saturn distance: 9.58 AU
  saturn.position.set(config.SUN_DISTANCE * (1 - 9.58), 0, 0);

  // --- Add Rings ---
  const ringTexture = textureLoader.load("assets/saturn_rings.png");
  ringTexture.wrapS = THREE.RepeatWrapping; // Repeat texture horizontally
  ringTexture.repeat.x = 2; // How many times to repeat texture around the ring

  const innerRadius = config.SATURN_RADIUS * 1.1; // Scale inner radius
  const outerRadius = config.SATURN_RADIUS * 2.0; // Scale outer radius
  const ringGeometry = new THREE.RingGeometry(innerRadius, outerRadius, 64); // 64 segments for smoothness

  // Rotate geometry so the texture maps correctly if needed (RingGeometry is XY plane)
  // We want the texture to wrap *around* the ring. Default UVs might work with wrapS.
  // If not, might need UV adjustments or rotating geometry to align with texture.

  // Fix UVs to map texture radially
  const pos = ringGeometry.attributes.position;
  const v3 = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++){
      v3.fromBufferAttribute(pos, i);
      // Map 'u' coordinate based on angle (atan2) and 'v' based on radius
      // This maps the long texture strip around the ring correctly.
      ringGeometry.attributes.uv.setXY(i, (v3.length() - innerRadius)/(outerRadius - innerRadius), 0);
      // The V coordinate might need adjustment based on the texture layout, setting to 0 for a thin strip texture.
  }
   ringGeometry.attributes.uv.needsUpdate = true;


  const ringMaterial = new THREE.MeshStandardMaterial({
    map: ringTexture,
    side: THREE.DoubleSide, // Visible from both sides
    transparent: true, // Enable transparency based on texture
    // alphaTest: 0.5, // Optional: Adjust if transparency has sharp edges
  });

  const rings = new THREE.Mesh(ringGeometry, ringMaterial);
  // RingGeometry is in XY plane, rotate it 90 degrees around X-axis to make it flat in XZ plane
  rings.rotation.x = Math.PI / 2;

  saturn.add(rings); // Add rings as a child of Saturn

  // Apply Saturn's axial tilt (approx 26.7 degrees)
  // Rotating the parent Saturn object will also rotate the child rings
  saturn.rotation.z = THREE.MathUtils.degToRad(26.7); // Tilt relative to orbit


  return saturn;
}

export function getUranus() {
  const uranusGeometry = new THREE.SphereGeometry(
    config.URANUS_RADIUS,
    config.PLANET_GEOMETRY_DETAIL,
    config.PLANET_GEOMETRY_DETAIL
  );

  const uranusTexture = textureLoader.load("assets/uranus.jpg");
  const uranusMaterial = new THREE.MeshLambertMaterial({
    map: uranusTexture,
  });

  const uranus = new THREE.Mesh(uranusGeometry, uranusMaterial);
  // Uranus distance: 19.22 AU
  uranus.position.set(config.SUN_DISTANCE * (1 - 19.22), 0, 0);
  return uranus;
}

export function getNeptune() {
  const neptuneGeometry = new THREE.SphereGeometry(
    config.NEPTUNE_RADIUS,
    config.PLANET_GEOMETRY_DETAIL,
    config.PLANET_GEOMETRY_DETAIL
  );

  const neptuneTexture = textureLoader.load("assets/neptune.jpg");
  const neptuneMaterial = new THREE.MeshLambertMaterial({
    map: neptuneTexture,
  });

  const neptune = new THREE.Mesh(neptuneGeometry, neptuneMaterial);
  // Neptune distance: 30.05 AU
  neptune.position.set(config.SUN_DISTANCE * (1 - 30.05), 0, 0);
  return neptune;
}

export function getPluto() {
  const plutoGeometry = new THREE.SphereGeometry(
    config.PLUTO_RADIUS,
    config.PLANET_GEOMETRY_DETAIL,
    config.PLANET_GEOMETRY_DETAIL
  );

  const plutoTexture = textureLoader.load("assets/pluto.jpg");
  const plutoMaterial = new THREE.MeshLambertMaterial({
    map: plutoTexture,
  });

  const pluto = new THREE.Mesh(plutoGeometry, plutoMaterial);
  // Pluto distance: 39.48 AU
  pluto.position.set(config.SUN_DISTANCE * (1 - 39.48), 0, 0);
  return pluto;
}

/** Helper functions */

/**
 * Calculates the Julian Day (JD) for a given JavaScript Date object.
 * JD is the number of days since noon Universal Time (UT) on January 1, 4713 BCE.
 */
function calculateJulianDay(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // JS months are 0-indexed
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();

  const dayFraction = (hours + minutes / 60 + seconds / 3600) / 24;

  if (month <= 2) {
    year -= 1;
    month += 12;
  }

  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  const JD =
    Math.floor(365.25 * (year + 4716)) +
    Math.floor(30.6001 * (month + 1)) +
    day +
    B -
    1524.5;

  return JD + dayFraction;
}

/**
 * Calculates approximate geocentric ECI position of the Moon.
 * Based on simplified algorithms (accuracy ~ arcminutes/few Earth radii).
 * @param {Date} date The date/time for which to calculate the position.
 * @returns {{x: number, y: number, z: number}} Geocentric ECI position in kilometers.
 */
export function getMoonPosition(date) {
  const JD = calculateJulianDay(date);
  const T = (JD - 2451545.0) / 36525; // Centuries since J2000.0

  // --- Mean Elements (degrees) ---
  const L0 =
    218.3164477 +
    481267.88123421 * T -
    0.0015786 * T * T +
    (T * T * T) / 538841 -
    (T * T * T * T) / 65194000; // Mean longitude
  const D =
    297.8501921 +
    445267.1114034 * T -
    0.0018819 * T * T +
    (T * T * T) / 545868 -
    (T * T * T * T) / 113065000; // Mean elongation (Moon - Sun)
  const M =
    134.9633964 +
    477198.8675055 * T +
    0.0087414 * T * T +
    (T * T * T) / 69699 -
    (T * T * T * T) / 14712000; // Sun's mean anomaly
  const M_prime =
    357.5291092 +
    35999.0502909 * T -
    0.0001536 * T * T +
    (T * T * T) / 24490000; // Moon's mean anomaly
  const F =
    93.272095 +
    483202.0175233 * T -
    0.0036539 * T * T -
    (T * T * T) / 3526000 +
    (T * T * T * T) / 863310000; // Argument of latitude

  // Convert degrees to radians for trig functions
  const L0_rad = THREE.MathUtils.degToRad(L0);
  const D_rad = THREE.MathUtils.degToRad(D);
  const M_rad = THREE.MathUtils.degToRad(M);
  const M_prime_rad = THREE.MathUtils.degToRad(M_prime);
  const F_rad = THREE.MathUtils.degToRad(F);

  // --- Major Perturbation Terms (degrees) ---
  // Longitude perturbations
  let dL =
    -1.274 * Math.sin(M_prime_rad - 2 * D_rad) +
    0.658 * Math.sin(2 * D_rad) -
    0.186 * Math.sin(M_prime_rad) -
    0.059 * Math.sin(2 * M_prime_rad - 2 * D_rad) -
    0.057 * Math.sin(M_prime_rad + 2 * D_rad) +
    0.053 * Math.sin(M_prime_rad - 2 * D_rad + M_rad) +
    0.046 * Math.sin(2 * D_rad - M_rad) +
    0.041 * Math.sin(M_prime_rad - M_rad) -
    0.035 * Math.sin(D_rad) -
    0.031 * Math.sin(M_prime_rad + M_rad) -
    0.015 * Math.sin(2 * F_rad - 2 * D_rad) +
    0.011 * Math.sin(M_prime_rad - 4 * D_rad);

  // Latitude perturbations
  let dB =
    -0.173 * Math.sin(F_rad - 2 * D_rad) -
    0.055 * Math.sin(M_prime_rad - F_rad - 2 * D_rad) -
    0.046 * Math.sin(M_prime_rad + F_rad - 2 * D_rad) +
    0.033 * Math.sin(F_rad + 2 * D_rad) +
    0.017 * Math.sin(2 * M_prime_rad + F_rad);

  // Distance perturbations (in Earth Radii)
  let dR_ER =
    -0.58 * Math.cos(M_prime_rad - 2 * D_rad) - 0.46 * Math.cos(2 * D_rad);

  // --- Calculate final ecliptic coords ---
  const lambda = L0 + dL; // Ecliptic Longitude (degrees)
  const beta = dB; // Ecliptic Latitude (degrees)
  const meanDistanceER = 60.2666; // Mean distance in Earth Radii
  const distanceER = meanDistanceER + dR_ER;
  const distanceKm = distanceER * config.EARTH_RADIUS_KM; // Distance in km

  const lambda_rad = THREE.MathUtils.degToRad(lambda);
  const beta_rad = THREE.MathUtils.degToRad(beta);

  // --- Convert Spherical Ecliptic to Cartesian Ecliptic ---
  const x_ecl = distanceKm * Math.cos(beta_rad) * Math.cos(lambda_rad);
  const y_ecl = distanceKm * Math.cos(beta_rad) * Math.sin(lambda_rad);
  const z_ecl = distanceKm * Math.sin(beta_rad);

  // --- Calculate Obliquity of the Ecliptic (degrees) ---
  const epsilon0 = 23.43929111;
  const epsilon =
    epsilon0 - 0.0130042 * T - 0.00000016 * T * T + 0.000000504 * T * T * T;
  const epsilon_rad = THREE.MathUtils.degToRad(epsilon);

  // --- Rotate Cartesian Ecliptic to Cartesian Equatorial (ECI) ---
  const cos_eps = Math.cos(epsilon_rad);
  const sin_eps = Math.sin(epsilon_rad);

  const x_eci = x_ecl;
  const y_eci = y_ecl * cos_eps - z_ecl * sin_eps;
  const z_eci = y_ecl * sin_eps + z_ecl * cos_eps;

  // Return position in kilometers
  return { x: x_eci, y: y_eci, z: z_eci };
}
