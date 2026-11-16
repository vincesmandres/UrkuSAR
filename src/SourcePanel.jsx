import { useState } from 'react'
import productAudit from './data/product-audit.json'
import ThermalSeries from './ThermalSeries.jsx'
import {
  DEFAULT_QUERY,
  SOURCES,
  buildSourceUrl,
  loadSource,
  parseFirmsCsv,
  parseInsarCsv,
} from './data/sources.js'

const states = {
  remote: 'Consulta remota',
  cache: 'Caché reciente',
  stale: 'Caché antigua · sin conexión',
  error: 'Consulta no disponible',
}
const timestamp = (value) =>
  new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value))

export default function SourcePanel() {
  const [query, setQuery] = useState(DEFAULT_QUERY)
  const [results, setResults] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uploads, setUploads] = useState({})
  const [uploadErrors, setUploadErrors] = useState({})
  const [reading, setReading] = useState('')

  async function consult(event) {
    event.preventDefault()
    const snapshot = structuredClone(query)
    try {
      buildSourceUrl('modis', snapshot)
    } catch (failure) {
      setError(failure.message)
      return
    }
    setBusy(true)
    setError('')
    setResults({})
    let storage
    try {
      storage = window.localStorage
    } catch {
      /* Remote reads still work without browser storage. */
    }
    const responses = await Promise.all(
      SOURCES.map(async (source) => {
        try {
          return [source.id, await loadSource(source.id, snapshot, { storage })]
        } catch (failure) {
          return [
            source.id,
            {
              sourceId: source.id,
              status: 'error',
              query: snapshot,
              records: [],
              error: failure.message,
            },
          ]
        }
      }),
    )
    setResults(Object.fromEntries(responses))
    setBusy(false)
  }

  async function importFile(event, kind) {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return
    const snapshot = structuredClone(query)
    setReading(kind)
    setUploadErrors((current) => ({ ...current, [kind]: '' }))
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error('El archivo excede el límite de 5 MiB.')
      const text = await file.text()
      const data =
        kind === 'firms'
          ? parseFirmsCsv(text, snapshot)
          : parseInsarCsv(text, snapshot)
      setUploads((current) => ({
        ...current,
        [kind]: {
          ...data,
          fileName: file.name,
          query: snapshot,
          importedAt: new Date().toISOString(),
        },
      }))
    } catch (failure) {
      setUploadErrors((current) => ({
        ...current,
        [kind]: `${failure.message} No se reemplazó la última importación válida.`,
      }))
    } finally {
      setReading('')
    }
  }

  return (
    <section
      id="fuentes"
      className="source-module"
      aria-labelledby="sources-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">03 / INGESTA Y PROCEDENCIA</p>
          <h2 id="sources-title">De la fuente a la evidencia.</h2>
        </div>
        <span className="module-tag">HITO 3 / EN INTEGRACIÓN</span>
      </div>
      <p className="source-intro">
        Consulta catálogos oficiales por región y fecha o importa observaciones
        procesadas. Estos registros se mantienen separados del índice sintético:
        una escena disponible no demuestra una anomalía ni un desplazamiento.
      </p>

      <form
        className="source-query"
        onSubmit={consult}
        aria-label="Consultar catálogos satelitales"
      >
        <fieldset disabled={busy || Boolean(reading)}>
          <legend>Ventana de consulta · UTC</legend>
          <div className="query-fields">
            <label>
              Desde
              <input
                type="date"
                required
                value={query.start}
                onChange={(event) =>
                  setQuery({ ...query, start: event.target.value })
                }
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                required
                value={query.end}
                onChange={(event) =>
                  setQuery({ ...query, end: event.target.value })
                }
              />
            </label>
            <button className="button primary" type="submit">
              {busy ? 'Consultando…' : 'Consultar catálogos'}
            </button>
          </div>
          <details className="query-bounds">
            <summary>Región WGS84 · {query.bbox.join(', ')}</summary>
            <div className="bounds-fields">
              {['Oeste', 'Sur', 'Este', 'Norte'].map((label, index) => (
                <label key={label}>
                  {label}
                  <input
                    type="number"
                    required
                    step="any"
                    min={index % 2 ? -90 : -180}
                    max={index % 2 ? 90 : 180}
                    value={query.bbox[index]}
                    onChange={(event) =>
                      setQuery({
                        ...query,
                        bbox: query.bbox.map((value, i) =>
                          i === index
                            ? event.target.value === ''
                              ? ''
                              : Number(event.target.value)
                            : value,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
        </fieldset>
        <p className="footnote">
          Máximo 366 días y hasta 10 resultados por fuente. Consulta manual; no
          hay seguimiento en vivo. Caché local por región y fechas durante 15
          minutos.
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </form>

      <div className="catalog-grid" aria-busy={busy}>
        {SOURCES.map((source) => {
          const result = results[source.id]
          return (
            <article
              className="catalog-card"
              key={source.id}
              aria-label={`Catálogo ${source.label}`}
            >
              <div className="catalog-top">
                <span className="eyebrow">{source.kind}</span>
                <span className={`source-status ${result?.status || ''}`}>
                  {busy
                    ? 'Consultando'
                    : result
                      ? states[result.status]
                      : 'Sin consultar'}
                </span>
              </div>
              <h3>{source.label}</h3>
              <p>{source.description}</p>
              <p className="footnote">
                Resolución del producto: {source.resolution}
              </p>
              {result && (
                <>
                  <p className="query-context">
                    {result.query.start} / {result.query.end}
                    <br />
                    BBOX: {result.query.bbox.join(', ')}
                  </p>
                  {result.fetchedAt && (
                    <p className="footnote">
                      Consulta guardada: {timestamp(result.fetchedAt)} UTC. No
                      es la fecha de adquisición.
                    </p>
                  )}
                  {result.error && (
                    <p className="source-warning" role="status">
                      {result.error}
                    </p>
                  )}
                  {result.cacheWarning && (
                    <p className="source-warning">{result.cacheWarning}</p>
                  )}
                  {result.status !== 'error' && (
                    <>
                      <strong className="record-count">
                        {result.records.length} registros recibidos
                      </strong>
                      {result.records.length === 0 ? (
                        <p className="empty-records">
                          Sin resultados para esta región y fechas. No equivale
                          a ausencia de riesgo.
                        </p>
                      ) : (
                        <ul className="catalog-records">
                          {result.records.map((record) => (
                            <li key={record.id}>
                              {record.url ? (
                                <a
                                  href={record.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {record.title} ↗
                                </a>
                              ) : (
                                <span>{record.title}</span>
                              )}
                              <time>
                                {record.acquiredAt
                                  ? timestamp(record.acquiredAt) + ' UTC'
                                  : 'Fecha no informada'}
                              </time>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </>
              )}
              <a
                className="source-documentation"
                href={source.documentation}
                target="_blank"
                rel="noreferrer"
              >
                Documentación oficial ↗
              </a>
            </article>
          )
        })}
      </div>
      <p className="source-limitation">
        OPERA DISP-S1 no cubre Ecuador actualmente. Sentinel-1 SLC es materia
        prima para interferometría, no deformación preprocesada. Para Cotopaxi
        hace falta un producto LOS procesado y validado. No se imputan ceros ni
        se completa el índice con datos inventados.
      </p>

      <details className="product-audit">
        <summary>
          Auditoría de productos reales · no aptos para calcular riesgo
        </summary>
        <p>
          Inspección reproducible del {timestamp(productAudit.checkedAt)} UTC.
          Es una evidencia archivada de dos archivos concretos, no monitoreo
          actual ni un resultado para el rango del formulario.
        </p>
        <p>
          BBOX verificado: {productAudit.bbox.join(', ')}. El índice de arriba
          continúa usando exclusivamente el fixture sintético.
        </p>
        <div className="import-grid">
          <article>
            <h4>COMET LiCSAR · coherencia</h4>
            <p>
              Frame {productAudit.products.licsar.frame}, par{' '}
              {productAudit.products.licsar.referenceDate} /{' '}
              {productAudit.products.licsar.secondaryDate}. Cobertura del área
              confirmada al leer el GeoTIFF.
            </p>
            <p>
              {productAudit.products.licsar.sampleCount.toLocaleString('es-EC')}{' '}
              celdas inspeccionadas. La coherencia no mide desplazamiento y no
              se convierte en milímetros.
            </p>
            <a
              className="source-documentation"
              href={productAudit.products.licsar.url}
              target="_blank"
              rel="noreferrer"
            >
              GeoTIFF de coherencia original ↗
            </a>
            {' · '}
            <a
              className="source-documentation"
              href={productAudit.products.licsar.license}
              target="_blank"
              rel="noreferrer"
            >
              Licencia y atribución ↗
            </a>
            <p className="footnote">
              SHA-256: <code>{productAudit.products.licsar.sha256}</code>
            </p>
            <p className="footnote">{productAudit.products.licsar.citation}</p>
            <p className="footnote" lang="en">
              {productAudit.products.licsar.acknowledgement}
            </p>
          </article>
          <article>
            <h4>NOAA GOES-19 · temperatura superficial</h4>
            <p>
              Observación {timestamp(productAudit.products.goes.timeStart)} UTC.
              Resolución nominal: {productAudit.products.goes.spatialResolution}
              .
            </p>
            <p data-testid="thermal-audit-quality">
              {productAudit.products.goes.highQualitySamples} de{' '}
              {productAudit.products.goes.sampleCount} píxeles cumplen DQF=0. No
              hay temperatura válida para calcular anomalía en esta muestra.
            </p>
            <a
              className="source-documentation"
              href={productAudit.products.goes.url}
              target="_blank"
              rel="noreferrer"
            >
              NetCDF térmico original ↗
            </a>
            {' · '}
            <a
              className="source-documentation"
              href={productAudit.products.goes.license}
              target="_blank"
              rel="noreferrer"
            >
              Condiciones y documentación ↗
            </a>
            <p className="footnote">
              SHA-256: <code>{productAudit.products.goes.sha256}</code>
            </p>
            <p className="footnote">
              {productAudit.products.goes.citation}{' '}
              {productAudit.products.goes.acknowledgement}
            </p>
          </article>
        </div>
        <h4>Por qué no se combinan</h4>
        <ul>
          {productAudit.blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      </details>

      <ThermalSeries />

      <div className="import-heading">
        <h3>Incorporar observaciones</h3>
        <p>
          Archivos procesados localmente, sin subirlos a un servidor.
          Procedencia declarada por quien los aporta, no autenticada por
          UrkuSAR. Cambiar el rango no refiltra una importación anterior: vuelve
          a importar el archivo.
        </p>
      </div>
      <div className="import-grid">
        {[
          ['firms', 'Detecciones FIRMS', 'MODIS o VIIRS · CSV oficial'],
          ['insar', 'Deformación InSAR', 'CSV normalizado de un producto LOS'],
        ].map(([kind, label, description]) => {
          const upload = uploads[kind]
          return (
            <article className="import-card" key={kind} aria-label={label}>
              <h4>{label}</h4>
              <p>{description}</p>
              <label className="file-label">
                Importar {label}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={Boolean(reading) || busy}
                  onChange={(event) => importFile(event, kind)}
                />
              </label>
              {reading === kind && <p role="status">Validando archivo…</p>}
              <p className="footnote">
                Máximo 5 MiB.{' '}
                {kind === 'firms'
                  ? 'Brillo en Kelvin y potencia radiativa en MW; no son anomalías respecto a una línea base.'
                  : 'Desplazamiento LOS en mm, coherencia, fecha de referencia e identificación del producto. No procesa HDF5 ni radar crudo.'}
              </p>
              {kind === 'firms' ? (
                <a
                  className="source-documentation"
                  href="https://firms.modaps.eosdis.nasa.gov/active_fire/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Obtener CSV de FIRMS ↗
                </a>
              ) : (
                <details className="csv-contract">
                  <summary>Formato requerido</summary>
                  <code>
                    latitude,longitude,date,displacement_mm,coherence,reference_date,product_id,source_url
                  </code>
                  <p>
                    Coherencia de 0 a 1, fecha de referencia anterior o igual a
                    la medición y URL HTTPS del producto. Fechas YYYY-MM-DD.
                  </p>
                </details>
              )}
              {uploadErrors[kind] && (
                <p className="form-error" role="alert">
                  {uploadErrors[kind]}
                </p>
              )}
              {upload && (
                <div className="import-result">
                  <strong>
                    {upload.records.length} observaciones en el rango
                  </strong>
                  <p>
                    {upload.fileName} · {upload.totalRows} filas de entrada
                  </p>
                  <p className="query-context">
                    {upload.query.start} / {upload.query.end}
                    <br />
                    BBOX: {upload.query.bbox.join(', ')}
                  </p>
                  <p className="footnote">
                    Importado: {timestamp(upload.importedAt)} UTC. No altera el
                    índice de demostración.
                  </p>
                  {upload.records.length === 0 ? (
                    <p>
                      El archivo es válido pero no contiene observaciones dentro
                      del rango.
                    </p>
                  ) : (
                    <div
                      className="observation-table"
                      role="region"
                      aria-label={`Observaciones de ${label}`}
                      tabIndex={0}
                    >
                      <table>
                        <caption>
                          Primeras {Math.min(upload.records.length, 5)}{' '}
                          observaciones
                        </caption>
                        <thead>
                          <tr>
                            <th>Fecha UTC</th>
                            <th>Lat / Lon</th>
                            <th>
                              {kind === 'firms' ? 'Brillo (K)' : 'LOS (mm)'}
                            </th>
                            <th>
                              {kind === 'firms' ? 'FRP (MW)' : 'Coherencia'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {upload.records.slice(0, 5).map((record, index) => (
                            <tr key={index}>
                              <td>{record.acquiredAt.slice(0, 10)}</td>
                              <td>
                                {record.latitude} / {record.longitude}
                              </td>
                              <td>
                                {kind === 'firms'
                                  ? record.brightnessK
                                  : record.displacementMm}
                              </td>
                              <td>
                                {kind === 'firms'
                                  ? record.frpMw
                                  : record.coherence}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setUploads((current) => ({ ...current, [kind]: null }))
                      setUploadErrors((current) => ({ ...current, [kind]: '' }))
                    }}
                  >
                    Quitar importación
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
