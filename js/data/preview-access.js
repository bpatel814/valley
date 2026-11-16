// Temporary home-play restriction requested by Balk. Revert by changing ONLY
// this value to false, then run python tools/version_modules.py and refresh.
// This never rewrites saved parent settings, drawings, or activity progress.
export const DRAWING_ONLY_PREVIEW = false;

const PAUSED_ROUTES = new Set([
  'stories', 'studio', 'bridge', 'discovery', 'treehouse', 'grandma', 'play-stage',
]);

export function isPreviewRouteEnabled(route) {
  return !DRAWING_ONLY_PREVIEW || !PAUSED_ROUTES.has(route);
}
