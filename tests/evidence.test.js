import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

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
