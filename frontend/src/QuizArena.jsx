import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; 

const QuizArena = ({userId, username, onQuizComplete }) => {
  // Stari pentru interfata de selectie (Lobby)
  const [availableQuizzes, setAvailableQuizzes] = useState([]); 
  
  // Stari pentru engine-ul de evaluare
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scoreSaved, setScoreSaved] = useState(false);

  /**
   * Preia lista de teste disponibile asociate utilizatorului curent.
   */
  const fetchAvailableQuizzes = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`http://localhost:8000/get-quizzes?user_id=${userId}`);
      if (!response.ok) throw new Error('Nu am putut prelua lista de teste.');
      
      const data = await response.json();
      if (data.success) {
        setAvailableQuizzes(data.quizzes);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Initializare date la montarea componentei
  useEffect(() => {
    if (!userId) return;
    fetchAvailableQuizzes();
  }, [userId]);

  /**
   * Salveaza scorul si actualizeaza metricile de progres in baza de date.
   */
  const saveScoreToDB = async () => {
    try {
      const { data: currentData, error: fetchError } = await supabase
        .from('progres_studenti')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

      const current = currentData || { teste_rezolvate: 0, raspunsuri_corecte: 0, total_intrebari: 0 };

      const { error: updateError } = await supabase
        .from('progres_studenti')
        .update({
          teste_rezolvate: (current.teste_rezolvate || 0) + 1,
          raspunsuri_corecte: (current.raspunsuri_corecte || 0) + score,
          total_intrebari: (current.total_intrebari || 0) + questions.length
        })
        .eq('user_id', userId);

      if (updateError) throw updateError;

      setScoreSaved(true);
      if (onQuizComplete) onQuizComplete(); 
      
    } catch (err) {
      console.error("Eroare la salvarea scorului:", err);
    }
  };

  // Trigger pentru persistarea datelor la finalizarea testului
  useEffect(() => {
    if (showResult && !scoreSaved) {
      saveScoreToDB();
    }
  }, [showResult]);

  /**
   * Configureaza si initializeaza o noua sesiune de test pe baza selectiei din Lobby.
   * @param {Object} quizObject - Obiectul continand metadatele si intrebarile testului.
   */
  const handleStartSelectedQuiz = (quizObject) => {
    // Clonare si randomizare set de intrebari
    const bancaDeIntrebari = [...quizObject.questions];
    const intrebariAmestecate = bancaDeIntrebari.sort(() => 0.5 - Math.random());

    // Limitare sesiune la un subset de maximum 5 intrebari
    const testCurent = intrebariAmestecate.slice(0, 5);

    setQuestions(testCurent);
    
    // Resetare state pentru sesiune noua
    setCurrentIndex(0);
    setScore(0);
    setShowResult(false);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setScoreSaved(false);
  };

  /**
   * Gestioneaza stergerea logica a unui curs din baza de date.
   * @param {Event} e - Evenimentul de click.
   * @param {string} quizId - Identificatorul unic al testului.
   */
  const handleDeleteQuiz = async (e, quizId) => {
    // Oprire propagare eveniment catre cardul parinte
    e.stopPropagation(); 

    // Confirmare actiune destructiva
    if (!window.confirm("Ești sigur că vrei să șteargi acest curs? Acțiunea este ireversibilă.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from('quizzes') 
        .delete()
        .eq('id', quizId); 

      if (error) throw error;

      // Actualizare state local post-stergere
      setAvailableQuizzes(prevQuizzes => prevQuizzes.filter(quiz => quiz.id !== quizId));
      
    } catch (err) {
      console.error("Eroare la stergerea cursului:", err);
      alert("A apărut o eroare la ștergerea cursului.");
    }
  };

  // View 1: Interfata Lobby (Selectie Curs)
  if (questions.length === 0) {
    return (
      <div className="flex flex-col h-full p-8 text-white animate-fade-in relative">
        
        {/* Strat efecte vizuale fundal */}
        <div className="absolute inset-0 overflow-hidden flex items-center justify-center pointer-events-none opacity-10">
            <div className="w-[600px] h-[600px] bg-indigo-600 rounded-full blur-[150px]"></div>
        </div>

        <div className="relative z-10 mb-10 text-center">
          <h2 className="text-4xl font-extrabold mb-3 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Arena de Testare
          </h2>
          <p className="text-slate-400 text-lg">Selectează un curs asimilat pentru a începe verificarea.</p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
             <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        ) : availableQuizzes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto w-full relative z-10">
            {availableQuizzes.map((quiz, idx) => (
              <div 
                key={idx}
                onClick={() => handleStartSelectedQuiz(quiz)}
                className="group bg-[#111827]/80 backdrop-blur-sm border border-white/5 p-6 rounded-3xl hover:border-indigo-500/50 transition-all duration-300 cursor-pointer hover:-translate-y-2 hover:shadow-2xl hover:shadow-indigo-500/20"
              ><button
                  onClick={(e) => handleDeleteQuiz(e, quiz.id)}
                  className="absolute top-4 right-4 p-2 bg-red-500/10 text-red-400 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all duration-300 z-20"
                  title="Șterge cursul"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4 text-2xl group-hover:scale-110 transition-transform">
                  📚
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-2 truncate" title={quiz.course_name}>
                  {quiz.course_name}
                </h3>
                <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {quiz.questions.length} Întrebări
                  </span>
                  <span>•</span>
                  <span>{new Date(quiz.created_at).toLocaleDateString('ro-RO')}</span>
                </div>
                <div className="mt-6 flex items-center text-sm font-bold text-indigo-400 group-hover:translate-x-2 transition-all">
                  Începe Testul <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center p-20 bg-slate-900/30 rounded-3xl border border-dashed border-slate-800 max-w-2xl mx-auto relative z-10">
            <div className="text-6xl mb-6">🏜️</div>
            <p className="text-slate-400 text-lg mb-6">Nu ai încărcat niciun curs în baza de date.</p>
            <p className="text-sm text-slate-500">Mergi în Study Room și adaugă un PDF pentru a genera automat întrebări.</p>
          </div>
        )}
        
        {error && <div className="mt-8 bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl max-w-md mx-auto">{error}</div>}
      </div>
    );
  }

  // View 2: Interfata Rezultate (Ecran Sumarizare)
  if (showResult) {
    const percentage = (score / questions.length) * 100;
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-white animate-fade-in">
        <div className="bg-slate-900/80 backdrop-blur-xl p-12 rounded-3xl border border-white/10 shadow-2xl text-center max-w-md w-full animate-fade-in-up">
          <div className="text-8xl mb-6">{percentage >= 80 ? '🏆' : percentage >= 50 ? '👍' : '📚'}</div>
          <h2 className="text-3xl font-bold mb-2">Test Finalizat!</h2>
          <p className="text-slate-400 mb-2">Ai parcurs toate cele {questions.length} întrebări.</p>
          
          {scoreSaved && (
            <p className="text-emerald-400 text-sm font-semibold mb-6 flex items-center justify-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> 
              Scorul a fost salvat în cloud!
            </p>
          )}
          
          <div className="flex justify-center items-end gap-2 mb-10 mt-4">
            <span className={`text-6xl font-extrabold ${percentage >= 80 ? 'text-emerald-400' : percentage >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{score}</span>
            <span className="text-2xl text-slate-500 mb-1">/ {questions.length}</span>
          </div>

          <button 
            onClick={() => {
              // Resetare context pentru revenire la meniul principal
              setQuestions([]); 
              fetchAvailableQuizzes(); 
            }} 
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 shadow-lg flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Înapoi la lista de cursuri
          </button>
        </div>
      </div>
    );
  }

  // View 3: Interfata Test Activ (Intrebare Curenta)
  const currentQ = questions[currentIndex];

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto p-4 md:p-6 text-white relative overflow-hidden">
      
      {/* Indicator vizual de progres */}
      <div className="mb-4 flex-shrink-0"> 
        <div className="flex justify-between items-center mb-2 text-xs md:text-sm font-semibold text-slate-400 uppercase tracking-wider">
          <span>Întrebarea {currentIndex + 1} din {questions.length}</span>
          <span>Progres: {Math.round((currentIndex / questions.length) * 100)}%</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2 md:h-3 overflow-hidden shadow-inner border border-slate-700/50">
          <div 
            className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full transition-all duration-500 ease-out" 
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          ></div>
        </div>
      </div>
      
      {/* Container text intrebare */}
      <h3 className="text-lg md:text-xl font-bold mb-8 text-slate-100 leading-snug flex-shrink-0">
        {currentQ.question_text}
      </h3>

      {/* Container optiuni de raspuns (Stacking context control) */}
      <div className="relative z-10 flex flex-col gap-2 md:gap-3 flex-grow overflow-y-auto pt-2 pr-2 pb-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {currentQ.options.map((option, index) => {
          let baseClass = "relative overflow-hidden text-left p-3 md:p-4 rounded-xl border transition-all duration-300 flex items-center group ";
          if (!isAnswered) baseClass += "bg-[#111827] border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10 cursor-pointer";
          else if (index === currentQ.correct_answer_index) baseClass += "bg-emerald-500/10 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.1)]";
          else if (index === selectedAnswer) baseClass += "bg-red-500/10 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.1)]";
          else baseClass += "bg-[#111827] border-slate-800 opacity-40 cursor-not-allowed grayscale";

          return (
            <button key={index} onClick={() => !isAnswered && (setSelectedAnswer(index), setIsAnswered(true), index === currentQ.correct_answer_index && setScore(s => s + 1))} className={baseClass}>
              <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center mr-3 md:mr-4 font-bold text-sm md:text-base transition-colors flex-shrink-0 ${isAnswered && index === currentQ.correct_answer_index ? 'bg-emerald-500 text-white' : isAnswered && index === selectedAnswer ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 group-hover:bg-indigo-500/20 group-hover:text-indigo-400'}`}>
                {['A', 'B', 'C', 'D'][index]}
              </div>
              <span className={`text-sm md:text-base ${isAnswered && index === currentQ.correct_answer_index ? 'text-emerald-300 font-semibold' : isAnswered && index === selectedAnswer ? 'text-red-300 font-semibold' : 'text-slate-300'}`}>{option}</span>
            </button>
          );
        })}
      </div>

      {/* Controale de navigare test */}
      <div className={`flex justify-end mt-4 pt-2 flex-shrink-0 transition-all duration-500 ${isAnswered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <button 
          onClick={() => {
            if (currentIndex < questions.length - 1) {
              setCurrentIndex(prev => prev + 1);
              setSelectedAnswer(null);
              setIsAnswered(false);
            } else {
              setShowResult(true);
            }
          }} 
          className="group relative flex items-center gap-2 px-5 py-2 md:px-8 md:py-3 font-bold text-white transition-all duration-300 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl hover:from-indigo-500 hover:to-purple-500 shadow-lg hover:shadow-indigo-500/25 border border-indigo-500/30 text-sm md:text-base overflow-hidden"
        >
          {currentIndex < questions.length - 1 ? 'Următoarea Întrebare' : 'Vezi Rezultatul Final'}
          <svg className="w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </div>
      
    </div>
  );
};

export default QuizArena;