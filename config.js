export const EARTH_RADIUS_KM = 6371;
export const SCALE = 1.0 / EARTH_RADIUS_KM; // scale down so 1 unit = 1 earth radius
export const SUN_DISTANCE = 149597870 * SCALE; // km
export const SUN_RADIUS = 696340 * SCALE; // km
export const MAX_SATELLITES = 20000;
export const RAYCASTER_POINT_THRESHOLD = 0.02;
export const PLANET_GEOMETRY_DETAIL = 64;
export const SUN_GEOMETRY_DETAIL = 32;
export const STARFIELD_SPHERE_RADIUS = 50000;
