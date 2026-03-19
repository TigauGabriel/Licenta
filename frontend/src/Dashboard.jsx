import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import QuizArena from './QuizArena';
import { supabase } from './supabaseClient';
import VideoLibrary from './VideoLibrary';

const Dashboard = ({userId, username, onLogout }) => {
  // Stari globale UI & Date
  const [messages, setMessages] = useState([
    { role: 'ai', text: `Salut, **${username}**! Sunt asistentul tău de studiu bazat pe AI. Cu ce te pot ajuta astăzi?` }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Stare pentru metricele de performanta ale utilizatorului
  const [stats, setStats] = useState({ teste_rezolvate: 0, raspunsuri_corecte: 0, total_intrebari: 0 });

  /**
   * Preluarea asincrona a datelor analitice pentru profilul studentului curent (din Supabase).
   * Se executa la montarea componentei.
   */
  const fetchStats = async () => {
    try {
      const { data, error } = await supabase
        .from('progres_studenti')
        .select('*')
        .eq('user_id', userId)
        .single();
        
      if (data) {
        setStats({
          teste_rezolvate: data.teste_rezolvate || 0,
          raspunsuri_corecte: data.raspunsuri_corecte || 0,
          total_intrebari: data.total_intrebari || 0
        });
      }
    } catch (err) {
      console.log("Eroare incarcare date profil:", err);
    }
  };

  useEffect(() => { fetchStats(); }, [userId]);

  // Logica dinamica de gamification (Calcul Acuratete & Sistem de Ranguri)
  let accuracy = 0;
  if (stats.total_intrebari > 0) {
    accuracy = Math.round((stats.raspunsuri_corecte / stats.total_intrebari) * 100);
  }

  let rankInfo = { name: "🥉 Începător", color: "text-slate-400" };
  if (accuracy >= 85 && stats.teste_rezolvate > 0) rankInfo = { name: "🥇 Maestru", color: "text-emerald-400" };
  else if (accuracy >= 50 && stats.teste_rezolvate > 0) rankInfo = { name: "🥈 Explorator", color: "text-yellow-400" };

  /**
   * Gestioneaza incarcarea fisierelor catre backend-ul FastAPI.
   * Modifica starea UI-ului si initializeaza pipeline-ul de RAG (Vectorizare & Generare Quiz).
   */
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadMessage('Se procesează documentul...');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_id', userId);

    try {
      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        body: formData, 
      });
      
      const data = await response.json();
      if (data.success) {
        setUploadMessage('✅ ' + data.message);
      } else {
        setUploadMessage('❌ ' + data.message);
      }
    } catch (error) {
      setUploadMessage('❌ Eroare de conexiune la server.');
    } finally {
      setUploading(false);
      e.target.value = null; 
      setTimeout(() => setUploadMessage(''), 5000); 
    }
  };
  
  // Auto-scrolling pentru panoul de chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => { scrollToBottom(); }, [messages]);

  /**
   * Controller principal pentru interfata de chat asincron cu LLM-ul (Streaming mode).
   * Parseaza chunk-urile HTTP, extrage metadatele despre surse (RAG) si orchestreaza 
   * apelul secundar pentru agentul de Fact-Checking.
   */
  const handleSendMessage = async (e) => {
  e.preventDefault();
  if (!input.trim()) return;

  const userMessage = { role: 'user', text: input };
  setMessages(prev => [...prev, userMessage]);
  setInput('');
  setLoading(true);

  // Initializare placeholder pentru fluxul AI
  setMessages(prev => [...prev, { role: 'ai', text: '', factCheck: null, sources: [] }]);

  try {
    const response = await fetch('http://localhost:8000/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: userMessage.text, username: username }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';
    let sourcesFound = [];
    let isFirstChunk = true;

    // Procesare Server-Sent Events (SSE) / Data Stream
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      let chunk = decoder.decode(value, { stream: true });

      // Protocol custom: Extractie surse din metadatele injectate la inceputul stream-ului
      if (isFirstChunk && chunk.includes("SOURCES:") && chunk.includes("|END_SOURCES|")) {
        const parts = chunk.split("|END_SOURCES|");
        const sourceHeader = parts[0]; 
        
        const filesString = sourceHeader.replace("SOURCES:", "");
        sourcesFound = filesString.split(",").filter(s => s.trim() !== "");
        
        chunk = parts[1] || "";
        isFirstChunk = false;
      }

      accumulatedText += chunk;

      setMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        lastMsg.text = accumulatedText;
        lastMsg.sources = sourcesFound; 
        return newMessages;
      });
    }

    // Pipeline evaluare acuratete (Fact-checking automatizat)
    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1].factCheck = { status: 'loading' };
      return updated;
    });

    try {
      const fcRes = await fetch('http://localhost:8000/fact-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage.text, answer: accumulatedText })
      });
      const fcData = await fcRes.json();
      
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1].factCheck = { 
          status: 'done', 
          score: fcData.score, 
          reason: fcData.reason 
        };
        return updated;
      });
    } catch (fcErr) {
      console.error("Modul Fact-Check indisponibil:", fcErr);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1].factCheck = null;
        return updated;
      });
    }
  } catch (error) {
    console.error("Eroare Retea:", error);
    setMessages(prev => {
      const newMessages = [...prev];
      newMessages[newMessages.length - 1].text = "Eroare comunicare sistem AI central.";
      return newMessages;
    });
  } finally {
    setLoading(false);
  }
};

  return (
  <div className="flex h-screen bg-[#0B0F19] text-slate-200 font-sans selection:bg-indigo-500/30">
    
    {/* Bara de Navigare Laterala */}
    <div className="w-72 bg-[#111827] border-r border-white/5 flex flex-col justify-between shadow-2xl z-20 relative">
      <div>
        <div className="p-[2vh] pb-[1.5vh] border-b border-white/5">
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent flex items-center gap-3">
            <span className="text-3xl">🧠</span> AI Tutor
          </h1>
        </div>
        
        <div className="p-[1.5vh] space-y-[0.5vh] mt-[1vh]">
          <p className="px-4 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Meniu Principal</p>
          
          <button 
            onClick={() => setActiveTab('chat')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
              activeTab === 'chat' 
              ? 'bg-indigo-500/10 text-indigo-400 font-semibold shadow-[inset_2px_0_0_0_#818cf8]' 
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            Study Room
          </button>
          
          <button 
            onClick={() => setActiveTab('quiz')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
              activeTab === 'quiz' 
              ? 'bg-purple-500/10 text-purple-400 font-semibold shadow-[inset_2px_0_0_0_#c084fc]' 
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
            Quiz Arena
          </button>
          
          <button 
            onClick={() => setActiveTab('video')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
              activeTab === 'video' 
              ? 'bg-red-500/10 text-red-400 font-semibold shadow-[inset_2px_0_0_0_#ef4444]' 
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Video Library
          </button>

          <div className="mt-4">
            <p className="px-4 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Baza de Cunoștințe</p>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,.txt" className="hidden" />
            <button 
              onClick={() => fileInputRef.current.click()}
              disabled={uploading}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-400 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                 <svg className="animate-spin h-5 w-5 text-emerald-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              ) : (
                <svg className="w-5 h-5 group-hover:-translate-y-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              )}
              {uploading ? 'Se procesează...' : 'Adaugă Curs (PDF)'}
            </button>
            {uploadMessage && <div className="mt-2 px-4 text-xs font-medium text-slate-300 animate-fade-in-up">{uploadMessage}</div>}
          </div>
        </div>
      </div>
      
      {/* Panou Statistica Gamification */}
      <div className="p-[1.5vh] mx-[1vh] mb-[1vh] mt-auto bg-slate-800/50 rounded-2xl border border-white/5 shadow-inner">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Metrice Invatare</p>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-slate-300">Rang</span>
          <span className={`text-sm font-bold ${rankInfo.color}`}>{rankInfo.name}</span>
        </div>
        <div className="flex justify-between items-center mb-4">
          <span className="text-sm font-medium text-slate-300">Teste Rezolvate</span>
          <span className="text-sm font-bold text-white">{stats.teste_rezolvate}</span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Acuratețe Globala</span>
            <span className="text-indigo-400 font-bold">{accuracy}%</span>
          </div>
          <div className="w-full bg-[#0B0F19] rounded-full h-2">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-1000" style={{ width: `${accuracy}%` }}></div>
          </div>
        </div>
      </div>

      {/* Footer Meniu: Control Sesiune Utilizator */}
      <div className="p-[1.5vh] border-t border-white/5 bg-gradient-to-b from-transparent to-black/20">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
            {username.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">{username}</p>
            <p className="text-xs text-slate-500">Student</p>
          </div>
        </div>
        <button 
          onClick={onLogout}
          className="w-full bg-slate-800/50 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700/50 hover:border-red-500/50 py-2.5 px-4 rounded-xl transition-all duration-300 text-sm font-medium flex justify-center items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          Deconectare
        </button>
      </div>
    </div>

    {/* Vizualizarea Rutelor de Componente (Chat / Quiz / Video) */}
    <div className="flex-1 flex flex-col relative overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
      <div className="absolute inset-0 bg-[#0B0F19]/95 z-0"></div>

      <div className="flex-1 flex flex-col z-10 w-full h-full relative">
        
        {activeTab === 'chat' ? (
          <div className="flex flex-col h-full max-w-4xl mx-auto w-full relative">
            
            <div className="py-6 px-8 flex justify-between items-center bg-[#0B0F19]/80 backdrop-blur-md border-b border-white/5 sticky top-0 z-20">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Study Room</h2>
                <p className="text-sm text-slate-400">Interfață Asistent AI bazată pe context documentar (RAG)</p>
              </div>
            </div>

            {/* Fereastra Redare Mesaje Chat */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              {messages.map((msg, index) => {
                // Ascundere bule empty generata de pre-initializarea obiectului de stare
                if (msg.role === 'ai' && !msg.text) return null;

                return (
                  <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                    {msg.role === 'ai' && (
                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mr-4 mt-1 flex-shrink-0">
                        🤖
                      </div>
                    )}

                    <div className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`p-5 shadow-xl ${
                        msg.role === 'user' 
                          ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-3xl rounded-tr-sm' 
                          : 'bg-[#1e293b]/80 backdrop-blur-sm border border-slate-700/50 text-slate-200 rounded-3xl rounded-tl-sm'
                      }`}>
                        <div className="prose prose-invert prose-p:leading-relaxed max-w-none">
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                      </div>

                      {/* Modul Afisare Referinte RAG */}
                      {msg.role === 'ai' && msg.sources && msg.sources.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-white/5 animate-fade-in">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400/70 mb-2">Referințe contextuale detectate</p>
                          <div className="flex flex-wrap gap-2">
                            {msg.sources.map((source, sIdx) => (
                              <div key={sIdx} className="group flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/5 border border-indigo-500/20 rounded-md">
                                <svg className="w-3 h-3 text-indigo-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                <span className="text-[11px] font-medium text-slate-300">{source}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Modul Raportare Acuratete Halucinatii */}
                      {msg.role === 'ai' && msg.factCheck && (
                        <div className="mt-3 ml-2 animate-fade-in-up">
                          {msg.factCheck.status === 'loading' ? (
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 italic">
                              <svg className="animate-spin h-3 w-3 text-indigo-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                              Audit Fact-Checking în curs...
                            </div>
                          ) : (
                            <div className={`inline-flex flex-col p-3 rounded-xl border backdrop-blur-sm shadow-lg ${
                              msg.factCheck.score >= 90 ? 'bg-emerald-500/10 border-emerald-500/30' : 
                              msg.factCheck.score >= 70 ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-red-500/10 border-red-500/30'
                            }`}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold tracking-widest uppercase">
                                  {msg.factCheck.score >= 90 ? '✅ Confirmed' : msg.factCheck.score >= 70 ? '⚠️ Uncertain' : '❌ Hallucination Detected'}
                                </span>
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-black/40">{msg.factCheck.score}%</span>
                              </div>
                              <p className="text-[10px] text-slate-400 leading-tight max-w-[250px]">{msg.factCheck.reason}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {msg.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center ml-4 mt-1 flex-shrink-0 text-xs font-bold shadow-lg shadow-indigo-500/50">
                        {username.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                );
              })}
              
              {/* UI Loading Indicator Asincron */}
              {loading && (!messages[messages.length - 1]?.text) && (
                <div className="flex justify-start animate-fade-in">
                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mr-4 mt-1">🤖</div>
                  <div className="bg-[#1e293b]/80 border border-slate-700/50 p-5 rounded-3xl rounded-tl-sm flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce"></div>
                    <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Zona Captare Input */}
            <div className="p-6 bg-gradient-to-t from-[#0B0F19] to-transparent pb-8">
              <form onSubmit={handleSendMessage} className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
                <div className="relative flex gap-3 bg-[#111827] border border-slate-700 rounded-2xl p-2 shadow-2xl">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Introdu o cerință bazată pe materialul cursului..."
                    className="flex-1 bg-transparent px-4 py-3 text-white focus:outline-none placeholder-slate-500"
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white px-6 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2"
                  >
                    <span>Procesare</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  </button>
                </div>
              </form>
              <p className="text-center text-xs text-slate-500 mt-4">Sistemele AI pot prezenta ocazional informatii inexacte. Recomandam verificarea contextului.</p>
            </div>
          </div>
        ) : activeTab === 'quiz' ? (
          <div className="h-full w-full overflow-y-auto">
            <QuizArena userId={userId} username={username} onQuizComplete={() => fetchStats()} />
          </div>
        ) : (
          <div className="h-full w-full overflow-y-auto relative z-10">
            <VideoLibrary userId={userId} />
          </div>
        )}
        
      </div>
    </div>
  </div>
);
};

export default Dashboard;