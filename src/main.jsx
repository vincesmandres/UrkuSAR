import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { getZones } from './data/adapter'
import './styles.css'

const zones = getZones()

const navItems = [
  ['overview', 'Resumen', '⌁'],
  ['layers', 'Capas de datos', '◈'],
  ['history', 'Histórico', '◴'],
]

function Icon({ children }) { return <span className="icon" aria-hidden="true">{children}</span> }

function App() {
  const [activeNav, setActiveNav] = useState('overview')
  const [activeZone, setActiveZone] = useState(zones[0])
  const [period, setPeriod] = useState('30D')
  const [layers, setLayers] = useState({ thermal: true, displacement: true, risk: true })
  const [notice, setNotice] = useState('')

  const toggleLayer = (key) => setLayers((current) => ({ ...current, [key]: !current[key] }))

  const notify = (message) => { setNotice(message); window.setTimeout(() => setNotice(''), 2800) }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><span /><span /><span /></div><div><strong>UrkuSAR</strong><small>ANALYTICS</small></div></div>
        <div className="workspace-label">ESPACIO DE TRABAJO <button onClick={() => notify('Selector de proyectos disponible próximamente')}>⌄</button></div>
        <div className="workspace"><span className="workspace-dot" />Cotopaxi / Ecuador<span className="status-dot" /></div>
        <nav className="main-nav" aria-label="Navegación principal">
          {navItems.map(([id, label, glyph]) => <button key={id} className={activeNav === id ? 'active' : ''} onClick={() => setActiveNav(id)}><Icon>{glyph}</Icon>{label}{id === 'layers' && <span className="nav-count">3</span>}</button>)}
        </nav>
        <div className="sidebar-rule" />
        <div className="workspace-label">MONITOREO ACTIVO</div>
        <div className="monitor-item"><span className="pulse purple" /><div><strong>Volcán Cotopaxi</strong><small>Última lectura · 14 min</small></div><span className="chevron">›</span></div>
        <div className="monitor-item"><span className="pulse orange" /><div><strong>Flanco nororiental</strong><small>Última lectura · 21 min</small></div><span className="chevron">›</span></div>
        <div className="sidebar-footer"><button className="help-button" onClick={() => notify('Centro de ayuda: documentación en preparación')}><span>?</span>Centro de ayuda</button><div className="profile"><div className="avatar">MR</div><div><strong>María Rojas</strong><small>Analista geotécnica</small></div><span>⌄</span></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumbs"><span>PROYECTOS</span><b>/</b><strong>COTOPAXI · ECUADOR</strong><i>•</i><span className="live-label"><em /> EN VIVO</span></div><div className="top-actions"><button onClick={() => notify('No hay nuevas notificaciones')} className="notification" aria-label="Notificaciones">♢<span /></button><button className="export-button" onClick={() => notify('Reporte preparado para exportación')}><Icon>↥</Icon> Exportar reporte</button></div></header>
        <section className="page-heading"><div><p className="eyebrow">CENTRO DE INTELIGENCIA GEOESPACIAL</p><h1>Diagnóstico <span>geotécnico</span></h1><p className="subtitle">Correlación satelital para protección civil y evaluación estructural.</p></div><div className="freshness"><span className="fresh-dot" />Datos actualizados <strong>hace 14 min</strong><button onClick={() => notify('Sincronizando MODIS y Sentinel-1...')}>↻</button></div></section>

        <section className="metrics-grid">
          <Metric label="Índice de riesgo" value="72.4" unit="/ 100" delta="↑ 8.6%" note="vs. periodo anterior" tone="purple" chart="risk" />
          <Metric label="Desplazamiento máximo" value="18.4" unit="mm" delta="↑ 3.2 mm" note="últimos 30 días" tone="orange" chart="displacement" />
          <Metric label="Anomalía térmica" value="4.8" unit="°C" delta="↑ 1.1 °C" note="sobre línea base" tone="pink" chart="thermal" />
          <Metric label="Zonas monitoreadas" value="03" unit="activas" delta="→ estable" note="en la región objetivo" tone="blue" chart="zones" />
        </section>

        <section className="analysis-layout">
          <div className="map-card card">
            <div className="card-header"><div><div className="section-kicker"><span className="kicker-line" /> MAPA DE CORRELACIÓN</div><h2>Polígonos de riesgo geotécnico</h2></div><div className="map-controls"><div className="period-selector">{['7D', '30D', '90D'].map((item) => <button key={item} className={period === item ? 'selected' : ''} onClick={() => setPeriod(item)}>{item}</button>)}</div><button className="square-button" onClick={() => notify('Vista centrada en Cotopaxi')}>⌖</button><button className="square-button" onClick={() => notify('Capas sincronizadas')}>☷</button></div></div>
            <div className="map-body"><div className="map-toolbar"><span className="map-badge"><i /> Sentinel-1 + MODIS</span><span className="map-coordinates">0°41' S&nbsp;&nbsp; 78°26' W</span></div><div className="map-canvas"><div className="contours contour-one" /><div className="contours contour-two" /><div className="contours contour-three" /><div className="mountain"><span className="peak" /><span className="snow" /></div><div className="map-label volcano-label">COTOPAXI <small>5,897 m</small></div>{layers.risk && zones.map((zone) => <button key={zone.id} className={`risk-zone ${zone.level} ${activeZone.id === zone.id ? 'selected-zone' : ''}`} style={{ clipPath: `path('${zone.path}')` }} onClick={() => setActiveZone(zone)} aria-label={`Zona ${zone.id}: ${zone.name}`}><span /></button>)}{layers.thermal && <><div className="sensor heat h1" /><div className="sensor heat h2" /><div className="sensor heat h3" /></>}{layers.displacement && <><div className="sensor displacement d1" /><div className="sensor displacement d2" /><div className="sensor displacement d3" /></>}<div className="map-label north-label">N</div><div className="map-scale"><span /><small>0</small><small>2 km</small></div><div className="map-zoom"><button>+</button><button>−</button></div></div><div className="map-legend"><Legend color="critical" label="Crítico" /><Legend color="elevated" label="Elevado" /><Legend color="watch" label="Vigilancia" /><span className="legend-divider" /><Legend dot="thermal" label="Anomalía térmica" /><Legend dot="displacement" label="Desplazamiento" /></div></div>
          </div>
          <aside className="detail-panel card"><div className="detail-top"><div><div className="section-kicker"><span className="kicker-line" /> ZONA SELECCIONADA</div><h2>{activeZone.name}</h2><p>{activeZone.id} · Actualizado hace 14 min</p></div><span className={`risk-pill ${activeZone.level}`}>{activeZone.level === 'critical' ? 'CRÍTICO' : activeZone.level === 'elevated' ? 'ELEVADO' : 'VIGILANCIA'}</span></div><div className="risk-score"><div className="score-ring" style={{ '--score': `${activeZone.risk * 3.6}deg` }}><strong>{activeZone.risk}</strong><small>RIESGO</small></div><div><span>Índice compuesto</span><strong>{activeZone.risk >= 80 ? 'Intervención recomendada' : 'Revisión preventiva'}</strong><small>Basado en 3 vectores de datos</small></div></div><div className="detail-stats"><Stat label="Deformación" value={activeZone.displacement} unit="mm" trend="↑ 14.2%" /><Stat label="Anomalía térmica" value={activeZone.thermal} unit="°C" trend="↑ 8.7%" /><Stat label="Superficie afectada" value={activeZone.area} trend={activeZone.points + ' puntos'} /></div><div className="signal-block"><div className="signal-head"><strong>Señal de inestabilidad</strong><span>Alta confianza</span></div><div className="signal-bars">{[30,42,48,43,55,61,58,71,68,79,74,88,84,93].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><div className="signal-labels"><span>01 JUN</span><span>15 JUN</span><span>30 JUN</span></div></div><button className="full-detail" onClick={() => notify(`Abriendo análisis completo de ${activeZone.id}`)}>Ver análisis completo <span>→</span></button></aside>
        </section>

        <section className="bottom-grid"><div className="activity-card card"><div className="card-header compact"><div><div className="section-kicker"><span className="kicker-line" /> ACTIVIDAD DEL SISTEMA</div><h2>Eventos recientes</h2></div><button className="text-button" onClick={() => notify('Mostrando historial completo')}>Ver historial <span>→</span></button></div><div className="events"><Event icon="△" color="red" title="Riesgo elevado detectado" desc="Zona Z-04 · Quebrada Yanasacha" time="Hace 14 min" /><Event icon="⌁" color="orange" title="Anomalía térmica confirmada" desc="MODIS Terra · 4.8 °C sobre línea base" time="Hace 2 h" /><Event icon="◌" color="purple" title="Nueva escena disponible" desc="Sentinel-1A · Órbita descendente" time="Hace 5 h" /></div></div><div className="layers-card card"><div className="card-header compact"><div><div className="section-kicker"><span className="kicker-line" /> CAPAS ACTIVAS</div><h2>Vectores de datos</h2></div><button className="settings-button" onClick={() => notify('Configuración de capas')} aria-label="Configurar capas">⚙</button></div><div className="layer-list"><LayerToggle name="Riesgo geotécnico" meta="Modelo correlativo · v1.4" color="purple" active={layers.risk} onClick={() => toggleLayer('risk')} /><LayerToggle name="Anomalía térmica" meta="MODIS / VIIRS · 1 km" color="orange" active={layers.thermal} onClick={() => toggleLayer('thermal')} /><LayerToggle name="Deformación InSAR" meta="Sentinel-1 · 14 mm/px" color="pink" active={layers.displacement} onClick={() => toggleLayer('displacement')} /></div></div></section>
        <footer className="page-footer"><span><i className="secure-dot" /> SISTEMA OPERATIVO</span><span>NASA OPEN DATA · PROTOTIPO DE INVESTIGACIÓN</span><span>v0.8.2 <b>•</b> © 2026 URKUSAR</span></footer>
      </main>
      {notice && <div className="toast">{notice}</div>}
    </div>
  )
}

function Metric({ label, value, unit, delta, note, tone, chart }) { return <div className="metric-card card"><div className="metric-title"><span>{label}</span><button aria-label={`Más información sobre ${label}`}>···</button></div><div className="metric-value">{value}<small>{unit}</small></div><div className={`metric-delta ${tone}`}><span>{delta}</span><small>{note}</small></div><div className={`mini-chart ${chart}`}>{[22,35,30,48,43,55,51,65,60,72,68,84].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div></div> }
function Legend({ color, dot, label }) { return <span className="legend-item"><i className={color || dot} />{label}</span> }
function Stat({ label, value, unit, trend }) { return <div><span>{label}</span><strong>{value} <small>{unit}</small></strong><em>{trend}</em></div> }
function Event({ icon, color, title, desc, time }) { return <div className="event"><span className={`event-icon ${color}`}>{icon}</span><div><strong>{title}</strong><p>{desc}</p></div><time>{time}</time></div> }
function LayerToggle({ name, meta, color, active, onClick }) { return <button className="layer-row" onClick={onClick}><span className={`layer-icon ${color}`}>{color === 'orange' ? '◒' : color === 'pink' ? '⌁' : '◇'}</span><span className="layer-copy"><strong>{name}</strong><small>{meta}</small></span><span className={`toggle ${active ? 'on' : ''}`}><i /></span></button> }

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
