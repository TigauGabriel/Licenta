import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import QuizArena from './QuizArena';
import { supabase } from './supabaseClient';
import VideoLibrary from './VideoLibrary';

const Dashboard = ({ username, onLogout }) => {
  const [messages, setMessages] = useState([
    { role: 'ai', text: `Salut, **${username}**! Sunt asistentul tău de studiu bazat pe AI. Cu ce te pot ajuta astăzi?` }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const fileInputRef = useRef(null);

  const [stats, setStats] = useState({ teste_rezolvate: 0, raspunsuri_corecte: 0, total_intrebari: 0 });

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase
        .from('progres_studenti')
        .select('*')
        .eq('username', username)
        .single();
        
      if (data) {
        setStats({
          teste_rezolvate: data.teste_rezolvate || 0,
          raspunsuri_corecte: data.raspunsuri_corecte || 0,
          total_intrebari: data.total_intrebari || 0
        });
      }
    } catch (err) {
      console.log("Nu s-au putut încărca statisticile:", err);
    }
  };

  // Se execută o singură dată când intri în Dashboard
  useEffect(() => { fetchStats(); }, [username]);

  // Calculăm Acuratețea și Rangul
  let accuracy = 0;
  if (stats.total_intrebari > 0) {
    accuracy = Math.round((stats.raspunsuri_corecte / stats.total_intrebari) * 100);
  }

  let rankInfo = { name: "🥉 Începător", color: "text-slate-400" };
  if (accuracy >= 85 && stats.teste_rezolvate > 0) rankInfo = { name: "🥇 Maestru", color: "text-emerald-400" };
  else if (accuracy >= 50 && stats.teste_rezolvate > 0) rankInfo = { name: "🥈 Explorator", color: "text-yellow-400" };

  // Funcția care trimite fișierul la Python
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadMessage('Se procesează documentul...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        body: formData, // Nu punem Content-Type, browserul îl setează automat pentru fișiere
      });
      
      const data = await response.json();
      if (data.success) {
        setUploadMessage('✅ ' + data.message);
      } else {
        setUploadMessage('❌ ' + data.message);
      }
    } catch (error) {
      setUploadMessage('❌ Eroare de conexiune la încărcare.');
    } finally {
      setUploading(false);
      e.target.value = null; // Resetăm inputul
      setTimeout(() => setUploadMessage(''), 5000); // Ștergem mesajul după 5 secunde
    }
  };
  
  // Ref pentru a da scroll automat jos în chat
  const messagesEndRef = useRef(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => { scrollToBottom(); }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    setMessages(prev => [...prev, { role: 'ai', text: '', factCheck: null }]);

    try {
      const response = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userMessage.text, username: username }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulatedText += chunk;

        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].text = accumulatedText;
          return newMessages;
        });
      }
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1].factCheck = { status: 'loading' };
        return updated;
      });

      try {
        const fcRes = await fetch('http://localhost:8000/fact-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: userMessage.text, answer: accumulatedText }) // folosim variabila în care ai strâns textul
        });
        const fcData = await fcRes.json();
        
        // 2. Salvăm rezultatul verificării
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
        console.error("Fact-check failed", fcErr);
        // Dacă dă eroare, scoatem badge-ul de loading
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1].factCheck = null;
          return updated;
        });
      }
    } catch (error) {
      console.error("Eroare:", error);
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].text = "Eroare de conexiune cu AI-ul.";
        return newMessages;
      });

    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#0B0F19] text-slate-200 font-sans selection:bg-indigo-500/30">
      
      {/* SIDEBAR MODERN */}
      <div className="w-72 bg-[#111827] border-r border-white/5 flex flex-col justify-between shadow-2xl z-20 relative">
        <div>
          <div className="p-8 pb-6 border-b border-white/5">
            <h1 className="text-2xl font-extrabold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent flex items-center gap-3">
              <span className="text-3xl">🧠</span> AI Tutor
            </h1>
          </div>
          
          <div className="p-4 space-y-2 mt-4">
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
            
            {/* NOU: Butonul pentru Video Library în Sidebar */}
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

            <div className="mt-8">
              <p className="px-4 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Baza de Cunoștințe</p>
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept=".pdf,.txt" 
                className="hidden" 
              />
              
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
                {uploading ? 'Se încarcă...' : 'Adaugă Curs (PDF)'}
              </button>

              {/* Mesaj de status */}
              {uploadMessage && (
                <div className="mt-2 px-4 text-xs font-medium text-slate-300 animate-fade-in-up">
                  {uploadMessage}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* --- ZONA DE STATISTICI ÎN SIDEBAR --- */}
        <div className="p-6 mx-4 mb-4 mt-auto bg-slate-800/50 rounded-2xl border border-white/5 shadow-inner">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Progresul Tău</p>
          
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
              <span className="text-slate-400">Acuratețe</span>
              <span className="text-indigo-400 font-bold">{accuracy}%</span>
            </div>
            <div className="w-full bg-[#0B0F19] rounded-full h-2">
              <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-1000" style={{ width: `${accuracy}%` }}></div>
            </div>
          </div>
        </div>

        {/* Profil & Logout */}
        <div className="p-6 border-t border-white/5 bg-gradient-to-b from-transparent to-black/20">
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

      {/* ZONA PRINCIPALĂ */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
        <div className="absolute inset-0 bg-[#0B0F19]/95 z-0"></div> {/* Overlay pentru textură */}

        <div className="flex-1 flex flex-col z-10 w-full h-full relative">
          
          {/* AICI ESTE LOGICA DE RANDARE A PAGINILOR (CHAT / QUIZ / VIDEO) */}
          {activeTab === 'chat' ? (
            <div className="flex flex-col h-full max-w-4xl mx-auto w-full relative">
              
              {/* Header Chat */}
              <div className="py-6 px-8 flex justify-between items-center bg-[#0B0F19]/80 backdrop-blur-md border-b border-white/5 sticky top-0 z-20">
                <div>
                  <h2 className="text-xl font-bold text-slate-100">Study Room</h2>
                  <p className="text-sm text-slate-400">Discută cu AI-ul despre cursurile tale</p>
                </div>
              </div>

              {/* Istoric Mesaje */}
              <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                {messages.map((msg, index) => (
  <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
    
    {/* 1. Rămâne la fel: Avatarul AI */}
    {msg.role === 'ai' && (
      <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mr-4 mt-1 flex-shrink-0">
        🤖
      </div>
    )}

    {/* 2. AICI MODIFICĂM: Adăugăm un div "părinte" (flex-col) ca să putem pune scorul SUB mesaj */}
    <div className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
      
      {/* Acesta este balonul tău de text original (PĂSTREAZĂ TOATE CLASELE TALE DE TAILWIND AICI) */}
      <div className={`p-5 shadow-xl ${
        msg.role === 'user' 
          ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-3xl rounded-tr-sm' 
          : 'bg-[#1e293b]/80 backdrop-blur-sm border border-slate-700/50 text-slate-200 rounded-3xl rounded-tl-sm'
      }`}>
        <div className="prose prose-invert prose-p:leading-relaxed max-w-none">
          <ReactMarkdown>{msg.text}</ReactMarkdown>
        </div>
      </div>

      {/* 3. AICI INSERĂM ELEMENTUL NOU (Scorul de încredere) */}
      {/* El va apărea doar dacă este mesaj de la AI și dacă are date de fact-check */}
      {msg.role === 'ai' && msg.factCheck && (
        <div className="mt-3 ml-2 animate-fade-in-up">
          {msg.factCheck.status === 'loading' ? (
            <div className="flex items-center gap-2 text-[10px] text-slate-500 italic">
              <svg className="animate-spin h-3 w-3 text-indigo-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Se verifică acuratețea datelor...
            </div>
          ) : (
            <div className={`inline-flex flex-col p-3 rounded-xl border backdrop-blur-sm shadow-lg ${
              msg.factCheck.score >= 90 ? 'bg-emerald-500/10 border-emerald-500/30' : 
              msg.factCheck.score >= 70 ? 'bg-yellow-500/10 border-yellow-500/30' : 
              'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold tracking-widest uppercase">
                  {msg.factCheck.score >= 90 ? '✅ Confirmed' : msg.factCheck.score >= 70 ? '⚠️ Uncertain' : '❌ Hallucination Detected'}
                </span>
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-black/40">
                  {msg.factCheck.score}%
                </span>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight max-w-[250px]">{msg.factCheck.reason}</p>
            </div>
          )}
        </div>
      )}
    </div>

    {/* 4. Rămâne la fel: Avatarul User */}
    {msg.role === 'user' && (
      <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center ml-4 mt-1 flex-shrink-0 text-xs font-bold shadow-lg shadow-indigo-500/50">
        {username.charAt(0).toUpperCase()}
      </div>
    )}

  </div>
))}
                
                {loading && (
                  <div className="flex justify-start animate-fade-in-up">
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

              {/* Caseta de text (Flotantă & Glassmorphism) */}
              <div className="p-6 bg-gradient-to-t from-[#0B0F19] to-transparent pb-8">
                <form onSubmit={handleSendMessage} className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
                  <div className="relative flex gap-3 bg-[#111827] border border-slate-700 rounded-2xl p-2 shadow-2xl">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Pune o întrebare din curs..."
                      className="flex-1 bg-transparent px-4 py-3 text-white focus:outline-none placeholder-slate-500"
                    />
                    <button
                      type="submit"
                      disabled={loading || !input.trim()}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white px-6 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2"
                    >
                      <span>Trimite</span>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    </button>
                  </div>
                </form>
                <p className="text-center text-xs text-slate-500 mt-4">AI Tutor poate face greșeli. Verifică informațiile importante în cursul original.</p>
              </div>
            </div>
          ) : activeTab === 'quiz' ? (
            <div className="h-full w-full overflow-y-auto">
              <QuizArena username={username} onQuizComplete={fetchStats} />
            </div>
          ) : (
            <div className="h-full w-full overflow-y-auto relative z-10">
              <VideoLibrary />
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
};

export default Dashboard;