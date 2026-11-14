import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { dataMetadata, getAnalysis } from './data/adapter.js'
import { DEFAULT_CONFIG } from './data/model.js'
import {
  createZoneReport,
  exportAnalysis,
  renderZoneReport,
} from './data/export.js'
import SourcePanel from './SourcePanel.jsx'
import './styles.css'

const levels = { critical: 'Crítico', elevated: 'Elevado', watch: 'Vigilancia' }
const vectors = {
  thermal: {
    label: 'Anomalía térmica',
    unit: '°C',
    property: 'thermalAnomalyC',
  },
  displacement: {
    label: 'Deformación',
    unit: 'mm',
    property: 'displacementMm',
  },
  persistence: {
    label: 'Persistencia',
    unit: 'días',
    property: 'persistenceDays',
  },
}
const number = (value, digits = 1) =>
  new Intl.NumberFormat('es-EC', { maximumFractionDigits: digits }).format(
    value,
  )
const date = (value) =>
  new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value))
const initialAnalysis = getAnalysis()

function saveText(text, type, filename) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function App() {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [weights, setWeights] = useState({
    thermal: 35,
    displacement: 45,
    persistence: 20,
  })
  const [analysis, setAnalysis] = useState(initialAnalysis)
  const [selectedId, setSelectedId] = useState(initialAnalysis.features[0].id)
  const [filter, setFilter] = useState('all')
  const [layer, setLayer] = useState('risk')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [exportScope, setExportScope] = useState('all')
  const [exportError, setExportError] = useState('')
  const [report, setReport] = useState(null)
  const reportDialog = useRef(null)
  const zones = [...analysis.features].sort(
    (a, b) => b.properties.risk - a.properties.risk,
  )
  const visible = zones.filter(
    ({ properties }) => filter === 'all' || properties.level === filter,
  )
  const selected = zones.find(({ id }) => id === selectedId)
  const p = selected.properties
  const criticalCount = zones.filter(
    ({ properties }) => properties.level === 'critical',
  ).length

  function recalculate(event) {
    event.preventDefault()
    const next = {
      ...config,
      weights: Object.fromEntries(
        Object.entries(weights).map(([key, value]) => [
          key,
          Number(value) / 100,
        ]),
      ),
    }
    try {
      setAnalysis(getAnalysis(next))
      setConfig(next)
      setError('')
      setMessage(
        'Índice recalculado. Los resultados y el GeoJSON usan los pesos aplicados.',
      )
    } catch (failure) {
      setError(failure.message)
      setMessage('')
    }
  }

  function reset() {
    setConfig(DEFAULT_CONFIG)
    setWeights({ thermal: 35, displacement: 45, persistence: 20 })
    setAnalysis(getAnalysis())
    setError('')
    setMessage('Pesos predeterminados restaurados.')
  }

  function download() {
    try {
      const collection = exportAnalysis(analysis, {
        scope: exportScope,
        selectedId,
        level: filter,
      })
      const suffix =
        exportScope === 'selected'
          ? selectedId
          : exportScope === 'visible'
            ? `visibles-${filter}`
            : 'todas'
      saveText(
        JSON.stringify(collection, null, 2),
        'application/geo+json',
        `urkusar-${suffix.replace(/[^a-z0-9_-]/gi, '_')}.geojson`,
      )
      setExportError('')
    } catch (failure) {
      setExportError(failure.message)
    }
  }

  function openReport() {
    try {
      const snapshot = createZoneReport(analysis, selectedId)
      setReport({ data: snapshot, html: renderZoneReport(snapshot) })
      setExportError('')
      reportDialog.current.showModal()
    } catch (failure) {
      setExportError(failure.message)
    }
  }

  function downloadReport() {
    saveText(
      report.html,
      'text/html;charset=utf-8',
      `urkusar-reporte-${report.data.zone.id.replace(/[^a-z0-9_-]/gi, '_')}.html`,
    )
  }

  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="site-header">
        <a className="brand" href="#contenido" aria-label="UrkuSAR, inicio">
          <svg viewBox="0 0 34 28" aria-hidden="true">
            <path d="M2 25 15 3l5 8 4-5 9 19H2Z M10 25l10-14" />
          </svg>
          Urku<span>SAR</span>
        </a>
        <nav aria-label="Navegación principal">
          <a href="#analisis">Territorio</a>
          <a href="#metodo">Modelo</a>
          <a href="#fuentes">Fuentes</a>
        </nav>
        <span className="edition">CUADERNO DE CAMPO / 01</span>
      </header>

      <main id="contenido" tabIndex={-1}>
        <section className="intro">
          <div>
            <p className="eyebrow">ECUADOR / OBSERVACIÓN DEL TERRITORIO</p>
            <h1>
              Leer el terreno.
              <br />
              <span>Entender sus señales.</span>
            </h1>
            <p className="intro-copy">
              Una vista conjunta de temperatura, deformación y persistencia para
              explorar la priorización geotécnica del Cotopaxi.
            </p>
          </div>
          <div className="intro-aside">
            <span className="demo-label">
              <i /> DEMOSTRACIÓN SINTÉTICA
            </span>
            <p>
              Un prototipo de investigación.
              <br />
              No es una alerta oficial.
            </p>
            <label className="export-scope">
              Alcance de exportación
              <select
                value={exportScope}
                onChange={(event) => setExportScope(event.target.value)}
              >
                <option value="all">Todas las zonas ({zones.length})</option>
                <option value="visible">
                  Zonas visibles ({visible.length})
                </option>
                <option value="selected">
                  Zona seleccionada ({selectedId})
                </option>
              </select>
            </label>
            <button
              className="button"
              onClick={download}
              disabled={exportScope === 'visible' && visible.length === 0}
            >
              Descargar GeoJSON <span aria-hidden="true">↓</span>
            </button>
            <small className="export-hint">
              Incluye procedencia, pesos aplicados y campos para GIS.
            </small>
            {exportError && (
              <p className="form-error" role="alert">
                {exportError}
              </p>
            )}
          </div>
        </section>

        <section className="summary" aria-label="Resumen calculado">
          <div>
            <span>Zonas de estudio</span>
            <strong>
              {String(zones.length).padStart(2, '0')}
              <small>polígonos</small>
            </strong>
          </div>
          <div>
            <span>Prioridad crítica</span>
            <strong>
              {String(criticalCount).padStart(2, '0')}
              <small>con estos pesos</small>
            </strong>
          </div>
          <div>
            <span>Deformación máxima</span>
            <strong>
              {number(
                Math.max(
                  ...zones.map((z) => Math.abs(z.properties.displacementMm)),
                ),
              )}
              <small>mm</small>
            </strong>
          </div>
          <div>
            <span>Fecha del fixture</span>
            <strong className="summary-date">
              {date(dataMetadata.observedAt)}
              <small>sin monitoreo en vivo</small>
            </strong>
          </div>
        </section>

        <section id="analisis" className="analysis-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">01 / TERRITORIO</p>
              <h2>Cotopaxi, en perspectiva.</h2>
            </div>
            <label className="filter">
              Mostrar{' '}
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">Todas las zonas</option>
                {Object.entries(levels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="analysis-grid">
            <div className="map-panel">
              <div className="map-toolbar">
                <span>Polígonos de demostración</span>
                <div
                  className="segmented"
                  role="group"
                  aria-label="Variable del mapa"
                >
                  {[
                    ['risk', 'Índice'],
                    ['thermal', 'Térmica'],
                    ['displacement', 'Deformación'],
                  ].map(([key, title]) => (
                    <button
                      key={key}
                      aria-pressed={layer === key}
                      onClick={() => setLayer(key)}
                    >
                      {title}
                    </button>
                  ))}
                </div>
              </div>
              <TerritoryMap
                zones={zones}
                visible={visible}
                selectedId={selectedId}
                onSelect={setSelectedId}
                layer={layer}
              />
              <div className="map-caption">
                <span>WGS84 · Longitud / latitud</span>
                <span>Geometría ilustrativa, no delimitación oficial</span>
              </div>
              {visible.length === 0 && (
                <p className="empty-state" role="status">
                  No hay zonas para este nivel con los pesos actuales.
                </p>
              )}
              <div className="zone-list" aria-label="Seleccionar zona">
                {visible.map(({ id, properties }) => (
                  <button
                    className="zone-row"
                    key={id}
                    onClick={() => setSelectedId(id)}
                    aria-pressed={selectedId === id}
                  >
                    <span className="zone-id">{id}</span>
                    <span className="zone-name">
                      {properties.name}
                      <small>{levels[properties.level]}</small>
                    </span>
                    <span className={`zone-score ${properties.level}`}>
                      {number(properties.risk)}
                      <small>/100</small>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            </div>

            <aside
              className="zone-detail"
              aria-label="Detalle de zona seleccionada"
            >
              <div className="detail-heading">
                <p className="eyebrow">{selected.id} / ZONA SELECCIONADA</p>
                <span className={`level-label ${p.level}`}>
                  {levels[p.level]}
                </span>
              </div>
              <h3>{p.name}</h3>
              {!visible.some(({ id }) => id === selectedId) && (
                <p className="muted">
                  Esta selección está fuera del filtro actual.
                </p>
              )}
              <div className="score">
                <strong data-testid="selected-score">{number(p.risk)}</strong>
                <span>
                  / 100
                  <br />
                  índice de priorización
                </span>
              </div>
              <p className="detail-intro">
                Así se construye este resultado. Cada aporte corresponde al
                valor normalizado multiplicado por su peso.
              </p>
              <div className="contributions">
                {Object.entries(vectors).map(([key, vector]) => (
                  <div className="contribution" key={key}>
                    <div>
                      <strong>{vector.label}</strong>
                      <span>
                        {number(p[vector.property])} {vector.unit}
                      </span>
                    </div>
                    <div className="bar-track">
                      <span
                        style={{
                          width: `${p.explanation.contributions[key]}%`,
                        }}
                      />
                    </div>
                    <div className="bar-caption">
                      <span>
                        Peso aplicado: {number(config.weights[key] * 100)}%
                      </span>
                      <span>
                        {number(p.explanation.contributions[key], 2)} puntos
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <dl className="detail-meta">
                <div>
                  <dt>Confianza declarada</dt>
                  <dd>{number(p.confidence * 100)}%</dd>
                </div>
                <div>
                  <dt>Persistencia de entrada</dt>
                  <dd>{p.persistenceDays} días</dd>
                </div>
                <div>
                  <dt>Origen</dt>
                  <dd>Fixture sintético</dd>
                </div>
              </dl>
              <p className="footnote">
                La confianza viene del fixture: no es una probabilidad de fallo
                ni una estimación validada. La persistencia no se infiere de una
                serie temporal en esta versión.
              </p>
              <button className="button report-button" onClick={openReport}>
                Ver reporte de zona <span aria-hidden="true">↗</span>
              </button>
            </aside>
          </div>
        </section>

        <section id="metodo" className="method-section">
          <div className="method-copy">
            <p className="eyebrow">02 / MODELO EXPLICABLE</p>
            <h2>Sin cajas negras.</h2>
            <p>
              Un índice heurístico, no un modelo predictivo entrenado.
              Normalizamos tres señales entre 0 y 1 y sumamos sus aportes
              ponderados.
            </p>
            <div className="formula">Índice = 100 × Σ (señal × peso)</div>
            <p className="footnote">
              Saturación: térmica {config.normalizers.thermal} °C, magnitud de
              deformación {config.normalizers.displacement} mm y persistencia{' '}
              {config.normalizers.persistence} días. Valores negativos de
              temperatura no aumentan el índice. Umbrales ilustrativos: elevado
              ≥ {config.thresholds.elevated}, crítico ≥{' '}
              {config.thresholds.critical}. No calibrados con eventos reales.
            </p>
          </div>
          <form className="weights-form" onSubmit={recalculate}>
            <h3>Explorar los pesos</h3>
            <p>La suma debe ser 100%. Los cambios se aplican al recalcular.</p>
            <div className="weight-inputs">
              {Object.entries(vectors).map(([key, vector]) => (
                <label key={key}>
                  {vector.label}
                  <span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      required
                      value={weights[key]}
                      onChange={(event) =>
                        setWeights({ ...weights, [key]: event.target.value })
                      }
                    />
                    %
                  </span>
                </label>
              ))}
            </div>
            <div className="form-actions">
              <button className="button primary" type="submit">
                Recalcular índice <span aria-hidden="true">↗</span>
              </button>
              <button className="text-button" type="button" onClick={reset}>
                Restablecer
              </button>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <p className="form-status" role="status">
              {message}
            </p>
          </form>
        </section>

        <SourcePanel />
      </main>
      <footer className="site-footer">
        <span>
          UrkuSAR <small>Investigación geoespacial</small>
        </span>
        <span>
          Datos para preguntar mejor. No para sustituir el criterio técnico.
        </span>
      </footer>
      <dialog
        className="report-dialog"
        ref={reportDialog}
        aria-labelledby="report-title"
        onClose={() => setReport(null)}
      >
        <div className="report-toolbar">
          <div>
            <p className="eyebrow">REPORTE / SNAPSHOT DEL ANÁLISIS</p>
            <h2 id="report-title">
              {report ? report.data.zone.properties.name : 'Reporte de zona'}
            </h2>
          </div>
          <button
            type="button"
            className="text-button"
            autoFocus
            onClick={() => reportDialog.current.close()}
          >
            Cerrar reporte
          </button>
        </div>
        {report && (
          <>
            <iframe
              title="Contenido del reporte de zona"
              srcDoc={report.html}
              sandbox=""
            />
            <div className="report-download">
              <p>
                HTML autónomo, sin scripts. Abre el archivo descargado para
                imprimirlo o guardarlo como PDF desde el navegador.
              </p>
              <button className="button primary" onClick={downloadReport}>
                Descargar reporte HTML <span aria-hidden="true">↓</span>
              </button>
            </div>
          </>
        )}
      </dialog>
    </>
  )
}

function TerritoryMap({ zones, visible, selectedId, onSelect, layer }) {
  const coordinates = zones.flatMap(({ geometry }) =>
    geometry.coordinates.flat(),
  )
  const minX = Math.min(...coordinates.map(([x]) => x))
  const maxX = Math.max(...coordinates.map(([x]) => x))
  const minY = Math.min(...coordinates.map(([, y]) => y))
  const maxY = Math.max(...coordinates.map(([, y]) => y))
  const scale = Math.min(
    500 / Math.max(maxX - minX, 0.001),
    285 / Math.max(maxY - minY, 0.001),
  )
  const project = ([x, y]) => [
    320 + (x - (minX + maxX) / 2) * scale,
    195 - (y - (minY + maxY) / 2) * scale,
  ]
  return (
    <svg
      className="territory-map"
      viewBox="0 0 640 400"
      role="group"
      aria-label="Mapa ilustrativo de las zonas de Cotopaxi"
    >
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path
            d="M40 0H0V40"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="640" height="400" fill="url(#grid)" className="map-grid" />
      <text x="25" y="28" className="map-note">
        COTOPAXI / ECUADOR
      </text>
      <path d="M600 58V25m-5 8 5-8 5 8" className="north-arrow" />
      <text x="596" y="18" className="map-note">
        N
      </text>
      {visible.map(({ id, geometry, properties }) => {
        const outer = geometry.coordinates[0].slice(0, -1).map(project)
        const center = [
          outer.reduce((sum, [x]) => sum + x, 0) / outer.length,
          outer.reduce((sum, [, y]) => sum + y, 0) / outer.length,
        ]
        const path = geometry.coordinates
          .map(
            (ring) =>
              `M${ring.map((point) => project(point).join(',')).join('L')}Z`,
          )
          .join(' ')
        const value =
          layer === 'risk'
            ? properties.risk
            : properties[vectors[layer].property]
        return (
          <g
            key={id}
            role="button"
            tabIndex={0}
            aria-pressed={selectedId === id}
            aria-label={`Seleccionar ${properties.name}: ${id} ${number(value)} ${layer === 'risk' ? '/100' : vectors[layer].unit}`}
            onClick={() => onSelect(id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(id)
              }
            }}
            className={`map-zone ${properties.level} ${selectedId === id ? 'is-selected' : ''}`}
          >
            <path d={path} fillRule="evenodd" />
            <text
              x={center[0]}
              y={center[1] - 4}
              textAnchor="middle"
              className="polygon-id"
            >
              {id}
            </text>{' '}
            <text
              x={center[0]}
              y={center[1] + 15}
              textAnchor="middle"
              className="polygon-value"
            >
              {number(value)} {layer === 'risk' ? '/100' : vectors[layer].unit}
            </text>
          </g>
        )
      })}
      <text x="25" y="378" className="map-note">
        {minX.toFixed(2)} / {minY.toFixed(2)}
      </text>
      <text x="615" y="378" textAnchor="end" className="map-note">
        {maxX.toFixed(2)} / {maxY.toFixed(2)}
      </text>
    </svg>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
