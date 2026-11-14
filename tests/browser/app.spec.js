import { test, expect } from '@playwright/test'

test('loads a labeled synthetic demo without browser errors or horizontal overflow', async ({
  page,
}, testInfo) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(
    page.getByRole('heading', {
      name: 'Leer el terreno. Entender sus señales.',
    }),
  ).toBeVisible()
  await expect(
    page.getByText('DEMOSTRACIÓN SINTÉTICA', { exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId('selected-score')).toHaveText('91')
  await expect(page.getByText('EN VIVO', { exact: true })).toHaveCount(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  expect(errors).toEqual([])
  await page.screenshot({
    path: testInfo.outputPath('urkusar.png'),
    fullPage: true,
  })
})

test('fits narrow phones, tablets and intermediate desktop sizes', async ({
  page,
}) => {
  await page.goto('/')
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  }
})

test('selects zones by list and keyboard and filters map polygons', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Z-02 Flanco nororiental/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Flanco nororiental', exact: true }),
  ).toBeVisible()
  const mapZone = page.getByRole('button', {
    name: /Seleccionar Valle de Mulaló/,
  })
  await mapZone.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('heading', { name: 'Valle de Mulaló', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('combobox', { name: 'Mostrar', exact: true })
    .selectOption('critical')
  await expect(page.locator('.map-zone')).toHaveCount(1)
  await expect(page.locator('.zone-row')).toHaveCount(1)
  await expect(
    page.getByText('Esta selección está fuera del filtro actual.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Térmica', exact: true }).click()
  await expect(page.locator('.polygon-value')).toContainText('°C')
})

test('recalculates weights, preserves results for invalid config and exports computed GeoJSON', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('spinbutton', { name: 'Anomalía térmica' }).fill('100')
  await page
    .getByRole('spinbutton', { name: 'Deformación %', exact: true })
    .fill('0')
  await page
    .getByRole('spinbutton', { name: 'Persistencia %', exact: true })
    .fill('0')
  await page.getByRole('button', { name: 'Recalcular índice' }).click()
  await expect(page.getByTestId('selected-score')).toHaveText('96')
  await page.getByRole('spinbutton', { name: 'Anomalía térmica' }).fill('50')
  await page.getByRole('button', { name: 'Recalcular índice' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByTestId('selected-score')).toHaveText('96')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar GeoJSON' }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  const data = JSON.parse(Buffer.concat(chunks).toString())
  expect(data.type).toBe('FeatureCollection')
  expect(data.features[0].properties.risk).toBe(96)
  expect(data.features[0].properties.explanation.weights.thermal).toBe(1)
  expect(data.features[0].geometry.type).toBe('Polygon')
  await page.getByRole('button', { name: 'Restablecer', exact: true }).click()
  await expect(page.getByTestId('selected-score')).toHaveText('91')
  await expect(page.getByRole('alert')).toHaveCount(0)
})
