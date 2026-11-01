// GitHub Pages hosts the UI; Cloudflare Workers + D1 host the API.
// Keep local previews on their own Express origin.
export const apiOrigin = ['localhost','127.0.0.1','[::1]'].includes(location.hostname)
  ? '' : 'https://goalroom-api.joshcodes-ai.workers.dev';
