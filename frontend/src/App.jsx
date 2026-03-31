import { useState, useRef, useEffect } from 'react';

const API_BASE = 'http://localhost:3001';

// --- Helpers ---
function detectPlatform(url) {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  return null;
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatViews(n) {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M vistas`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K vistas`;
  return `${n} vistas`;
}

function timeAgo(date) {
  const diff = (Date.now() - date) / 1000;
  if (diff < 60) return 'Ahora mismo';
  if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

// --- Icons ---
const YouTubeIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.24 8.24 0 0 0 4.83 1.56V6.79a4.85 4.85 0 0 1-1.06-.1z"/>
  </svg>
);

const CloudIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M17.5 19a5.5 5.5 0 0 0 0-11h-1.5a7 7 0 1 0-13 4"/>
    <polyline points="9 13 12 10 15 13"/>
    <line x1="12" y1="10" x2="12" y2="16"/>
  </svg>
);

const LinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

const PrevIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
    <polyline points="15 18 9 12 15 6"></polyline>
  </svg>
);

const NextIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);

const LoopIcon = ({ active }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={active ? '#a78bfa' : 'currentColor'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <polyline points="17 1 21 5 17 9"></polyline>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
    <polyline points="7 23 3 19 7 15"></polyline>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
  </svg>
);

const SpeedIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="6" x2="12" y2="12"></line>
    <line x1="12" y1="12" x2="16" y2="14"></line>
  </svg>
);

export default function App() {
  const [url, setUrl] = useState('');
  const [platform, setPlatform] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [selectedFormat, setSelectedFormat] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [playbackMode, setPlaybackMode] = useState(0); // 0: Una vez, 1: Bucle, 2: Auto-Siguiente
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  
  // Playlists State
  const [playlists, setPlaylists] = useState(() => {
    try {
      const saved = localStorage.getItem('app_playlists');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [activePlaylistId, setActivePlaylistId] = useState(null); // null = Todos
  
  // Load history from localStorage at start
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('cloud_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [activeVideoIndex, setActiveVideoIndex] = useState(-1); // Index in history
  const inputRef = useRef(null);
  const videoRef = useRef(null);

  // Sync history with localStorage
  useEffect(() => {
    localStorage.setItem('cloud_history', JSON.stringify(history));
  }, [history]);

  // Sync playlists with localStorage
  useEffect(() => {
    localStorage.setItem('app_playlists', JSON.stringify(playlists));
  }, [playlists]);

  // Update playback rate when it changes OR when video changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, activeVideoIndex]);

  // Auto-scroll logic for cleaner UX
  useEffect(() => {
    if (videoInfo && !loading) {
       document.getElementById('video-details')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [videoInfo, loading]);

  const handleUrlChange = (e) => {
    const val = e.target.value;
    setUrl(val);
    setPlatform(detectPlatform(val));
    setError('');
    setVideoInfo(null);
    setDownloadSuccess(false);
  };

  const handleFetchInfo = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Por favor ingresa una URL válida.');
      return;
    }
    setLoading(true);
    setError('');
    setVideoInfo(null);
    setSelectedFormat(null);
    setDownloadSuccess(false);

    try {
      const res = await fetch(`${API_BASE}/api/info?url=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al obtener información del video');
      
      setVideoInfo(data);
      // Determine format automatically
      const best = data.formats.find(f => f.label === 'Best Quality') || data.formats.find(f => !f.label.includes('Audio')) || data.formats[0];
      setSelectedFormat(best);

      // AUTOMATICALLY START SAVING TO CLOUD
      handleSaveToCloud(data, best, trimmed);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleSaveToCloud = async (infoArg = null, formatArg = null, urlArg = null) => {
    const activeInfo = infoArg || videoInfo;
    const activeFormat = formatArg || selectedFormat;
    const activeUrl = urlArg || url.trim();

    if (!activeInfo || !activeFormat) return;
    setDownloading(true);
    setDownloadSuccess(false);
    setLoading(true); // Keep loading state visible

    const historyId = Date.now();
    const newEntry = {
      id: historyId,
      title: activeInfo.title,
      thumbnail: activeInfo.thumbnail,
      platform: activeInfo.platform,
      format: activeFormat.label,
      status: 'downloading',
      time: Date.now(),
      cloudinaryUrl: null,
    };
    
    // Add to history
    setHistory(prev => [newEntry, ...prev]);

    try {
      const res = await fetch(`${API_BASE}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: activeUrl,
          format_id: activeFormat.format_id,
          label: activeFormat.label,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al subir a la nube');

      setDownloadSuccess(true);
      
      // Update entry in history with Cloudinary URL and public_id
      setHistory(prev => prev.map((h, index) => {
        if (h.id === historyId) {
           return { ...h, status: 'success', cloudinaryUrl: data.url, publicId: data.public_id };
        }
        return h;
      }));

      // Find new index
      const isAudio = activeFormat.label.toLowerCase().includes('audio');
      if (!isAudio) {
         setActiveVideoIndex(0);
      }
    } catch (err) {
      setError(err.message);
      setHistory(prev => prev.map(h => h.id === historyId ? { ...h, status: 'failed' } : h));
    } finally {
      setDownloading(false);
      setLoading(false);
    }
  };

  const handlePrev = () => {
    setVideoError(false);
    // Find index of previous video in history (older one, so index is higher)
    const prevIndex = history.findIndex((h, idx) => 
      idx > activeVideoIndex && h.cloudinaryUrl && !h.format.toLowerCase().includes('audio')
    );
    if (prevIndex !== -1) {
      setActiveVideoIndex(prevIndex);
    }
  };

  const handleNext = () => {
    setVideoError(false);
    // Find index of next video in history (newer one, so index is lower)
    let target = -1;
    for (let i = activeVideoIndex - 1; i >= 0; i--) {
      if (history[i].cloudinaryUrl && !history[i].format.toLowerCase().includes('audio')) {
        target = i;
        break;
      }
    }
    if (target !== -1) {
      setActiveVideoIndex(target);
    }
  };

  const handleDelete = async (id, publicId) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este video?')) return;
    
    // Remove from state immediately
    setHistory(prev => prev.filter(h => h.id !== id));
    
    // If it has a publicId, try to delete from Cloudinary too
    if (publicId) {
      try {
        await fetch(`${API_BASE}/api/video/${publicId}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Error deleting from cloud:', err);
      }
    }
  };

  const handleBulkDelete = async () => {
    const idsArray = Array.from(selectedIds);
    if (idsArray.length === 0) return;
    if (!window.confirm(`¿Estás seguro de que quieres eliminar estos ${idsArray.length} videos?`)) return;

    // Get public IDs of selected items
    const publicIdsToDelete = history
      .filter(h => selectedIds.has(h.id) && h.publicId)
      .map(h => h.publicId);

    // Remove from state immediately
    setHistory(prev => prev.filter(h => !selectedIds.has(h.id)));
    setSelectedIds(new Set());
    setIsSelectionMode(false);

    // Call backend if there are public IDs to remove from Cloudinary
    if (publicIdsToDelete.length > 0) {
      try {
        await fetch(`${API_BASE}/api/video/bulk-delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publicIds: publicIdsToDelete }),
        });
      } catch (err) {
        console.error('Error in bulk delete:', err);
      }
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreatePlaylist = () => {
    const name = window.prompt('Nombre de la nueva lista:');
    if (!name) return;
    const newPlaylist = {
       id: Date.now(),
       name: name,
       videoIds: []
    };
    setPlaylists(prev => [...prev, newPlaylist]);
  };

  const addToPlaylist = (playlistId) => {
    const idsToAdd = Array.from(selectedIds);
    setPlaylists(prev => prev.map(pl => {
      if (pl.id === playlistId) {
        // Only add unique IDs
        const combined = new Set([...pl.videoIds, ...idsToAdd]);
        return { ...pl, videoIds: Array.from(combined) };
      }
      return pl;
    }));
    setIsSelectionMode(false);
    setSelectedIds(new Set());
    alert('Videos añadidos a la lista con éxito.');
  };

  const removeFromPlaylist = (playlistId, videoId) => {
     setPlaylists(prev => prev.map(pl => {
        if (pl.id === playlistId) {
           return { ...pl, videoIds: pl.videoIds.filter(id => id !== videoId) };
        }
        return pl;
     }));
  };

  const deletePlaylist = (playlistId) => {
     if (!window.confirm('¿Quieres eliminar esta lista por completo? Los videos no se borrarán de tu galería general.')) return;
     setPlaylists(prev => prev.filter(pl => pl.id !== playlistId));
     setActivePlaylistId(null);
  };

  const cyclePlaybackMode = () => {
    setPlaybackMode(prev => (prev + 1) % 3);
  };

  const handleVideoEnded = () => {
    if (playbackMode === 2) {
      handleNext();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleFetchInfo();
  };

  const activeVideo = activeVideoIndex !== -1 ? history[activeVideoIndex] : null;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-icon">☁️</div>
            <span className="logo-text">AppTube</span>
          </div>
        </div>
      </header>

      <main className="main">
        {/* Hero */}
        <section className="hero">
          <h1 className="hero-title">
            Guarda videos de
            <br />
            <span className="gradient-text">YouTube & TikTok</span>
          </h1>
          <p className="hero-subtitle">
            Pega el enlace y nosotros lo subimos a Cloudinary por ti. Míralos aquí mismo sin gastar espacio en tu pc.
          </p>
          <div className="platform-icons">
            <div className="platform-badge youtube">
              <YouTubeIcon />
              YouTube
            </div>
            <div className="platform-badge tiktok">
              <TikTokIcon />
              TikTok
            </div>
          </div>
        </section>

        {/* Global Video Player Modal */}
        {activeVideo && (
          <div className="video-modal-overlay" onClick={() => setActiveVideoIndex(-1)}>
            <div className="video-modal-content" onClick={e => e.stopPropagation()}>
              <div className="video-modal-header">
                <span className="video-modal-title">{activeVideo.title}</span>
                <button className="video-modal-close" onClick={() => setActiveVideoIndex(-1)} title="Cerrar">✕</button>
              </div>
              
              <div className="video-player-wrapper">
                {/* Prev Button */}
                <button 
                  className="nav-btn prev" 
                  onClick={handlePrev}
                  disabled={!history.some((h, i) => i > activeVideoIndex && h.cloudinaryUrl && !h.format.toLowerCase().includes('audio'))}
                >
                  <PrevIcon title="Anterior" />
                </button>

                <div className="video-container">
                  <video 
                    key={activeVideo.id}
                    ref={videoRef}
                    src={activeVideo.cloudinaryUrl} 
                    controls 
                    autoPlay 
                    playsInline
                    loop={playbackMode === 1}
                    onEnded={handleVideoEnded}
                    className="main-video-player"
                    onError={(e) => {
                       console.error('Video error:', e);
                       setVideoError(true);
                    }}
                    onPlay={() => {
                       setVideoError(false);
                       if (videoRef.current) videoRef.current.playbackRate = playbackRate;
                    }}
                  />
                  {videoError && (
                    <div className="video-error-overlay">
                       <div className="video-error-content">
                         <span className="error-icon">❌</span>
                         <p>No se pudo cargar el video en el reproductor.</p>
                         <a href={activeVideo.cloudinaryUrl} target="_blank" rel="noreferrer" className="btn-external">
                           Abrir en una pestaña nueva
                         </a>
                       </div>
                    </div>
                  )}
                </div>

                {/* Next Button */}
                <button 
                  className="nav-btn next" 
                  onClick={handleNext}
                  disabled={!history.some((h, i) => i < activeVideoIndex && h.cloudinaryUrl && !h.format.toLowerCase().includes('audio'))}
                >
                  <NextIcon title="Siguiente" />
                </button>
              </div>

              <div className="video-modal-footer">
                <div className="modal-controls-bar">
                  <div className="playback-controls">
                    <button 
                       className={`control-btn mode-btn mode-${playbackMode}`} 
                       onClick={cyclePlaybackMode}
                       title="Cambiar Modo de Reproducción"
                    >
                       {playbackMode === 0 && <span>🔄 Una vez</span>}
                       {playbackMode === 1 && <span>🔁 En Bucle</span>}
                       {playbackMode === 2 && <span>➡️ Auto-Siguiente</span>}
                    </button>

                    <div className="speed-control-group">
                       {[0.5, 1, 1.5, 2, 2.5, 3].map(rate => (
                          <button 
                             key={rate}
                             className={`speed-pill ${playbackRate === rate ? 'active' : ''}`}
                             onClick={() => setPlaybackRate(rate)}
                          >
                             {rate}x
                          </button>
                       ))}
                    </div>
                  </div>
                  <div className="video-info-text">
                    {activeVideo.platform.toUpperCase()} · {activeVideo.format}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Downloader */}
        <div id="downloader" className="downloader-card">

          {/* URL Input */}
          {platform && (
            <div className={`platform-indicator ${platform}`}>
              {platform === 'youtube' ? <YouTubeIcon /> : <TikTokIcon />}
              <span>
                {platform === 'youtube' ? 'YouTube detectado' : 'TikTok detectado'}
              </span>
            </div>
          )}

          <div className="input-group">
            <div className="url-input-wrapper">
              <input
                id="url-input"
                ref={inputRef}
                className="url-input"
                type="url"
                placeholder="Pega el enlace de YouTube o TikTok aquí…"
                value={url}
                onChange={handleUrlChange}
                onKeyDown={handleKeyDown}
                autoFocus
              />
              <div className="url-input-icon"><LinkIcon /></div>
            </div>
            <button
              id="btn-fetch-info"
              className="btn-fetch"
              onClick={handleFetchInfo}
              disabled={loading || downloading || !url.trim()}
            >
              <CloudIcon />
              {loading || downloading ? 'Procesando…' : 'Descargar y Guardar en la Nube'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="error-box">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="loading-state">
              <div className="spinner" />
              <span className="loading-text">Obteniendo información del video…</span>
            </div>
          )}

        {/* Only show info if we already have it but hide buttons */}
        {videoInfo && (
           <div id="video-details" className="fade-in downloader-results-simple">
              <div className="video-info">
                 <div className="video-info-inner">
                    <div className="video-thumbnail-wrap">
                       {videoInfo.thumbnail && <img className="video-thumbnail" src={videoInfo.thumbnail} alt={videoInfo.title} />}
                       <span className={`platform-dot ${videoInfo.platform}`}>
                          {videoInfo.platform === 'youtube' ? 'YT' : 'TT'}
                       </span>
                    </div>
                    <div className="video-meta">
                       <div className="video-title">{videoInfo.title}</div>
        <div className="video-status-simple">
                          {downloading ? '🔄 Subiendo a Cloudinary...' : downloadSuccess ? '✅ ¡Listo para ver!' : ''}
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        )}
        </div>

        {/* Saved Videos History */}
        <section id="history" className="history-section">
          {/* Playlist Tabs */}
          <div className="playlist-tabs-container">
            <div className="playlist-tabs">
              <button 
                className={`tab-btn ${activePlaylistId === null ? 'active' : ''}`}
                onClick={() => setActivePlaylistId(null)}
              >
                🎥 Todos
              </button>
              {playlists.map(pl => (
                <div key={pl.id} className="tab-wrapper">
                  <button 
                    className={`tab-btn ${activePlaylistId === pl.id ? 'active' : ''}`}
                    onClick={() => setActivePlaylistId(pl.id)}
                  >
                    📁 {pl.name}
                  </button>
                  {activePlaylistId === pl.id && (
                    <button className="btn-tab-action" onClick={() => deletePlaylist(pl.id)} title="Eliminar Lista">✕</button>
                  )}
                </div>
              ))}
              <button className="tab-btn create" onClick={handleCreatePlaylist}>
                ➕ Nueva Lista
              </button>
            </div>
          </div>

          <div className="history-header">
            <h2 className="history-title">
              {activePlaylistId === null ? '📋 Galería Global' : `📂 ${playlists.find(p => p.id === activePlaylistId)?.name}`}
            </h2>
            {history.length > 0 && (
              <div className="history-selection-bar">
                {isSelectionMode ? (
                  <>
                    <button className="btn-clear cancel" onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }}>
                      Cancelar
                    </button>
                    {playlists.length > 0 && selectedIds.size > 0 && (
                       <div className="add-to-playlist-group">
                          <select className="playlist-select" onChange={(e) => addToPlaylist(Number(e.target.value))} defaultValue="">
                             <option value="" disabled>Añadir a...</option>
                             {playlists.map(pl => (
                                <option key={pl.id} value={pl.id}>{pl.name}</option>
                             ))}
                          </select>
                       </div>
                    )}
                    <button 
                      className="btn-clear delete-bulk" 
                      onClick={handleBulkDelete}
                      disabled={selectedIds.size === 0}
                    >
                      Borrar de Nube ({selectedIds.size})
                    </button>
                  </>
                ) : (
                  <button className="btn-clear select-mode" onClick={() => setIsSelectionMode(true)}>
                    Seleccionar
                  </button>
                )}
              </div>
            )}
          </div>

          {((activePlaylistId === null && history.length === 0) || 
            (activePlaylistId !== null && playlists.find(p => p.id === activePlaylistId)?.videoIds.length === 0)) ? (
            <div className="history-empty">
              No hay videos aquí aún.
            </div>
          ) : (
            <div className="history-list">
              {history
                .filter(item => {
                  if (activePlaylistId === null) return true;
                  const pl = playlists.find(p => p.id === activePlaylistId);
                  return pl?.videoIds.includes(item.id);
                })
                .map((item, index) => (
                <div 
                  key={item.id} 
                  className={`history-item clickable ${item.status === 'success' ? 'ready' : ''} ${selectedIds.has(item.id) ? 'selected' : ''} ${isSelectionMode ? 'selection-active' : ''}`}
                  onClick={() => {
                      if (isSelectionMode) {
                        toggleSelect(item.id);
                        return;
                      }
                      console.log('Clicked item:', item);
                      if (item.status === 'success') {
                         if (item.cloudinaryUrl) {
                            const isAudio = item.format?.toLowerCase().includes('audio');
                            if (isAudio) {
                               window.open(item.cloudinaryUrl, '_blank');
                            } else {
                                console.log('Abriendo video en historial. Index:', index, 'ID:', item.id);
                                setVideoError(false);
                                setActiveVideoIndex(index);
                            }
                         } else {
                            setHistory(prev => prev.map(h => h.id === item.id ? { ...h, status: 'failed' } : h));
                            alert('No se encontró el enlace de este video en el historial. Intenta procesarlo de nuevo.');
                         }
                      } else if (item.status === 'downloading') {
                         alert('Todavía se está subiendo… falta poco.');
                      } else if (item.status === 'failed') {
                         alert('Hubo un error al descargar este video. Por favor, intenta pegando el link de nuevo.');
                      }
                   }}
                >
                  {isSelectionMode && (
                    <div className={`selection-indicator ${selectedIds.has(item.id) ? 'checked' : ''}`}>
                      {selectedIds.has(item.id) ? '✓' : ''}
                    </div>
                  )}
                  <div className="history-thumb">
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt={item.title} />
                    ) : (
                      <div className="history-thumb-placeholder">
                        {item.platform === 'youtube' ? '▶️' : '🎵'}
                      </div>
                    )}
                    {item.status === 'success' && !item.format.toLowerCase().includes('audio') && !isSelectionMode && (
                      <div className="play-overlay">
                        <PlayIcon />
                      </div>
                    )}
                  </div>
                  <div className="history-info">
                    <div className="history-item-title">{item.title}</div>
                    <div className="history-item-meta">
                      <span>{item.format}</span>
                      <span>·</span>
                      <span>{timeAgo(item.time)}</span>
                    </div>
                  </div>
                  <div className="history-actions">
                    <span className={`history-status ${item.status}`}>
                      {item.status === 'success' && 'Listo'}
                      {item.status === 'failed' && 'Error'}
                      {item.status === 'downloading' && 'Subiendo…'}
                    </span>
                    {!isSelectionMode && (
                      <>
                        {activePlaylistId !== null && (
                          <button 
                            className="btn-delete-item-pl" 
                            onClick={(e) => { e.stopPropagation(); removeFromPlaylist(activePlaylistId, item.id); }}
                            title="Quitar de lista"
                          >
                            ➖
                          </button>
                        )}
                        <button 
                          className="btn-delete-item" 
                          onClick={(e) => { e.stopPropagation(); handleDelete(item.id, item.publicId); }}
                          title="Eliminar de Nube"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .video-modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.95);
          backdrop-filter: blur(20px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.3s ease;
        }
        .video-modal-content {
          width: 95%;
          max-width: 1100px;
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 15px;
        }
        .playlist-tabs-container {
          overflow-x: auto;
          margin-bottom: 24px;
          padding-bottom: 8px;
          scrollbar-width: thin;
        }
        .playlist-tabs {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .tab-btn {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          color: var(--text-muted);
          padding: 10px 20px;
          border-radius: 14px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          white-space: nowrap;
          transition: 0.3s;
        }
        .tab-btn:hover {
          background: rgba(255,255,255,0.08);
          color: white;
        }
        .tab-btn.active {
          background: var(--gradient-main);
          color: white;
          border-color: transparent;
          box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
        }
        .tab-btn.create {
          border-style: dashed;
          border-color: var(--purple-light);
          color: var(--purple-light);
        }
        .tab-wrapper { position: relative; display: flex; align-items: center; }
        .btn-tab-action {
          position: absolute; right: 5px; top: -5px;
          background: var(--red); color: white; border: none;
          width: 18px; height: 18px; border-radius: 50%;
          font-size: 10px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        }

        .playlist-select {
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid var(--purple);
          color: var(--purple-light);
          padding: 8px 12px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          outline: none;
        }
        .btn-delete-item-pl {
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--border);
          color: var(--text-muted);
          width: 32px; height: 32px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: 0.2s;
          margin-right: 4px;
        }
        .btn-delete-item-pl:hover {
          background: rgba(255,255,255,0.1);
          color: white;
        }

        .history-selection-bar {
          display: flex;
          gap: 10px;
        }
        .btn-clear.cancel {
          background: rgba(255,255,255,0.05);
        }
        .btn-clear.delete-bulk {
          background: rgba(239, 68, 68, 0.1);
          color: #fca5a5;
          border-color: rgba(239, 68, 68, 0.3);
        }
        .btn-clear.select-mode {
          border-color: var(--purple);
          color: var(--purple-light);
        }
        .selection-active {
          border-color: rgba(139, 92, 246, 0.3);
        }
        .history-item.selected {
          background: rgba(139, 92, 246, 0.08);
          border-color: var(--purple);
        }
        .selection-indicator {
          width: 22px; height: 22px;
          border-radius: 4px;
          border: 2px solid var(--border);
          display: flex; align-items: center; justify-content: center;
          font-weight: 900; color: white;
          flex-shrink: 0;
        }
        .selection-indicator.checked {
          background: var(--purple);
          border-color: var(--purple);
        }
        .history-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .btn-delete-item {
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--border);
          color: var(--text-muted);
          width: 32px; height: 32px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: 0.2s;
          font-size: 14px;
        }
        .btn-delete-item:hover {
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.4);
          color: #fca5a5;
          transform: scale(1.1);
        }
        .video-status-simple {
          font-size: 13px;
          color: var(--purple-light);
          font-weight: 600;
          margin-top: 5px;
        }
        .downloader-results-simple {
          margin-top: 24px;
        }
        .video-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 10px;
        }
        .video-modal-title {
          font-weight: 800;
          font-size: 20px;
          color: white;
          max-width: 85%;
          line-height: 1.3;
          letter-spacing: -0.5px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .video-modal-close {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          color: white;
          width: 44px; height: 44px;
          border-radius: 50%; cursor: pointer;
          font-size: 18px; transition: all 0.3s;
          display: flex; align-items: center; justify-content: center;
        }
        .video-modal-close:hover {
          background: var(--red);
          transform: rotate(90deg);
        }
        .video-player-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          gap: 25px;
        }
        .nav-btn {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: white;
          width: 64px; height: 64px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          flex-shrink: 0;
          backdrop-filter: blur(10px);
        }
        .nav-btn:hover:not(:disabled) {
          background: var(--gradient-main);
          border-color: transparent;
          transform: scale(1.15);
          box-shadow: 0 0 30px rgba(139, 92, 246, 0.4);
        }
        .nav-btn:disabled { opacity: 0.1; cursor: default; filter: grayscale(1); }

        .video-container {
          flex: 1;
          position: relative;
          background: #000;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 
            0 0 80px rgba(0,0,0,0.8),
            0 0 2px rgba(139, 92, 246, 0.4),
            0 20px 50px rgba(0,0,0,0.5);
          aspect-ratio: 16/9;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .main-video-player {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: contain;
        }

        .video-error-overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(10, 10, 15, 0.95);
          display: flex; align-items: center; justify-content: center;
          text-align: center; padding: 40px; z-index: 5;
        }
        .video-error-content {
          display: flex; flex-direction: column; align-items: center; gap: 20px;
        }
        .btn-external {
          background: var(--gradient-main);
          color: white;
          padding: 14px 28px;
          border-radius: 40px;
          text-decoration: none;
          font-weight: 700;
          font-size: 15px;
          transition: 0.3s;
          box-shadow: 0 4px 20px rgba(139, 92, 246, 0.4);
        }
        .btn-external:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(139, 92, 246, 0.6);
        }
        .video-modal-footer {
          padding: 15px 10px;
          background: rgba(255,255,255,0.03);
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.06);
          margin-top: 5px;
        }
        .modal-controls-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }
        .playback-controls {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .speed-control-group {
          display: flex;
          background: rgba(255,255,255,0.05);
          padding: 4px;
          border-radius: 99px;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .speed-pill {
          background: transparent;
          border: none;
          color: var(--text-muted);
          padding: 6px 12px;
          border-radius: 99px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: 0.3s;
        }
        .speed-pill:hover {
          color: white;
          background: rgba(255,255,255,0.05);
        }
        .speed-pill.active {
          background: white;
          color: black;
          box-shadow: 0 4px 12px rgba(255,255,255,0.2);
        }
        .control-btn {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: white;
          padding: 10px 20px;
          border-radius: 99px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          font-weight: 700;
          transition: all 0.3s;
          letter-spacing: 0.2px;
        }
        .control-btn:hover:not(:disabled) {
          background: rgba(255,255,255,0.12);
          transform: translateY(-1px);
        }
        .control-btn.mode-0 { border-color: rgba(255,255,255,0.2); }
        .control-btn.mode-1 { 
          background: rgba(139, 92, 246, 0.15); 
          border-color: var(--purple); 
          color: var(--purple-light);
          box-shadow: 0 0 20px rgba(139, 92, 246, 0.2);
        }
        .control-btn.mode-2 { 
          background: var(--gradient-main); 
          border: none;
          box-shadow: 0 4px 20px rgba(139, 92, 246, 0.4);
        }
        .video-info-text {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          opacity: 0.8;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .history-item.clickable { cursor: pointer; transition: 0.3s; position: relative; }
        .history-item.clickable:hover { 
          background: var(--bg-card-hover);
          border-color: rgba(139, 92, 246, 0.4);
        }
        .history-thumb { position: relative; }
        .play-overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.4);
          display: flex; align-items: center; justify-content: center;
          opacity: 0; transition: 0.3s;
        }
        .history-item.ready:hover .play-overlay { opacity: 1; }

        .format-info-simple {
          margin: 10px 0 20px;
          padding: 12px;
          background: rgba(139, 92, 246, 0.05);
          border: 1px solid rgba(139, 92, 246, 0.1);
          border-radius: var(--radius-sm);
          font-size: 13px;
          color: var(--purple-light);
          text-align: center;
          font-weight: 500;
        }
        @media (max-width: 768px) {
          .nav-btn { position: absolute; z-index: 10; top: 50%; transform: translateY(-50%); }
          .nav-btn.prev { left: -10px; }
          .nav-btn.next { right: -10px; }
          .video-modal-title { font-size: 14px; }
        }
      `}} />
    </div>
  );
}
