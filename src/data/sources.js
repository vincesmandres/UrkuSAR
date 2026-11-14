const DAY = 86400000
const CACHE_VERSION = 1
const CACHE_TTL = 15 * 60 * 1000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const DEFAULT_QUERY = Object.freeze({
  bbox: Object.freeze([-78.46, -0.74, -78.28, -0.57]),
  start: '2026-10-13',
  end: '2026-11-12',
})

export const SOURCES = Object.freeze([
  {
    id: 'modis',
    label: 'MODIS · MOD14A1',
    kind: 'Térmico / catálogo',
    resolution: '1 km nominal',
    description:
      'Disponibilidad de granules MOD14A1 en NASA CMR. No representa detecciones de fuego ni anomalías calculadas.',
    documentation: 'https://lpdaac.usgs.gov/products/mod14a1v061/',
  },
  {
    id: 'sentinel',
    label: 'Sentinel-1 SLC',
    kind: 'Radar / catálogo',
    resolution: 'Depende del modo de adquisición',
    description:
      'Escenas SLC de ASF. La descarga puede requerir Earthdata Login; deben procesarse para medir desplazamiento.',
    documentation: 'https://docs.asf.alaska.edu/api/basics/',
  },
  {
    id: 'displacement',
    label: 'OPERA DISP-S1',
    kind: 'InSAR / catálogo',
    resolution: 'Grilla de 30 m',
    description:
      'Disponibilidad de productos LOS preprocesados. La cobertura publicada no incluye Ecuador.',
    documentation: 'https://displacement.asf.alaska.edu/',
  },
])

const fail = (message) => {
  throw new Error(message)
}
const source = (id) =>
  SOURCES.find((item) => item.id === id) || fail(`Fuente desconocida: ${id}`)

function date(value, label) {
  if (typeof value !== 'string' || !DATE_RE.test(value))
    fail(`${label} debe ser YYYY-MM-DD`)
  const parsed = Date.parse(`${value}T00:00:00Z`)
  if (
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString().slice(0, 10) !== value
  )
    fail(`${label} inválida`)
  return parsed
}

function queryValue(query = DEFAULT_QUERY) {
  if (!query || !Array.isArray(query.bbox) || query.bbox.length !== 4)
    fail('Región BBOX inválida')
  const [west, south, east, north] = query.bbox
  if (
    ![west, south, east, north].every(Number.isFinite) ||
    west < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    west >= east ||
    south >= north
  )
    fail('Región BBOX inválida')
  const start = date(query.start, 'Fecha inicial')
  const end = date(query.end, 'Fecha final')
  if (end < start || end - start >= 366 * DAY)
    fail(
      'Rango inválido: ordena las fechas y limita la consulta a 366 días inclusive.',
    )
  return {
    bbox: [west, south, east, north],
    start: query.start,
    end: query.end,
  }
}

export function buildSourceUrl(id, query = DEFAULT_QUERY) {
  source(id)
  const q = queryValue(query)
  const [west, south, east, north] = q.bbox
  const start = `${q.start}T00:00:00Z`
  const end = `${q.end}T23:59:59Z`
  if (id === 'modis' || id === 'displacement') {
    const url = new URL('https://cmr.earthdata.nasa.gov/search/granules.json')
    url.searchParams.set(
      'short_name',
      id === 'modis' ? 'MOD14A1' : 'OPERA_L3_DISP-S1_V1',
    )
    url.searchParams.set('bounding_box', q.bbox.join(','))
    url.searchParams.set('temporal', `${start},${end}`)
    url.searchParams.set('page_size', '10')
    url.searchParams.set('sort_key', '-start_date')
    return url.toString()
  }
  const url = new URL('https://api.daac.asf.alaska.edu/services/search/param')
  url.searchParams.set('platform', 'Sentinel-1')
  url.searchParams.set('processingLevel', 'SLC')
  url.searchParams.set('output', 'geojson')
  url.searchParams.set('maxResults', '10')
  url.searchParams.set(
    'intersectsWith',
    `POLYGON((${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south}))`,
  )
  url.searchParams.set('start', start)
  url.searchParams.set('end', end)
  return url.toString()
}

function safeUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.toString()
      : null
  } catch {
    return null
  }
}

function iso(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    fail(`${label} inválido`)
  date(value.slice(0, 10), label)
  return new Date(value).toISOString()
}

export function normalizeSource(id, payload) {
  source(id)
  if (!payload || typeof payload !== 'object') fail('Respuesta JSON inválida')
  let records
  if (id === 'sentinel') {
    if (!Array.isArray(payload.features)) fail('Respuesta ASF sin features')
    records = payload.features.map((feature) => {
      const p = feature?.properties
      if (!p || typeof p !== 'object') fail('Feature ASF inválida')
      const title = p.sceneName || p.granuleName || feature.id
      const url = safeUrl(
        p.url ||
          p.downloadUrl ||
          (title &&
            `https://api.daac.asf.alaska.edu/services/search/param?granuleName=${encodeURIComponent(title)}`),
      )
      if (typeof title !== 'string' || !title.trim() || !url)
        fail('Feature ASF sin identificación o URL segura')
      return {
        id: String(feature.id || title),
        title,
        acquiredAt: iso(p.startTime || p.acquisitionDate, 'startTime'),
        url,
      }
    })
  } else {
    if (!payload.feed || !Array.isArray(payload.feed.entry))
      fail('Respuesta CMR sin feed.entry')
    records = payload.feed.entry.map((entry) => {
      if (
        !entry ||
        typeof entry.id !== 'string' ||
        !entry.id ||
        typeof entry.title !== 'string' ||
        !entry.title.trim() ||
        !entry.time_start
      )
        fail('Entrada CMR inválida')
      const href = Array.isArray(entry.links)
        ? entry.links.find((link) => safeUrl(link?.href))?.href
        : null
      const url = safeUrl(
        href ||
          `https://cmr.earthdata.nasa.gov/search/concepts/${encodeURIComponent(entry.id)}.json`,
      )
      return {
        id: entry.id,
        title: entry.title,
        acquiredAt: iso(entry.time_start, 'time_start'),
        url,
      }
    })
  }
  if (new Set(records.map((record) => record.id)).size !== records.length)
    fail('Respuesta con registros duplicados')
  return records.slice(0, 10)
}

function cacheKey(id, query) {
  return `urkusar:sources:v${CACHE_VERSION}:${id}:${JSON.stringify(query.bbox)}:${query.start}:${query.end}`
}

function readCache(storage, key, id, query, now) {
  const raw = storage.getItem(key)
  try {
    const value = JSON.parse(raw)
    if (
      value?.version !== CACHE_VERSION ||
      value.sourceId !== id ||
      JSON.stringify(value.query) !== JSON.stringify(query) ||
      !Array.isArray(value.records) ||
      value.records.length > 10 ||
      !Number.isFinite(value.fetchedAt) ||
      value.fetchedAt < 0 ||
      value.fetchedAt > now
    )
      return null
    for (const record of value.records) {
      if (
        !record ||
        typeof record.id !== 'string' ||
        !record.id ||
        typeof record.title !== 'string' ||
        !record.title.trim() ||
        !safeUrl(record.url) ||
        iso(record.acquiredAt, 'Fecha en caché') !== record.acquiredAt
      )
        return null
    }
    if (
      new Set(value.records.map((record) => record.id)).size !==
      value.records.length
    )
      return null
    return { value, fresh: now - value.fetchedAt < CACHE_TTL }
  } catch {
    return null
  }
}

export async function loadSource(
  id,
  query = DEFAULT_QUERY,
  { fetchImpl = globalThis.fetch, storage, now = () => Date.now() } = {},
) {
  source(id)
  const cleanQuery = queryValue(query)
  const key = cacheKey(id, cleanQuery)
  let cacheWarning = storage
    ? null
    : 'La caché local no está disponible en esta sesión.'
  let cached
  if (storage) {
    try {
      cached = readCache(storage, key, id, cleanQuery, now())
    } catch {
      cacheWarning = 'La caché local no está disponible.'
    }
  }
  if (cached?.fresh)
    return {
      sourceId: id,
      query: cleanQuery,
      records: cached.value.records,
      fetchedAt: cached.value.fetchedAt,
      status: 'cache',
      error: null,
      cacheWarning,
    }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable')
    const response = await fetchImpl(buildSourceUrl(id, cleanQuery), {
      credentials: 'omit',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response?.ok) throw new Error('remote')
    const records = normalizeSource(id, await response.json())
    const fetchedAt = now()
    try {
      storage?.setItem(
        key,
        JSON.stringify({
          version: CACHE_VERSION,
          sourceId: id,
          query: cleanQuery,
          fetchedAt,
          records,
        }),
      )
    } catch {
      cacheWarning = 'No se pudo guardar la caché local.'
    }
    return {
      sourceId: id,
      query: cleanQuery,
      records,
      fetchedAt,
      status: 'remote',
      error: null,
      cacheWarning,
    }
  } catch {
    if (!cached)
      throw new Error(
        'No fue posible consultar la fuente y no hay caché compatible. Revisa la conexión o inténtalo más tarde; la demo sigue disponible.',
      )
    return {
      sourceId: id,
      query: cleanQuery,
      records: cached.value.records,
      fetchedAt: cached.value.fetchedAt,
      status: 'stale',
      error:
        'No fue posible consultar la fuente remota; se muestran datos antiguos en caché para este mismo rango.',
      cacheWarning,
    }
  } finally {
    clearTimeout(timer)
  }
}

function csv(text) {
  if (
    typeof text !== 'string' ||
    new TextEncoder().encode(text).byteLength > 5 * 1024 * 1024
  )
    fail('CSV ausente o superior a 5 MiB')
  text = text.replace(/^\uFEFF/, '')
  const rows = []
  let row = [],
    cell = '',
    quoted = false,
    closed = false
  const endCell = () => {
    row.push(cell)
    cell = ''
    closed = false
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') {
        quoted = false
        closed = true
      } else cell += c
    } else if (c === ',') endCell()
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      endCell()
      rows.push(row)
      row = []
    } else if (closed) fail('CSV con caracteres después de comillas de cierre')
    else if (c === '"') {
      if (cell !== '') fail('CSV con comillas dentro de un campo sin escapar')
      quoted = true
    } else cell += c
  }
  if (quoted) fail('CSV con comillas sin cerrar')
  if (cell || row.length || closed) {
    endCell()
    rows.push(row)
  }
  if (!rows.length) fail('CSV sin encabezado')
  const headers = rows.shift().map((h) => h.trim())
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
    fail('Encabezado CSV vacío o duplicado')
  return {
    headers,
    rows: rows
      .filter((r) => r.some((v) => v.trim() !== ''))
      .map((r) => {
        if (r.length !== headers.length)
          fail('Fila CSV con un número incorrecto de columnas')
        return Object.fromEntries(headers.map((h, i) => [h, r[i].trim()]))
      }),
  }
}

function num(value, label) {
  if (
    typeof value !== 'string' ||
    !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) ||
    !Number.isFinite(Number(value))
  )
    fail(`${label} ausente o inválido`)
  return Number(value)
}

function location(r) {
  const latitude = num(r.latitude, 'latitude'),
    longitude = num(r.longitude, 'longitude')
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)
    fail('Coordenada fuera de rango')
  return { latitude, longitude }
}

function within(record, query) {
  return (
    record.longitude >= query.bbox[0] &&
    record.longitude <= query.bbox[2] &&
    record.latitude >= query.bbox[1] &&
    record.latitude <= query.bbox[3] &&
    record.acquiredAt.slice(0, 10) >= query.start &&
    record.acquiredAt.slice(0, 10) <= query.end
  )
}

export function parseFirmsCsv(text, query = DEFAULT_QUERY) {
  const q = queryValue(query)
  const { headers, rows } = csv(text)
  const required = [
    'latitude',
    'longitude',
    'acq_date',
    'acq_time',
    'frp',
    'confidence',
    'satellite',
  ]
  if (
    !required.every((h) => headers.includes(h)) ||
    (!headers.includes('brightness') && !headers.includes('bright_ti4'))
  )
    fail('CSV FIRMS sin columnas requeridas')
  const isModis = headers.includes('brightness')
  const all = rows.map((r) => {
    date(r.acq_date, 'acq_date')
    if (!/^\d{1,4}$/.test(r.acq_time)) fail('Hora FIRMS inválida')
    const time = r.acq_time.padStart(4, '0')
    if (Number(time.slice(0, 2)) > 23 || Number(time.slice(2)) > 59)
      fail('Hora FIRMS fuera de rango')
    const record = {
      ...location(r),
      acquiredAt: `${r.acq_date}T${time.slice(0, 2)}:${time.slice(2)}:00.000Z`,
      brightnessK: num(isModis ? r.brightness : r.bright_ti4, 'brightness'),
      frpMw: num(r.frp, 'frp'),
      confidence: r.confidence,
      satellite: r.satellite,
    }
    if (record.brightnessK <= 0 || record.frpMw < 0 || !record.satellite)
      fail('Valores radiométricos o satélite FIRMS inválidos')
    if (isModis) {
      const confidence = num(r.confidence, 'confidence')
      if (confidence < 0 || confidence > 100)
        fail('Confianza MODIS fuera de rango')
    } else if (!['l', 'n', 'h'].includes(r.confidence.toLowerCase()))
      fail('Confianza VIIRS inválida')
    return record
  })
  const records = all.filter((r) => within(r, q))
  return {
    kind: 'thermal-detections',
    source: 'NASA FIRMS (archivo aportado)',
    records,
    totalRows: all.length,
    filteredRows: records.length,
  }
}

export function parseInsarCsv(text, query = DEFAULT_QUERY) {
  const q = queryValue(query)
  const { headers, rows } = csv(text)
  const fields = [
    'latitude',
    'longitude',
    'date',
    'displacement_mm',
    'coherence',
    'reference_date',
    'product_id',
    'source_url',
  ]
  if (!fields.every((h) => headers.includes(h)))
    fail('CSV InSAR sin columnas requeridas')
  const all = rows.map((r) => {
    date(r.date, 'date')
    date(r.reference_date, 'reference_date')
    const record = {
      ...location(r),
      acquiredAt: `${r.date}T00:00:00.000Z`,
      displacementMm: num(r.displacement_mm, 'displacement_mm'),
      coherence: num(r.coherence, 'coherence'),
      referenceDate: r.reference_date,
      productId: r.product_id,
      url: safeUrl(r.source_url),
    }
    if (
      record.coherence < 0 ||
      record.coherence > 1 ||
      r.reference_date > r.date ||
      !record.productId ||
      !record.url
    )
      fail('Registro InSAR inválido')
    return record
  })
  const records = all.filter((r) => within(r, q))
  return {
    kind: 'displacement-observations',
    source: 'InSAR preprocesado (archivo aportado)',
    records,
    totalRows: all.length,
    filteredRows: records.length,
  }
}
