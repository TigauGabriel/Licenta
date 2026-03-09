import { useState } from 'react'
import { supabase } from './supabaseClient'
import Dashboard from './Dashboard'

function App() {
  const [isLogin, setIsLogin] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [loggedInUser, setLoggedInUser] = useState(null)

  // Simulăm criptarea simplă pentru compatibilitate cu baza noastră
  const hashPassword = async (text) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const hashedPass = await hashPassword(password)

      if (isLogin) {
        // Logica de LOGIN
        const { data, error: dbError } = await supabase
          .from('utilizatori')
          .select('*')
          .eq('username', username)
          .eq('parola', hashedPass)

        if (dbError) throw dbError
        if (data && data.length > 0) {
          setLoggedInUser(username)
        } else {
          setError('Nume de utilizator sau parolă incorectă!')
        }
      } else {
        // Logica de ÎNREGISTRARE (REGISTER)
        const { error: insertError } = await supabase
          .from('utilizatori')
          .insert([{ username: username, parola: hashedPass }])

        if (insertError) {
          if (insertError.code === '23505') setError('Acest nume de utilizator există deja!')
          else throw insertError
        } else {
          // Creăm și progresul pentru el
          await supabase.from('progres_studenti').insert([{ username: username }])
          alert('Cont creat cu succes! Acum te poți loga.')
          setIsLogin(true)
        }
      }
    } catch (err) {
      setError('A apărut o eroare la conectare.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Dacă utilizatorul este logat, afișăm interfața principală
  if (loggedInUser) {
    return <Dashboard username={loggedInUser} onLogout={() => setLoggedInUser(null)} />
  }

  // --- NOUA INTERFAȚĂ DE LOGIN ---
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F19] relative overflow-hidden font-sans text-slate-200">
      
      {/* Efecte de Fundal (Glow & Textură) */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-600/30 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{animationDelay: '1s'}}></div>
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 pointer-events-none"></div>

      {/* Cardul Principal de Autentificare */}
      <div className="w-full max-w-md p-8 sm:p-10 rounded-[2.5rem] bg-[#111827]/80 backdrop-blur-2xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative z-10 animate-fade-in-up">
        
        {/* Antet */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-white/5 mb-6 shadow-inner">
            <span className="text-4xl">🎓</span>
          </div>
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-2">
            AI Tutor
          </h1>
          <p className="text-slate-400 text-sm font-medium">
            {isLogin ? 'Autentifică-te pentru a continua' : 'Creează-ți un cont nou'}
          </p>
        </div>

        {/* Afișare Erori */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl mb-6 text-sm text-center flex items-center justify-center gap-2 animate-fade-in-up">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {error}
          </div>
        )}

        {/* Formularul (conectat la logica ta Supabase) */}
        <form onSubmit={handleAuth} className="space-y-6">
          
          {/* Câmp Username */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Nume Utilizator</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#0B0F19]/50 border border-slate-700/50 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-slate-600 shadow-inner"
                placeholder="ex: student123"
                required
              />
            </div>
          </div>

          {/* Câmp Parolă */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Parolă</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-purple-400 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              </div>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0B0F19]/50 border border-slate-700/50 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all placeholder-slate-600 shadow-inner"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {/* Buton Trimitere */}
          <button 
            type="submit" 
            disabled={loading}
            className="w-full relative group inline-flex items-center justify-center px-8 py-4 font-bold text-white transition-all duration-300 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl hover:from-indigo-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#0B0F19] overflow-hidden mt-4 shadow-lg shadow-indigo-500/25"
          >
            <div className="absolute inset-0 w-full h-full -mt-1 rounded-lg opacity-30 bg-gradient-to-b from-transparent via-transparent to-black"></div>
            <span className="relative flex items-center gap-2 text-lg">
              {loading ? (
                 <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              ) : (
                isLogin ? 'Intră în cont' : 'Creează cont'
              )}
            </span>
          </button>
        </form>

        {/* Comutator Login / Register */}
        <div className="mt-8 text-center text-sm text-slate-400">
          {isLogin ? "Nu ai cont? " : "Ai deja cont? "}
          <button 
            onClick={() => { setIsLogin(!isLogin); setError(''); }} 
            className="font-bold text-indigo-400 hover:text-indigo-300 transition-colors focus:outline-none"
          >
            {isLogin ? "Creează unul aici" : "Autentifică-te aici"}
          </button>
        </div>

      </div>
    </div>
  )
}

export default App