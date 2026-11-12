import { readFile } from 'node:fs/promises'

const zones = JSON.parse(await readFile(new URL('../src/data/zones.geojson', import.meta.url)))
const observations = JSON.parse(await readFile(new URL('../src/data/observations.json', import.meta.url)))
const ids = new Set()
const levels = new Set(['critical', 'elevated', 'watch'])

if (zones.type !== 'FeatureCollection' || !zones.features?.length) throw new Error('zones.geojson no es un FeatureCollection válido')
for (const feature of zones.features) {
  const p = feature.properties
  if (!feature.id || ids.has(feature.id)) throw new Error(`ID inválido o duplicado: ${feature.id}`)
  if (!p?.name || !levels.has(p.level)) throw new Error(`Propiedades inválidas en ${feature.id}`)
  if (![p.risk, p.displacementMm, p.thermalAnomalyC].every(Number.isFinite)) throw new Error(`Métricas inválidas en ${feature.id}`)
  if (feature.geometry?.type !== 'Polygon') throw new Error(`Geometría inválida en ${feature.id}`)
  ids.add(feature.id)
}
if (!observations.observations?.length) throw new Error('observations.json no contiene observaciones')
for (const observation of observations.observations) {
  if (!ids.has(observation.zoneId)) throw new Error(`Observación sin zona: ${observation.zoneId}`)
  if (!Number.isFinite(observation.confidence) || observation.confidence < 0 || observation.confidence > 1) throw new Error(`Confianza inválida: ${observation.zoneId}`)
}
console.log(`Data validada: ${zones.features.length} zonas, ${observations.observations.length} observaciones`)
