import { DEFAULT_QUERY, SOURCES, loadSource } from '../src/data/sources.js'

let failures = 0
for (const source of SOURCES) {
  try {
    const result = await loadSource(source.id, DEFAULT_QUERY)
    console.log(
      `${source.id}: ${result.records.length} registros de catálogo, ${result.status}, consulta ${result.fetchedAt}`,
    )
  } catch (error) {
    failures += 1
    console.error(`${source.id}: ${error.message}`)
  }
}
console.log(
  'Los registros de catálogo no son observaciones de anomalía ni deformación.',
)
process.exitCode = failures ? 1 : 0
