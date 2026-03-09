import streamlit as st
import json
import random
import os
import time
from dotenv import load_dotenv
import shutil

# --- IMPORTURI AI & TOOLS ---
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

# --- CONFIGURARE PROIECT ---
load_dotenv()
st.set_page_config(page_title="AI Tutor", layout="wide", page_icon="🎓")

# Constante stabile
EMBEDDING_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"
GENERATIVE_MODEL = "models/gemini-flash-latest"
DB_DIR = "db_chroma"
LIBRARY_DIR = "biblioteca_txt"
QUIZ_FILE = "quiz_bank.json"
PROGRES_FILE = "progres_student.json"

# ==========================================
#  RESURSE
# ==========================================
@st.cache_resource
def init_resources():
    embed = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
    db = Chroma(persist_directory=DB_DIR, embedding_function=embed)
    llm = ChatGoogleGenerativeAI(model=GENERATIVE_MODEL, temperature=0.3)
    return {"db": db, "llm": llm, "embed": embed}

res = init_resources()

PROFILE_FILE = "student_profile.json"

# ==========================================
#  MANAGEMENT PROFIL STUDENT
# ==========================================
def load_profile():
    if os.path.exists(PROFILE_FILE):
        with open(PROFILE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"scores": {}}

def save_profile(profile):
    with open(PROFILE_FILE, "w", encoding="utf-8") as f:
        json.dump(profile, f, indent=2)

# ==========================================
#  DETECTORUL DE DOMENIU ACADEMIC
# ==========================================
def detect_document_domain(text):
    """Folosește Gemini pentru a deduce domeniul documentului din primele pagini."""
    try:
        prompt = f"""
        Citește introducerea acestui document și identifică domeniul academic sau materia.
        Exemple de răspunsuri: Informatică, Medicină, Istorie, Inginerie Electrică, Drept, Fizică, etc.
        
        REGULĂ STRICTĂ: Răspunde DOAR cu numele domeniului (maxim 2-3 cuvinte), fără nicio altă explicație sau punctuație.
        
        TEXT:
        {text[:2000]} 
        """
        response = res["llm"].invoke(prompt)
        
        # Extragem textul corect, indiferent de formatul returnat de model
        res_text = response.content
        if isinstance(res_text, list): 
            res_text = res_text[0].get('text', str(res_text))
            
        # Acum putem curăța textul în siguranță
        domeniu = res_text.replace("\n", "").strip()
        return domeniu
        
    except Exception as e:
        print(f"⚠️ Eroare la detectarea domeniului: {e}")
        return ""

# ==========================================
#  AGENT 1: INGESTOR (Knowledge Processor)
# ==========================================

def clean_romanian_pdf_text(text):
    """Curăță artefactele specifice PDF-urilor LaTeX pentru diacriticele românești."""
    replacements = {
        "s,i": "și",
        "t,i": "ți",
        "s,": "ș",
        "t,": "ț",
        "S,": "Ș",
        "T,": "Ț",
        "ˆın": "în",
        "ˆı": "î",
        "˘a": "ă",
        "˘A": "Ă",
        "ˆA": "Â",
        "ˆa": "â"
    }
    for bad_char, good_char in replacements.items():
        text = text.replace(bad_char, good_char)
    return text

def process_uploaded_file(uploaded_file):
    import fitz  
    
    filename = uploaded_file.name
    topic_name = filename.rsplit('.', 1)[0].lower().replace(" ", "_")
    text = ""

    # 1. Extragere text din PDF/TXT
    if filename.endswith(".pdf"):
        with fitz.open(stream=uploaded_file.read(), filetype="pdf") as doc:
            for page in doc:
                text += page.get_text()
    elif filename.endswith(".txt"):
        text = uploaded_file.getvalue().decode("utf-8")

    text = clean_romanian_pdf_text(text)

    if not text.strip():
        return False, "Fișierul este gol sau imposibil de citit."
    
    domeniu_detectat = detect_document_domain(text)
    if domeniu_detectat:
        # Salvăm domeniul într-un fișier mic pentru a-l ține minte și după refresh
        with open("domeniu_curent.txt", "w", encoding="utf-8") as f:
            f.write(domeniu_detectat)

    # 2. Salvare locală și adăugare în ChromaDB (Agent 1)
    if not os.path.exists(LIBRARY_DIR): os.makedirs(LIBRARY_DIR)
    with open(os.path.join(LIBRARY_DIR, f"{topic_name}.txt"), "w", encoding="utf-8") as f:
        f.write(text)

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = splitter.split_text(text)
    docs = [Document(page_content=c, metadata={"source": topic_name}) for c in chunks]
    res["db"].add_documents(docs)

    # 3. Generare Automată Întrebări (Agent 3)
    new_questions = generate_quiz_from_text(text, topic_name)
    
    if new_questions:
        try:
            with open(QUIZ_FILE, 'r', encoding='utf-8') as f:
                current_bank = json.load(f)
        except:
            current_bank = []
            
        current_bank.extend(new_questions)
        
        with open(QUIZ_FILE, 'w', encoding='utf-8') as f:
            json.dump(current_bank, f, indent=2, ensure_ascii=False)
            
        return True, f"Gata! Am procesat PDF-ul și am creat {len(new_questions)} întrebări noi."
    else:
        return True, "PDF indexat, dar nu am putut genera automat întrebările."

# ==========================================
#  AGENT 2: THE TEACHER (Contextual Tutor)
# ==========================================
def agent_tutor_response(query):
    """Căutare RAG și generare răspuns curat."""
    # 1. Retrieval
    docs = res["db"].similarity_search(query, k=5)
    context = "\n\n".join([d.page_content for d in docs])
    
    # 2. Prompting (Anti-halucinație)
    prompt = f"""Ești un profesor universitar. Răspunde STRICT folosind contextul de mai jos. 
    
    REGULI GENERALE DE BAZĂ: 
    1. TOLERANȚĂ LA ERORI: Fii tolerant cu greșelile de tastare ale utilizatorului. Dacă un cuvânt este scris greșit sau fără majuscule, asociază-l cu cel mai apropiat termen tehnic sau concept valid găsit în text.
    2. SEPARARE CONCEPTUALĂ: Nu amesteca informațiile! Dacă textul descrie mai multe metode, algoritmi sau concepte diferite, oferă caracteristici și avantaje STRICT pentru cel solicitat, fără a împrumuta trăsături de la celelalte.
    3. LIMITA DE CUNOAȘTERE: Dacă informația cerută nu se deduce logic și direct din contextul furnizat, nu inventa nimic. Răspunde cu exact aceste cuvinte: "Nu am găsit informații specifice despre acest concept în text."
    
    Context: {context}
    
    Întrebare: {query}"""
    response = res["llm"].invoke(prompt)
    
    # 3. Curățare răspuns (Fix pentru paranteze/semnături)
    content = response.content
    if isinstance(content, list):
        # Extragem doar textul util din lista returnată de Gemini
        return content[0].get('text', str(content)), context
    return content, context

# ==========================================
#  AGENT 3: THE EXAMINER
# ==========================================
def generate_quiz_from_text(text, topic_name):
    """Permite AI-ului să decidă numărul optim de întrebări pentru a acoperi toată materia."""
    try:
        prompt = f"""
        Ești un profesor universitar exigent. Analizează cu atenție textul de mai jos și identifică TOATE conceptele, definițiile, algoritmii și ideile principale.
        
        SARCINA TA:
        Generează câte o întrebare grilă pentru FIECARE concept important găsit, astfel încât testul să acopere 100% din materia prezentată. 
        Tu decizi numărul total de întrebări (pot fi 5, 15, 30 sau oricâte sunt necesare pentru a epuiza subiectele din text). Nu rata nicio informație esențială!
        
        REGULI STRICTE:
        1. Topic-ul trebuie să fie EXACT: "{topic_name}" pentru fiecare element.
        2. Fără absolut nicio explicație sau text înainte/după. Returnează DOAR o listă JSON validă.
        3. Fiecare întrebare trebuie să aibă 4 variante de răspuns (options) clare și un index corect (0, 1, 2 sau 3).

        TEXT:
        {text}

        FORMAT JSON DORIT:
        [
          {{
            "topic": "{topic_name}",
            "question_text": "...",
            "options": ["A", "B", "C", "D"],
            "correct_answer_index": 0
          }}
        ]
        """
        
        response = res["llm"].invoke(prompt)
        
        res_text = response.content
        if isinstance(res_text, list): 
            res_text = res_text[0].get('text', str(res_text))
            
        # Curățăm formatul (eliminăm eventualele block-uri markdown ```json)
        json_str = res_text.replace("```json", "").replace("```", "").strip()
        
        # Măsură de siguranță: decupăm strict de la prima paranteză pătrată '[' la ultima ']'
        # Pentru a preveni erorile în caz că AI-ul mai adaugă text accidental la final (ex: "Sper că te ajută!")
        start_idx = json_str.find('[')
        end_idx = json_str.rfind(']') + 1
        
        if start_idx != -1 and end_idx != -1:
            json_str = json_str[start_idx:end_idx]
            
        import random
        
        intrebari_generate = json.loads(json_str)
        
        for q in intrebari_generate:
            # Salvăm textul variantei care este corectă inițial
            text_corect = q["options"][q["correct_answer_index"]]
            
            # Amestecăm variantele
            random.shuffle(q["options"])
            
            # Căutăm la ce index a ajuns varianta corectă după amestecare și actualizăm
            q["correct_answer_index"] = q["options"].index(text_corect)
            
        return intrebari_generate
        
    except Exception as e:
        print(f"⚠️ Eroare Agent 3 (Generare Quiz Dinamic): {e}")
        return []

# ==========================================
#  AGENT 4: THE LIBRARIAN (AI Video Researcher)
# ==========================================

def generate_optimized_video_search(user_query, domain):
    """Folosește Gemini pentru a transforma o întrebare simplă într-o căutare profesională pe YouTube."""
    try:
        prompt = f"""
        Ești un expert în cercetare educațională. Un student care studiază materia "{domain}" te-a întrebat: "{user_query}".
        
        Sarcina ta este să deduci care sunt conceptele cheie din această întrebare și să generezi CEL MAI BUN termen de căutare pentru YouTube, astfel încât studentul să găsească tutoriale academice, prelegeri sau animații explicative.
        
        REGULI STRICTE:
        1. Formulează o căutare scurtă (maxim 4-6 cuvinte).
        2. Folosește limba engleză dacă termenii tehnici sunt mai bine reprezentați așa (ex: "thermal management" în loc de "management termic").
        3. Adaugă opțional cuvinte precum "tutorial", "lecture", "explained" pentru a filtra rezultatele de calitate.
        4. Returnează DOAR termenul de căutare optimizat, fără absolut niciun alt text, punctuație sau ghilimele.
        """
        
        response = res["llm"].invoke(prompt)
        
        res_text = response.content
        if isinstance(res_text, list): 
            res_text = res_text[0].get('text', str(res_text))
            
        optimized_search = res_text.replace("\n", "").replace('"', '').strip()
        return optimized_search
        
    except Exception as e:
        print(f"⚠️ Eroare AI Căutare Video: {e}")
        # Fallback de siguranță: dacă dă eroare API-ul, folosește metoda veche
        return f"{user_query} {domain}" 

def agent_curator_search(query):
    """Căutare inteligentă pe YouTube folosind LLM-ul pentru optimizarea termenilor."""
    from youtube_search import YoutubeSearch
    import os
    
    domeniu_curent = ""
    if os.path.exists("domeniu_curent.txt"):
        with open("domeniu_curent.txt", "r", encoding="utf-8") as f:
            domeniu_curent = f.read().strip()
            
    if domeniu_curent:
        # Lăsăm AI-ul să decidă ce se caută pe YouTube
        search_term = generate_optimized_video_search(query, domeniu_curent)
    else:
        search_term = query 
        
    print(f"🔍 AI-ul caută pe YouTube: {search_term}")
    
    final_videos = []
    
    try:
        # Încercăm căutarea prin scraper cu termenul nou, optimizat de AI
        results = YoutubeSearch(search_term, max_results=4).to_dict()
        for r in results:
            final_videos.append({
                "title": r['title'],
                "link": "https://www.youtube.com/watch?v=" + r['id'],
                "thumbnail": r['thumbnails'][0]
            })
    except Exception as e:
        print(f"⚠️ Eroare Scraper: {e}")
        
    return final_videos

# ==========================================
#  AGENTUL 5: FACT-CHECKER (Anti-Halucinație)
# ==========================================
def verify_hallucination(query, context, ai_response):
    """Evaluează cât de fidel este răspunsul față de contextul extras."""
    try:
        prompt = f"""
        Ești un auditor extrem de strict. Sarcina ta este să compari RĂSPUNSUL generat de AI cu CONTEXTUL extras din document.
        Dacă AI-ul a folosit informații din afara contextului, este o halucinație, iar scorul scade dramatic.
        
        CONTEXT EXTRAS: {context}
        ÎNTREBARE: {query}
        RĂSPUNS AI: {ai_response}
        
        Returnează DOAR un format JSON valid, exact cu această structură:
        {{
            "score": 100, 
            "reason": "Scurtă explicație a scorului (ex: Răspunsul este perfect susținut de context / Conține elemente inventate)."
        }}
        """
        response = res["llm"].invoke(prompt)
        
        res_text = response.content
        if isinstance(res_text, list): 
            res_text = res_text[0].get('text', str(res_text))
            
        json_str = res_text.replace("```json", "").replace("```", "").strip()
        
        start_idx = json_str.find('{')
        end_idx = json_str.rfind('}') + 1
        if start_idx != -1 and end_idx != -1:
            json_str = json_str[start_idx:end_idx]
            
        data = json.loads(json_str)
        return data.get("score", 0), data.get("reason", "Eroare la parsare.")
        
    except Exception as e:
        print(f"⚠️ Eroare Fact-Checker: {e}")
        return None, None

# ==========================================
#  FUNCȚIE DE RESETARE TOTALĂ
# ==========================================
def hard_reset_app():
    """Șterge tot progresul, fișierele text, baza de întrebări și golește Vector DB-ul."""
    # 1. Ștergem fișierele de progres și teste
    for file in [PROFILE_FILE, QUIZ_FILE, PROGRES_FILE]:
        if os.path.exists(file):
            os.remove(file)
            
    # 2. Ștergem și recreăm folderul cu materia (biblioteca_txt)
    if os.path.exists(LIBRARY_DIR):
        shutil.rmtree(LIBRARY_DIR, ignore_errors=True)
    os.makedirs(LIBRARY_DIR, exist_ok=True)
    
    # 3. Ștergem colecția de vectori din ChromaDB
    try:
        res["db"].delete_collection()
    except Exception as e:
        print(f"Colecția era deja goală sau blocată: {e}")

    # 3.5 ȘTERGERE FIZICĂ: Radem complet folderul bazei de date de pe disk
    if os.path.exists("db_chroma"):
        shutil.rmtree("db_chroma", ignore_errors=True)

    # 4. Curățăm memoria cache și sesiunea curentă Streamlit
    st.cache_resource.clear()
    st.session_state.clear()

# ==========================================
#  INTERFAȚA STREAMLIT (UI)
# ==========================================
st.title("🎓 Tutor Adaptiv Multi-Agent")
student_profile = load_profile()
# SIDEBAR
with st.sidebar:
    st.header("⚙️ Control Panel")
    # --- AFIȘARE PROGRES ---
    st.divider()
    st.markdown("### 📈 Progresul tău")
    
    import json, os
    if os.path.exists(PROGRES_FILE):
        try:
            with open(PROGRES_FILE, "r", encoding="utf-8") as f:
                istoric = json.load(f)
                
            teste = istoric.get("teste_rezolvate", 0)
            corecte = istoric.get("raspunsuri_corecte", 0)
            total_q = istoric.get("total_intrebari", 0)
            
            if teste > 0 and total_q > 0:
                acuratete = int((corecte / total_q) * 100)
                
                # Sistemul de Ranguri
                if acuratete >= 85:
                    rang = "🥇 Maestru"
                    culoare = "green"
                elif acuratete >= 50:
                    rang = "🥈 Explorator"
                    culoare = "orange"
                else:
                    rang = "🥉 Începător"
                    culoare = "red"

                st.markdown(f"**Rang curent:** :{culoare}[{rang}]")
                
                col1, col2 = st.columns(2)
                col1.metric("Teste", teste)
                col2.metric("Acuratețe", f"{acuratete}%")
                
                st.progress(acuratete / 100, text="Rata de succes generală")
            else:
                st.info("Rezolvă primul test pentru a debloca statisticile!")
        except:
            st.info("Rezolvă primul test pentru a debloca statisticile!")
    else:
        st.info("Rezolvă primul test pentru a debloca statisticile!")
    
    # --- ÎNCĂRCARE MATERIE NOUĂ ---
    st.divider()
    st.header("📂 Încarcă Materie")
    uploaded_file = st.file_uploader("Adaugă un curs nou (PDF/TXT)", type=["pdf", "txt"])
    
    if uploaded_file and st.button("🚀 Procesează Fișierul", type="primary"):
        with st.spinner("Agentul 1 citește documentul, iar Agentul 3 creează întrebările..."):
            success, msg = process_uploaded_file(uploaded_file)
            if success:
                st.success(msg)
                time.sleep(3) # Așteptăm puțin ca să poată citi mesajul de succes
                st.rerun()
            else:
                st.error(msg)


    st.divider()
    if st.button("🗑️ Șterge Istoric Chat"):
        st.session_state.messages = []
        st.rerun()

    # --- DANGER ZONE (Resetare) ---
    st.divider()
    st.header("⚠️ Zona de Pericol")
    
    if st.button("🚨 Resetare Completă Aplicație", type="primary", use_container_width=True):
        with st.spinner("Se șterg documentele, testele și progresul..."):
            hard_reset_app()
            st.success("Aplicația a fost readusă la setările din fabrică!")
            time.sleep(2) # Lăsăm 2 secunde să citească mesajul
            st.rerun()    # Reîncărcăm pagina complet curată

# TAB-URI PRINCIPALE
tab1, tab2, tab3 = st.tabs(["💬 Study Room", "📝 Quiz Arena", "📚 Video Library"])

# --- TAB 1: STUDY ROOM ---
with tab1:
    st.subheader("Discută cu materia ta")
    if "messages" not in st.session_state: st.session_state.messages = []

    for m in st.session_state.messages:
        with st.chat_message(m["role"]): st.markdown(m["content"])

    if prompt := st.chat_input("Întreabă ceva..."):
        st.chat_message("user").markdown(prompt)
        st.session_state.messages.append({"role": "user", "content": prompt})
        
        with st.chat_message("assistant"):
            answer, context = agent_tutor_response(prompt)
            st.markdown(answer)
            with st.expander("📖 Sursă utilizată (RAG)"): st.write(context)
            with st.status("🛡️ Se verifică acuratețea (Fact-Check)...", expanded=False) as status:
                score, reason = verify_hallucination(prompt, context, answer)
                
                if score is not None:
                    status.update(label="Verificare completă!", state="complete")
                    
                    # Stabilim culoarea în funcție de scor (Verde pt >90, Portocaliu pt >70, Roșu pt <70)
                    if score >= 90:
                        color = "#28a745" # Verde
                        icon = "✅"
                    elif score >= 70:
                        color = "#ffc107" # Portocaliu
                        icon = "⚠️"
                    else:
                        color = "#dc3545" # Roșu
                        icon = "❌"
                        
                    # Afișăm scorul cu un design elegant sub mesaj
                    st.markdown(f"""
                    <div style="border-left: 4px solid {color}; padding-left: 10px; margin-top: 10px; margin-bottom: 10px; background-color: rgba(0,0,0,0.05); border-radius: 4px;">
                        <span style="color: {color}; font-weight: bold; font-size: 14px;">
                            {icon} Confidence Score: {score}%
                        </span><br>
                        <span style="font-size: 12px; color: gray;"><i>{reason}</i></span>
                    </div>
                    """, unsafe_allow_html=True)
                else:
                    status.update(label="Eroare la verificarea acurateței.", state="error")
            
            st.session_state.messages.append({"role": "assistant", "content": answer})

# --- TAB 2: QUIZ ROOM ---
with tab2:
    import random
    import json
    import os
    
    st.subheader("📝 Micro-Test de Evaluare (5 Întrebări)")
    
    # 1. Inițializăm "memoria" testului
    if "quiz_data" not in st.session_state: st.session_state.quiz_data = []
    if "quiz_index" not in st.session_state: st.session_state.quiz_index = 0
    if "quiz_score" not in st.session_state: st.session_state.quiz_score = 0
    if "answered_current" not in st.session_state: st.session_state.answered_current = False
    if "quiz_finished" not in st.session_state: st.session_state.quiz_finished = False

    # 2. Ecranul de Start (Tragem 5 întrebări din banca deja existentă)
    if not st.session_state.quiz_data and not st.session_state.quiz_finished:
        st.info("Banca ta de întrebări a fost generată la încărcarea documentului. Apasă butonul de mai jos pentru a trage 5 întrebări aleatoare pentru acest test.")
        
        if st.button("🚀 Începe Testul Rapid"):
            if os.path.exists(QUIZ_FILE):
                try:
                    with open(QUIZ_FILE, "r", encoding="utf-8") as f:
                        banca_completa = json.load(f)
                        
                    if len(banca_completa) > 0:
                        # Extragem maxim 5 întrebări aleatoare din bancă
                        numar_intrebari = min(5, len(banca_completa))
                        intrebari_alese = random.sample(banca_completa, numar_intrebari)
                        
                        # Salvăm în sesiune și pornim testul
                        st.session_state.quiz_data = intrebari_alese
                        st.session_state.quiz_index = 0
                        st.session_state.quiz_score = 0
                        st.session_state.answered_current = False
                        st.session_state.quiz_finished = False
                        st.rerun()
                    else:
                        st.error("Banca de întrebări este goală. Încarcă un document mai întâi.")
                except Exception as e:
                    st.error(f"Eroare la citirea băncii de întrebări: {e}")
            else:
                st.warning("Nu am găsit nicio întrebare salvată. Te rog să încarci un curs (PDF) mai întâi.")

    # 3. Afișarea întrebărilor una câte una
    elif st.session_state.quiz_data and not st.session_state.quiz_finished:
        idx = st.session_state.quiz_index
        q = st.session_state.quiz_data[idx]
        total_q = len(st.session_state.quiz_data)
        
        st.progress((idx) / total_q)
        st.markdown(f"### Întrebarea {idx + 1} din {total_q}")
        st.write(f"**{q['question_text']}**")
        
        user_choice = st.radio("Alege varianta corectă:", q["options"], key=f"radio_{idx}")

        # Starea înainte să răspundă
        if not st.session_state.answered_current:
            if st.button("Trimite Răspunsul"):
                st.session_state.answered_current = True
                
                correct_option_text = q["options"][q["correct_answer_index"]]
                if user_choice == correct_option_text:
                    st.session_state.quiz_score += 1
                st.rerun()
                
        # Starea după ce a răspuns (Feedback)
        else:
            correct_option_text = q["options"][q["correct_answer_index"]]
            if user_choice == correct_option_text:
                st.success("✅ Răspuns Corect!")
            else:
                st.error(f"❌ Răspuns Greșit! Varianta corectă era: **{correct_option_text}**")
            
            if idx < total_q - 1:
                if st.button("Următoarea Întrebare ➡️"):
                    st.session_state.quiz_index += 1
                    st.session_state.answered_current = False
                    st.rerun()
            else:
                if st.button("🏆 Vezi Rezultatul Final"):
                    st.session_state.quiz_finished = True
                    st.rerun()

    # 4. Ecranul de Finalizare (Scorul)
    elif st.session_state.quiz_finished:
        total_q = len(st.session_state.quiz_data)
        if "score_saved" not in st.session_state:
            import json, os
            istoric = {"teste_rezolvate": 0, "raspunsuri_corecte": 0, "total_intrebari": 0}
            
            if os.path.exists(PROGRES_FILE):
                try:
                    with open(PROGRES_FILE, "r", encoding="utf-8") as f:
                        istoric = json.load(f)
                except:
                    pass
            
            istoric["teste_rezolvate"] += 1
            istoric["raspunsuri_corecte"] += st.session_state.quiz_score
            istoric["total_intrebari"] += total_q
            
            with open(PROGRES_FILE, "w", encoding="utf-8") as f:
                json.dump(istoric, f)
                
            st.session_state.score_saved = True # Marcam ca salvat

        st.balloons()
        st.markdown("<h2 style='text-align: center;'>🎉 Test Finalizat!</h2>", unsafe_allow_html=True)
        st.markdown(f"<h3 style='text-align: center;'>Scorul tău: {st.session_state.quiz_score} / {total_q}</h3>", unsafe_allow_html=True)
        
        procent = st.session_state.quiz_score / total_q if total_q > 0 else 0
        if procent == 1.0: 
            st.success("Excepțional! Stăpânești perfect acest material.")
        elif procent >= 0.6: 
            st.warning("Te-ai descurcat bine, dar mai poți recapitula.")
        else: 
            st.error("Ai nevoie de mai mult studiu la acest capitol.")

        # Buton pentru a trage ALTE 5 întrebări din bancă
        if st.button("🔄 Încearcă alt test (Trage alte 5 întrebări)"):
            st.session_state.quiz_data = []
            st.session_state.quiz_finished = False
            st.rerun() 

# --- TAB 3: VIDEO LIBRARY ---
with tab3:
    st.subheader("📺 Explorator Resurse Video")
    
    q_search = st.text_input("Ce dorești să cauți?", placeholder="", key="video_q")
    
    if st.button("🔍 Caută Surse", type="primary"):
        if q_search:
            with st.spinner(f"Agentul 4 scanează YouTube..."):
                videos = agent_curator_search(q_search)
                
                if videos:
                    st.success(f"Am găsit {len(videos)} tutoriale!")
                    col1, col2 = st.columns(2)
                    for idx, v in enumerate(videos):
                        target = col1 if idx % 2 == 0 else col2
                        with target:
                            with st.container(border=True):
                                st.video(v['link'])
                                st.caption(f"📌 {v['title']}")
                else:
                    # --- PLANUL DE REZERVĂ ---
                    st.warning("⚠️ Scraper-ul este momentan blocat de YouTube.")
                    st.info("Agentul 4 ți-a pregătit totuși link-ul direct către rezultate:")
                    yt_link = f"https://www.youtube.com/results?search_query={q_search.replace(' ', '+')}+informatica"
                    st.link_button(f"🔗 Vezi rezultatele pentru '{q_search}' pe YouTube", yt_link)
        else:
            st.error("Introdu un termen de căutare.")