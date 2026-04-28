import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient'; // 🔥 Asigură-te că importul ăsta e corect pentru proiectul tău

export default function ProblemList() {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Toate');
  const navigate = useNavigate();

  // Starea pentru XP și Level
  const [userStats, setUserStats] = useState({ xp: 0, level: 1 });

  useEffect(() => {
    // 1. Extragem Problemele din backend (Python)
    const fetchProblems = fetch('http://localhost:8000/problems')
      .then(res => res.json())
      .then(data => {
        // Dacă e array oprim problemele, altfel punem array gol, dar ne asiguram ca mergem mai departe din raspunsul Python-ului (data.problems)
        const problemsArray = data.success ? data.problems : (Array.isArray(data) ? data : []);
        setProblems(problemsArray);
      })
      .catch(err => console.error("Eroare la fetch:", err));

    // 2. Extragem XP-ul din baza de date (Supabase)
    const fetchUserStats = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase.from('users').select('xp_total').eq('id', user.id).single();
          const xp = data?.xp_total || 0;
          setUserStats({ 
            xp: xp, 
            level: Math.floor(xp / 100) + 1 // Nivel nou la fiecare 100 XP
          });
        }
      } catch (err) {
        console.error("Eroare la preluarea XP-ului:", err);
      }
    };

    // Așteptăm să se termine ambele (opțional, dar bun pentru loading state)
    Promise.all([fetchProblems, fetchUserStats()]).finally(() => {
      setLoading(false);
    });

  }, []);

  if (loading) return <div className="p-10 text-center animate-pulse text-indigo-400 font-bold">Se încarcă Arena...</div>;

  const categories = ['Toate', ...new Set(problems.map(p => p.category || 'General'))];
  
  const filteredProblems = filter === 'Toate' 
    ? problems 
    : problems.filter(p => (p.category || 'General') === filter);

  return (
    <div className="p-8 max-w-5xl mx-auto h-full flex flex-col">
      
      {/* 🔥 HEADER: Titlu și Player Card (Buletinul de Gamer) */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-extrabold mb-2 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Alege o Provocare
          </h2>
          <p className="text-slate-400 text-sm">Rezolvă probleme de algoritmică, câștigă puncte și devino Maestru C++.</p>
        </div>

        {/* Player Card UI */}
        <div className="flex items-center gap-4 bg-slate-800/50 border border-slate-700 p-3 rounded-2xl shadow-lg shrink-0">
          <div className="bg-indigo-500/20 p-3 rounded-xl border border-indigo-500/30">
            <span className="text-2xl">🧙‍♂️</span>
          </div>
          <div className="pr-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">RANG CURENT</p>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black text-white">Nivel {userStats.level}</span>
              <span className="text-sm font-bold text-emerald-400">⚡ {userStats.xp} XP</span>
            </div>
          </div>
        </div>
      </div>

      {/* Meniul de Filtrare */}
      <div className="flex gap-3 mb-8 overflow-x-auto pb-2 custom-scrollbar">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
              filter === cat 
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-500/20' 
                : 'bg-[#111827] text-slate-400 border-slate-700 hover:border-indigo-500 hover:text-indigo-300'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grila de Probleme */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-10">
        {filteredProblems.map((prob) => (
          <div 
            key={prob.id}
            onClick={() => navigate(`/codearena/${prob.id}`)}
            className="bg-[#111827] border border-slate-700 p-6 rounded-2xl hover:border-indigo-500 transition-all cursor-pointer group shadow-lg flex flex-col justify-between"
          >
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                    prob.difficulty === 'Ușor' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                    prob.difficulty === 'Mediu' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                    'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>
                    {prob.difficulty || 'Nedefinit'}
                  </span>
                  <span className="px-3 py-1 bg-slate-800 text-slate-300 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-700">
                    {prob.category || 'General'}
                  </span>
                </div>
                <span className="text-xl group-hover:scale-125 transition-transform">🚀</span>
              </div>
              <h3 className="text-xl font-bold text-white group-hover:text-indigo-400 transition-colors">{prob.title}</h3>
            </div>

            <div className="mt-6 flex items-center text-xs font-bold text-slate-500 uppercase">
              Rezolvă Acum <span className="ml-2 group-hover:translate-x-1 transition-transform text-indigo-400">➔</span>
            </div>
          </div>
        ))}
      </div>

      {filteredProblems.length === 0 && (
        <div className="text-center text-slate-500 mt-10 font-bold">
          Nicio problemă găsită în această categorie.
        </div>
      )}
    </div>
  );
}