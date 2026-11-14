import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_QUERY,
  SOURCES,
  buildSourceUrl,
  normalizeSource,
  loadSource,
  parseFirmsCsv,
  parseInsarCsv,
} from '../src/data/sources.js'

test('declara consulta y URLs de catálogo sin credenciales', () => {
  assert.deepEqual(DEFAULT_QUERY, {
    bbox: [-78.46, -0.74, -78.28, -0.57],
    start: '2026-10-13',
    end: '2026-11-12',
  })
  assert.deepEqual(
    SOURCES.map((s) => s.id),
    ['modis', 'sentinel', 'displacement'],
  )
  const modis = new URL(buildSourceUrl('modis'))
  assert.equal(modis.searchParams.get('short_name'), 'MOD14A1')
  assert.equal(modis.searchParams.get('page_size'), '10')
  assert.equal(modis.searchParams.get('sort_key'), '-start_date')
  const asf = new URL(buildSourceUrl('sentinel'))
  assert.equal(asf.searchParams.get('platform'), 'Sentinel-1')
  assert.equal(asf.searchParams.get('processingLevel'), 'SLC')
  assert.equal(asf.searchParams.get('output'), 'geojson')
  assert.throws(() =>
    buildSourceUrl('modis', { ...DEFAULT_QUERY, bbox: [1, 2, 1, 3] }),
  )
  assert.throws(() =>
    buildSourceUrl('modis', {
      ...DEFAULT_QUERY,
      start: '2026-01-01',
      end: '2027-02-01',
    }),
  )
})

test('normaliza CMR/ASF, permite vacíos y rechaza payloads o enlaces inseguros', () => {
  assert.deepEqual(normalizeSource('modis', { feed: { entry: [] } }), [])
  assert.deepEqual(normalizeSource('sentinel', { features: [] }), [])
  const cmr = normalizeSource('modis', {
    feed: {
      entry: [
        {
          id: 'x',
          title: 'Granule',
          time_start: '2026-11-01T00:00:00Z',
          links: [{ href: 'https://example.test/x' }],
        },
      ],
    },
  })
  assert.equal(cmr[0].url, 'https://example.test/x')
  assert.throws(() => normalizeSource('modis', {}), /feed.entry/)
  assert.throws(() =>
    normalizeSource('sentinel', {
      features: [
        {
          id: 'x',
          properties: {
            sceneName: 'x',
            startTime: '2026-11-01',
            url: 'http://unsafe',
          },
        },
      ],
    }),
  )
})

test('caché distingue consulta, TTL, stale, offline y cuota', async () => {
  let now = 1000000
  const map = new Map()
  const storage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
  }
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ feed: { entry: [] } }),
  })
  const first = await loadSource('modis', DEFAULT_QUERY, {
    fetchImpl,
    storage,
    now: () => now,
  })
  assert.equal(first.status, 'remote')
  assert.equal(
    (
      await loadSource('modis', DEFAULT_QUERY, {
        fetchImpl: async () => {
          throw new Error()
        },
        storage,
        now: () => now + 1,
      })
    ).status,
    'cache',
  )
  now += 16 * 60 * 1000
  const stale = await loadSource('modis', DEFAULT_QUERY, {
    fetchImpl: async () => {
      throw new Error()
    },
    storage,
    now: () => now,
  })
  assert.equal(stale.status, 'stale')
  assert.match(stale.error, /caché/)
  await assert.rejects(
    () =>
      loadSource(
        'modis',
        { ...DEFAULT_QUERY, end: '2026-11-11' },
        {
          fetchImpl: async () => {
            throw new Error()
          },
          storage,
          now: () => now,
        },
      ),
    /no hay caché/,
  )
  const quota = await loadSource('modis', DEFAULT_QUERY, {
    fetchImpl,
    storage: {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    },
    now: () => 1,
  })
  assert.match(quota.cacheWarning, /caché/)
})

test('parsea FIRMS con MODIS/VIIRS, comillas, BOM, filtros y rechaza campos', () => {
  const text =
    '\uFEFFlatitude,longitude,acq_date,acq_time,bright_ti4,frp,confidence,satellite\r\n-0.65,-78.35,2026-11-01,1200,310.5,4.2,n,VIIRS\r\n-5,-78,2026-11-01,1200,300,2,n,"NOAA,20"\r\n'
  const result = parseFirmsCsv(text, DEFAULT_QUERY)
  assert.equal(result.totalRows, 2)
  assert.equal(result.filteredRows, 1)
  assert.equal(result.records[0].brightnessK, 310.5)
  assert.throws(() =>
    parseFirmsCsv('latitude,longitude,acq_date,brightness\n-0.6,-78.3,bad,300'),
  )
  assert.throws(() =>
    parseFirmsCsv(
      'latitude,longitude,acq_date,brightness\n-0.6,-78.3,2026-11-01,"unterminated',
    ),
  )
  assert.equal(
    parseFirmsCsv(
      'latitude,longitude,acq_date,acq_time,brightness,frp,confidence,satellite\n',
    ).totalRows,
    0,
  )
})

test('parsea InSAR normalizado, fechas de referencia y URLs https', () => {
  const text =
    'latitude,longitude,date,displacement_mm,coherence,reference_date,product_id,source_url\n-0.65,-78.35,2026-11-01,-3.2,0.8,2026-10-01,P-1,https://example.test/p\n-0.65,-78.35,2026-01-01,1,0.5,2025-12-02,P-2,https://example.test/q\n'
  const result = parseInsarCsv(text, DEFAULT_QUERY)
  assert.equal(result.kind, 'displacement-observations')
  assert.equal(result.totalRows, 2)
  assert.equal(result.filteredRows, 1)
  assert.equal(result.records[0].displacementMm, -3.2)
  assert.throws(() => parseInsarCsv(text.replace('0.8,2026', '1.2,2026')))
  assert.throws(() =>
    parseInsarCsv(
      text.replace('https://example.test/p', 'http://example.test/p'),
    ),
  )
  assert.equal(
    parseInsarCsv(
      'latitude,longitude,date,displacement_mm,coherence,reference_date,product_id,source_url\n',
    ).totalRows,
    0,
  )
})

const firmsHeader =
  'latitude,longitude,acq_date,acq_time,brightness,frp,confidence,satellite'
const firmsRow = '-0.65,-78.35,2026-11-01,1200,310.5,4.2,90,Terra'
const insarHeader =
  'latitude,longitude,date,displacement_mm,coherence,reference_date,product_id,source_url'
const insarRow =
  '-0.65,-78.35,2026-11-01,-3.2,0.8,2026-10-01,P-1,https://example.test/p'

for (const [name, text] of [
  ['header vacío', ''],
  ['header desconocido sin filas', 'wrong,header\n'],
  ['header duplicado', `${firmsHeader},latitude\n`],
  ['dato numérico vacío', `${firmsHeader}\n${firmsRow.replace('310.5', '')}`],
  ['cero Kelvin', `${firmsHeader}\n${firmsRow.replace('310.5', '0')}`],
  ['FRP negativo', `${firmsHeader}\n${firmsRow.replace('4.2', '-1')}`],
  [
    'fecha imposible',
    `${firmsHeader}\n${firmsRow.replace('2026-11-01', '2026-02-30')}`,
  ],
  ['hora inválida', `${firmsHeader}\n${firmsRow.replace('1200', '2460')}`],
  [
    'coordenada inválida',
    `${firmsHeader}\n${firmsRow.replace('-0.65', '-91')}`,
  ],
  ['columna incompleta', `${firmsHeader}\n${firmsRow},extra`],
  [
    'comillas rotas',
    `${firmsHeader}\n${firmsRow.replace('Terra', '"Terra"extra')}`,
  ],
  [
    'confianza MODIS inválida',
    `${firmsHeader}\n${firmsRow.replace(',90,', ',101,')}`,
  ],
]) {
  test(`rechaza FIRMS ${name}`, () => assert.throws(() => parseFirmsCsv(text)))
}

for (const [name, text] of [
  [
    'unidad incorrecta',
    `${insarHeader.replace('displacement_mm', 'displacement_m')}\n${insarRow}`,
  ],
  ['dato ausente', `${insarHeader}\n${insarRow.replace('-3.2', '')}`],
  [
    'coherencia fuera de rango',
    `${insarHeader}\n${insarRow.replace('0.8', '-0.1')}`,
  ],
  [
    'referencia posterior',
    `${insarHeader}\n${insarRow.replace('2026-10-01', '2026-12-01')}`,
  ],
  [
    'referencia inexistente',
    `${insarHeader}\n${insarRow.replace('2026-10-01', '2026-02-30')}`,
  ],
  [
    'URL con credenciales',
    `${insarHeader}\n${insarRow.replace('https://', 'https://user:secret@')}`,
  ],
  [
    'protocolo no HTTPS',
    `${insarHeader}\n${insarRow.replace('https://example.test/p', 'javascript:alert(1)')}`,
  ],
]) {
  test(`rechaza InSAR ${name}`, () => assert.throws(() => parseInsarCsv(text)))
}

test('CSV valida consulta incluso sin datos y acepta extremos inclusivos', () => {
  assert.throws(() =>
    parseInsarCsv(`${insarHeader}\n`, { ...DEFAULT_QUERY, bbox: [] }),
  )
  const result = parseFirmsCsv(
    `${firmsHeader}\n${firmsRow.replace('-78.35', '-78.46').replace('2026-11-01', DEFAULT_QUERY.end).replace('1200', '2359')}`,
  )
  assert.equal(result.filteredRows, 1)
  const filtered = parseFirmsCsv(
    `${firmsHeader}\n${firmsRow.replace('2026-11-01', '2026-01-01')}`,
  )
  assert.equal(filtered.totalRows, 1)
  assert.equal(filtered.filteredRows, 0)
  assert.equal(
    parseFirmsCsv(`${firmsHeader}\n${firmsRow.replace('1200', '5')}`).records[0]
      .acquiredAt,
    '2026-11-01T00:05:00.000Z',
  )
})

test('CSV limita bytes UTF-8 y no solo caracteres', () => {
  assert.throws(() => parseInsarCsv('é'.repeat(3 * 1024 * 1024)), /5 MiB/)
})

test('valida intervalos y rangos inclusivos de consulta', () => {
  assert.throws(() =>
    buildSourceUrl('modis', { ...DEFAULT_QUERY, start: '2026-02-30' }),
  )
  assert.throws(() =>
    buildSourceUrl('modis', { ...DEFAULT_QUERY, bbox: [-181, -1, -78, 1] }),
  )
  assert.throws(() =>
    buildSourceUrl('modis', { ...DEFAULT_QUERY, start: '2026-11-13' }),
  )
  assert.equal(
    new URL(buildSourceUrl('sentinel')).searchParams.get('end'),
    '2026-11-12T23:59:59Z',
  )
})

test('sin red ni caché no se simulan resultados vacíos', async () => {
  await assert.rejects(
    () => loadSource('modis', DEFAULT_QUERY, { fetchImpl: null }),
    /no hay caché/,
  )
  await assert.rejects(
    () =>
      loadSource('modis', DEFAULT_QUERY, {
        fetchImpl: async () => ({ ok: false }),
      }),
    /no hay caché/,
  )
  await assert.rejects(
    () =>
      loadSource('modis', DEFAULT_QUERY, {
        fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
      }),
    /no hay caché/,
  )
})

test('caché corrupta o con URLs inseguras nunca se devuelve', async () => {
  const map = new Map()
  const storage = {
    getItem: (k) => map.get(k),
    setItem: (k, v) => map.set(k, v),
  }
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      feed: {
        entry: [
          { id: 'G1', title: 'Granule', time_start: '2026-11-01T00:00:00Z' },
        ],
      },
    }),
  })
  await loadSource('modis', DEFAULT_QUERY, {
    storage,
    fetchImpl,
    now: () => 1000,
  })
  const key = [...map.keys()][0]
  const valid = map.get(key)
  const corruptions = [
    (v) => {
      v.records[0].url = 'javascript:alert(1)'
    },
    (v) => {
      v.records[0].acquiredAt = 'yesterday'
    },
    (v) => {
      v.fetchedAt = 3000
    },
    (v) => {
      v.records.push(null)
    },
    (v) => {
      v.version = 0
    },
  ]
  for (const change of corruptions) {
    const value = JSON.parse(valid)
    change(value)
    map.set(key, JSON.stringify(value))
    await assert.rejects(() =>
      loadSource('modis', DEFAULT_QUERY, {
        storage,
        fetchImpl: null,
        now: () => 2000,
      }),
    )
  }
  map.set(key, '{broken')
  assert.equal(
    (
      await loadSource('modis', DEFAULT_QUERY, {
        storage,
        fetchImpl,
        now: () => 2000,
      })
    ).status,
    'remote',
  )
})

test('fallo de almacenamiento no bloquea una respuesta remota', async () => {
  const result = await loadSource('modis', DEFAULT_QUERY, {
    storage: {
      getItem() {
        throw new Error('blocked')
      },
      setItem() {
        throw new Error('blocked')
      },
    },
    fetchImpl: async (url, options) => {
      assert.equal(options.credentials, 'omit')
      return { ok: true, json: async () => ({ feed: { entry: [] } }) }
    },
  })
  assert.equal(result.status, 'remote')
  assert.match(result.cacheWarning, /caché/)
})

test('timeout aborta la solicitud sin presentar registros inventados', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const request = loadSource('modis', DEFAULT_QUERY, {
    fetchImpl: (url, { signal }) =>
      new Promise((resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('aborted'))),
      ),
  })
  const rejection = assert.rejects(request, /no hay caché/)
  context.mock.timers.tick(15000)
  await rejection
})
