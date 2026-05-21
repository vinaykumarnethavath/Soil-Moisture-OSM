import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import axios from 'axios';
import { Search, MapPin, Calendar, Droplets, Thermometer, Wind, CloudRain, Sprout, History } from 'lucide-react';
import './App.css';

// Fix default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function ChangeView({ center }) {
  const map = useMap();
  useEffect(() => { map.setView(center, 10); }, [center, map]);
  return null;
}

function MapClickHandler({ onClick }) {
  useMapEvents({ click: (e) => onClick(e.latlng) });
  return null;
}

// Weather icon picker
function getWeatherIcon(precip, tempMax) {
  if (precip > 10) return '🌧️';
  if (precip > 2) return '🌦️';
  if (tempMax > 35) return '☀️';
  if (tempMax > 25) return '🌤️';
  if (tempMax > 15) return '⛅';
  return '🌥️';
}

function getDayName(dateStr, i) {
  if (i === 0) return 'Today';
  if (i === 1) return 'Tomorrow';
  return new Date(dateStr).toLocaleDateString('en', { weekday: 'short' });
}

// Soil moisture color
function getMoistureColor(val) {
  if (val < 0.1) return '#f87171';
  if (val < 0.2) return '#fbbf24';
  if (val < 0.3) return '#38bdf8';
  return '#34d399';
}

function App() {
  const [searchMode, setSearchMode] = useState('city');
  const [cityName, setCityName] = useState('');
  const [lat, setLat] = useState('36.12');
  const [lon, setLon] = useState('-97.06');
  const [histDate, setHistDate] = useState('');
  const [geocodeResults, setGeocodeResults] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mapCenter, setMapCenter] = useState([36.12, -97.06]);
  const [locationName, setLocationName] = useState('Stillwater, Oklahoma, US');

  const fetchForecast = useCallback(async (latitude, longitude) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await axios.get(`${API}/forecast`, { params: { lat: latitude, lon: longitude } });
      setData(resp.data);
      setMapCenter([resp.data.latitude, resp.data.longitude]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch data. Is the backend running?');
    }
    setLoading(false);
  }, []);

  const fetchHistorical = async () => {
    if (!histDate) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await axios.get(`${API}/historical`, { params: { lat, lon, date: histDate } });
      setData(resp.data);
      setMapCenter([resp.data.latitude, resp.data.longitude]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch historical data.');
    }
    setLoading(false);
  };

  const handleGeocode = async () => {
    if (!cityName.trim()) return;
    try {
      const resp = await axios.get(`${API}/geocode`, { params: { name: cityName } });
      setGeocodeResults(resp.data.results || []);
    } catch { setGeocodeResults([]); }
  };

  const selectLocation = (loc) => {
    setLat(String(loc.latitude));
    setLon(String(loc.longitude));
    setLocationName(loc.display || loc.name);
    setGeocodeResults([]);
    setCityName(loc.display || loc.name);
    fetchForecast(loc.latitude, loc.longitude);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchMode === 'city') { handleGeocode(); }
    else { fetchForecast(parseFloat(lat), parseFloat(lon)); setLocationName(`${lat}, ${lon}`); }
  };

  const handleMapClick = (latlng) => {
    setLat(String(latlng.lat.toFixed(4)));
    setLon(String(latlng.lng.toFixed(4)));
    setLocationName(`${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`);
    fetchForecast(latlng.lat, latlng.lng);
  };

  useEffect(() => { fetchForecast(36.12, -97.06); }, [fetchForecast]);

  const current = data?.current || {};
  const daily = data?.daily || [];
  const recommendations = data?.recommendations || [];

  // Soil moisture depths
  const soilMoistureLayers = [
    { label: '0–1 cm', key: 'soil_moisture_0_to_1cm', altKey: 'soil_moisture_0_to_7cm' },
    { label: '1–3 cm', key: 'soil_moisture_1_to_3cm', altKey: 'soil_moisture_7_to_28cm' },
    { label: '3–9 cm', key: 'soil_moisture_3_to_9cm', altKey: 'soil_moisture_28_to_100cm' },
    { label: '9–27 cm', key: 'soil_moisture_9_to_27cm', altKey: 'soil_moisture_100_to_255cm' },
    { label: '27–81 cm', key: 'soil_moisture_27_to_81cm' },
  ];

  return (
    <div className="app-root">
      {/* ── Header ──────────────────────────── */}
      <header className="app-header">
        <div className="header-inner">
          <div className="header-brand">
            <span className="header-logo">🌾</span>
            <div>
              <div className="header-title">SoilMoisture <span style={{color:'var(--accent-blue)'}}>OSM</span></div>
              <div className="header-subtitle">Real-Time Soil & Weather Intelligence</div>
            </div>
          </div>
          <div className="header-badge">
            <span className="header-badge-dot"></span>
            Live · Open-Meteo API
          </div>
        </div>
      </header>

      {/* ── Main ────────────────────────────── */}
      <main className="app-main">
        {/* Top Stats */}
        {data && !loading && (
          <div className="top-stats-row" style={{marginBottom: 28}}>
            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-card-icon" style={{background:'rgba(56,189,248,0.12)'}}><Droplets size={20} color="#38bdf8"/></div>
                <span className="stat-card-label">Surface Moisture</span>
              </div>
              <div className="stat-card-value" style={{color:'var(--accent-blue)'}}>
                {(current.soil_moisture_0_to_1cm ?? current.soil_moisture_0_to_7cm) != null
                  ? ((current.soil_moisture_0_to_1cm ?? current.soil_moisture_0_to_7cm) * 100).toFixed(1) + '%'
                  : 'N/A'}
              </div>
              <div className="stat-card-sub">Volumetric water content</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-card-icon" style={{background:'rgba(251,191,36,0.12)'}}><Thermometer size={20} color="#fbbf24"/></div>
                <span className="stat-card-label">Air Temperature</span>
              </div>
              <div className="stat-card-value" style={{color:'var(--accent-amber)'}}>
                {current.temperature_2m != null ? current.temperature_2m.toFixed(1) + '°C' : 'N/A'}
              </div>
              <div className="stat-card-sub">
                {current.temperature_2m_max != null ? `H: ${current.temperature_2m_max}° / L: ${current.temperature_2m_min}°` : '2m above ground'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-card-icon" style={{background:'rgba(52,211,153,0.12)'}}><CloudRain size={20} color="#34d399"/></div>
                <span className="stat-card-label">Precipitation</span>
              </div>
              <div className="stat-card-value" style={{color:'var(--accent-green)'}}>
                {current.precipitation_sum != null ? current.precipitation_sum + ' mm' : (current.precipitation != null ? current.precipitation + ' mm' : 'N/A')}
              </div>
              <div className="stat-card-sub">Today's total rainfall</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-card-icon" style={{background:'rgba(167,139,250,0.12)'}}><Wind size={20} color="#a78bfa"/></div>
                <span className="stat-card-label">Wind Speed</span>
              </div>
              <div className="stat-card-value" style={{color:'var(--accent-purple)'}}>
                {current.windspeed_10m != null ? current.windspeed_10m.toFixed(1) + ' km/h' : 'N/A'}
              </div>
              <div className="stat-card-sub">10m above ground</div>
            </div>
          </div>
        )}

        <div className="dashboard-grid">
          {/* ── Left Column ─────────────────── */}
          <div className="left-column">
            {/* Search Panel */}
            <div className="card search-panel">
              <div className="card-title"><Search size={18}/> Search Location</div>
              <div className="search-mode-tabs">
                <button className={`search-mode-tab ${searchMode==='city'?'active':''}`} onClick={()=>setSearchMode('city')}>🏙️ City Name</button>
                <button className={`search-mode-tab ${searchMode==='coords'?'active':''}`} onClick={()=>setSearchMode('coords')}>📍 Coordinates</button>
              </div>
              <form onSubmit={handleSearch}>
                {searchMode === 'city' ? (
                  <div className="input-group">
                    <label>City / Place Name</label>
                    <input className="input-field" placeholder="e.g. Mumbai, London, São Paulo..." value={cityName} onChange={e => { setCityName(e.target.value); setGeocodeResults([]); }} />
                  </div>
                ) : (
                  <div className="coord-row">
                    <div className="input-group">
                      <label>Latitude</label>
                      <input className="input-field" type="number" step="any" placeholder="36.12" value={lat} onChange={e=>setLat(e.target.value)} />
                    </div>
                    <div className="input-group">
                      <label>Longitude</label>
                      <input className="input-field" type="number" step="any" placeholder="-97.06" value={lon} onChange={e=>setLon(e.target.value)} />
                    </div>
                  </div>
                )}
                <button type="submit" className="btn-primary" style={{marginTop:14}} disabled={loading}>
                  <Search size={18}/> {loading ? 'Fetching...' : 'Fetch Live Data'}
                </button>
              </form>

              {geocodeResults.length > 0 && (
                <div className="geocode-results">
                  {geocodeResults.map((r, i) => (
                    <div key={i} className="geocode-item" onClick={() => selectLocation(r)}>
                      <span className="geocode-item-name">{r.name}</span> — {r.admin1}, {r.country}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Historical Query */}
            <div className="card">
              <div className="card-title"><History size={18}/> Historical Data</div>
              <div className="input-group" style={{marginBottom:12}}>
                <label>Select Past Date</label>
                <input className="input-field" type="date" value={histDate} onChange={e=>setHistDate(e.target.value)} max={new Date().toISOString().split('T')[0]} />
              </div>
              <button className="btn-secondary" onClick={fetchHistorical} disabled={loading || !histDate}>
                <Calendar size={18}/> Fetch Historical Data
              </button>
            </div>

            {/* Soil Moisture Depth Chart */}
            {data && !loading && (
              <div className="card">
                <div className="card-title"><Droplets size={18}/> Soil Moisture by Depth</div>
                <div className="soil-depth-section">
                  {soilMoistureLayers.map(layer => {
                    const val = current[layer.key] ?? current[layer.altKey];
                    if (val == null) return null;
                    const pct = Math.min(val / 0.5 * 100, 100);
                    return (
                      <div className="soil-depth-bar" key={layer.key}>
                        <span className="soil-depth-label">{layer.label}</span>
                        <div className="soil-depth-track">
                          <div className="soil-depth-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${getMoistureColor(val)}, ${getMoistureColor(val)}88)` }}/>
                        </div>
                        <span className="soil-depth-value">{(val * 100).toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Map */}
            <div className="card" style={{padding:0, overflow:'hidden'}}>
              <div style={{padding:'18px 20px 10px'}}>
                <div className="card-title"><MapPin size={18}/> Interactive Map</div>
                <p style={{fontSize:'0.78rem', color:'var(--text-muted)', marginTop: -8, marginBottom: 10}}>Click anywhere on the map to fetch data for that location</p>
              </div>
              <div className="map-container">
                <MapContainer center={mapCenter} zoom={10} style={{height:'100%', width:'100%'}}>
                  <ChangeView center={mapCenter}/>
                  <MapClickHandler onClick={handleMapClick}/>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap'/>
                  {data && (
                    <Marker position={[data.latitude, data.longitude]}>
                      <Popup>
                        <strong>{locationName}</strong><br/>
                        Lat: {data.latitude}, Lon: {data.longitude}<br/>
                        Elevation: {data.elevation}m
                      </Popup>
                    </Marker>
                  )}
                </MapContainer>
              </div>
            </div>
          </div>

          {/* ── Right Column ────────────────── */}
          <div className="right-column">
            {loading && (
              <div className="card loading-overlay">
                <div className="spinner"></div>
                <span className="loading-text">Fetching agricultural data...</span>
              </div>
            )}

            {error && <div className="error-msg">{error}</div>}

            {data && !loading && (
              <>
                {/* Location Info */}
                <div className="location-info">
                  <div className="location-info-item">📍 <span className="location-info-value">{locationName}</span></div>
                  <div className="location-divider"/>
                  <div className="location-info-item">🌐 <span className="location-info-value">{data.latitude}°, {data.longitude}°</span></div>
                  <div className="location-divider"/>
                  <div className="location-info-item">⛰️ <span className="location-info-value">{data.elevation}m</span></div>
                  <div className="location-divider"/>
                  <div className="location-info-item">🕐 <span className="location-info-value">{data.timezone}</span></div>
                </div>

                {/* 7-Day Forecast */}
                {daily.length > 1 && (
                  <div className="card">
                    <div className="card-title">📅 7-Day Forecast</div>
                    <div className="forecast-scroll">
                      {daily.map((d, i) => (
                        <div className={`forecast-card ${i===0?'today':''}`} key={d.date}>
                          <div className="forecast-day">{getDayName(d.date, i)}</div>
                          <div className="forecast-date">{d.date}</div>
                          <div className="forecast-icon">{getWeatherIcon(d.precipitation_sum || d.precipitation || 0, d.temperature_2m_max || d.temperature_2m || 0)}</div>
                          <div className="forecast-temps">
                            <span className="forecast-temp-high">{d.temperature_2m_max != null ? Math.round(d.temperature_2m_max) + '°' : '--'}</span>
                            <span className="forecast-temp-low">{d.temperature_2m_min != null ? Math.round(d.temperature_2m_min) + '°' : '--'}</span>
                          </div>
                          <div className="forecast-detail">💧 {d.precipitation_sum ?? d.precipitation ?? 0} mm</div>
                          <div className="forecast-detail">🌱 SM: {((d.soil_moisture_0_to_1cm ?? d.soil_moisture_0_to_7cm ?? 0)*100).toFixed(0)}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Current Detailed Data */}
                <div className="card">
                  <div className="card-title"><Sprout size={18}/> Current Conditions — {current.date || 'Today'}</div>
                  <div className="data-cards-grid" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
                    {[
                      { label: 'Soil Temp (Surface)', val: current.soil_temperature_0cm ?? current.soil_temperature_0_to_7cm, unit: '°C', color: '#fbbf24', icon: '🌡️' },
                      { label: 'Soil Temp (6cm)', val: current.soil_temperature_6cm ?? current.soil_temperature_7_to_28cm, unit: '°C', color: '#fb923c', icon: '🌡️' },
                      { label: 'Soil Temp (18cm)', val: current.soil_temperature_18cm ?? current.soil_temperature_28_to_100cm, unit: '°C', color: '#f97316', icon: '🌡️' },
                      { label: 'Soil Temp (54cm)', val: current.soil_temperature_54cm ?? current.soil_temperature_100_to_255cm, unit: '°C', color: '#ea580c', icon: '🌡️' },
                      { label: 'Humidity', val: current.relative_humidity_2m, unit: '%', color: '#38bdf8', icon: '💧' },
                      { label: 'Wind Speed', val: current.windspeed_10m, unit: 'km/h', color: '#a78bfa', icon: '💨' },
                      { label: 'Evapotranspiration', val: current.evapotranspiration ?? current.et0_fao_evapotranspiration, unit: 'mm', color: '#34d399', icon: '☀️' },
                      { label: 'Precipitation', val: current.precipitation_sum ?? current.precipitation, unit: 'mm', color: '#60a5fa', icon: '🌧️' },
                    ].map((item, i) => (
                      item.val != null && (
                        <div className="data-card" key={i}>
                          <div className="data-card-icon" style={{background: `${item.color}18`}}>
                            <span>{item.icon}</span>
                          </div>
                          <div>
                            <div className="data-card-label">{item.label}</div>
                            <div className="data-card-value">
                              {typeof item.val === 'number' ? item.val.toFixed(1) : item.val}
                              <span className="data-card-unit"> {item.unit}</span>
                            </div>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                </div>

                {/* Recommendations */}
                {recommendations.length > 0 && (
                  <div className="card">
                    <div className="card-title">🧑‍🌾 Farmer Recommendations</div>
                    <div className="recommendation-list">
                      {recommendations.map((rec, i) => (
                        <div className={`recommendation-card ${rec.type}`} key={i}>
                          <span className="recommendation-icon">{rec.icon}</span>
                          <div>
                            <div className="recommendation-title">{rec.title}</div>
                            <div className="recommendation-text">{rec.text}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
