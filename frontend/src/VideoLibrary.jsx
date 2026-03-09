import React, { useState } from 'react';

const VideoLibrary = () => {
  const [query, setQuery] = useState('');
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiSearchTerm, setAiSearchTerm] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setVideos([]);
    setAiSearchTerm('');

    try {
      const response = await fetch('http://localhost:8000/search-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query })
      });

      const data = await response.json();

      if (data.success) {
        setVideos(data.videos);
        setAiSearchTerm(data.optimized_search);
      } else {
        setError(data.message || 'Eroare la căutarea pe YouTube.');
      }
    } catch (err) {
      setError('Eroare de conexiune cu serverul.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto p-8 text-white relative">
      
      {/* Header */}
      <div className="text-center mb-10 animate-fade-in-up">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-tr from-red-500/20 to-orange-500/20 border border-red-500/20 mb-6 shadow-inner">
          <span className="text-4xl">📺</span>
        </div>
        <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
          Explorator Video Inteligent
        </h2>
        <p className="text-slate-400 max-w-2xl mx-auto">
          Spune-i Agentului ce concept nu ai înțeles din curs. El va deduce termenii academici corecți și îți va aduce cele mai bune tutoriale direct aici.
        </p>
      </div>

      {/* Caseta de Căutare */}
      <form onSubmit={handleSearch} className="relative group max-w-2xl mx-auto w-full mb-12 animate-fade-in-up">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
        <div className="relative flex gap-3 bg-[#111827] border border-slate-700 rounded-2xl p-2 shadow-2xl">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex: Cum funcționează rețelele neuronale?"
            className="flex-1 bg-transparent px-4 py-3 text-white focus:outline-none placeholder-slate-500"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-600 text-white px-8 rounded-xl font-bold transition-all duration-300 flex items-center gap-2"
          >
            {loading ? 'Se caută...' : 'Caută Surse'}
          </button>
        </div>
      </form>

      {/* Mesaje & Status AI */}
      {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl mb-6 text-center">{error}</div>}
      
      {aiSearchTerm && !loading && (
        <div className="text-center mb-8 animate-fade-in-up">
          <span className="bg-slate-800 border border-slate-700 text-slate-300 text-sm px-4 py-2 rounded-full inline-flex items-center gap-2">
            <span className="text-orange-400">🧠 AI a căutat:</span> "{aiSearchTerm}"
          </span>
        </div>
      )}

      {/* Grid-ul cu Videoclipuri */}
      {videos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-10">
          {videos.map((video, idx) => (
            <a 
              key={idx} 
              href={video.link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="group bg-[#111827]/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl overflow-hidden hover:border-red-500/50 hover:shadow-[0_0_30px_rgba(239,68,68,0.15)] hover:-translate-y-1 transition-all duration-300 flex flex-col animate-fade-in-up"
              style={{ animationDelay: `${idx * 0.1}s` }}
            >
              {/* Thumbnail cu Iconiță Play */}
              <div className="relative aspect-video overflow-hidden bg-slate-900">
                <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center pl-1 shadow-lg">
                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4l12 6-12 6z" /></svg>
                  </div>
                </div>
                <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-bold px-2 py-1 rounded">
                  {video.duration}
                </div>
              </div>
              
              {/* Detalii Video */}
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="text-lg font-bold text-slate-200 group-hover:text-red-400 transition-colors line-clamp-2 mb-2 leading-tight">
                  {video.title}
                </h3>
                <div className="mt-auto text-sm text-slate-500 font-medium">
                  {video.views}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

export default VideoLibrary;