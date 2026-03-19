import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Dashboard from './Dashboard'

function App() {
  // Stari pentru manipularea form-ului de autentificare
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('') 
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Stari globale pentru managementul sesiunii utilizatorului
  const [loggedInUser, setLoggedInUser] = useState(null)
  const [isInitializing, setIsInitializing] = useState(true)

  // Hook pentru interceptarea si validarea sesiunii active la incarcarea componentei radacina.
  // Previne expulzarea utilizatorului din aplicatie la refresh.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setLoggedInUser(session.user)
      }
      setIsInitializing(false)
    })

    // Listener pentru evenimente de modificare a starii de autentificare (ex: token refresh, sign-in, sign-out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedInUser(session?.user || null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Handler principal pentru procesarea intrarilor utilizatorilor (Login / SignUp)
  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (isLogin) {
        // Flux Autentificare
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: email,
          password: password,
        })

        if (authError) throw authError
        
      } else {
        // Flux Inregistrare
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email,
          password: password,
        })

        if (signUpError) throw signUpError
        
        const userId = data.user.id
        
        // Initializare profil student in baza de date relationala la momentul crearii contului
        const { error: insertError } = await supabase
          .from('progres_studenti')
          .insert([{ 
            user_id: userId, 
            teste_rezolvate: 0, 
            raspunsuri_corecte: 0, 
            total_intrebari: 0 
          }])

        if (insertError) {
          console.error("Eroare initializare profil utilizator:", insertError)
        }
        
        alert('Cont creat cu succes!')
        setIsLogin(true) 
      }
    } catch (err) {
      // Dictionar de erori prietenoase pentru UI mapping
      if (err.message === 'Invalid login credentials') {
        setError('Email sau parolă incorectă!')
      } else if (err.message.includes('already registered')) {
         setError('Acest email este deja folosit!')
      } else if (err.message.includes('Password should be at least')) {
         setError('Parola trebuie să aibă minim 6 caractere.')
      } else {
         setError(err.message)
      }
      console.error(err)
    } finally {
      setLoading(false)
    }
  }
  
  // Handler delogare 
  const handleLogout = async () => {
    await supabase.auth.signOut()
    setLoggedInUser(null)
  }

  // Pre-render (Loading State): Mentine o tranzitie lina pana cand confirmarea tokenului de la server finalizeaza
  if (isInitializing) {
     return <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center text-indigo-500"><div className="w-10 h-10 border-4 border-t-transparent border-indigo-500 rounded-full animate-spin"></div></div>
  }

  // Rutare Conditionata: Daca exista o sesiune valida, injecteaza datele de identificare catre Dashboard
  if (loggedInUser) {
    return <Dashboard userId={loggedInUser.id} username={loggedInUser.email} onLogout={handleLogout} />
  }

  // Fallback: Randare interfata de Autentificare/Inregistrare
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F19] relative overflow-hidden font-sans text-slate-200">
      
      {/* Container decoratiuni fundal (Glassmorphism & Gradients) */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-600/30 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{animationDelay: '1s'}}></div>
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 pointer-events-none"></div>

      {/* Container Formular */}
      <div className="w-full max-w-md p-8 sm:p-10 rounded-[2.5rem] bg-[#111827]/80 backdrop-blur-2xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative z-10 animate-fade-in-up">
        
        {/* Antet Formular */}
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

        {/* Zona alertare erori */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl mb-6 text-sm text-center flex items-center justify-center gap-2 animate-fade-in-up">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {error}
          </div>
        )}

        {/* Formular de date */}
        <form onSubmit={handleAuth} className="space-y-6">
          
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Adresă de Email</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" /></svg>
              </div>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#0B0F19]/50 border border-slate-700/50 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-slate-600 shadow-inner"
                placeholder="ex: student@facultate.ro"
                required
              />
            </div>
          </div>

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
                placeholder="•••••••• (minim 6 caractere)"
                required
              />
            </div>
          </div>

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

        {/* Toggle functionalitate formular */}
        <div className="mt-8 text-center text-sm text-slate-400">
          {isLogin ? "Nu ai cont? " : "Ai deja cont? "}
          <button 
            type="button" 
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