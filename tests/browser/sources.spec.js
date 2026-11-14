import { test, expect } from '@playwright/test'

async function mockCatalogs(page) {
  await page.route(
    'https://cmr.earthdata.nasa.gov/search/granules.json?**',
    async (route) => {
      const displacement =
        new URL(route.request().url()).searchParams.get('short_name') ===
        'OPERA_L3_DISP-S1_V1'
      await route.fulfill({
        json: {
          feed: {
            entry: displacement
              ? []
              : [
                  {
                    id: 'G1234-TEST',
                    title: 'MOD14A1 catálogo de prueba',
                    time_start: '2026-11-01T00:00:00Z',
                    links: [{ href: 'https://example.org/modis' }],
                  },
                ],
          },
        },
      })
    },
  )
  await page.route(
    'https://api.daac.asf.alaska.edu/services/search/param?**',
    (route) =>
      route.fulfill({
        json: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              id: 'S1-TEST',
              properties: {
                sceneName: 'Sentinel-1 SLC de prueba',
                startTime: '2026-11-01T00:00:00Z',
                url: 'https://example.org/sentinel',
              },
            },
          ],
        },
      }),
  )
}

test('loads remote metadata, distinguishes no coverage and never replaces synthetic score', async ({
  page,
}) => {
  await mockCatalogs(page)
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Consultar catálogos', exact: true })
    .click()
  await expect(page.getByText('Consulta remota', { exact: true })).toHaveCount(
    3,
  )
  await expect(
    page.getByRole('link', { name: /MOD14A1 catálogo de prueba/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /Sentinel-1 SLC de prueba/ }),
  ).toBeVisible()
  await expect(
    page.getByText('0 registros recibidos', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(/Sin resultados para esta región/)).toBeVisible()
  await expect(page.getByTestId('selected-score')).toHaveText('91')
  await page.reload()
  await page
    .getByRole('button', { name: 'Consultar catálogos', exact: true })
    .click()
  await expect(page.getByText('Caché reciente', { exact: true })).toHaveCount(3)
})

test('remote errors leave the offline demonstration available', async ({
  page,
}) => {
  await page.route('https://cmr.earthdata.nasa.gov/**', (route) =>
    route.abort(),
  )
  await page.route('https://api.daac.asf.alaska.edu/**', (route) =>
    route.fulfill({ status: 503, body: 'Service unavailable' }),
  )
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Consultar catálogos', exact: true })
    .click()
  await expect(
    page.getByText('Consulta no disponible', { exact: true }),
  ).toHaveCount(3)
  await expect(page.getByTestId('selected-score')).toHaveText('91')
  await page.getByRole('button', { name: /Z-02 Flanco nororiental/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Flanco nororiental', exact: true }),
  ).toBeVisible()
})

test('uses stale cache on failure but never for a different query', async ({
  page,
}) => {
  await page.clock.install()
  await mockCatalogs(page)
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Consultar catálogos', exact: true })
    .click()
  await expect(page.getByText('Consulta remota', { exact: true })).toHaveCount(
    3,
  )
  await page.clock.setFixedTime(new Date(Date.now() + 16 * 60 * 1000))
  await page.route('https://cmr.earthdata.nasa.gov/**', (route) =>
    route.abort(),
  )
  await page.route('https://api.daac.asf.alaska.edu/**', (route) =>
    route.abort(),
  )
  await page
    .getByRole('button', { name: 'Consultar catálogos', exact: true })
    .click()
  await expect(
    page.getByText('Caché antigua · sin conexión', { exact: true }),
  ).toHaveCount(3)
  await page.getByLabel('Desde', { exact: true }).fill('2026-10-14')
  await page
    .getByRole('button', { name: 'Consultar catálogos', exact: true })
    .click()
  await expect(
    page.getByText('Consulta no disponible', { exact: true }),
  ).toHaveCount(3)
  await expect(
    page.getByRole('link', { name: /MOD14A1 catálogo de prueba/ }),
  ).toHaveCount(0)
})

test('imports FIRMS and processed InSAR CSV without converting them into a risk score', async ({
  page,
}) => {
  await page.goto('/')
  const firms =
    'latitude,longitude,brightness,frp,confidence,satellite,acq_date,acq_time\n-0.65,-78.4,310.2,4.5,90,Terra,2026-11-01,1200\n'
  const insar =
    'latitude,longitude,date,displacement_mm,coherence,reference_date,product_id,source_url\n-0.65,-78.4,2026-11-01,-12.4,0.85,2026-10-01,S1-processed,https://example.org/product\n'
  await page
    .getByLabel('Importar Detecciones FIRMS')
    .setInputFiles({
      name: 'firms.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(firms),
    })
  await page
    .getByLabel('Importar Deformación InSAR')
    .setInputFiles({
      name: 'insar.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(insar),
    })
  await expect(
    page.getByText('1 observaciones en el rango', { exact: true }),
  ).toHaveCount(2)
  await expect(
    page.getByRole('cell', { name: '310.2', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('cell', { name: '-12.4', exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId('selected-score')).toHaveText('91')
  await page
    .getByLabel('Importar Detecciones FIRMS')
    .setInputFiles({
      name: 'bad.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('wrong,header\n1,2'),
    })
  await expect(page.getByRole('alert')).toContainText(
    'No se reemplazó la última importación válida.',
  )
  await expect(
    page.getByRole('cell', { name: '310.2', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})

test('rejects invalid date intervals before any remote request', async ({
  page,
}) => {
  let requests = 0
  await page.route('https://cmr.earthdata.nasa.gov/**', (route) => {
    requests += 1
    return route.abort()
  })
  await page.goto('/')
  await page.getByLabel('Desde', { exact: true }).fill('2026-12-01')
  await page
    .getByRole('button', { name: 'Consultar catálogos', exact: true })
    .click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(requests).toBe(0)
})
