export const AU = 149597870; // km

export const MAX_SATELLITES = 20000;
export const RAYCASTER_POINT_THRESHOLD = 0.02;
export const REALTIME_UPDATE_INTERVAL_MS = 500;
export const CAMERA_MIN_DISTANCE_FACTOR = 1.5;
export const CAMERA_MAX_DISTANCE_FACTOR = 50;

export const EARTH_RADIUS_KM = 6371;
export const SCALE = 1.0 / EARTH_RADIUS_KM; // scale down so 1 unit = 1 earth radius
export const PLANET_GEOMETRY_DETAIL = 64;

export const SUN_RADIUS = 696340 * SCALE; // km scaled
export const SUN_GEOMETRY_DETAIL = 32;

export const STARFIELD_SPHERE_RADIUS = 50000000;

export const MOON_DISTANCE = 384400 * SCALE; // km scaled
export const MOON_RADIUS = 1737.4 * SCALE; // km scaled
export const MOON_PERIOD_MS = 27.3 * 24 * 60 * 60 * 1000; // 27.3 days
export const MOON_GEOMETRY_DETAIL = 32;

export const HIGHLIGHT_COLOR = 0x00ffff;
export const SELECTION_COLOR = 0xff8800;

export const MERCURY_RADIUS = 2440 * SCALE; // km scaled
export const VENUS_RADIUS = 6052 * SCALE; // km scaled
export const MARS_RADIUS = 3390 * SCALE; // km scaled
export const JUPITER_RADIUS = 69911 * SCALE; // km scaled
export const SATURN_RADIUS = 58232 * SCALE; // km scaled
export const URANUS_RADIUS = 25362 * SCALE; // km scaled
export const NEPTUNE_RADIUS = 24622 * SCALE; // km scaled
export const PLUTO_RADIUS = 1188 * SCALE; // km scaled
