export const config = {
  matcher: ['/((?!favicon|_next/static|_next/image|assets/).*)'],
};

export default function middleware(request) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/health')) return;

  const auth = request.headers.get('authorization');
  if (auth) {
    const [scheme, encoded] = auth.split(' ');
    if (scheme === 'Basic' && encoded) {
      try {
        const decoded = atob(encoded);
        const idx = decoded.indexOf(':');
        const provided = idx >= 0 ? decoded.slice(idx + 1) : decoded;
        if (provided === password) return;
      } catch {
        // fall through to 401
      }
    }
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Phone Call OpenClaw"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
