import zonesRaw from './zones.geojson?raw'
import observations from './observations.json'

const zonesGeoJson = JSON.parse(zonesRaw)

const LEVELS = new Set(['critical', 'elevated', 'watch'])

export function validateData({ zones = zonesGeoJson, observationData = observations } = {}) {
  if (zones.type !== 'FeatureCollection' || !Array.isArray(zones.features) || zones.features.length === 0) {
    throw new Error('El fixture de zonas debe ser un FeatureCollection no vacío.')
  }
  const zoneIds = new Set()
  for (const feature of zones.features) {
    const properties = feature.properties || {}
    if (!feature.id || zoneIds.has(feature.id)) throw new Error(`ID de zona inválido o duplicado: ${feature.id}`)
    if (!LEVELS.has(properties.level)) throw new Error(`Nivel inválido en ${feature.id}: ${properties.level}`)
    if (typeof properties.risk !== 'number' || properties.risk < 0 || properties.risk > 100) throw new Error(`Riesgo fuera de rango en ${feature.id}`)
    if (typeof properties.displacementMm !== 'number' || typeof properties.thermalAnomalyC !== 'number') throw new Error(`Métricas incompletas en ${feature.id}`)
    if (feature.geometry?.type !== 'Polygon') throw new Error(`Geometría no soportada en ${feature.id}`)
    zoneIds.add(feature.id)
  }
  if (!Array.isArray(observationData.observations)) throw new Error('Las observaciones deben ser un arreglo.')
  for (const observation of observationData.observations) {
    if (!zoneIds.has(observation.zoneId)) throw new Error(`Observación sin zona asociada: ${observation.zoneId}`)
    if (typeof observation.confidence !== 'number' || observation.confidence < 0 || observation.confidence > 1) throw new Error(`Confianza inválida en ${observation.zoneId}`)
  }
  return true
}

export function getZones() {
  validateData()
  return zonesGeoJson.features.map(({ id, properties }) => ({
    id,
    name: properties.name,
    level: properties.level,
    risk: properties.risk,
    displacement: properties.displacementMm,
    thermal: properties.thermalAnomalyC,
    area: `${properties.areaKm2} km²`,
    points: properties.observationPoints.toLocaleString('en-US'),
    path: properties.mapPath,
    cx: properties.mapCenter[0],
    cy: properties.mapCenter[1],
  }))
}

export const dataMetadata = observations
