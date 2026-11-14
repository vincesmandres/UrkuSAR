const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const DEFAULT_CONFIG = Object.freeze({
  weights: Object.freeze({
    thermal: 0.35,
    displacement: 0.45,
    persistence: 0.2,
  }),
  normalizers: Object.freeze({ thermal: 5, displacement: 20, persistence: 30 }),
  thresholds: Object.freeze({ elevated: 50, critical: 80 }),
})

function fail(message) {
  throw new Error(message)
}

function finite(value, message, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isFinite(value) || value < min || value > max) fail(message)
}

function validDate(value, message) {
  if (
    typeof value !== 'string' ||
    !DATE_RE.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  )
    fail(message)
  if (new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)
    fail(message)
}

function validateGeometry(feature) {
  const geometry = feature.geometry
  if (
    !geometry ||
    geometry.type !== 'Polygon' ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length === 0
  )
    fail(`Geometría inválida en ${feature.id}`)
  geometry.coordinates.forEach((ring) => {
    if (!Array.isArray(ring) || ring.length < 4)
      fail(`Anillo inválido en ${feature.id}`)
    ring.forEach((point) => {
      if (!Array.isArray(point) || point.length !== 2)
        fail(
          `Coordenada inválida en ${feature.id}: se requiere longitud/latitud 2D`,
        )
      finite(point[0], `Longitud inválida en ${feature.id}`, {
        min: -180,
        max: 180,
      })
      finite(point[1], `Latitud inválida en ${feature.id}`, {
        min: -90,
        max: 90,
      })
    })
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1])
      fail(`Anillo no cerrado en ${feature.id}`)
    const signedArea = ring
      .slice(1)
      .reduce(
        (sum, point, index) =>
          sum + ring[index][0] * point[1] - point[0] * ring[index][1],
        0,
      )
    if (Math.abs(signedArea) < 1e-12) fail(`Anillo degenerado en ${feature.id}`)
  })
}

function validateConfig(config) {
  if (!config || typeof config !== 'object')
    fail('La configuración es inválida')
  for (const key of ['thermal', 'displacement', 'persistence']) {
    finite(config.weights?.[key], `Peso inválido: ${key}`, { min: 0 })
    finite(config.normalizers?.[key], `Normalizador inválido: ${key}`, {
      min: Number.EPSILON,
    })
  }
  finite(config.thresholds?.elevated, 'Umbral elevated inválido', {
    min: 0,
    max: 100,
  })
  finite(config.thresholds?.critical, 'Umbral critical inválido', {
    min: 0,
    max: 100,
  })
  if (config.thresholds.elevated >= config.thresholds.critical)
    fail('Los umbrales deben estar ordenados y ser distintos')
  const sum =
    config.weights.thermal +
    config.weights.displacement +
    config.weights.persistence
  if (Math.abs(sum - 1) > 1e-9)
    fail('Los pesos deben sumar 100% (1 en el modelo)')
}

export function validateData(zones, observationData) {
  if (
    !zones ||
    zones.type !== 'FeatureCollection' ||
    !Array.isArray(zones.features) ||
    zones.features.length === 0
  )
    fail('Las zonas deben ser un FeatureCollection no vacío')
  if (
    !observationData ||
    typeof observationData !== 'object' ||
    !Array.isArray(observationData.observations) ||
    observationData.observations.length === 0
  )
    fail('Las observaciones deben ser un arreglo no vacío')
  if (
    typeof observationData.schemaVersion !== 'string' ||
    !observationData.schemaVersion
  )
    fail('Falta schemaVersion')
  if (typeof observationData.region !== 'string' || !observationData.region)
    fail('Falta region')
  if (
    typeof observationData.observedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(
      observationData.observedAt,
    ) ||
    Number.isNaN(Date.parse(observationData.observedAt))
  )
    fail('observedAt debe ser una fecha ISO UTC')
  validDate(observationData.observedAt.slice(0, 10), 'observedAt inválido')
  const sources = observationData.sources
  if (
    !sources?.thermal ||
    sources.thermal.unit !== '°C' ||
    !sources?.displacement ||
    sources.displacement.unit !== 'mm'
  )
    fail('Las fuentes deben declarar unidades °C y mm')
  for (const source of [sources.thermal, sources.displacement]) {
    if (!source.provider || !source.resolution || source.status !== 'fixture')
      fail('El contrato v1 requiere fuentes identificadas como fixture')
  }

  const ids = new Set()
  for (const feature of zones.features) {
    if (
      !feature ||
      typeof feature.id !== 'string' ||
      !feature.id ||
      ids.has(feature.id)
    )
      fail(`ID de zona inválido o duplicado: ${feature?.id}`)
    if (feature.type !== 'Feature')
      fail(`Tipo de Feature inválido en ${feature.id}`)
    if (
      !feature.properties ||
      typeof feature.properties.name !== 'string' ||
      !feature.properties.name
    )
      fail(`Metadata mínima ausente en ${feature.id}`)
    finite(feature.properties.areaKm2, `Área inválida en ${feature.id}`, {
      min: 0,
    })
    finite(
      feature.properties.observationPoints,
      `Puntos inválidos en ${feature.id}`,
      { min: 0 },
    )
    if (!Number.isInteger(feature.properties.observationPoints))
      fail(`Puntos no enteros en ${feature.id}`)
    validateGeometry(feature)
    ids.add(feature.id)
  }
  if (observationData.observations.length !== ids.size)
    fail('La correspondencia zonas-observaciones debe ser completa')
  const observedIds = new Set()
  for (const observation of observationData.observations) {
    if (
      !observation ||
      !ids.has(observation.zoneId) ||
      observedIds.has(observation.zoneId)
    )
      fail(`Observación sin zona o duplicada: ${observation?.zoneId}`)
    validDate(observation.date, `Fecha inválida en ${observation.zoneId}`)
    if (observation.date > observationData.observedAt.slice(0, 10))
      fail(`Fecha posterior al corte en ${observation.zoneId}`)
    finite(
      observation.thermalAnomalyC,
      `Anomalía térmica inválida en ${observation.zoneId}`,
    )
    finite(
      observation.displacementMm,
      `Desplazamiento inválido en ${observation.zoneId}`,
    )
    finite(
      observation.persistenceDays,
      `Persistencia inválida en ${observation.zoneId}`,
      { min: 0 },
    )
    if (!Number.isInteger(observation.persistenceDays))
      fail(`Persistencia no entera en ${observation.zoneId}`)
    finite(
      observation.confidence,
      `Confianza inválida en ${observation.zoneId}`,
      { min: 0, max: 1 },
    )
    observedIds.add(observation.zoneId)
  }
  return true
}

export function analyze(zones, observationData, config = DEFAULT_CONFIG) {
  validateData(zones, observationData)
  validateConfig(config)
  const byZone = new Map(
    observationData.observations.map((observation) => [
      observation.zoneId,
      observation,
    ]),
  )
  const normalized = (value, normalizer) =>
    Math.min(1, Math.max(0, value / normalizer))
  return {
    ...structuredClone(zones),
    metadata: {
      schemaVersion: observationData.schemaVersion,
      region: observationData.region,
      observedAt: observationData.observedAt,
      status: 'synthetic',
      sources: structuredClone(observationData.sources),
      limitation:
        'Índice heurístico no calibrado; no predice fallos ni constituye una alerta oficial.',
    },
    features: zones.features.map((feature) => {
      const observation = byZone.get(feature.id)
      const values = {
        thermal: normalized(
          observation.thermalAnomalyC,
          config.normalizers.thermal,
        ),
        displacement: normalized(
          Math.abs(observation.displacementMm),
          config.normalizers.displacement,
        ),
        persistence: normalized(
          observation.persistenceDays,
          config.normalizers.persistence,
        ),
      }
      const contributions = {
        thermal: values.thermal * config.weights.thermal * 100,
        displacement: values.displacement * config.weights.displacement * 100,
        persistence: values.persistence * config.weights.persistence * 100,
      }
      const risk = Math.min(
        100,
        Math.max(
          0,
          contributions.thermal +
            contributions.displacement +
            contributions.persistence,
        ),
      )
      const level =
        risk >= config.thresholds.critical
          ? 'critical'
          : risk >= config.thresholds.elevated
            ? 'elevated'
            : 'watch'
      return {
        ...structuredClone(feature),
        properties: {
          ...feature.properties,
          risk,
          level,
          thermalAnomalyC: observation.thermalAnomalyC,
          displacementMm: observation.displacementMm,
          persistenceDays: observation.persistenceDays,
          confidence: observation.confidence,
          observedOn: observation.date,
          explanation: {
            version: '1.0.0',
            inputs: {
              thermalAnomalyC: observation.thermalAnomalyC,
              displacementMm: observation.displacementMm,
              persistenceDays: observation.persistenceDays,
              confidence: observation.confidence,
            },
            normalized: values,
            weights: { ...config.weights },
            contributions,
            thresholds: { ...config.thresholds },
            normalizers: { ...config.normalizers },
          },
        },
      }
    }),
  }
}
