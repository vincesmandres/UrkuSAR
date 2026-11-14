import zonesRaw from './zones.geojson?raw'
import observations from './observations.json'
import { analyze, DEFAULT_CONFIG } from './model.js'

const zones = JSON.parse(zonesRaw)

export function getAnalysis(config = DEFAULT_CONFIG) {
  return analyze(zones, observations, config)
}

export const dataMetadata = observations
