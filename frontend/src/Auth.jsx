import React, { useState } from 'react';
import { supabase } from './supabaseClient';

const Auth = ({ onAuthSuccess }) => {
  // Stare pentru determinarea modului curent (Autentificare vs. Inregistrare)
  const [isLogin, setIsLogin] = useState(true); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Stari pentru managementul UI-ului asincron
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Handler principal pentru procesarea formularului de autentificare/inregistrare
  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (isLogin) {
        // Rutina de autentificare cu email si parola prin Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        
        // Propagarea obiectului de sesiune catre componenta parinte
        if (onAuthSuccess) onAuthSuccess(data.user);
        
      } else {
        // Rutina de creare cont nou prin Supabase Auth
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        
        // Resetare stare UI post-inregistrare pentru tranzitia spre autentificare
        setMessage('Cont creat cu succes! Te poți loga acum.');
        setIsLogin(true); 
        setPassword(''); 
      }
    } catch (err) {
      // Formatare eroare specifica pentru credentiale invalide
      setError(err.message === 'Invalid login credentials' 
        ? 'Email sau parolă incorectă.' 
        : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B1120] text-white p-4 relative overflow-hidden">
      
      {/* Container efecte fundal */}
      <div className="absolute inset-0 overflow-hidden flex items-center justify-center pointer-events-none opacity-20">
          <div className="w-[800px] h-[800px] bg-indigo-600 rounded-full blur-[150px]"></div>
      </div>

      {/* Container principal formular (Glassmorphism) */}
      <div className="relative z-10 w-full max-w-md bg-slate-900/80 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl">
        
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl shadow-lg shadow-indigo-500/30">
            {isLogin ? '🔐' : '✨'}
          </div>
          <h2 className="text-3xl font-extrabold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            {isLogin ? 'Bine ai revenit!' : 'Creează un cont nou'}
          </h2>
          <p className="text-slate-400 mt-2 text-sm">
            {isLogin ? 'Loghează-te pentru a-ți accesa cursurile și testele.' : 'Alătură-te platformei pentru a genera teste inteligente.'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Adresă de Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#111827] border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              placeholder="student@facultate.ro"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Parolă</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#111827] border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              placeholder="••••••••"
            />
          </div>

          {/* Afisare conditionata mesaje stare retea */}
          {error && <div className="text-red-400 text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/20">{error}</div>}
          {message && <div className="text-emerald-400 text-sm bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">{message}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full group relative flex items-center justify-center gap-2 px-8 py-3.5 font-bold text-white transition-all duration-300 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl hover:from-indigo-500 hover:to-purple-500 shadow-lg hover:shadow-indigo-500/25 border border-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            {loading ? (
               <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              isLogin ? 'Intră în cont' : 'Înregistrează-te'
            )}
          </button>
        </form>

        {/* Toggle functionalitate formular */}
        <div className="mt-6 text-center text-sm text-slate-400">
          {isLogin ? "Nu ai un cont încă? " : "Ai deja un cont? "}
          <button 
            type="button" 
            onClick={() => { setIsLogin(!isLogin); setError(''); setMessage(''); }}
            className="text-indigo-400 font-bold hover:text-indigo-300 hover:underline transition-all"
          >
            {isLogin ? 'Creează unul acum' : 'Loghează-te aici'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;