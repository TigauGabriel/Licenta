import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useParams, useNavigate } from 'react-router-dom';
import Confetti from 'react-confetti';
import { useWindowSize } from 'react-use';
import { supabase } from './supabaseClient';

export default function CodeArena() {
  const { problemId } = useParams();
  const navigate = useNavigate();

  const [problem, setProblem] = useState(null);
  const [code, setCode] = useState("// Se încarcă mediul...");
  
  // Stări pentru UI tip HackerRank
  const [testResults, setTestResults] = useState(null);
  const [activeTab, setActiveTab] = useState(0); // Care test e deschis în vizualizator
  const [aiFeedback, setAiFeedback] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  const { width, height } = useWindowSize(); // Măsoară ecranul pentru confetti
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [earnedXP, setEarnedXP] = useState(0);
  const [alreadySolved, setAlreadySolved] = useState(false); // Verificăm dacă face "farming"
  const [newTotalXP, setNewTotalXP] = useState(0);

  useEffect(() => {
    const fetchProblem = async () => {
      try {
        const response = await fetch(`http://localhost:8000/problem/${problemId}`);
        const data = await response.json();
        if (data && !data.error) {
          setProblem(data);
          setCode(data.starter_code ? data.starter_code.replace(/\\n/g, '\n') : "// Scrie codul aici");
        }
      } catch (error) { console.error("Eroare la încărcare:", error); }
    };
    if (problemId) fetchProblem();
  }, [problemId]);

  const handleRunCode = async () => {
    setIsRunning(true);
    setTestResults(null);
    setAiFeedback(null);
    setShowSuccessModal(false); // Ne asigurăm că modalul e închis la o nouă rulare

    try {
      const response = await fetch('http://localhost:8000/run_and_evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code, language: 'cpp', problem_id: problemId }),
      });
      const data = await response.json();
      
      setTestResults(data.test_results);
      setActiveTab(0); // Resetăm la primul test
      if (data.ai_feedback) setAiFeedback(data.ai_feedback);

      // 🔥 LOGICA DE GAMIFICATION (Dacă trece toate testele)
      if (data.success) {
        // 1. Calculăm XP-ul pe baza dificultății
        const xpCastigat = problem.difficulty === 'Greu' ? 30 : problem.difficulty === 'Mediu' ? 20 : 10;
        setEarnedXP(xpCastigat);
        
        // 2. Extragem utilizatorul din Supabase
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          // 3. Încercăm să salvăm problema în istoricul studentului
          const { error: insertError } = await supabase
            .from('user_coding_progress')
            .insert([{ 
                user_id: user.id, 
                problem_id: problemId, 
                xp_earned: xpCastigat 
            }]);

          if (!insertError) {
            setAlreadySolved(false);
            const { data: userData } = await supabase.from('users').select('xp_total').eq('id', user.id).single();
            const xpCurent = userData?.xp_total || 0;
            const totalNou = xpCurent + xpCastigat; // Calculăm totalul
            
            await supabase.from('users').update({ xp_total: totalNou }).eq('id', user.id);
            setNewTotalXP(totalNou); // 🔥 Salvăm totalul pentru modal
          } else {
            // 🔥 AICI E SPIONUL NOSTRU:
            console.error("❌ EROARE SUPABASE LA INSERT:", insertError);
            
            setAlreadySolved(true);
            // Dacă a mai rezolvat-o, afișăm doar XP-ul vechi
            const { data: userData } = await supabase.from('users').select('xp_total').eq('id', user.id).single();
            setNewTotalXP(userData?.xp_total || 0);
          }
        }
        
        // 4. Afișăm pop-up-ul de succes și confetti-ul!
        setShowSuccessModal(true);
      }

    } catch (error) {
      alert("Eroare de conexiune cu serverul de testare.");
      console.error(error);
    } finally {
      setIsRunning(false);
    }
  };

  if (!problem) return <div className="h-screen bg-[#0B0F19] flex items-center justify-center text-indigo-400 font-bold animate-pulse">Se încarcă Arena...</div>;

  return (
    <div className="flex h-screen bg-[#0B0F19] text-slate-300 font-sans">
      
      {/* 🟢 PARTEA STÂNGĂ: Descrierea Problemei */}
      <div className="w-[35%] md:w-[40%] p-8 border-r border-slate-800 overflow-y-auto bg-[#111827] custom-scrollbar relative">
        <button onClick={() => navigate('/dashboard')} className="mb-6 text-xs font-bold text-slate-500 hover:text-indigo-400 transition-colors flex items-center gap-1">← Înapoi la Probleme</button>
        
        <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-extrabold text-indigo-400">{problem.title}</h2>
            <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full text-xs font-bold uppercase">{problem.difficulty}</span>
        </div>
        
        <div className="space-y-6 text-slate-300 leading-relaxed text-sm">
          <div className="whitespace-pre-wrap">{problem.description}</div>
          
          {/* Poți adăuga coloane în Supabase pentru Input/Output Format pe viitor */}
        </div>
      </div>

      {/* 🟢 PARTEA DREAPTĂ: Editor + HackerRank Results */}
      <div className="flex-1 flex flex-col h-full bg-[#0B0F19] relative">
  
        {/* Toolbar Superior */}
        <div className="bg-[#0B0F19] border-b border-slate-800 px-6 py-3 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] bg-slate-800/50 px-3 py-1 rounded">main.cpp</span>
          </div>

          <button 
            onClick={handleRunCode}
            disabled={isRunning}
            className={`px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 text-xs uppercase tracking-wider ${
              isRunning ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
            }`}
          >
            {isRunning ? 'Se execută...' : '▶ Run Code'}
          </button>
        </div>

        {/* Zona Editorului (Ocupă restul spațiului sus) */}
        <div className="flex-1 min-h-[300px]">
          <Editor
            height="100%"
            defaultLanguage="cpp"
            theme="vs-dark"
            value={code}
            onChange={(value) => setCode(value)}
            options={{ minimap: { enabled: false }, fontSize: 15, fontFamily: 'Fira Code', padding: { top: 20 }, scrollBeyondLastLine: false }}
          />
        </div>

        {/* 🟢 ZONA TESTELOR (Apare doar dacă ai dat Run) */}
        {testResults && (
          <div className="h-[280px] bg-[#111827] border-t border-slate-800 flex flex-col shrink-0 animate-fade-in-up shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
            
            {/* Tab-uri orizontale pentru Teste */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 overflow-x-auto custom-scrollbar">
              {testResults.map((test, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveTab(idx)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-xs font-bold transition-all ${
                    activeTab === idx 
                      ? 'bg-slate-800 text-white border-t-2 border-indigo-500' 
                      : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
                  }`}
                >
                  <span className={test.passed ? 'text-emerald-400' : 'text-red-400'}>
                    {test.passed ? '✔' : '✘'}
                  </span>
                  {test.name}
                </button>
              ))}
              
              {/* Tab special pentru AI Tutor dacă a picat */}
              {aiFeedback && (
                 <button
                 onClick={() => setActiveTab('ai')}
                 className={`ml-auto flex items-center gap-2 px-4 py-2 rounded-t-lg text-xs font-bold transition-all ${
                   activeTab === 'ai' ? 'bg-indigo-900/40 text-indigo-300 border-t-2 border-indigo-500' : 'text-indigo-500 hover:bg-indigo-900/20'
                 }`}
               >
                 🤖 AI Tutor
               </button>
              )}
            </div>

            {/* Conținutul Tab-ului Selectat */}
            <div className="flex-1 overflow-y-auto p-4 text-sm font-mono custom-scrollbar">
              {activeTab === 'ai' ? (
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-200">
                  <span className="font-sans font-bold block mb-2 text-indigo-400 uppercase text-xs tracking-wider">Analiză Cod:</span>
                  <div className="whitespace-pre-wrap">{aiFeedback}</div>
                </div>
              ) : testResults[activeTab] ? (
                <div className="space-y-4">
                  {testResults[activeTab].error ? (
                    <div>
                      <p className="text-xs text-slate-500 font-sans uppercase mb-1 font-bold">Eroare / Compiler Output:</p>
                      <pre className="p-3 bg-red-950/30 text-red-400 rounded-lg border border-red-900/50 break-words whitespace-pre-wrap">{testResults[activeTab].error}</pre>
                    </div>
                  ) : testResults[activeTab].hidden ? (
                    <div className="flex flex-col items-center justify-center py-6 text-slate-500 font-sans">
                      <span className="text-3xl mb-2">🔒</span>
                      <p className="font-bold">Test Ascuns</p>
                      <p className="text-xs">Nu poți vedea datele de intrare pentru acest test.</p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="text-xs text-slate-500 font-sans uppercase mb-1 font-bold">Input:</p>
                        <pre className="p-3 bg-[#0B0F19] text-slate-300 rounded-lg border border-slate-800">{testResults[activeTab].input}</pre>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-sans uppercase mb-1 font-bold">Expected Output:</p>
                        <pre className="p-3 bg-[#0B0F19] text-slate-300 rounded-lg border border-slate-800">{testResults[activeTab].expected}</pre>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-sans uppercase mb-1 font-bold">Your Output:</p>
                        <pre className={`p-3 bg-[#0B0F19] rounded-lg border ${testResults[activeTab].passed ? 'border-emerald-500/30 text-emerald-400' : 'border-red-500/30 text-red-400'}`}>
                          {testResults[activeTab].actual}
                        </pre>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
      {/* 🟢 MODALUL DE SUCCES & CONFETTI */}
      {showSuccessModal && (
        <>
          <Confetti width={width} height={height} recycle={false} numberOfPieces={600} gravity={0.2} />
          
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#111827] border-2 border-emerald-500/50 p-8 rounded-3xl shadow-[0_0_50px_rgba(16,185,129,0.2)] max-w-sm w-full text-center transform scale-100">
              <div className="text-6xl mb-4">🏆</div>
              <h2 className="text-2xl font-black text-white mb-2">Test Trecut!</h2>
              <p className="text-slate-400 text-sm mb-6">Ai rezolvat problema cu succes și ai scris un cod excelent.</p>
              
              <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-4 mb-6">
                <p className="text-emerald-400 font-bold uppercase text-xs tracking-widest mb-1">XP Câștigat</p>
                <p className="text-3xl font-black text-emerald-400">
                  {alreadySolved ? "+0 (Deja rezolvată)" : `+${earnedXP}`}
                </p>
                {/* 🔥 NOU: Afișăm totalul curent și Nivelul actualizat */}
                <div className="pt-3 border-t border-emerald-500/20 flex justify-between items-center text-sm">
                  <span className="text-emerald-500/70 font-bold">Total XP: <span className="text-emerald-400">{newTotalXP}</span></span>
                  <span className="text-indigo-400 font-bold">Nivel {Math.floor(newTotalXP / 100) + 1}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setShowSuccessModal(false)} 
                  className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
                >
                  Rămâi aici
                </button>
                <button 
                  onClick={() => navigate('/dashboard')} 
                  className="flex-1 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/20"
                >
                  Meniul Principal
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}