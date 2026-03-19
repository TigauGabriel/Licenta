import React, { useState, useEffect, useRef } from 'react';
import mermaid from 'mermaid';

// Componenta pentru randarea diagramelor Mermaid.js cu auto-adaptare la dimensiunea containerului
const DiagramaMermaid = ({ cod }) => {
  useEffect(() => {
    mermaid.initialize({ 
      startOnLoad: true, 
      theme: 'dark',
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' }
    });
    mermaid.contentLoaded();
  }, [cod]);

  if (!cod) return null;
  
  return (
    <div key={cod} className="mermaid flex items-center justify-center w-full h-full [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto">
      {cod}
    </div>
  );
};

const VideoLibrary = ({ userId }) => {
  // Stari globale pentru managementul prezentarii si navigarii
  const [subiect, setSubiect] = useState('');
  const [loading, setLoading] = useState(false);
  const [prezentare, setPrezentare] = useState(null);
  const [slideCurent, setSlideCurent] = useState(0);
  
  // Stari pentru managementul resurselor multimedia (Audio & Imagini)
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  
  // Obiect pentru caching-ul imaginilor generate per sesiune
  const [imaginiGenerate, setImaginiGenerate] = useState({});

  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [slideCurent]);

  // Handler principal pentru initierea procesului de generare a intregului curs
  const handleGenereaza = async (e) => {
    e.preventDefault();
    if (!subiect.trim()) return;
    
    setLoading(true);
    setPrezentare(null);
    setSlideCurent(0);

    try {
      const response = await fetch('http://localhost:8000/genereaza-prezentare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subiect, user_id: userId })
      });
      const data = await response.json();
      
      if (data.success) {
        setPrezentare(data.prezentare);
      } else {
        alert("Eroare la generare: " + data.message);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Functie pentru preluarea fisierului audio TTS aferent textului din slide
  const incarcaVoceSlide = async (textSlide) => {
    setAudioLoading(true);
    setIsPlaying(false);
    setAudioUrl(null);

    try {
      const response = await fetch('http://localhost:8000/genereaza-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textSlide })
      });
      const data = await response.json();
      
      if (data.success) {
        setAudioUrl(data.audio_url);
      }
    } catch (err) {
      console.error("Eroare audio:", err);
    } finally {
      setAudioLoading(false);
    }
  };

  /**
   * Comunica cu API-ul backend pentru generarea imaginilor (ex: NVIDIA NIM).
   * @param {string} prompt - Descrierea imaginii in limba engleza.
   * @returns {Promise<string|null>} Codul Base64 al imaginii pentru caching.
   */
  const incarcaImagineSlide = async (prompt) => {
    setImageLoading(true);
    setImageUrl(null);
    setImageError(false);
    let imagineBase64 = null; 

    try {
      const response = await fetch('http://localhost:8000/genereaza-imagine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt })
      });
      const data = await response.json();
      
      if (data.success) {
        setImageUrl(data.imagine); 
        imagineBase64 = data.imagine; 
      } else {
        console.error("Eroare NVIDIA:", data.message);
        setImageError(true);
      }
    } catch (err) {
      console.error("Eroare retea imagine:", err);
      setImageError(true);
    } finally {
      setImageLoading(false);
      return imagineBase64;
    }
  };

  // Sincronizeaza incarcarea asset-urilor la fiecare schimbare de slide.
  // Utilizeaza imaginiGenerate ca mecanism de cache local pentru optimizarea apelurilor retea.
  useEffect(() => {
    if (prezentare && prezentare.slide_uri[slideCurent]) {
      const slideActual = prezentare.slide_uri[slideCurent];
      const cheieCache = `slide_${slideCurent}`;
      
      incarcaVoceSlide(slideActual.text_pentru_voce);
      
      if (slideActual.prompt_imagine_en) {
        if (imaginiGenerate[cheieCache]) {
          // Incarcare instantanee din cache
          setImageUrl(imaginiGenerate[cheieCache]);
          setImageLoading(false);
          setImageError(false);
        } else {
          // Apel API si salvare in cache
          incarcaImagineSlide(slideActual.prompt_imagine_en).then((imagineBase64) => {
             if (imagineBase64) {
               setImaginiGenerate(prev => ({...prev, [cheieCache]: imagineBase64}));
             }
          });
        }
      } else {
        setImageUrl(null); 
      }
    }
  }, [slideCurent, prezentare]);

  // Controale navigare limitate la numarul total de slide-uri
  const nextSlide = () => setSlideCurent(prev => Math.min(prev + 1, prezentare.slide_uri.length - 1));
  const prevSlide = () => setSlideCurent(prev => Math.max(prev - 1, 0));

  return (
    <div className="w-full h-full flex flex-col relative bg-[#0B0F19]">
      
      {/* View 1: Interfata de input pentru generarea cursului */}
      {!prezentare && (
        <div className="flex-1 flex items-center justify-center p-8 animate-fade-in">
          <div className="bg-[#111827] border border-slate-700 rounded-3xl p-10 shadow-2xl max-w-2xl w-full">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
                <span className="text-4xl">🎓</span>
              </div>
              <h2 className="text-3xl font-extrabold text-white mb-3">Generează Curs Interactiv</h2>
              <p className="text-slate-400">Transformă PDF-urile tale în prezentări video cu diagrame și profesor AI.</p>
            </div>
            
            <form onSubmit={handleGenereaza} className="flex flex-col gap-4">
              <input
                type="text"
                value={subiect}
                onChange={(e) => setSubiect(e.target.value)}
                placeholder="Ex: Explică arhitectura microprocesoarelor..."
                className="w-full bg-[#0B0F19] border border-slate-600 px-6 py-4 rounded-xl text-lg text-white focus:outline-none focus:border-indigo-500 transition-colors shadow-inner"
              />
              <button
                type="submit"
                disabled={loading || !subiect.trim()}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-800 disabled:to-slate-800 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3 shadow-lg"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Se procesează informațiile...
                  </>
                ) : '🚀 Generează Cursul Acum'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* View 2: Player-ul prezentarii (Theater Mode) */}
      {prezentare && (
        <div className="absolute inset-0 z-50 flex flex-col bg-[#080B12] animate-fade-in-up">
          
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 px-8 py-3 flex justify-between items-center border-b border-white/10 shrink-0">
            <div>
              <h1 className="text-xl font-bold text-slate-200 tracking-wide">{prezentare.titlu_curs}</h1>
              <p className="text-indigo-400 font-medium text-xs mt-0.5">Slide {slideCurent + 1} din {prezentare.slide_uri.length}</p>
            </div>
            <button 
              onClick={() => {
                setPrezentare(null);
                setIsPlaying(false);
                if (audioRef.current) audioRef.current.pause();
              }}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
            >
              ✕ Închide
            </button>
          </div>

          {/* Container Principal Slide */}
          <div className="flex-1 flex flex-col p-10 overflow-hidden">
            
            <h2 className="text-4xl font-extrabold text-white mb-8 border-b border-white/5 pb-4 shrink-0">
              {prezentare.slide_uri[slideCurent].titlu}
            </h2>
            
            {/* Split Screen Layout */}
            <div className="flex-1 grid grid-cols-2 gap-10 min-h-0 overflow-hidden">
              
              {/* Coloana de continut text */}
              <div className="flex flex-col justify-center overflow-hidden pr-4">
                <ul className="space-y-4">
                  {prezentare.slide_uri[slideCurent].idei_principale.map((idee, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-lg text-slate-300 leading-snug font-medium">
                      <span className="text-indigo-500 mt-0.5 text-lg">✦</span>
                      <span>{idee}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Coloana de resurse vizuale (Imagine AI / Diagrama) */}
              <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-[#0B0F19] shadow-2xl h-full w-full min-h-0">
                
                {imageLoading && prezentare.slide_uri[slideCurent].prompt_imagine_en && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-[#0B0F19]/80 backdrop-blur-sm">
                    <svg className="animate-spin h-10 w-10 text-indigo-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span className="text-sm font-bold text-indigo-400 animate-pulse">Generare vizual AI...</span>
                  </div>
                )}
                
                {imageUrl && !imageLoading && prezentare.slide_uri[slideCurent].prompt_imagine_en && (
                  <img 
                    src={imageUrl} 
                    alt="Slide Visual"
                    className="absolute inset-0 w-full h-full object-cover animate-fade-in"
                  />
                )}

                {prezentare.slide_uri[slideCurent].cod_diagrama_mermaid && (
                  <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-slate-900/40 p-6">
                    <DiagramaMermaid cod={prezentare.slide_uri[slideCurent].cod_diagrama_mermaid} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Navigare & Controale Audio */}
          <div className="bg-[#05080f] px-8 py-4 flex justify-between items-center border-t border-white/5 shrink-0 z-20">
            
            <button 
              onClick={prevSlide} disabled={slideCurent === 0}
              className="w-40 py-3 bg-slate-800 disabled:opacity-30 rounded-xl text-sm font-bold text-white hover:bg-slate-700 transition-colors"
            >
              ← Anterior
            </button>

            <div className="flex flex-col items-center gap-3">
              {audioUrl && (
                <audio 
                  ref={audioRef} src={audioUrl} autoPlay
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => {
                    setIsPlaying(false);
                    // Auto-avansare la finalizarea audio-ului
                    if (slideCurent < prezentare.slide_uri.length - 1) setSlideCurent(prev => prev + 1);
                  }}
                />
              )}
              
              {audioLoading ? (
                 <span className="text-xs text-indigo-400 font-bold animate-pulse">Sincronizare voce...</span>
              ) : (
                <button 
                  onClick={() => isPlaying ? audioRef.current?.pause() : audioRef.current?.play()}
                  className="text-slate-400 hover:text-white flex items-center gap-2 text-sm transition-colors"
                >
                  {isPlaying ? '⏸ Pauză Voce' : '▶️ Reia Vocea'}
                </button>
              )}

              {/* Indicator de progres */}
              <div className="flex gap-3">
                {prezentare.slide_uri.map((_, idx) => (
                  <div key={idx} className={`h-2 rounded-full transition-all duration-500 ${idx === slideCurent ? 'bg-indigo-500 w-8' : 'bg-slate-700 w-2'}`} />
                ))}
              </div>
            </div>

            <button 
              onClick={nextSlide} disabled={slideCurent === prezentare.slide_uri.length - 1}
              className="w-40 py-3 bg-indigo-600 disabled:opacity-30 rounded-xl text-sm font-bold text-white hover:bg-indigo-500 transition-colors"
            >
              Următor →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoLibrary;