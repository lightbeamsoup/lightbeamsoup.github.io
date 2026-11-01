// GitHub Pages hosts the UI; the separate Railway service hosts the API.
// Keep local previews on their own Express origin.
export const apiOrigin = ['localhost','127.0.0.1','[::1]'].includes(location.hostname)
  ? '' : 'https://api.joshcodes.ai';
