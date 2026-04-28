import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { useNavigate } from 'react-router-dom' // Magia care ne mută de pe o pagină pe alta

export default function AuthPage() {
  const navigate = useNavigate(); // Inițializăm funcția de navigare

  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('') 
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/dashboard'); // Dacă are deja sesiune, îl trimitem la Dashboard
      }
      setIsInitializing(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        navigate('/dashboard'); // După login cu succes, îl trimitem la Dashboard
      }
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  const handleGoogleLogin = async () => {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:5173/dashboard' 
      }
    });

    if (error) {
      console.error("Eroare Google:", error.message);
      setError('A apărut o eroare la conectarea cu Google.');
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (isLogin) {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email,
          password: password,
        })
        if (authError) throw authError
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email,
          password: password,
        })
        if (signUpError) throw signUpError
        
        const userId = data.user.id
        
        const { error: insertError } = await supabase
          .from('progres_studenti')
          .insert([{ 
            user_id: userId, 
            teste_rezolvate: 0, 
            raspunsuri_corecte: 0, 
            total_intrebari: 0 
          }])

        if (insertError) console.error("Eroare profil:", insertError)
        
        alert('Cont creat cu succes!')
        setIsLogin(true) 
      }
    } catch (err) {
      if (err.message === 'Invalid login credentials') setError('Email sau parolă incorectă!')
      else if (err.message.includes('already registered')) setError('Acest email este deja folosit!')
      else if (err.message.includes('Password should be at least')) setError('Parola trebuie să aibă minim 6 caractere.')
      else setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (isInitializing) {
     return <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center"><div className="w-10 h-10 border-4 border-t-transparent border-indigo-500 rounded-full animate-spin"></div></div>
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F19] relative overflow-hidden font-sans text-slate-200">
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-600/30 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{animationDelay: '1s'}}></div>
      
      <div className="w-full max-w-md p-6 sm:p-8 rounded-[2.5rem] bg-[#111827]/80 backdrop-blur-2xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative z-10 animate-fade-in-up">
        
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-white/5 mb-4 shadow-inner">
            <span className="text-3xl">🎓</span>
          </div>
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-1">
            AI Tutor
          </h1>
          <p className="text-slate-400 text-xs font-medium">
            {isLogin ? 'Autentifică-te pentru a continua' : 'Creează-ți un cont nou'}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-xl mb-4 text-xs text-center flex items-center justify-center gap-2">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0B0F19]/50 border border-slate-700/50 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Parolă</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0B0F19]/50 border border-slate-700/50 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full flex items-center justify-center px-8 py-3 font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl hover:from-indigo-500 hover:to-purple-500 mt-2 shadow-lg"
          >
            {loading ? 'Se procesează...' : (isLogin ? 'Intră în cont' : 'Creează cont')}
          </button>
        </form>

        <div className="flex items-center my-4">
          <div className="flex-1 border-t border-slate-700/50"></div>
          <span className="px-3 text-[10px] text-slate-500 uppercase font-semibold">SAU</span>
          <div className="flex-1 border-t border-slate-700/50"></div>
        </div>

        <button
          onClick={handleGoogleLogin}
          type="button"
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-slate-900 text-sm font-bold rounded-2xl hover:bg-gray-100 shadow-md"
        >
          Continuă cu Google
        </button>

        <div className="mt-5 text-center text-xs text-slate-400">
          {isLogin ? "Nu ai cont? " : "Ai deja cont? "}
          <button 
            type="button" 
            onClick={() => { setIsLogin(!isLogin); setError(''); }} 
            className="font-bold text-indigo-400 hover:text-indigo-300"
          >
            {isLogin ? "Creează unul aici" : "Autentifică-te aici"}
          </button>
        </div>
      </div>
    </div>
  )
}