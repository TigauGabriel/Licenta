import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // Importăm conexiunea la baza de date

// NOU: Primim username-ul și o funcție de refresh de la Dashboard
const QuizArena = ({ username, onQuizComplete }) => {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Stare pentru a nu salva scorul de 2 ori
  const [scoreSaved, setScoreSaved] = useState(false);

  // Funcția care salvează scorul în baza de date
  const saveScoreToDB = async () => {
    try {
      // 1. Luăm scorul vechi al utilizatorului
      const { data: currentData, error: fetchError } = await supabase
        .from('progres_studenti')
        .select('*')
        .eq('username', username)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

      const current = currentData || { teste_rezolvate: 0, raspunsuri_corecte: 0, total_intrebari: 0 };

      // 2. Adăugăm scorul testului proaspăt terminat
      const { error: updateError } = await supabase
        .from('progres_studenti')
        .update({
          teste_rezolvate: (current.teste_rezolvate || 0) + 1,
          raspunsuri_corecte: (current.raspunsuri_corecte || 0) + score,
          total_intrebari: (current.total_intrebari || 0) + questions.length
        })
        .eq('username', username);

      if (updateError) throw updateError;

      setScoreSaved(true);
      // 3. Anunțăm Dashboard-ul să își dea refresh la statistici
      if (onQuizComplete) onQuizComplete(); 
      
    } catch (err) {
      console.error("Eroare la salvarea scorului în Supabase:", err);
    }
  };

  // Când showResult devine true (testul se termină), salvăm scorul
  useEffect(() => {
    if (showResult && !scoreSaved) {
      saveScoreToDB();
    }
  }, [showResult]);

  const startQuiz = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('http://localhost:8000/get-quiz');
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Eroare la preluarea testului');
      }
      const data = await response.json();
      setQuestions(data.quiz);
      setCurrentIndex(0);
      setScore(0);
      setShowResult(false);
      setSelectedAnswer(null);
      setIsAnswered(false);
      setScoreSaved(false); // Resetăm pentru noul test
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (option, index) => {
    if (isAnswered) return; 
    setSelectedAnswer(index);
    setIsAnswered(true);
    
    if (index === questions[currentIndex].correct_answer_index) {
      setScore(prev => prev + 1);
    }
  };

  const nextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setIsAnswered(false);
    } else {
      setShowResult(true);
    }
  };

  // --- HTML-UL RĂMÂNE EXACT LA FEL CA ÎNAINTE ---
  // Ecranul de Start
  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-white relative">
        <div className="absolute inset-0 overflow-hidden flex items-center justify-center pointer-events-none opacity-20">
            <div className="w-[500px] h-[500px] bg-purple-600 rounded-full blur-[120px]"></div>
        </div>
        <div className="relative z-10 text-center max-w-lg mx-auto bg-slate-900/50 backdrop-blur-xl p-12 rounded-3xl border border-white/10 shadow-2xl">
          <div className="text-7xl mb-6 inline-block animate-bounce">🎯</div>
          <h2 className="text-4xl font-extrabold mb-4 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Pregătit pentru test?</h2>
          <p className="text-slate-400 mb-8 text-lg">Sistemul va extrage întrebări cheie din cursul tău pentru a-ți testa cunoștințele.</p>
          {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl mb-6">{error}</div>}
          
          <button onClick={startQuiz} disabled={loading} className="group relative inline-flex items-center justify-center px-8 py-4 font-bold text-white transition-all duration-300 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl hover:from-purple-500 hover:to-indigo-500 focus:outline-none overflow-hidden">
            <div className="absolute inset-0 w-full h-full -mt-1 rounded-lg opacity-30 bg-gradient-to-b from-transparent via-transparent to-black"></div>
            <span className="relative flex items-center gap-2 text-lg">
              {loading ? 'Se generează...' : '🚀 Începe Sesiunea de Testare'}
            </span>
          </button>
        </div>
      </div>
    );
  }

  // Ecranul de Rezultat
  if (showResult) {
    const percentage = (score / questions.length) * 100;
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-white">
        <div className="bg-slate-900/80 backdrop-blur-xl p-12 rounded-3xl border border-white/10 shadow-2xl text-center max-w-md w-full animate-fade-in-up">
          <div className="text-8xl mb-6">{percentage >= 80 ? '🏆' : percentage >= 50 ? '👍' : '📚'}</div>
          <h2 className="text-3xl font-bold mb-2">Test Finalizat!</h2>
          <p className="text-slate-400 mb-2">Ai parcurs toate cele {questions.length} întrebări.</p>
          
          {/* NOU: Indicator salvare scor */}
          {scoreSaved && <p className="text-emerald-400 text-sm font-semibold mb-6 flex items-center justify-center gap-1"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Scorul a fost salvat în cloud!</p>}
          
          <div className="flex justify-center items-end gap-2 mb-10 mt-4">
            <span className={`text-6xl font-extrabold ${percentage >= 80 ? 'text-emerald-400' : percentage >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{score}</span>
            <span className="text-2xl text-slate-500 mb-1">/ {questions.length}</span>
          </div>

          <button onClick={startQuiz} className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 shadow-lg">
            🔄 Generează un test nou
          </button>
        </div>
      </div>
    );
  }

  // Ecranul de Întrebări (Rămâne la fel)
  const currentQ = questions[currentIndex];

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto p-8 text-white relative">
      <div className="mb-10">
        <div className="flex justify-between items-center mb-4 text-sm font-semibold text-slate-400 uppercase tracking-wider">
          <span>Întrebarea {currentIndex + 1}</span>
          <span>Progres: {Math.round((currentIndex / questions.length) * 100)}%</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden shadow-inner border border-slate-700/50">
          <div className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full transition-all duration-500 ease-out relative" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}></div>
        </div>
      </div>
      
      <h3 className="text-2xl md:text-3xl font-bold mb-10 text-slate-100 leading-tight">{currentQ.question_text}</h3>

      <div className="flex flex-col gap-4 mb-10">
        {currentQ.options.map((option, index) => {
          let baseClass = "relative overflow-hidden text-left p-6 rounded-2xl border transition-all duration-300 flex items-center group ";
          if (!isAnswered) baseClass += "bg-[#111827] border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10 cursor-pointer";
          else if (index === currentQ.correct_answer_index) baseClass += "bg-emerald-500/10 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.1)]";
          else if (index === selectedAnswer) baseClass += "bg-red-500/10 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.1)]";
          else baseClass += "bg-[#111827] border-slate-800 opacity-40 cursor-not-allowed grayscale";

          return (
            <button key={index} onClick={() => handleAnswer(option, index)} className={baseClass}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mr-5 font-bold text-lg transition-colors ${isAnswered && index === currentQ.correct_answer_index ? 'bg-emerald-500 text-white' : isAnswered && index === selectedAnswer ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 group-hover:bg-indigo-500/20 group-hover:text-indigo-400'}`}>
                {['A', 'B', 'C', 'D'][index]}
              </div>
              <span className={`text-lg ${isAnswered && index === currentQ.correct_answer_index ? 'text-emerald-300 font-semibold' : isAnswered && index === selectedAnswer ? 'text-red-300 font-semibold' : 'text-slate-300'}`}>{option}</span>
            </button>
          );
        })}
      </div>

      {isAnswered && (
        <div className="flex justify-end animate-fade-in-up mt-auto">
          <button onClick={nextQuestion} className="group bg-slate-100 hover:bg-white text-slate-900 px-8 py-4 rounded-xl font-bold transition-all shadow-lg hover:shadow-xl flex items-center gap-2">
            {currentIndex < questions.length - 1 ? 'Următoarea Întrebare' : 'Vezi Rezultatul Final'}
            <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default QuizArena;