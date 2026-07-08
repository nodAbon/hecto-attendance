export const ICAL_REFRESH_INTERVAL_SECONDS = 300;

export const ICAL_RESPONSE_HEADERS = {
  'Content-Type': 'text/calendar; charset=utf-8',
  'Cache-Control': 'private, no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
  Pragma: 'no-cache',
  Expires: '0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'X-Accel-Expires': '0',
  'X-Published-TTL': `PT${Math.round(ICAL_REFRESH_INTERVAL_SECONDS / 60)}M`,
};

export function buildIcalHeaders(extraHeaders = {}) {
  return {
    ...ICAL_RESPONSE_HEADERS,
    ...extraHeaders,
  };
}
