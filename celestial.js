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
      sunPosition: { value: new THREE.Vector3(0, 0, 0) },
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
  const sunlight = new THREE.PointLight(0xffffff, 1.5);
  sunlight.position.set(0, 0, 0);
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
  // Venus has a large retrograde tilt (~177 deg)
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
  mars.rotation.z = THREE.MathUtils.degToRad(25.2); // Axial tilt
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
  jupiter.rotation.z = THREE.MathUtils.degToRad(3.1); // Axial tilt
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
  saturn.rotation.z = THREE.MathUtils.degToRad(26.7); // Axial tilt

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
  uranus.rotation.z = THREE.MathUtils.degToRad(97.8); // Axial tilt
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
  neptune.rotation.z = THREE.MathUtils.degToRad(28.3); // Axial tilt
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
  // Pluto has a large retrograde tilt (~120 deg)
  return pluto;
}
