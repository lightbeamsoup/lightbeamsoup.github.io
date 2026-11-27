import {photoCatalog} from './photo-catalog.js';

const producerAliases = new Map([
  ['the steven kent winery', 'steven kent winery'],
  ['the lineage collection steven kent winery', 'steven kent winery'],
]);

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function wineKey(producer, name) {
  const winery = normalize(producer);
  return `${producerAliases.get(winery) ?? winery}:${normalize(name)}`;
}

const photosByWine = new Map();
for (const entry of photoCatalog) {
  for (const name of entry.names) {
    const key = wineKey(entry.producer, name);
    const photos = photosByWine.get(key) ?? [];
    photos.push(...entry.photos);
    photosByWine.set(key, photos);
  }
}

export function findBottlePhoto({producer, name, year}) {
  const photos = photosByWine.get(wineKey(producer, name));
  if (!photos) return null;

  const vintage = String(year ?? '').trim().toUpperCase();
  const exact = vintage && photos.find(photo => photo.vintage === vintage);
  if (exact) return exact;
  const generic = photos.find(photo => photo.vintage === '');
  if (generic) return generic;
  const dated = photos.filter(photo => /^\d{4}$/.test(photo.vintage));
  if (!/^\d{4}$/.test(vintage) || !dated.length) return photos[0];

  const distance = photo => Math.abs(Number(photo.vintage) - Number(vintage));
  return dated.reduce((closest, photo) => distance(photo) < distance(closest) ? photo : closest);
}

export function bottlePhotoUrl(photo) {
  return new URL(`./bottle-photos/${photo.file}.webp`, import.meta.url).href;
}
