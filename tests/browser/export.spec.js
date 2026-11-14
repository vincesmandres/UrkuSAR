import { test, expect } from '@playwright/test'

async function downloadText(page, button) {
  const pending = page.waitForEvent('download')
  await button.click()
  const download = await pending
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return {
    text: Buffer.concat(chunks).toString(),
    filename: download.suggestedFilename(),
  }
}

test('exports visible and selected subsets independently, retaining GIS properties', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('combobox', { name: 'Mostrar', exact: true })
    .selectOption('elevated')
  await page
    .getByRole('combobox', { name: 'Alcance de exportación', exact: true })
    .selectOption('visible')
  const visible = await downloadText(
    page,
    page.getByRole('button', { name: 'Descargar GeoJSON', exact: true }),
  )
  const collection = JSON.parse(visible.text)
  expect(collection.features.map(({ id }) => id)).toEqual(['Z-02'])
  expect(collection.metadata.export.level).toBe('elevated')
  expect(collection.bbox).toEqual([-78.36, -0.66, -78.28, -0.57])
  expect(collection.features[0].properties.thermalWeight).toBe(0.35)
  expect(collection.features[0].properties.coordinateReference).toBe(
    'OGC:CRS84',
  )
  expect(collection.crs.properties.name).toBe('urn:ogc:def:crs:OGC:1.3:CRS84')
  expect(visible.filename).toBe('urkusar-visibles-elevated.geojson')
  await page
    .getByRole('combobox', { name: 'Alcance de exportación', exact: true })
    .selectOption('selected')
  const selected = JSON.parse(
    (
      await downloadText(
        page,
        page.getByRole('button', { name: 'Descargar GeoJSON', exact: true }),
      )
    ).text,
  )
  expect(selected.features.map(({ id }) => id)).toEqual(['Z-04'])
  expect(selected.metadata.export.selectedId).toBe('Z-04')
  expect(selected.metadata.status).toBe('synthetic')
  await page.getByRole('button', { name: /Z-02 Flanco nororiental/ }).click()
  const changed = JSON.parse(
    (
      await downloadText(
        page,
        page.getByRole('button', { name: 'Descargar GeoJSON', exact: true }),
      )
    ).text,
  )
  expect(changed.features.map(({ id }) => id)).toEqual(['Z-02'])
})

test('previews and downloads an autonomous report with current applied weights', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await page.getByRole('spinbutton', { name: 'Anomalía térmica' }).fill('100')
  await page
    .getByRole('spinbutton', { name: 'Deformación %', exact: true })
    .fill('0')
  await page
    .getByRole('spinbutton', { name: 'Persistencia %', exact: true })
    .fill('0')
  await page.getByRole('button', { name: 'Recalcular índice' }).click()
  await page.getByRole('spinbutton', { name: 'Anomalía térmica' }).fill('50')
  await page.getByRole('button', { name: 'Ver reporte de zona' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const frame = page.frameLocator(
    'iframe[title="Contenido del reporte de zona"]',
  )
  await expect(
    frame.getByRole('heading', { name: 'Quebrada Yanasacha' }),
  ).toBeVisible()
  await expect(frame.locator('.score')).toContainText('96')
  await expect(frame.locator('.notice')).toContainText(
    'No es una alerta oficial',
  )
  await page.screenshot({ path: testInfo.outputPath('zone-report.png') })
  const report = await downloadText(
    page,
    page.getByRole('button', { name: 'Descargar reporte HTML' }),
  )
  expect(report.filename).toBe('urkusar-reporte-Z-04.html')
  expect(report.text).toContain('DEMOSTRACIÓN SINTÉTICA')
  expect(report.text).toContain('96')
  expect(report.text).not.toContain('<script')
  expect(report.text).toContain('@media print')
  await page.getByRole('button', { name: 'Cerrar reporte' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Ver reporte de zona' }),
  ).toBeFocused()
})

test('reports selected zone after filtering and closes with Escape', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Z-01 Valle de Mulaló/ }).click()
  await page
    .getByRole('combobox', { name: 'Mostrar', exact: true })
    .selectOption('critical')
  await page.getByRole('button', { name: 'Ver reporte de zona' }).click()
  const frame = page.frameLocator(
    'iframe[title="Contenido del reporte de zona"]',
  )
  await expect(
    frame.getByRole('heading', { name: 'Valle de Mulaló', exact: true }),
  ).toBeVisible()
  await expect(frame.getByText('Z-01', { exact: true })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('downloaded report works offline and supports print layout', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Ver reporte de zona' }).click()
  const report = await downloadText(
    page,
    page.getByRole('button', { name: 'Descargar reporte HTML' }),
  )
  const standalone = await context.newPage()
  await standalone.goto('about:blank')
  await context.setOffline(true)
  await standalone.setContent(report.text)
  await expect(
    standalone.getByRole('heading', { name: 'Quebrada Yanasacha' }),
  ).toBeVisible()
  await standalone.emulateMedia({ media: 'print' })
  await expect(standalone.locator('.notice')).toBeVisible()
  await expect(standalone.getByRole('table')).toBeVisible()
  expect(await standalone.locator('script, link, img').count()).toBe(0)
  await standalone.close()
})
