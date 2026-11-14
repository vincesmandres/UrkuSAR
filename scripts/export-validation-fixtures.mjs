import { readFile } from 'node:fs/promises'
import { analyze, DEFAULT_CONFIG } from '../src/data/model.js'
import { exportAnalysis } from '../src/data/export.js'

const zones = JSON.parse(
  await readFile(new URL('../src/data/zones.geojson', import.meta.url)),
)
const observations = JSON.parse(
  await readFile(new URL('../src/data/observations.json', import.meta.url)),
)
const analysis = analyze(zones, observations)
const exportedAt = '2026-11-14T00:00:00.000Z'
const cases = {
  all: exportAnalysis(analysis, { exportedAt }),
  selected: exportAnalysis(analysis, {
    scope: 'selected',
    selectedId: 'Z-04',
    exportedAt,
  }),
  visible: exportAnalysis(analysis, {
    scope: 'visible',
    level: 'elevated',
    exportedAt,
  }),
  weighted: exportAnalysis(
    analyze(zones, observations, {
      ...DEFAULT_CONFIG,
      weights: { thermal: 1, displacement: 0, persistence: 0 },
    }),
    { exportedAt },
  ),
  empty: exportAnalysis(
    analyze(zones, observations, {
      ...DEFAULT_CONFIG,
      normalizers: { thermal: 500, displacement: 2000, persistence: 3000 },
    }),
    { scope: 'visible', level: 'critical', exportedAt },
  ),
}
process.stdout.write(JSON.stringify(cases))
