importScripts('https://cdn.jsdelivr.net/npm/satellite.js@4.0.0/dist/satellite.min.js');

self.onmessage = (e) => {
    const { tleData, time } = e.data;
    const positions = tleData.map(tle => {
        if (!tle.TLE_LINE1 || !tle.TLE_LINE2 || typeof tle.TLE_LINE1 !== 'string' || typeof tle.TLE_LINE2 !== 'string') {
            console.error('Invalid TLE data:', tle);
            return { x: 0, y: 0, z: 0 };
        }

        try {
            const satrec = satellite.twoline2satrec(tle.TLE_LINE1, tle.TLE_LINE2);
            const positionAndVelocity = satellite.propagate(satrec, new Date(time));
            if (!positionAndVelocity.position) return { x: 0, y: 0, z: 0 };

            const gmst = satellite.gstime(new Date(time));
            const position = satellite.eciToGeodetic(positionAndVelocity.position, gmst);

            // Convert geodetic to Cartesian coordinates
            const earthRadius = 1; // Earth radius in Three.js units
            const altitude = position.height / 6371; // Height in Earth radii (6371 km is Earth's radius)
            const radius = earthRadius + altitude; // Total distance from Earth's center

            // Latitude and longitude in radians
            const lat = position.latitude; // Already in radians
            const lon = position.longitude; // Already in radians

            // Convert to Cartesian (x, y, z)
            const x = radius * Math.cos(lat) * Math.cos(lon);
            const y = radius * Math.sin(lat); // y is up
            const z = radius * Math.cos(lat) * Math.sin(lon);

            return { x, y, z };
        } catch (error) {
            console.error('Error processing TLE:', tle, error);
            return { x: 0, y: 0, z: 0 };
        }
    });
    self.postMessage(positions);
};