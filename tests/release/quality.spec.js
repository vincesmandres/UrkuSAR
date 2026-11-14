import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function audit(page, testInfo, name) {
  const builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
  ])
  // The sandbox prohibits script injection; its identical report HTML is audited separately.
  if (name === 'report-dialog') builder.exclude('iframe')
  const result = await builder.analyze()
  await testInfo.attach(`${name}-axe`, {
    body: JSON.stringify(
      { violations: result.violations, incomplete: result.incomplete },
      null,
      2,
    ),
    contentType: 'application/json',
  })
  expect(
    result.violations,
    `${name}: infracciones automáticas WCAG A/AA`,
  ).toEqual([])
}

test('production loads under the Pages path without asset errors or automatic external calls', async ({
  page,
  baseURL,
}, testInfo) => {
  const errors = [],
    failures = [],
    external = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(response.url())
  })
  page.on('requestfailed', (request) => failures.push(request.url()))
  page.on('request', (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).origin !== new URL(baseURL).origin
    )
      external.push(request.url())
  })
  const response = await page.goto('./')
  expect(response.status()).toBe(200)
  await expect(page.getByTestId('selected-score')).toHaveText('91')
  await expect(
    page.getByText('DEMOSTRACIÓN SINTÉTICA', { exact: true }),
  ).toBeVisible()
  await page
    .getByText(
      'Auditoría de productos reales · no aptos para calcular riesgo',
      { exact: true },
    )
    .click()
  await audit(page, testInfo, 'production-home')
  expect(errors).toEqual([])
  expect(failures).toEqual([])
  expect(external).toEqual([])
  await page.screenshot({
    path: testInfo.outputPath('production.png'),
    fullPage: true,
  })
})

test('keyboard can skip navigation, select a map zone and close the report', async ({
  page,
}, testInfo) => {
  await page.goto('./')
  await expect(page.getByTestId('selected-score')).toHaveText('91')
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('link', { name: 'Saltar al contenido' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toBeFocused()
  const polygon = page.getByRole('button', {
    name: /Seleccionar Valle de Mulaló/,
  })
  await polygon.focus()
  await page.keyboard.press('Space')
  await expect(
    page.getByRole('heading', { name: 'Valle de Mulaló', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Térmica', exact: true }).click()
  await expect(polygon).toHaveAccessibleName(/Z-01 1,1 °C/)
  await audit(page, testInfo, 'thermal-layer')
  await page.getByRole('button', { name: 'Deformación', exact: true }).click()
  await expect(polygon).toHaveAccessibleName(/Z-01 6,2 mm/)
  await audit(page, testInfo, 'displacement-layer')
  const reportButton = page.getByRole('button', { name: 'Ver reporte de zona' })
  await reportButton.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Cerrar reporte' }),
  ).toBeFocused()
  await expect(page.locator('iframe')).toHaveAttribute(
    'title',
    'Contenido del reporte de zona',
  )
  await audit(page, testInfo, 'report-dialog')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(reportButton).toBeFocused()
})

test('loaded demonstration stays usable offline and exports applied results', async ({
  page,
  context,
}) => {
  await page.goto('./')
  await expect(page.getByTestId('selected-score')).toHaveText('91')
  await context.setOffline(true)
  await page.getByRole('spinbutton', { name: 'Anomalía térmica' }).fill('100')
  await page
    .getByRole('spinbutton', { name: 'Deformación %', exact: true })
    .fill('0')
  await page
    .getByRole('spinbutton', { name: 'Persistencia %', exact: true })
    .fill('0')
  await page.getByRole('button', { name: 'Recalcular índice' }).click()
  await expect(page.getByTestId('selected-score')).toHaveText('96')
  await page
    .getByRole('combobox', { name: 'Alcance de exportación', exact: true })
    .selectOption('selected')
  const pending = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Descargar GeoJSON', exact: true })
    .click()
  const stream = await (await pending).createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  const output = JSON.parse(Buffer.concat(chunks).toString())
  expect(output.features).toHaveLength(1)
  expect(output.features[0].properties.risk).toBe(96)
  expect(output.metadata.status).toBe('synthetic')
})

test('standalone report has accessible content and print layout', async ({
  page,
  context,
}, testInfo) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Ver reporte de zona' }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar reporte HTML' }).click()
  const stream = await (await pending).createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  const report = await context.newPage()
  await report.setContent(Buffer.concat(chunks).toString())
  await audit(report, testInfo, 'standalone-report')
  await report.emulateMedia({ media: 'print' })
  await expect(report.locator('.notice')).toBeVisible()
  await expect(report.getByRole('table')).toBeVisible()
  await report.close()
})

test('error states remain accessible and small-screen reduced-motion layout fits', async ({
  page,
}, testInfo) => {
  await page.goto('./')
  await page.getByRole('spinbutton', { name: 'Anomalía térmica' }).fill('0')
  await page.getByRole('button', { name: 'Recalcular índice' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('spinbutton', { name: 'Anomalía térmica' }).focus()
  await audit(page, testInfo, 'invalid-weights')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 320, height: 700 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    ),
  ).toBe('auto')
})

test('imported observation table is accessible and keyboard-scrollable', async ({
  page,
  browserName,
}, testInfo) => {
  await page.goto('./')
  const csv =
    'latitude,longitude,brightness,frp,confidence,satellite,acq_date,acq_time\n-0.6512345,-78.4123456,310.2,4.5,90,Terra,2026-11-01,1200\n'
  await page.getByLabel('Importar Detecciones FIRMS').setInputFiles({
    name: 'firms-demo.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  })
  await expect(
    page.getByText('1 observaciones en el rango', { exact: true }),
  ).toBeVisible()
  const region = page.getByRole('region', {
    name: 'Observaciones de Detecciones FIRMS',
  })
  if (process.platform === 'win32' && browserName === 'firefox') {
    // Reproduced native Firefox/Windows crash inside axe after file selection.
    // Keep import/keyboard assertions; Linux CI and the other engines run axe.
    testInfo.annotations.push({
      type: 'audit-limitation',
      description:
        'Firefox/Windows: axe after file selection crashes the renderer; import and keyboard checks still run.',
    })
  } else {
    await audit(page, testInfo, 'imported-observations')
  }
  await page.setViewportSize({ width: 320, height: 700 })
  await region.focus()
  await expect(region).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect
    .poll(() =>
      region.evaluate(
        (element) =>
          element.scrollWidth <= element.clientWidth || element.scrollLeft > 0,
      ),
    )
    .toBe(true)
})
