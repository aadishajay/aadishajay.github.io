// Offline support for Mountain Surfer. This is only ever registered by
// components/games/mountain-surfer/MountainSurferLoader.js, i.e. only once
// someone actually opens the game — everyone else never triggers it. Once
// active it opportunistically caches same-origin GET requests so the game
// (and the static site chrome it's embedded in) keeps working with no
// network. That's safe site-wide here because every page is fully static/
// pre-rendered at build time — there's no runtime API data that could go
// stale.
//
// Keep CACHE_NAME in sync with the copy in MountainSurferLoader.js.
const CACHE_NAME = 'mountain-surfer-cache-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    request.mode === 'navigate' ? networkFirst(request) : staleWhileRevalidate(request)
  )
})

// HTML pages: prefer a fresh network copy (so an online visitor always gets
// the latest build), fall back to whatever was cached last time if the
// network is unreachable.
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch {
    return (await cache.match(request)) || (await cache.match('/games/mountain-surfer'))
  }
}

// Everything else (JS/CSS chunks, fonts, images): serve the cached copy
// instantly if there is one, and refresh it in the background — these are
// content-hashed and effectively immutable, so a cached copy is never
// wrong, just possibly one build behind.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => cached)
  return cached || network
}
