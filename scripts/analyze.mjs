import { readFile } from 'node:fs/promises'
import { analyze } from '../src/data/model.js'

const zones = JSON.parse(
  await readFile(new URL('../src/data/zones.geojson', import.meta.url), 'utf8'),
)
const observations = JSON.parse(
  await readFile(
    new URL('../src/data/observations.json', import.meta.url),
    'utf8',
  ),
)

process.stdout.write(
  `${JSON.stringify(analyze(zones, observations), null, 2)}\n`,
)
