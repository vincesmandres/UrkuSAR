import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const series = JSON.parse(
  await readFile(new URL('../src/data/thermal-series.json', import.meta.url)),
)

test('thermal reference archive retains quality gaps instead of inventing anomalies', () => {
  assert.equal(series.eligibleForRiskIndex, false)
  assert.equal(series.retrievalComplete, true)
  assert.equal(series.sources.length, 41)
  assert.equal(new Set(series.sources.map((s) => s.date)).size, 41)
  assert.equal(series.method.periodStart, series.sarContext.referenceDate)
  assert.equal(series.method.periodEnd, series.sarContext.secondaryDate)
  assert.ok(series.method.baselineEnd < series.method.periodStart)
  assert.equal(series.baselineEligiblePixels, 0)
  assert.equal(series.comparedObservations, 0)
  assert.equal(
    series.pixels.reduce((n, p) => n + p.baselineValidDays, 0),
    1,
  )
  for (const source of series.sources) {
    assert.equal(new URL(source.url).hostname, 'noaa-goes19.s3.amazonaws.com')
    assert.match(source.sha256, /^[a-f0-9]{64}$/)
    assert.equal(source.status, 'available')
  }
  for (const pixel of series.pixels) {
    assert.equal(pixel.baselineMedianK, null)
    assert.equal(pixel.longestObservedRunDays, null)
    assert.equal(pixel.observations.length, 13)
    assert.ok(
      pixel.observations.every(
        (o) =>
          o.anomalyC === null &&
          o.temperatureK === null &&
          o.status === 'quality-rejected',
      ),
    )
  }
})

const evidence = JSON.parse(
  await readFile(new URL('../src/data/product-audit.json', import.meta.url)),
)

test('audited products retain provenance and explicitly refuse an unsupported score', () => {
  assert.equal(evidence.eligibleForRiskIndex, false)
  assert.ok(evidence.blockers.length >= 4)
  assert.ok(Number.isFinite(Date.parse(evidence.checkedAt)))
  for (const product of Object.values(evidence.products)) {
    assert.match(product.sha256, /^[a-f0-9]{64}$/)
    assert.ok(product.bytes > 0)
    assert.equal(new URL(product.url).protocol, 'https:')
    assert.equal(new URL(product.license).protocol, 'https:')
  }
  assert.equal(evidence.products.licsar.type, 'coherence-only')
  const [west, south, east, north] = evidence.products.licsar.bounds
  assert.ok(
    west <= evidence.bbox[0] &&
      south <= evidence.bbox[1] &&
      east >= evidence.bbox[2] &&
      north >= evidence.bbox[3],
  )
  assert.equal(evidence.products.goes.anomalyC, null)
  assert.equal(evidence.products.goes.baselineStatus, 'not-established')
  if (!evidence.products.goes.highQualitySamples) {
    assert.equal(evidence.products.goes.temperatureKMin, null)
    assert.equal(evidence.products.goes.temperatureKMax, null)
  }
})
