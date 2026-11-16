import { useState } from 'react'
import series from './data/thermal-series.json'
import seriesFile from './data/thermal-series.json?url'

const statusLabels = {
  compared: 'Comparación disponible',
  'insufficient-baseline': 'Referencia insuficiente',
  'quality-rejected': 'Rechazada por calidad',
  missing: 'Sin archivo',
  unavailable: 'Fuente no disponible',
}
const number = (value, fallback = 'No estimable') =>
  value == null
    ? fallback
    : new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 }).format(value)

export default function ThermalSeries() {
  const [pixelId, setPixelId] = useState(series.pixels[0]?.id || '')
  const pixel = series.pixels.find(({ id }) => id === pixelId)
  const m = series.method
  return (
    <details className="product-audit thermal-series">
      <summary>Serie térmica alineada al periodo SAR</summary>
      <p className="footnote">
        Inspección archivada:{' '}
        {new Intl.DateTimeFormat('es-EC', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'UTC',
        }).format(new Date(series.checkedAt))}{' '}
        UTC.
      </p>
      <p>
        Archivo de investigación, no monitoreo actual. GOES-19 a las {m.hourUTC}
        :00 UTC: referencia del {m.baselineStart} al {m.baselineEnd}, análisis
        del {m.periodStart} al {m.periodEnd}. La coincidencia de fechas no
        significa adquisición simultánea ni relación causal con SAR.
      </p>
      <p>
        {series.sources.filter((s) => s.status === 'available').length} de{' '}
        {series.sources.length} archivos recuperados. {series.pixelCount}{' '}
        centros de píxel dentro del área de estudio; resolución nominal{' '}
        {series.spatialResolution}.
      </p>
      <p className="source-limitation" data-testid="thermal-series-result">
        {series.baselineEligiblePixels} de {series.pixelCount} píxeles con
        referencia suficiente. {series.comparedObservations} comparaciones
        estimables. Estos datos no alimentan el índice sintético.
      </p>
      <p>
        Referencia: mediana por píxel de mediciones anteriores con DQF=0, al
        menos {m.minimumBaselineDays} días válidos. No es una climatología.
        Umbral exploratorio: más de {number(m.thresholdC)} °C; los días sin
        medición válida interrumpen las rachas, no se rellenan con ceros.
      </p>
      <div
        className="observation-table"
        role="region"
        aria-label="Calidad de la referencia térmica por píxel"
        tabIndex={0}
      >
        <table>
          <caption>Referencia y disponibilidad por píxel</caption>
          <thead>
            <tr>
              <th>Píxel</th>
              <th>Días válidos de referencia</th>
              <th>Mediana (K)</th>
              <th>Días válidos en análisis</th>
              <th>Racha observada (días)</th>
            </tr>
          </thead>
          <tbody>
            {series.pixels.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.baselineValidDays}</td>
                <td>{number(p.baselineMedianK)}</td>
                <td>{p.analysisValidDays}</td>
                <td>{number(p.longestObservedRunDays)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pixel && (
        <>
          <label className="filter series-selector">
            Píxel de la serie
            <select
              value={pixelId}
              onChange={(event) => setPixelId(event.target.value)}
            >
              {series.pixels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} · {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}
                </option>
              ))}
            </select>
          </label>
          <div
            className="observation-table"
            role="region"
            aria-label="Observaciones térmicas diarias"
            tabIndex={0}
          >
            <table>
              <caption>
                Serie diaria de {pixel.id} · {m.hourUTC}:00 UTC
              </caption>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Temperatura (K)</th>
                  <th>Diferencia (°C)</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {pixel.observations.map((o) => (
                  <tr key={o.date}>
                    <td>{o.date}</td>
                    <td>{number(o.temperatureK, 'Sin dato válido')}</td>
                    <td>{number(o.anomalyC)}</td>
                    <td>{statusLabels[o.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p>
        La diferencia en Kelvin respecto a la referencia equivale numéricamente
        a una diferencia en °C; no es una temperatura absoluta ni una señal
        volcánica atribuida.
      </p>
      <ul>
        {series.limitations.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <a
        className="button"
        href={seriesFile}
        download="urkusar-serie-termica.json"
      >
        Descargar serie y manifiesto <span aria-hidden="true">↓</span>
      </a>
      <p className="footnote">
        Incluye fechas, configuración y URLs/SHA-256 de cada archivo para
        reproducir la inspección. {series.citation}
      </p>
    </details>
  )
}
