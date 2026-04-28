import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import QuizArena from './QuizArena';
import { supabase } from './supabaseClient';
import VideoLibrary from './VideoLibrary';
import CodeArena from './CodeArena';
import ProblemList from './ProblemList';
import mermaid from 'mermaid';
import { Link } from 'react-router-dom';
import { BookOpen, Book, ChevronRight, Bot, Map } from 'lucide-react';

const Dashboard = ({userId, username }) => {
  // Stari globale UI & Date
  
  const [messages, setMessages] = useState([
  { role: 'ai', text: 'Salut! Sunt asistentul tău de studiu bazat pe AI. Alege o lecție de pe hartă pentru a începe.' }
]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('lastActiveTab') || 'chat'; 
  });

  // 2. Salvăm în memorie de fiecare dată când dai click pe un tab nou
  useEffect(() => {
    if (activeTab) {
      localStorage.setItem('lastActiveTab', activeTab);
    }
  }, [activeTab]);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Stare pentru metricele de performanta ale utilizatorului
  const [stats, setStats] = useState({ teste_rezolvate: 0, raspunsuri_corecte: 0, total_intrebari: 0 });

  const [isGraphOpen, setIsGraphOpen] = useState(false);
  const [mermaidGraphCode, setMermaidGraphCode] = useState('');
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [allQuizzes, setAllQuizzes] = useState([]); // Lista cu toate cursurile
  const [selectedQuizId, setSelectedQuizId] = useState(null); // ID-ul cursului activ
  // Adaugă asta lângă celelalte state-uri:
  const [conceptCurent, setConceptCurent] = useState(null);
  const [completedNodes, setCompletedNodes] = useState([]); 
  const [currentLesson, setCurrentLesson] = useState(null);

  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [numeAfisat, setNumeAfisat] = useState("Student");
  const [currentUserInfo, setCurrentUserInfo] = useState(null);
  const [studentName, setStudentName] = useState("");
  const navigate = useNavigate();

  const handleLogoutInternal = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // După ce Supabase închide sesiunea, trimitem userul la pagina de login (/)
      navigate('/'); 
    } catch (err) {
      console.error("Eroare la deconectare:", err.message);
    }
  };

  
  
  useEffect(() => {
    const verificaUtilizator = async () => {
      // 1. Luăm sesiunea curentă (să vedem dacă a venit de pe Google)
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // Dacă nu e logat, îl dăm afară la login
        window.location.href = '/login';
        return;
      }

      const user = session.user;
      setCurrentUserInfo(user);

      // 2. Căutăm userul în tabela noastră publică "users"
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (!userData) {
        // Dacă nu e în tabelă, e prima dată când se loghează! Îl inserăm.
        await supabase.from('users').insert([{
          id: user.id,
          email: user.email,
          profile_status: 'profile_incomplete'
        }]);
        setShowUsernameModal(true); // Îi arătăm popup-ul

      } else if (userData.profile_status === 'profile_incomplete') {
        // E în tabelă, dar a închis popup-ul tura trecută fără să pună nume
        setShowUsernameModal(true);

      } else {
        setNumeAfisat(userData.username);
        setStudentName(userData.username);
      }
    };

    verificaUtilizator();
  }, []);

  // Funcția care salvează numele când apasă pe "Salvează"
  const handleSaveUsername = async () => {
    if (usernameInput.trim().length < 3) {
      alert("Numele trebuie să aibă măcar 3 litere!");
      return;
    }

    // (Opțional) Verificăm dacă numele e deja luat de alt student
    const { data: existing } = await supabase.from('users').select('id').eq('username', usernameInput);
    if (existing && existing.length > 0) {
      alert("Acest nume este deja folosit. Alege altul!");
      return;
    }

    // Salvăm în baza de date
    await supabase.from('users').update({
      username: usernameInput,
      profile_status: 'profile_complete'
    }).eq('id', currentUserInfo.id);

    // Închidem popup-ul și actualizăm UI-ul
    setShowUsernameModal(false);
    setStudentName(usernameInput);
    setNumeAfisat(usernameInput);
  };


  // Dashboard.jsx

const fetchUserProgress = async () => {
    try {
        // 1. Luăm user-ul logat direct din sesiune
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            console.warn("⚠️ Niciun utilizator detectat pentru fetchUserProgress.");
            return;
        }

        // 2. Trimitem ID-ul real către backend-ul tău Python
        const res = await fetch(`http://localhost:8000/get_progress/${user.id}`);
        const data = await res.json();
        
        if (data.success) {
            setCompletedNodes(data.completed_nodes);
        }
    } catch (error) {
        console.error("Eroare la încărcarea progresului:", error);
    }
};

    useEffect(() => {
        
        
      fetchUserProgress();
        
    }, []);

  const fetchAllQuizzes = async () => {
    try {
        // 1. Luăm user-ul logat direct (pentru că prop-ul userId este undefined)
        const { data: { user } } = await supabase.auth.getUser();
        const uid = user?.id;

        if (!uid) {
            console.warn("⚠️ Niciun utilizator detectat pentru fetchAllQuizzes.");
            return;
        }

        console.log("🔍 Căutăm cursuri pentru UID real:", uid);
        
        const { data, error } = await supabase
            .from('quizzes')
            .select('id, created_at, knowledge_graph')
            .eq('user_id', uid) // 👈 Folosim UID-ul extras acum
            .not('knowledge_graph', 'is', null)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (data && data.length > 0) {
            const cursuriProcesate = data.map(curs => {
                let titlu = "Curs fără nume";
                try {
                    const graf = typeof curs.knowledge_graph === 'string' 
                        ? JSON.parse(curs.knowledge_graph) 
                        : curs.knowledge_graph;
                    if (graf && graf.subiect_principal) titlu = graf.subiect_principal;
                } catch (e) { console.error("Eroare parsare titlu"); }
                return { ...curs, titluAfisare: titlu };
            });

            setAllQuizzes(cursuriProcesate);
            if (!selectedQuizId) setSelectedQuizId(cursuriProcesate[0].id);
        }
    } catch (err) {
        console.error("❌ Eroare fetchAllQuizzes:", err.message);
    }
};


// Apelăm funcția când se încarcă Dashboard-ul
useEffect(() => {
   fetchAllQuizzes();
}, []);

  // Funcția care trage JSON-ul din DB și îl transformă în Flowchart Mermaid
  // Funcția modernizată care trage JSON-ul și îl transformă într-un Flowchart HTML
  const fetchAndRenderGraph = async (quizId = null) => {
    setIsGraphOpen(true);
    setLoadingGraph(true);
    
    const clean = (text) => text ? text.replace(/"/g, "'").replace(/&/g, "și").replace(/\(/g, "[").replace(/\)/g, "]").replace(/\n/g, " ").trim() : "";
    
    try {
        // 🔥 PASUL 1: Luăm user-ul logat direct din Supabase
        const { data: { user: activeUser } } = await supabase.auth.getUser();
        
        if (!activeUser) {
            console.error("❌ Eroare: Utilizator nelogat.");
            setLoadingGraph(false);
            return;
        }

        // Construim query-ul folosind ID-ul sigur extras anterior
        let query = supabase
            .from('quizzes')
            .select('knowledge_graph, id, concepte_finalizate')
            .eq('user_id', activeUser.id) // 👈 Folosim activeUser.id
            .not('knowledge_graph', 'is', null);

        if (quizId) {
            query = query.eq('id', quizId);
        } else {
            query = query.order('created_at', { ascending: false }).limit(1);
        }

        // 🔥 PASUL 2: maybeSingle() previne eroarea 406 dacă tabelul e gol
        const { data: graphData, error } = await query.maybeSingle();

        if (error) throw error;

        if (!graphData) {
            console.warn("⚠️ Nu am găsit nicio hartă pentru acest curs.");
            setLoadingGraph(false);
            return;
        }

        const concepteStapaniteDinDB = graphData.concepte_finalizate || [];

        if (graphData && graphData.knowledge_graph) {
            const jsonGraph = typeof graphData.knowledge_graph === 'string' 
                ? JSON.parse(graphData.knowledge_graph) 
                : graphData.knowledge_graph;

            let code = "graph TD\n";

            // 1. Nodul Principal (Subject Card)
            const mainTitle = clean(jsonGraph.subiect_principal);
            const mainNodeHtml = `
                <div class="p-4 w-[240px] h-[120px] bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 border-2 border-indigo-400/50 rounded-2xl shadow-xl flex flex-col justify-center items-center">
                    <p class="text-[8px] text-indigo-200 font-black uppercase tracking-widest mb-1 opacity-70">Subiect Central</p>
                    <h4 class="text-white font-extrabold text-[13px] leading-tight text-center px-2">${mainTitle}</h4>
                </div>
            `.replace(/\n/g, ' ').trim();

            code += `  Main("${mainNodeHtml}")\n`;
            
            if (jsonGraph.nodes && jsonGraph.edges) {
                const targetIds = new Set(jsonGraph.edges.map(e => e.target));
                const rootNodes = jsonGraph.nodes.filter(n => !targetIds.has(n.id));
                
                rootNodes.forEach(root => {
                    const safeId = root.id.replace(/-/g, '_');
                    code += `  Main --> ${safeId}\n`;
                });

                jsonGraph.nodes.forEach((node) => {
                    const safeId = node.id.replace(/-/g, '_');
                    const cName = clean(node.label);
                    
                    const isMastered = concepteStapaniteDinDB.includes(cName) || completedNodes.includes(node.id);
                    
                    const incomingEdges = jsonGraph.edges.filter(e => e.target === node.id);
                    let isUnlocked = false;
                    
                    if (incomingEdges.length === 0) {
                        isUnlocked = true; 
                    } else {
                        isUnlocked = incomingEdges.every(edge => {
                            const sourceNode = jsonGraph.nodes.find(n => n.id === edge.source);
                            return sourceNode ? (concepteStapaniteDinDB.includes(clean(sourceNode.label)) || completedNodes.includes(sourceNode.id)) : true;
                        });
                    }

                    const borderColor = isMastered ? "border-emerald-500/60" : (isUnlocked ? "border-indigo-500/60" : "border-slate-800");
                    const bgColor = isMastered ? "bg-emerald-950/30" : (isUnlocked ? "bg-[#1e293b]" : "bg-slate-900/50");
                    const btnClass = isMastered 
                        ? "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400" 
                        : (isUnlocked ? "bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400" : "bg-slate-800 opacity-60");
                    
                    const badge = isMastered ? "FINALIZAT ✅" : (isUnlocked ? "URMEAZĂ 🚀" : "BLOCAT 🔒");
                    const icon = isMastered ? "🌟" : (isUnlocked ? "📖" : "🔒");

                    const conceptHtml = `
                        <div class="p-4 w-[280px] h-[155px] ${bgColor} border-2 ${borderColor} rounded-2xl shadow-[0_10px_25px_rgba(0,0,0,0.4)] flex flex-col justify-between transition-all hover:border-indigo-400/50 group relative overflow-hidden">
                            <div class="flex flex-col">
                                <div class="flex justify-between items-center mb-1">
                                    <p class="text-[8px] font-black ${isMastered ? 'text-emerald-400' : 'text-indigo-400'} uppercase tracking-widest">${badge}</p>
                                    <span class="text-[10px] opacity-70">${icon}</span>
                                </div>
                                <h5 class="text-white font-black text-[15px] leading-tight text-left pr-2 mt-1">${cName}</h5>
                                <p class="text-[9px] text-gray-400 text-left mt-1 uppercase tracking-wider">${node.estimated_minutes} min • Dificultate: ${node.difficulty}/5</p>
                            </div>
                            <button 
                                ${isUnlocked ? `data-concept="${cName}" data-node-id="${node.id}" data-tip="${isMastered ? 'review' : 'start'}"` : 'disabled'}
                                class="btn-lectie w-full py-2.5 ${btnClass} rounded-xl text-[10px] text-white font-black transition-all uppercase tracking-wider shadow-md active:scale-95 flex items-center justify-center gap-2"
                            >
                                <span>${isMastered ? 'Recapitulează' : 'Începe Lecția'}</span>
                                <span class="text-xs transition-transform group-hover:translate-x-1">➔</span>
                            </button>
                        </div>
                    `.replace(/\n/g, ' ').trim();

                    code += `  ${safeId}("${conceptHtml}")\n`;
                });

                jsonGraph.edges.forEach(edge => {
                    const safeSource = edge.source.replace(/-/g, '_');
                    const safeTarget = edge.target.replace(/-/g, '_');
                    code += `  ${safeSource} --> ${safeTarget}\n`;
                });
            }
            
            code += `\n  classDef default fill:none,stroke:none;`;
            code += `\n  linkStyle default stroke:#6366f1,stroke-width:2px,opacity:0.3;`;

            setMermaidGraphCode(code);
        }
    } catch (err) { 
        console.error("❌ Eroare la preluarea cursului specific:", err); 
    } finally { 
        setLoadingGraph(false); 
    }
};
  const DiagramaMermaid = ({ cod }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current && cod) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        flowchart: { 
          htmlLabels: true, 
          useMaxWidth: false,
          curve: 'basis',
          padding: 40 
        }
      });
      
      const renderDiagram = async () => {
        try {
          const id = `mermaid-svg-${Math.random().toString(36).substr(2, 9)}`;
          const { svg } = await mermaid.render(id, cod);
          
          if (containerRef.current) {
            containerRef.current.innerHTML = `
              <style>
                .mermaid-canvas svg foreignObject { overflow: visible !important; }
                .mermaid-canvas svg { overflow: visible !important; max-width: none !important; }
              </style>
              <div class="mermaid-canvas inline-block">
                ${svg}
              </div>
            `;
          }
        } catch (err) { console.error(err); }
      };
      renderDiagram();
    }
  }, [cod]);

  return <div ref={containerRef} />;
};
useEffect(() => {
    window.startLesson = (concept, mode) => {
        setIsGraphOpen(false); // Închidem modalul hărții
        
        let customMessage = mode === 'review' 
            ? `Vreau să recapitulez conceptul "${concept}". Fă-mi un rezumat rapid.` 
            : `Vreau să încep lecția despre "${concept}". Explică-mi bazele.`;
            
        // Simulăm trimiterea mesajului în chat
        handleSendMessage(null, customMessage);
    };
}, []);

  /**
   * Preluarea asincrona a datelor analitice pentru profilul studentului curent (din Supabase).
   * Se executa la montarea componentei.
   */
  // Dashboard.jsx

const fetchStats = async () => {
  try {
    // 1. Luăm user-ul logat direct din sesiune (siguranță maximă)
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return;

    // 2. Folosim .maybeSingle() în loc de .single()
    const { data, error } = await supabase
      .from('progres_studenti')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(); // 👈 Schimbarea magică aici
      
    if (error) {
      console.error("Eroare Supabase:", error.message);
      return;
    }

    // 3. Dacă avem date, le punem. Dacă nu (user nou), lăsăm valorile de 0
    if (data) {
      setStats({
        teste_rezolvate: data.teste_rezolvate || 0,
        raspunsuri_corecte: data.raspunsuri_corecte || 0,
        total_intrebari: data.total_intrebari || 0
      });
    } else {
      // Opțional: Inițializăm cu zero dacă rândul nu există încă
      setStats({ teste_rezolvate: 0, raspunsuri_corecte: 0, total_intrebari: 0 });
    }
  } catch (err) {
    console.log("Eroare critică la stats:", err);
  }
};

  useEffect(() => { 
  fetchStats(); 
}, []);

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
    formData.append('user_id', currentUserInfo?.id);

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
  const handleSendMessage = async (e, textAutomat = null) => {
    if (e && typeof e.preventDefault === 'function') {
        e.preventDefault();
    }

    // 1. Textul curat
    const textAfisat = textAutomat || input;
    if (!textAfisat || !textAfisat.trim()) return;

    // 2. Afișăm în UI mesajul tău
    const userMessage = { role: 'user', text: textAfisat };
    setMessages(prev => [...prev, userMessage]);
    
    if (!textAutomat) {
        setInput('');
    }
    setLoading(true);

    // Punem un mesaj gol temporar pentru AI
    setMessages(prev => [...prev, { role: 'ai', text: '', factCheck: null, sources: [] }]);

    try {
        const { data: { user } } = await supabase.auth.getUser();
        const finalUserId = user?.id;
        const currentNodeId = currentLesson ? String(currentLesson.id) : "general";
        const currentConcept = currentLesson ? String(currentLesson.name) : "Discuție Generală";

        // 3. Trimitem comanda către noul Multi-Agent (Format JSON curat)
        const response = await fetch('http://localhost:8000/chat_agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                user_id: String(finalUserId),
                node_id: currentNodeId,
                concept_label: currentConcept,
                message: textAfisat 
            }),
        });

        const data = await response.json();
        let accumulatedText = "Eroare la procesare.";

        if (data.success && data.answer) {
            accumulatedText = data.answer;
            
            // Afișăm instant răspunsul primit de la Agent (Evaluator sau Profesor)
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMsg = newMessages[newMessages.length - 1];
                lastMsg.text = accumulatedText;
                lastMsg.sources = []; // Agentul nou ia contextul RAG intern, nu mai trimite metadata de surse pe stream
                if (data.feynman_scores) {
                    lastMsg.feynmanScores = data.feynman_scores;
                    lastMsg.isCorrect = data.is_correct;
                }
                
                return newMessages;
            });
        }

        // ==========================================
        // Logica ta veche de Auto-Validare (Păstrată)
        // ==========================================
        console.log("🧐 VERIFICARE CONDIȚII:", {
            agent_used: data.agent_used,
            is_correct: data.is_correct,
            currentLesson: currentLesson?.name,
            selectedQuizId: selectedQuizId
        });

        if (!textAutomat && currentLesson) {
            if (data.agent_used === "Evaluator AI" && data.is_correct === true) {
                console.log(`✅ TEST TRECUT PENTRU: ${currentLesson.name}! Încep salvarea...`);
                
                // 1. UPDATE INSTANT ÎN UI
                setCompletedNodes(prev => {
                    if (!prev.includes(currentLesson.id)) {
                        return [...prev, currentLesson.id];
                    }
                    return prev;
                });

                // 2. VERIFICĂM ID-UL ÎNAINTE DE A BATE LA UȘA SUPABASE
                if (!selectedQuizId) {
                    console.error("⛔ EROARE CRITICĂ: selectedQuizId este undefined sau null! Supabase nu știe ce rând să modifice.");
                } else {
                    console.log(`Batem la ușa Supabase pentru quiz-ul cu ID: ${selectedQuizId}...`);
                    
                    try {
                        const { data: dbData, error: selectErr } = await supabase
                            .from('quizzes')
                            .select('concepte_finalizate')
                            .eq('id', selectedQuizId)
                            .single();
                            
                        if (selectErr) {
                            console.error("❌ EROARE LA CITIRE DIN SUPABASE:", selectErr);
                        } else {
                            console.log("Date vechi din DB:", dbData);
                            
                            const listaVeche = dbData?.concepte_finalizate || [];
                            
                            if (!listaVeche.includes(currentLesson.name)) {
                                const listaNoua = [...listaVeche, currentLesson.name];
                                console.log("Trimitem lista nouă:", listaNoua);
                                
                                const { error: updateErr } = await supabase
                                    .from('quizzes')
                                    .update({ concepte_finalizate: listaNoua })
                                    .eq('id', selectedQuizId);
                                    
                                if (updateErr) {
                                    console.error("❌ EROARE LA SALVARE (UPDATE) ÎN SUPABASE:", updateErr);
                                } else {
                                    console.log("🎉 PROGRES SALVAT CU SUCCES ÎN BAZA DE DATE!");
                                }
                            } else {
                                console.log("⚠️ Conceptul era deja salvat în baza de date.");
                            }
                        }
                    } catch (fatalErr) {
                        console.error("❌ EROARE FATALĂ SUPABASE:", fatalErr);
                    }
                }
                
                // 3. Salvăm în Python pentru statistici/gamification
                fetch("http://localhost:8000/save_progress", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        user_id: String(userId?.id || userId),
                        node_id: currentLesson.id
                    })
                }).catch(e => console.error(e));
               
           } else if (data.agent_used === "Evaluator AI" && data.is_correct === false) {
                 console.log(`❌ Răspuns greșit pentru: ${currentLesson.name}. Mai are de învățat.`);
            }
        }

        // ==========================================
        // Pipeline evaluare acuratete (Fact-checking automatizat)
        // ==========================================
        if (data.agent_used !== "Evaluator AI" && data.agent_used !== "Evaluator") {
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
                        // Atenție aici: Backend-ul Python returnează "explanation", verifică dacă în UI folosești "reason"
                        reason: fcData.explanation || fcData.reason 
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

const handleOpenGraph = async () => {
    setIsGraphOpen(true);
    // Întâi aducem lista de cursuri
    await fetchAllQuizzes();
    // Apoi randăm harta (care va lua automat selectedQuizId sau ultimul)
    fetchAndRenderGraph();
};



  return (
  <div className="flex h-screen bg-[#0B0F19] text-slate-200 font-sans selection:bg-indigo-500/30">
    
    {/* 🔥 POPUP-UL PENTRU SETARE USERNAME (OBLIGATORIU) 🔥 */}
    {showUsernameModal && (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[999] backdrop-blur-sm">
        <div className="bg-[#111827] p-8 rounded-3xl border border-white/10 w-96 shadow-2xl animate-fade-in-up">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6 text-3xl shadow-lg shadow-indigo-500/30">
            👋
          </div>
          <h2 className="text-2xl font-extrabold text-center bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-2">Bun venit!</h2>
          <p className="text-slate-400 mb-6 text-sm text-center">Pentru a-ți proteja identitatea pe platformă, te rugăm să alegi un nume de utilizator (ex: Andrei P.)</p>
          
          <input 
            type="text" 
            placeholder="Numele tău de utilizator..." 
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            className="w-full px-4 py-3 bg-[#0B0F19] border border-slate-700 rounded-xl mb-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
          
          <button 
            onClick={handleSaveUsername}
            className="w-full group relative flex items-center justify-center gap-2 px-8 py-3.5 font-bold text-white transition-all duration-300 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl hover:from-indigo-500 hover:to-purple-500 shadow-lg hover:shadow-indigo-500/25 border border-indigo-500/30"
          >
            Salvează și continuă
          </button>
        </div>
      </div>
    )}

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
  onClick={() => setActiveTab('code')}
  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
    activeTab === 'code' 
    ? 'bg-purple-500/10 text-purple-400 font-semibold shadow-[inset_2px_0_0_0_#c084fc]' 
    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
  }`}
>
  {/* Iconiță specifică pentru programare (semnele < / >) */}
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
  </svg>
  Code Arena
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
            {numeAfisat.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">{numeAfisat}</p>
            <p className="text-xs text-slate-500">Student</p>
          </div>
        </div>
        <button 
          onClick={handleLogoutInternal}
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
              
              {/* NOU: Butonul Harta Cursului */}
              <button 
                onClick={handleOpenGraph}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 hover:from-indigo-500/20 hover:to-purple-500/20 text-indigo-300 border border-indigo-500/20 rounded-xl transition-all font-bold text-sm shadow-[0_0_15px_rgba(99,102,241,0.1)] hover:shadow-[0_0_20px_rgba(99,102,241,0.2)]"
              >
                <Map className="w-5 h-5" /> Harta Cursului
              </button>
            </div>
            
            {/* Modalul pentru Harta Cursului - SLIM & CENTERED */}
            {isGraphOpen && (
              <div className="fixed top-0 right-0 bottom-0 left-72 z-[100] flex flex-col bg-[#0B0F19] animate-fade-in">
                
                {/* --- HEADER HARTA SLIM --- */}
                <div className="w-full flex flex-row justify-between items-center py-4 bg-slate-900 border-b border-slate-800 shadow-sm shrink-0 z-10">
                  
                  <div className="flex items-center gap-4 pl-8"> 
                    <div className="p-2.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20 shadow-inner">
                      <BookOpen className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div className="flex flex-col">
                      <h2 className="text-xl font-bold text-white tracking-tight leading-none mb-1">
                        Învățare: Traseu Logic
                      </h2>
                      <p className="text-sm text-slate-400 font-medium">
                        Urmărește-ți progresul pas cu pas.
                      </p>
                    </div>
                  </div>

                  {/* Partea dreaptă: Selector + Buton Închidere (Rămân la fel) */}
                  <div className="flex items-center gap-5 pr-8">
                    <div className="relative group">
                      <select 
                        value={selectedQuizId || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedQuizId(val);
                          fetchAndRenderGraph(val);
                        }}
                        className="w-[280px] bg-[#0f172a] border border-slate-700 text-slate-300 text-sm font-medium rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 appearance-none cursor-pointer transition-all hover:border-slate-500 truncate pr-10 shadow-sm"
                      >
                        {allQuizzes.length > 0 ? (
                          allQuizzes.map((q) => (
                            <option key={q.id} value={q.id} className="bg-slate-800 text-white">
                              {q.titluAfisare}
                            </option>
                          ))
                        ) : (
                          <option disabled value="">Niciun curs găsit</option>
                        )}
                      </select>
                      
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-indigo-400 transition-colors">
                        <svg width="12" height="7" viewBox="0 0 14 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M1 1L7 7L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>

                    <button 
                      onClick={() => setIsGraphOpen(false)}
                      className="px-5 py-2.5 bg-slate-800 hover:bg-red-500/20 text-gray-300 hover:text-red-400 border border-slate-700 hover:border-red-500/50 rounded-xl transition-all text-sm font-bold flex items-center gap-2 shadow-sm"
                    >
                      <span className="text-base leading-none">✕</span> Închide
                    </button>
                  </div>
                </div>
                {/* --- FINAL HEADER SLIM --- */}

                {/* Zona de Randare a Hărții */}
                <div className="flex-1 w-full relative bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-[#0B0F19] to-[#0B0F19] overflow-hidden">
                  {loadingGraph ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                      <div className="animate-spin h-10 w-10 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
                      <span className="text-indigo-400 font-bold text-sm animate-pulse">Generare hartă din baza de cunoștințe...</span>
                    </div>
                  ) : (
                    <div className="w-full h-full overflow-auto custom-scrollbar"
                  onClick={async (e) => { 
                    const buton = e.target.closest('.btn-lectie');
                    if (buton) {
                      const conceptId = buton.getAttribute('data-node-id'); 
                      const conceptName = buton.getAttribute('data-concept'); 

                      const { data: { user } } = await supabase.auth.getUser();
                      const finalUserId = user?.id;
                      
                      setCurrentLesson({ id: conceptId, name: conceptName });
                      setIsGraphOpen(false);
                      setMessages(prev => [
                        ...prev, 
                        { role: 'user', text: `Vreau să învăț despre: ${conceptName}` }
                      ]);
                      setLoading(true);

                      try {
                        // 🔥 MODIFICAT: Acum apelăm chat_agent în loc de generate_lesson
                        const response = await fetch("http://localhost:8000/chat_agent", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            user_id: String(finalUserId),
                            node_id: String(conceptId),
                            concept_label: String(conceptName),
                            message: "INCEPE_LECTIA", // 🔥 NOU: Mesajul invizibil pentru Router
                            history: []               // 🔥 NOU: Pornim cu un istoric curat
                          })
                        });
                        
                        const data = await response.json();
                        console.log("Date primite de la server:", data);

                        if (data.success && data.answer) {
                          // Asigurăm că answer este string
                          const aiText = typeof data.answer === 'object' 
                            ? JSON.stringify(data.answer) 
                            : String(data.answer);

                          // 1. Salvăm mesajul și setăm factCheck pe 'loading'
                          setMessages(prev => [
                          ...prev, 
                          { 
                            role: 'ai', 
                            text: aiText,
                            isCorrect: data.is_correct,
                            feynmanScores: data.feynman_scores,
                            agentUsed: data.agent_used,
                            factCheck: { status: 'loading' } // 🔥 Arătăm auditul în UI
                          }
                        ]);

                          // 2. 🔥 APELĂM FACT-CHECK-UL PENTRU LECȚIE 🔥
                          try {
                              const factCheckRes = await fetch("http://localhost:8000/fact-check", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                      query: conceptName, 
                                      answer: aiText
                                  })
                              });
                              
                              const fcData = await factCheckRes.json();
                              
                              // Actualizăm starea cu rezultatul auditului
                              setMessages(prev => {
                                  const newMsgs = [...prev];
                                  const lastIdx = newMsgs.findLastIndex(m => m.role === 'ai');
                                  if(lastIdx !== -1) {
                                      newMsgs[lastIdx].factCheck = {
                                          status: 'done',
                                          score: fcData.score,
                                          reason: fcData.explanation || fcData.reason
                                      };
                                  }
                                  return newMsgs;
                              });
                          } catch (fcErr) {
                              console.error("Eroare Fact-Check:", fcErr);
                              setMessages(prev => {
                                  const newMsgs = [...prev];
                                  const lastIdx = newMsgs.findLastIndex(m => m.role === 'ai');
                                  if(lastIdx !== -1) {
                                      newMsgs[lastIdx].factCheck = null;
                                  }
                                  return newMsgs;
                              });
                          }

                        } else {
                          setMessages(prev => [
                            ...prev,
                            { role: 'ai', text: `❌ Eroare server: ${data.message || "Te rog să reîncarci pagina."}` }
                          ]);
                        }
                      } finally {
                        setLoading(false);
                      }
                    }
                  }}
                    >
                      {/* Containerul care ține SVG-ul centrat și lasă loc de scroll natural */}
                      <div className="min-w-full min-h-full flex items-center justify-center p-12">
                         {mermaidGraphCode && <DiagramaMermaid cod={mermaidGraphCode} />}
                      </div>
                    </div>
                  )}

                  <style>{`
                    .custom-scrollbar::-webkit-scrollbar {
                      width: 12px;
                      height: 12px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-track {
                      background: rgba(11, 15, 25, 0.9);
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb {
                      background: #4f46e5;
                      border-radius: 6px;
                      border: 3px solid rgba(11, 15, 25, 0.9);
                    }
                    .custom-scrollbar::-webkit-scrollbar-corner {
                      background: rgba(11, 15, 25, 0.9);
                    }
                  `}</style>
                </div>
              </div>
            )}

            {/* =========================================================================
                🔥 PASUL C AICI: Butonul de Salvare Progres (Apare deasupra mesajelor) 🔥 
                ========================================================================= */}
            {!isGraphOpen && currentLesson && (
                <div className="w-full flex justify-between items-center px-6 py-4 bg-slate-800 border-b border-slate-700 shrink-0">
                    <span className="text-slate-300 text-sm">
                        Lecție Activă: <strong className="text-emerald-400">{currentLesson.name}</strong>
                    </span>
                    
                    {/* <button 
                        onClick={() => {
                            // Chat-ul se închide și ne întoarcem la hartă
                            setIsGraphOpen(true);
                            setCurrentLesson(null);
                            setMessages([]); 
                            // Redesenăm harta. Acum va vedea `completedNodes` actualizat!
                            fetchAndRenderGraph(selectedQuizId || null);
                        }}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition-all text-sm flex items-center gap-2"
                    >
                        ✅ Am înțeles! Revino la Hartă
                    </button> */}
                </div>
            )}
            {/* ========================================================================= */}


            {/* Fereastra Redare Mesaje Chat */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              {messages.map((msg, index) => {
                // Ascundere bule empty generata de pre-initializarea obiectului de stare
                if (msg.role === 'ai' && !msg.text) return null;

                return (
                  <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                    {msg.role === 'ai' && (
                      <div className="w-10 h-10 rounded-full bg-[#1e293b] border-2 border-slate-700/50 flex items-center justify-center mr-4 flex-shrink-0 shadow-lg relative group">
                      {/* Un mic efect de glow în spate, asortat cu animația */}
                      <div className="absolute inset-0 rounded-full bg-indigo-500/10 blur-sm group-hover:bg-purple-500/10 transition-colors"></div>
                      
                      {/* Iconița Lucide Bot stilizată cu culorile neon din animație */}
                      <Bot className="w-6 h-6 text-indigo-400 group-hover:text-purple-400 transition-colors relative z-10" strokeWidth={1.5} />
                    </div>
                    )}

                    <div className={`flex flex-col max-w-[80%] min-w-0 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`p-5 shadow-xl ${
                        msg.role === 'user' 
                        ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-3xl rounded-tr-sm' 
                        : 'bg-[#1e293b]/80 backdrop-blur-sm border border-slate-700/50 text-slate-200 rounded-3xl rounded-tl-sm'
                    }`}>
                      {/* 🔥 FIX-UL ESTE AICI: whitespace-pre-wrap și break-words sunt critice */}
                      <div className="prose prose-invert prose-p:leading-relaxed max-w-none whitespace-pre-wrap [word-break:break-word] break-words overflow-hidden text-sm md:text-base">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    </div>
                    
                    {/* 🔥 PANOU NOTE FEYNMAN (Apare doar dacă mesajul are note atașate) */}
                      {msg.feynmanScores && (
                        <div className="mt-5 pt-4 border-t border-slate-700/50 flex flex-wrap gap-3 animate-fade-in-up">
                            
                            {/* Insigna Acuratețe */}
                            <div className="flex flex-col gap-1 bg-slate-900/60 px-3 py-2.5 rounded-xl border border-slate-700 shadow-inner">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">🎯 Acuratețe</span>
                                <div className="flex items-baseline gap-1">
                                    <span className={`text-lg font-black leading-none ${msg.feynmanScores.acuratete >= 8 ? 'text-emerald-400' : msg.feynmanScores.acuratete >= 5 ? 'text-yellow-400' : 'text-red-400'}`}>
                                        {msg.feynmanScores.acuratete}
                                    </span>
                                    <span className="text-xs font-bold text-slate-600">/10</span>
                                </div>
                            </div>

                            {/* Insigna Completitudine */}
                            <div className="flex flex-col gap-1 bg-slate-900/60 px-3 py-2.5 rounded-xl border border-slate-700 shadow-inner">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">🧩 Completitudine</span>
                                <div className="flex items-baseline gap-1">
                                    <span className={`text-lg font-black leading-none ${msg.feynmanScores.completitudine >= 8 ? 'text-emerald-400' : msg.feynmanScores.completitudine >= 5 ? 'text-yellow-400' : 'text-red-400'}`}>
                                        {msg.feynmanScores.completitudine}
                                    </span>
                                    <span className="text-xs font-bold text-slate-600">/10</span>
                                </div>
                            </div>

                            {/* Insigna Claritate */}
                            <div className="flex flex-col gap-1 bg-slate-900/60 px-3 py-2.5 rounded-xl border border-slate-700 shadow-inner">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">💡 Claritate</span>
                                <div className="flex items-baseline gap-1">
                                    <span className={`text-lg font-black leading-none ${msg.feynmanScores.claritate >= 8 ? 'text-emerald-400' : msg.feynmanScores.claritate >= 5 ? 'text-yellow-400' : 'text-red-400'}`}>
                                        {msg.feynmanScores.claritate}
                                    </span>
                                    <span className="text-xs font-bold text-slate-600">/10</span>
                                </div>
                            </div>

                            {/* Rezultat Final (Trecut / Picat) */}
                            <div className={`ml-auto flex items-center gap-2 px-4 py-2 rounded-xl border font-black text-xs uppercase tracking-wider shadow-lg ${msg.isCorrect ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-red-500/20 border-red-500/50 text-red-400'}`}>
                                {msg.isCorrect ? '✅ CONCEPT STĂPÂNIT' : '🔄 MAI ÎNCEARCĂ'}
                            </div>
                            {/* 🔥 Butonul magic apare DOAR dacă a luat notă de trecere */}
                                {msg.isCorrect && (
                                    <button 
                                        onClick={() => {
                                            setIsGraphOpen(true);
                                            setCurrentLesson(null);
                                            // Curățăm chat-ul ca să fie fresh pentru următoarea lecție
                                            setMessages([{ role: 'ai', text: `Salut, **${username}**! Sunt asistentul tău de studiu bazat pe AI. Cu ce te pot ajuta astăzi?` }]);
                                            fetchAndRenderGraph(selectedQuizId || null);
                                        }}
                                        className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all text-[11px] uppercase tracking-wider flex items-center gap-2 group active:scale-95"
                                    >
                                        🗺️ Continuă pe Hartă
                                        <span className="transition-transform group-hover:translate-x-1">➔</span>
                                    </button>
                                )}
                        </div>
                      )}

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
                      {msg.role === 'ai' && msg.factCheck && msg.agentUsed !== 'Evaluator AI' && (
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
                        {numeAfisat.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                );
              })}
              
              
              {/* UI Loading Indicator Asincron */}
              {loading && (
                <div className="flex justify-start animate-fade-in-up">
                  {/* Avatar Robot în Loading */}
                  <div className="w-10 h-10 rounded-full bg-[#1e293b] border-2 border-slate-700/50 flex items-center justify-center mr-4 flex-shrink-0 shadow-lg relative group mt-1">
                    <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-sm animate-pulse"></div>
                    <Bot className="w-6 h-6 text-indigo-400 relative z-10 animate-pulse" strokeWidth={1.5} />
                  </div>
                  
                  {/* Bula de Loading cu Text */}
                  <div className="bg-[#1e293b]/80 backdrop-blur-sm border border-slate-700/50 p-4 rounded-3xl rounded-tl-sm flex flex-col gap-3 shadow-xl">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce"></div>
                      <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                    
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
            <QuizArena userId={currentUserInfo?.id} username={numeAfisat} onQuizComplete={() => fetchStats()} />
          </div>
        ) : activeTab === 'code' ? (
  <div className="h-full w-full overflow-y-auto relative z-10 custom-scrollbar">
    {/* ACUM afișăm lista de probleme, nu editorul direct */}
    <div className="p-8 border-b border-white/5">
        <h2 className="text-2xl font-black text-white">Arena de Programare</h2>
        <p className="text-slate-500 text-sm">Alege o provocare și demonstrează-ți abilitățile.</p>
    </div>
    <ProblemList />
  </div>
        ) : activeTab === 'video' ? (
          <div className="h-full w-full overflow-y-auto relative z-10">
            <VideoLibrary userId={currentUserInfo?.id} onGoToQuiz={() => setActiveTab('quiz')} />
          </div>
        ) : null}
        
      </div>
    </div>
  </div>
);
};

export default Dashboard;