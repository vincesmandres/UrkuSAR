import { readFile } from 'node:fs/promises'
import { validateData } from '../src/data/model.js'

const zones = JSON.parse(
  await readFile(new URL('../src/data/zones.geojson', import.meta.url), 'utf8'),
)
const observations = JSON.parse(
  await readFile(
    new URL('../src/data/observations.json', import.meta.url),
    'utf8',
  ),
)

validateData(zones, observations)
console.log(
  `Data validada: ${zones.features.length} zonas, ${observations.observations.length} observaciones`,
)
