import os
from fastapi import FastAPI, Depends, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import asyncio
from fastapi.responses import StreamingResponse
import json
import random
from fastapi import HTTPException
from fastapi import UploadFile, File
import fitz
from youtube_search import YoutubeSearch
from supabase import create_client, Client
from langchain_community.vectorstores import SupabaseVectorStore
import edge_tts
import uuid
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import json
import json
import re
import requests
from pydantic import BaseModel
import base64
import numpy as np
import httpx
from typing import List, Dict, Any
from functools import lru_cache

from langchain_classic.chains import RetrievalQA
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_core.prompts import PromptTemplate
load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)

app = FastAPI()


# Initializare director pentru fisiere media
os.makedirs("audio_files", exist_ok=True)

# Montare director static pentru acces public la fisierele audio
app.mount("/audio", StaticFiles(directory="audio_files"), name="audio")

# Configurare CORS pentru integrarea cu frontend-ul
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@lru_cache(maxsize=1)
def get_llm():
    # FastAPI va rula asta inteligent, fără să creeze 100 de instanțe
    return ChatGoogleGenerativeAI(
        model="models/gemini-flash-latest",
        google_api_key=os.getenv("GOOGLE_API_KEY"),
        temperature=0.3,
        streaming=True
    )

@lru_cache(maxsize=1)
def get_embeddings():
    return HuggingFaceEmbeddings(model_name="paraphrase-multilingual-MiniLM-L12-v2")

# Variabile globale pentru instantierea componentelor AI
qa_chain = None
vector_db = None
llm = None
embeddings = None
def init_ai():
    global qa_chain, vector_db, llm, embeddings
    try:
        # Validare variabila de mediu Google API
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            print("❌ EROARE: GOOGLE_API_KEY lipsește din .env!")
            return

        # Initializare model embeddings (multilingv)
        print("📂 Încărcăm modelul local: paraphrase-multilingual-MiniLM-L12-v2...")
        embeddings = HuggingFaceEmbeddings(model_name="paraphrase-multilingual-MiniLM-L12-v2")


        # Conectare la baza de date vectoriala Supabase    
        vector_db = SupabaseVectorStore(
            embedding=embeddings,
            client=supabase,
            table_name="documents",
            query_name="match_documents"
        )
        
        # Initializare LLM Google Gemini
        print("Initializare LLM...")
        llm = ChatGoogleGenerativeAI(
            model="models/gemini-flash-latest", 
            google_api_key=api_key,
            temperature=0.3,
            streaming=True
        )
        
        # Instantiere pipeline RetrievalQA
        qa_chain = RetrievalQA.from_chain_type(
            llm=llm,
            chain_type="stuff",
            retriever=vector_db.as_retriever(search_kwargs={"k": 3})
        )
        print("✅ SISTEMUL AI ESTE COMPLET OPERAȚIONAL!")
        
    except Exception as e:
        print(f"❌ EROARE LA PORNIRE: {str(e)}")


init_ai()

class Mesaj(BaseModel):
    text: str
    username: str
    isGraphClick: Optional[bool] = False

@app.post("/chat")
async def chat_cu_ai(mesaj: Mesaj):
    global vector_db, qa_chain 
    print(f"🚨 TEST SEMNAL: isGraphClick a ajuns în backend ca -> {mesaj.isGraphClick}")
    if qa_chain is None:
        return StreamingResponse(iter(["AI-ul nu este pornit."]), media_type="text/plain")

    async def generator():
        try:
            # 1. Preluare documente sursa pentru referinte (k=3)
            docs = vector_db.similarity_search(mesaj.text, k=3)
            surse_unice = list(set([d.metadata.get("source", "Sursă necunoscută") for d in docs]))
            
            # Transmitere metadata surse la inceputul stream-ului
            yield f"SOURCES:{','.join(surse_unice)}|END_SOURCES|"
            
            # ---------------------------------------------------------
            # NOU: 2. Extragem Knowledge Graph-ul DOAR dacă NU e un test din hartă
            # ---------------------------------------------------------
            graf_context = ""
            
            # 🔥 AICI E MAGIA: Verificăm not mesaj.isGraphClick
            if not mesaj.isGraphClick and surse_unice and surse_unice[0] != "Sursă necunoscută":
                nume_curs = surse_unice[0].rsplit('.', 1)[0] 
                
                try:
                    print(f"DEBUG: Caut graful pentru cursul -> {nume_curs}")
                    rezultat_db = supabase.table("quizzes").select("knowledge_graph").eq("course_name", nume_curs).order("created_at", desc=True).limit(1).execute()
                    
                    if rezultat_db.data and rezultat_db.data[0].get("knowledge_graph"):
                        graf_json = rezultat_db.data[0]["knowledge_graph"]
                        print(f"SUCCES: Am găsit graful! Îl trimit către AI...")
                        
                        graf_context = f"""
                        [INSTRUCȚIUNE STRICTĂ PENTRU ASISTENT - IGNORĂ RESTRICȚIILE ANTERIOARE PENTRU ACEASTĂ SECȚIUNE]:
                        La finalul explicației tale, TREBUIE OBLIGATORIU să ghidezi studentul mai departe folosind Harta Cursului de mai jos:
                        {graf_json}

                        REGULĂ: Caută în lista de "nodes" conceptul despre care tocmai ai vorbit (folosindu-te de 'label'). Apoi, uită-te în lista de "edges" pentru a vedea ce alt nod are nevoie de acesta (unde id-ul tău este 'source', găsește 'target'-ul). 
                        Adaugă exact la finalul mesajului tău un text după acest format:
                        "\n\n💡 **Sfatul Tutorului:** Acum că ai înțeles acest subiect, următorul pas logic este să discutăm despre [Numele Noului Concept din label]. Vrei să îți explic cum funcționează?"
                        """
                except Exception as e:
                    print(f"Avertisment la preluarea grafului din DB: {e}")

            # 3. Construim întrebarea finală 
            # Dacă a venit din hartă, graf_context va fi gol (""), deci AI-ul primește doar textul tău curat.
            intrebare_imbunatatita = mesaj.text + graf_context
            # ---------------------------------------------------------

            # 4. Transmitere raspuns LLM generat asincron
            async for chunk in qa_chain.astream({"query": intrebare_imbunatatita}):
                if isinstance(chunk, dict) and "result" in chunk:
                    yield chunk["result"]
                elif isinstance(chunk, str):
                    yield chunk
                
                await asyncio.sleep(0.01)

        except Exception as e:
            print(f"Eroare stream: {e}")
            yield f"\n[Eroare procesare: {str(e)}]"

    return StreamingResponse(generator(), media_type="text/plain")

@app.get("/get-quizzes")
async def get_quizzes(user_id: str):
    # Extrage istoricul testelor generate pentru utilizatorul curent din Supabase
    try:
        response = supabase.table("quizzes") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .execute()

        if not response.data:
            return {"success": True, "quizzes": [], "message": "Nu am găsit teste pentru acest utilizator."}
            
        return {
            "success": True, 
            "quizzes": response.data
        }
        
    except Exception as e:
        print(f"Eroare preluare date baza de date: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
def clean_romanian_pdf_text(text):
    # Normalizare caractere speciale romanesti pentru curatarea textului extras din PDF
    replacements = {
        "s,i": "și", "t,i": "ți", "s,": "ș", "t,": "ț",
        "S,": "Ș", "T,": "Ț", "ˆın": "în", "ˆı": "î",
        "˘a": "ă", "˘A": "Ă", "ˆA": "Â", "ˆa": "â"
    }
    for bad_char, good_char in replacements.items():
        text = text.replace(bad_char, good_char)
    return text

def esantioneaza_text_uniform(text: str, max_chars: int = 30000) -> str:
    # Dacă textul e deja mic, îl returnăm întreg
    if len(text) <= max_chars:
        return text
        
    # Împărțim textul în 5 segmente egale și luăm câte o porțiune din fiecare
    segment_size = len(text) // 5
    sample_per_segment = max_chars // 5
        
    segmente = []
    for i in range(5):
        start = i * segment_size
        segmente.append(text[start:start + sample_per_segment])
        
    # Le lipim înapoi cu un separator ca să știe LLM-ul că am sărit peste text
    return "\n\n[...]\n\n".join(segmente)

async def generate_quiz_from_text(text: str, topic_name: str):
    global llm 
    
    try:
        prompt = f"""
        Ești un profesor universitar exigent. Analizează cu atenție textul de mai jos și identifică TOATE conceptele, definițiile, algoritmii și ideile principale.
        
        SARCINA TA:
        Generează câte o întrebare grilă pentru FIECARE concept important găsit, astfel încât testul să acopere 100% din materia prezentată. 
        Tu decizi numărul total de întrebări (pot fi 5, 15, 30 sau oricâte sunt necesare pentru a epuiza subiectele din text). Nu rata nicio informație esențială!
        
        REGULI STRICTE:
        1. Topic-ul trebuie să fie EXACT: "{topic_name}".
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
        
        response = llm.invoke(prompt)
        res_text = response.content
        
        if isinstance(res_text, list): 
            res_text = res_text[0].get('text', str(res_text))
            
        # Parsare si curatare markup JSON din raspuns
        json_str = res_text.replace("```json", "").replace("```", "").strip()
        
        start_idx = json_str.find('[')
        end_idx = json_str.rfind(']') + 1
        
        if start_idx != -1 and end_idx != -1:
            json_str = json_str[start_idx:end_idx]
            
        intrebari_generate = json.loads(json_str)
        
        # Randomizare ordinii optiunilor pentru fiecare intrebare
        for q in intrebari_generate:
            text_corect = q["options"][q["correct_answer_index"]]
            import random
            random.shuffle(q["options"])
            q["correct_answer_index"] = q["options"].index(text_corect)
            
        return intrebari_generate
        
    except Exception as e:
        print(f"Eroare generare test: {e}")
        return []

async def genereaza_micro_graf(text_complet_pdf: str) -> dict:
    """
    Analizează textul unui curs și extrage un Knowledge Graph Semantic sub formă de JSON.
    Conține Noduri (concepte) și Muchii (relații de dependență).
    """
    # Folosim o temperatură mică pentru precizie maximă a JSON-ului
    llm = ChatGoogleGenerativeAI(model="models/gemini-flash-latest", temperature=0.1)
    
    prompt_template = """
Ești un arhitect educațional expert. Analizează textul cursului și extrage o hartă de cunoștințe (Knowledge Graph) completă și logică.

═══════════════════════════════════════════════════
REGULI STRICTE DE GENERARE
═══════════════════════════════════════════════════

1. ID-URI: Folosește EXCLUSIV litere mici, cifre și cratime. FĂRĂ caractere românești în ID.
   ✓ Corect: "memorie-ram", "algoritm-dijkstra", "structuri-date"
   ✗ Greșit: "memorie_ram", "AlgoritmDijkstra", "structuri-de-date-și-algoritmi"

2. NODURI: Extrage TOATE conceptele distincte din text. 
   - Minim 5 noduri, maxim 15 per curs
   - Fiecare nod = un singur concept clar, nu o combinație
   - 'label' = maxim 4 cuvinte, fără diacritice dacă sunt termeni tehnici
   - 'difficulty' = 1 la 5 (calibrat relativ între noduri, nu absolut)
   - 'concept_type': "teoretic" | "procedural" | "aplicativ"
   - 'estimated_minutes': între 10 și 45

3. MUCHII (EDGES): 
   - Folosește DOAR id-uri care există EXACT în lista de nodes
   - 'relation_type': 
       "requires"  → target NU poate fi înțeles fără source (blocker)
       "part_of"   → source este o componentă a target-ului
       "extends"   → source aprofundează sau detaliază target-ul
   - Fiecare nod trebuie să aibă CEL PUȚIN O muchie (nu lăsa noduri izolate)
   - VERIFICĂ: nu crea cicluri (A→B→A este invalid)

4. ORDINE LOGICĂ: Nodurile din 'nodes' trebuie să apară în ordinea 
   recomandată de învățare (de la fundamente la complex).

5. FORMAT: Returnează EXCLUSIV JSON valid. Zero markdown, zero explicații, 
   zero text în afara JSON-ului. Primul caracter = {{, ultimul = }}

═══════════════════════════════════════════════════
STRUCTURA EXACTĂ
═══════════════════════════════════════════════════

{{
  "subiect_principal": "Tema generală a cursului",
  "nodes": [
    {{
      "id": "slug-unic-fara-diacritice",
      "label": "Nume Scurt",
      "description": "1-2 propoziții clare despre ce reprezintă conceptul și de ce e important.",
      "difficulty": 2,
      "concept_type": "teoretic",
      "estimated_minutes": 15
    }}
  ],
  "edges": [
    {{
      "source": "id-concept-anterior",
      "target": "id-concept-urmator",
      "relation_type": "requires",
      "description": "De ce trebuie știut 'source' înainte de 'target'."
    }}
  ]
}}

Textul cursului:
{text_curs}
"""
    
    prompt = PromptTemplate(template=prompt_template, input_variables=["text_curs"])
    chain = prompt | llm
    
    try:
        # Trimitem textul la Gemini
        text_procesat = esantioneaza_text_uniform(text_complet_pdf, max_chars=30000)
        raspuns = await chain.ainvoke({"text_curs": text_procesat})
        
        # Extragem continutul brut
        continut_brut = raspuns.content
        if isinstance(continut_brut, list):
            continut_brut = "".join([bloc.get("text", "") if isinstance(bloc, dict) else str(bloc) for bloc in continut_brut])
            
        clean_text = str(continut_brut).replace("```json", "").replace("```", "").strip()
        
        graf_json = json.loads(clean_text)
        return graf_json
        
    except Exception as e:
        print(f"Eroare la generarea grafului semantic: {e}")
        # Fallback adaptat la noua structură
        return {"subiect_principal": "Curs", "nodes": [], "edges": []}


def cosine_similarity(a, b):
    a_np, b_np = np.array(a), np.array(b)
    # Evităm împărțirea la zero în cazuri rare
    if np.linalg.norm(a_np) == 0 or np.linalg.norm(b_np) == 0:
        return 0.0
    return np.dot(a_np, b_np) / (np.linalg.norm(a_np) * np.linalg.norm(b_np))


@app.post("/upload")
async def incarca_document(
    file: UploadFile = File(...), 
    user_id: str = Form(...)
):
    global vector_db, embeddings # Folosim variabila ta 'embeddings' definită global
    try:
        content = await file.read()
        text = ""

        # 1. Extracție text
        if file.filename.endswith(".pdf"):
            doc = fitz.open(stream=content, filetype="pdf")
            for page in doc:
                text += page.get_text()
        elif file.filename.endswith(".txt"):
            text = content.decode("utf-8")
        else:
            return {"success": False, "message": "Format nesuportat."}

        text = clean_romanian_pdf_text(text)
        if not text.strip():
            return {"success": False, "message": "Fișier fără text."}

        # 2. Generăm Knowledge Graph-ul PRIMA DATĂ
        print("Generez Knowledge Graph-ul semantic...")
        micro_graf = await genereaza_micro_graf(text)
        print("Knowledge Graph generat cu succes!")

        # 🔥 NOU: Pre-calculăm vectorii pentru nodurile din graf ca să facem asocierea semantică
        print("🧠 Pre-calculez embeddings pentru nodurile din graf...")
        node_embeddings = {}
        for nod in micro_graf.get("nodes", []):
            # Combinăm titlul cu descrierea pentru context maxim
            text_nod = f"{nod.get('label', '')} {nod.get('description', '')}".strip()
            # Folosim aembed_query ca să fie asincron și rapid
            node_embeddings[nod['id']] = await embeddings.aembed_query(text_nod)

        # 3. Segmentare document
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = splitter.split_text(text)
        
        # 4. Pregătirea fragmentelor cu etichete de noduri (Node-IDs)
        topic_name = file.filename.rsplit('.', 1)[0]
        records = []
        
        print(f"Indexez {len(chunks)} fragmente în tabela 'documents'...")
        
        for chunk_text in chunks:
            # Generăm vectorul pentru fragmentul de text o singură dată!
            vector = await embeddings.aembed_query(chunk_text)
            
            # 🔥 FIX RAG CHIRURGICAL: Folosim similaritatea cosinus în loc de potrivire exactă
            associated_node_ids = []
            for node_id, node_emb in node_embeddings.items():
                similarity = cosine_similarity(vector, node_emb)
                if similarity > 0.6:  # Pragul optim recomandat de celălalt AI
                    associated_node_ids.append(node_id)

            records.append({
                "content": chunk_text,
                "metadata": {
                    "source": file.filename, 
                    "user_id": user_id, 
                    "course_name": topic_name
                },
                "embedding": vector,
                "node_ids": associated_node_ids
            })

        # 5. Inserție directă în Supabase în tabela 'documents'
        supabase.table("documents").insert(records).execute()

        # 6. Generare Quiz (Rămâne neschimbat)
        new_questions = await generate_quiz_from_text(text, topic_name)
        
        # 7. Salvare în tabela 'quizzes'
        if new_questions:
            try:
                supabase.table("quizzes").insert({
                    "user_id": user_id,
                    "course_name": topic_name,
                    "questions": new_questions,
                    "knowledge_graph": micro_graf
                }).execute()
                
                mesaj_quiz = f"Am generat {len(new_questions)} întrebări salvate în contul tău!"
            except Exception as e:
                print(f"Eroare la salvarea quiz-ului în DB: {e}")
                mesaj_quiz = "Document asimilat, dar testul nu a putut fi salvat."
        else:
            mesaj_quiz = "Nu s-au putut genera întrebări noi."

        return {
            "success": True, 
            "message": f"Documentul '{file.filename}' a fost asimilat. {mesaj_quiz}"
        }

    except Exception as e:
        print(f"Eroare gravă la upload: {e}")
        return {"success": False, "message": f"Eroare la procesare: {str(e)}"}
class VideoQuery(BaseModel):
    query: str


class ChatAgentRequest(BaseModel):
    user_id: str
    node_id: str
    concept_label: str
    message: str
    history: List[Dict[str, Any]] = []

@app.post("/chat_agent")
async def chat_agent(
    request: ChatAgentRequest,
    llm = Depends(get_llm),                    # 🔥 FIX CONCURENȚĂ: LLM injectat
    embeddings_model = Depends(get_embeddings) # 🔥 FIX CONCURENȚĂ: Embeddings injectat
):
    global supabase # Am scos llm și embeddings de la globale
    
    try:
        print(f"\n--- 🤖 MULTI-AGENT CHAT: {request.concept_label} ---")
        print(f"🗣️ Mesaj student: {request.message}")

        # ==========================================
        # 🔥 FIX MEMORIE: Formatăm istoricul conversației
        # ==========================================
        history_text = "\n".join([
            f"{'Student' if h.get('role') == 'user' else 'Tutor'}: {h.get('text', '')}" 
            for h in request.history[-6:] # Luăm doar ultimele 3 schimburi de replici pentru eficiență
        ])
        if not history_text:
            history_text = "(Fără istoric recent)"

        # ==========================================
        # ♻️ RECICLARE 1: Extragem contextul chirurgical (RAG)
        # ==========================================
        # Acum folosim embeddings_model primit prin Depends()
        # Nu căutăm după "INCEPE_LECTIA" pentru că strică rezultatele RAG
        rag_query = f"{request.concept_label} {request.message if request.message != 'INCEPE_LECTIA' else ''}"
        
        query_vector = embeddings_model.embed_query(rag_query)
        rpc_response = supabase.rpc("search_chunks_by_node", {
            "query_embedding": query_vector,
            "target_user_id": request.user_id,
            "target_node_id": request.node_id,
            "match_count": 4 
        }).execute()

        chunks = rpc_response.data if rpc_response.data else []
        context = "\n\n".join([c["content"] for c in chunks])
        if not context:
            context = "Context nedetectat în curs. Folosește cunoștințele generale, dar specifică acest lucru."

        # ==========================================
        # 🤖 AGENT 1: ROUTER-UL (Polițistul de dirijare - ACUM CU 3 RUTE)
        # ==========================================
        router_prompt = f"""
        Analizează intenția acestui mesaj de la un student: "{request.message}"
        
        Contextul discuției anterioare (te ajută să înțelegi intenția dacă e o continuare):
        {history_text}
        
        REGULI STRICTE DE DECIZIE (Alege DOAR UNA):
        1. Dacă mesajul este EXACT "INCEPE_LECTIA" -> scrie EXACT un cuvânt: LECTIE
        2. Dacă studentul dă un răspuns la o întrebare, completează o propoziție, rezolvă un exercițiu sau dă o soluție -> scrie EXACT un cuvânt: EVALUARE
        3. Dacă studentul pune o întrebare, cere o explicație sau e confuz -> scrie EXACT un cuvânt: PREDARE
        
        Răspunde DOAR cu acel singur cuvânt ales, fără punctuație.
        """
        intent_raw = llm.invoke(router_prompt)
        
        # --- FIX-UL PENTRU STRIP (Neschimbat) ---
        intent_str = ""
        if hasattr(intent_raw, 'content'):
            if isinstance(intent_raw.content, list):
                for item in intent_raw.content:
                    if isinstance(item, dict) and 'text' in item:
                        intent_str += item['text']
                    else:
                        intent_str += str(item)
            else:
                intent_str = str(intent_raw.content)
        elif isinstance(intent_raw, list):
             for item in intent_raw:
                  if isinstance(item, dict) and 'text' in item:
                       intent_str += item['text']
                  else:
                       intent_str += str(item)
        else:
            intent_str = str(intent_raw)

        intent = intent_str.strip().upper()
        print(f"🧭 Decizie Router: {intent}")

        # ==========================================
        # 🤖 AGENT 2, 3 & 4: EXECUȚIA (Lecție, Evaluator sau Profesor)
        # ==========================================
        is_correct = False
        text_final = ""
        scores = None
        agent_nume = ""

        if "LECTIE" in intent:
            # --- RUTA NOUĂ: PREDAREA INIȚIALĂ LA CLICK PE NOD ---
            prompt = f"""
            Ești un Tutor AI universitar. Studentul tocmai a deschis prima lecție despre: "{request.concept_label}".
            
            Ai la dispoziție următorul CONTEXT extras din curs:
            ==========
            {context}
            ==========
            
            Sarcina ta:
            1. Bazează-te STRICT pe faptele din CONTEXT pentru a preda conceptul.
            2. Prezintă conceptul didactic și clar — definiție, intuiție, funcționalitate de bază.
            3. Folosește o analogie din viața reală pentru a face informația tehnică ușor de înțeles.
            4. Încheie OBLIGATORIU cu Provocarea Feynman: "Pentru a mă asigura că ai înțeles, explică-mi înapoi acest concept ca și cum aș fi un coleg care nu a auzit de el."
            """
            print("📖 Executare Agent Lecție Inițială...")
            ai_raw_response = llm.invoke(prompt)
            
            # Parsare robustă (aceeași funcționalitate ca la Profesor)
            content_raw = ai_raw_response.content if hasattr(ai_raw_response, 'content') else ai_raw_response
            if isinstance(content_raw, list):
                for item in content_raw:
                    if isinstance(item, dict) and 'text' in item: text_final += item['text']
                    else: text_final += str(item)
            else:
                text_final = str(content_raw)
                
            agent_nume = "Lector AI"

        elif "EVALUARE" in intent:
            # --- RUTA B: METODA FEYNMAN (Neschimbat) ---
            prompt = f"""
            Ești un evaluator expert. Studentul a încercat să explice conceptul: "{request.concept_label}".

            ISTORIC CONVERSAȚIE:
            {history_text}

            EXPLICAȚIA STUDENTULUI:
            "{request.message}"

            SURSA DE ADEVĂR (din documentul de curs):
            {context}

            Evaluează pe 3 dimensiuni și returnează EXCLUSIV un JSON valid (fără formatare markdown, fără alte texte). Folosește exact această structură:
            {{
              "acuratete": {{
                "scor": <0-10>,
                "erori_factuale": ["<eroare1>", "<eroare2>"], 
                "concepte_corecte": ["<concept_corect_mentionat>"]
              }},
              "completitudine": {{
                "scor": <0-10>,
                "omisiuni_critice": ["<ce lipsește esențial>"]
              }},
              "claritate": {{
                "scor": <0-10>,
                "observatie": "<Cât de simplu și logic a fost explicat>"
              }},
              "feedback_final": "<Paragraf de 3-4 propoziții, ton de mentor, începe cu un aspect pozitiv, adresează cel mai important gap, oferă o direcție concretă.>",
              "concept_finalizat": <true dacă media celor 3 scoruri este >= 7, altfel false>
            }}
            """
            print("📝 Executare Evaluator Feynman...")
            
            ai_raw_response = llm.invoke(prompt)
            
            try:
                content_raw = ai_raw_response.content if hasattr(ai_raw_response, 'content') else ai_raw_response
                content_str = ""
                if isinstance(content_raw, list):
                    for item in content_raw:
                        if isinstance(item, dict) and 'text' in item: content_str += item['text']
                        else: content_str += str(item)
                else:
                    content_str = str(content_raw)
                
                content_clean = content_str.replace("```json", "").replace("```", "").replace("JSON", "").replace("json", "").strip()
                eval_data = json.loads(content_clean)
                
                text_final = eval_data.get("feedback_final", "Nu am putut genera feedback-ul final.")
                is_correct = eval_data.get("concept_finalizat", False)
                

                scores = {
                    "acuratete": eval_data.get("acuratete", {}).get("scor", 0),
                    "completitudine": eval_data.get("completitudine", {}).get("scor", 0),
                    "claritate": eval_data.get("claritate", {}).get("scor", 0)
                }
                print(f"📊 Scor Acuratețe: {scores['acuratete']}")
                print(f"📊 Scor Claritate: {scores['claritate']}")
                
            except json.JSONDecodeError as e:
                print(f"❌ Eroare la parsarea JSON-ului Feynman: {e}")
                text_final = "Explicația ta a fost procesată, dar am întâmpinat o eroare la formatarea feedback-ului. Mai încearcă o dată, te rog."
                is_correct = False
                
            agent_nume = "Evaluator AI"

        else:
            # --- RUTA C: PREDARE (Conversația continuă - Neschimbat) ---
            prompt = f"""
            Ești un Tutor AI universitar, expert în a explica concepte tehnice într-un mod simplu și didactic. 
            Studentul învață despre "{request.concept_label}".
            
            Ai la dispoziție următorul CONTEXT extras direct din cursul studentului:
            ==========
            {context}
            ==========
            
            Istoric conversație:
            {history_text}
            
            Întrebarea studentului: "{request.message}"

            REGULI STRICTE DE PREDARE:
            1. Bazează-te STRICT pe faptele tehnice din CONTEXT. Chiar dacă acest context este foarte scurt (ex: 2-3 propoziții), tratează-l ca fiind sursa ta principală și suficientă de adevăr.
            2. INTERZIS: Nu folosi NICIODATĂ expresii de scuză precum "nu am detectat un context specific", "deoarece nu am găsit informații" sau "voi folosi cunoștințe generale". Asumă-ți direct rolul și predă cu încredere.
            3. ESTE PERMIS (și încurajat) să dezvolți faptele din context folosind analogii și metafore din viața de zi cu zi (ex: sertare, birouri, muncitori) pentru a face lecția ușor de înțeles. Acestea nu sunt considerate abateri de la context.
            4. Încheie întotdeauna explicația cu Provocarea Feynman: "Pentru a mă asigura că ai înțeles, explică-mi înapoi acest concept ca și cum aș fi un coleg care nu a auzit de el."
            """
            print("👨‍🏫 Executare Agent Profesor...")
            
            ai_raw_response = llm.invoke(prompt)

            content_raw = ai_raw_response.content if hasattr(ai_raw_response, 'content') else ai_raw_response
            if isinstance(content_raw, list):
                for item in content_raw:
                    if isinstance(item, dict) and 'text' in item: text_final += item['text']
                    else: text_final += str(item)
            else:
                text_final = str(content_raw)
            
            is_correct = False
            agent_nume = "Profesor AI"

        # Returnăm răspunsul unificat
        return {
            "success": True, 
            "answer": text_final.strip(),
            "agent_used": agent_nume,
            "is_correct": is_correct,
            "feynman_scores": scores 
        }
        
    except Exception as e:
        print(f"❌ Eroare Multi-Agent globală: {str(e)}")
        return {
            "success": False, 
            "message": str(e),
            "answer": "Ne pare rău, agenții AI întâmpină dificultăți de comunicare."
        }

class ProgressRequest(BaseModel):
    user_id: str
    node_id: str

@app.post("/save_progress")
async def save_progress(request: ProgressRequest):
    try:
        # Folosim "upsert" ca să nu dea eroare dacă lecția e deja marcată ca terminată
        supabase.table("user_progress").upsert({
            "user_id": request.user_id,
            "node_id": request.node_id
        }).execute()
        
        return {"success": True, "message": "Progres salvat cu succes!"}
    except Exception as e:
        print(f"❌ Eroare la salvarea progresului: {e}")
        return {"success": False, "message": str(e)}

@app.get("/get_progress/{user_id}")
async def get_progress(user_id: str):
    try:
        # Extragem toate node_id-urile completate de acest user
        response = supabase.table("user_progress").select("node_id").eq("user_id", user_id).execute()
        
        # Facem o listă curată doar cu ID-urile (ex: ["ierarhia-memoriilor", "memoria-ram"])
        completed_nodes = [item["node_id"] for item in response.data]
        
        return {"success": True, "completed_nodes": completed_nodes}
    except Exception as e:
        print(f"❌ Eroare la citirea progresului: {e}")
        return {"success": False, "completed_nodes": []}


@app.post("/search-video")
async def search_video(request: VideoQuery):
    global llm
    try:
        user_query = request.query
        search_term = user_query
        folosit_ai = False

        print(f"🎬 Solicitare video pentru: {user_query}")

        # Optimizare semantica query pentru YouTube prin LLM
        if llm is not None:
            try:
                prompt = f"""
                Ești un expert în cercetare educațională. Un student te-a întrebat: "{user_query}".
                Dedu care sunt conceptele cheie și generează CEL MAI BUN termen de căutare pentru YouTube (tutoriale academice, animații).
                REGULI: 1. Scurt (3-5 cuvinte). 2. Engleza e preferată pt termeni tehnici. 3. Fără alte explicații.
                """
                response = llm.invoke(prompt)
                search_term = response.content.strip().replace('"', '').replace('\n', '')
                folosit_ai = True
                print(f"Termen cautare optimizat: {search_term}")
            except Exception as ai_err:
                print(f"Optimizare LLM indisponibila (fallback activat). Eroare: {ai_err}")

        # Executare interogare YouTube API
        results = YoutubeSearch(search_term, max_results=4).to_dict()
        
        final_videos = []
        for r in results:
            final_videos.append({
                "title": r['title'],
                "link": "https://www.youtube.com/watch?v=" + r['id'],
                "thumbnail": r['thumbnails'][0],
                "duration": r.get('duration', 'N/A'),
                "views": r.get('views', 'N/A')
            })

        status_ai = "Optimizat de AI" if folosit_ai else "Căutare Directă (AI în pauză)"

        return {
            "success": True, 
            "original_query": user_query,
            "optimized_search": search_term, 
            "status_ai": status_ai,
            "videos": final_videos
        }

    except Exception as e:
        print(f"⚠️ Eroare totală Agent 4: {e}")
        return {"success": False, "message": "Nu am putut accesa YouTube-ul în acest moment."}
    
class FactCheckRequest(BaseModel):
    query: str
    answer: str

@app.post("/fact-check")
async def verify_hallucination_endpoint(request: FactCheckRequest):
    global llm, vector_db
    
    try:
        # Verificare siguranță instanțe
        if llm is None or vector_db is None:
            return {
                "is_accurate": False, 
                "score": 0, 
                "explanation": "Sistemul AI sau baza de date nu este activă."
            }

        # 1. Recuperăm contextul (RAG)
        docs = vector_db.similarity_search(request.query, k=5)
        context = "\n\n".join([d.page_content for d in docs])
        
        # 2. Promptul Auditorului (Îmbunătățit pentru analogii didactice)
        prompt = f"""
        Ești un auditor educațional extrem de precis. Sarcina ta este să verifici dacă RĂSPUNSUL generat de Profesorul AI respectă faptele tehnice din CONTEXTUL extras.
        
        REGULA DE AUR: 
        1. Răspunsul trebuie să se bazeze strict pe faptele tehnice din context. AI-ul NU are voie să inventeze cifre, viteze sau denumiri tehnice.
        2. ESTE PERMIS ca Profesorul să folosească analogii și metafore (ex: 'masa de lucru', 'bucătar', 'frigider') pentru a explica conceptele tehnice din context. Acestea reprezintă metode didactice, NU halucinații!
        
        CONTEXT EXTRAS: {context}
        ÎNTREBARE: {request.query}
        RĂSPUNS PROFESOR: {request.answer}
        
        Dacă faptele tehnice de bază din răspuns sunt susținute de context (indiferent de analogiile folosite), acordă un scor mare (peste 90). Scade scorul dacă a inventat termeni tehnici complet străini de text.
        
        Returnează STRICT un JSON valid, fără explicații suplimentare în afara lui:
        {{
            "score": 100, 
            "explanation": "Explicația deciziei."
        }}
        """
        
        response = llm.invoke(prompt)
        
        # 3. Parsare EXTREM de sigură a textului de la LLM
        content_raw = response.content if hasattr(response, 'content') else response
        res_text = ""
        
        if isinstance(content_raw, list):
            for item in content_raw:
                if isinstance(item, dict) and 'text' in item:
                    res_text += item['text']
                else:
                    res_text += str(item)
        else:
            res_text = str(content_raw)
            
        # Folosim Regex pentru a extrage DOAR obiectul JSON
        json_match = re.search(r'\{.*\}', res_text.replace('\n', ''), re.DOTALL)
        if json_match:
            res_text = json_match.group(0)
        else:
            # Fallback dacă LLM-ul chiar nu a dat JSON
            res_text = '{"score": 0, "explanation": "Eroare de formatare LLM."}'
            
        data = json.loads(res_text)
        
        # 4. Calculăm decizia finală
        score = int(data.get("score", 0))
        is_accurate = score >= 85 # Pragul de trecere
        
        return {
            "is_accurate": is_accurate,
            "score": score, 
            "explanation": data.get("explanation", "Evaluare completă.")
        }
        
    except Exception as e:
        print(f"⚠️ Eroare CRITICĂ Fact-Checker: {e}")
        # Nu lăsăm erorile Python să ajungă în Frontend
        return {
            "is_accurate": False,
            "score": 0, 
            "explanation": "Fact-checking imposibil. Eroare internă a serverului."
        }


class TextPentruVoce(BaseModel):
    text: str
    voce: str = "ro-RO-AlinaNeural"

@app.post("/genereaza-audio")
async def genereaza_audio(date: TextPentruVoce):
    try:
        # Generare identificator unic si cale de salvare locala
        nume_fisier = f"{uuid.uuid4()}.mp3"
        cale_completa = f"audio_files/{nume_fisier}"
        
        # Utilizare TTS pentru generare audio
        comunicare = edge_tts.Communicate(date.text, date.voce)
        await comunicare.save(cale_completa)
        
        return {
            "success": True, 
            "audio_url": f"http://localhost:8000/audio/{nume_fisier}"
        }
    except Exception as e:
        print(f"Eroare la generare audio: {e}")
        return {"success": False, "message": str(e)}


class CererePrezentare(BaseModel):
    subiect: str
    user_id: str

@app.post("/genereaza-prezentare")
async def genereaza_prezentare(date: CererePrezentare):
    global vector_db 
    
    try:
        # Faza 1: Extragere context RAG
        docs = vector_db.similarity_search(date.subiect, k=5, filter={"user_id": date.user_id})
        context_text = "\n\n".join([d.page_content for d in docs])
        
        if not context_text.strip():
            print("Avertizare RAG: Nu au fost gasite referinte in documentele utilizatorului.")
            context_text = "Nu s-au găsit informații specifice în cursuri. Te rog să generezi pe baza cunoștințelor tale generale."

        # Faza 2: Constructie si procesare prompt
        prompt_prezentare = f"""
            Acționează ca un profesor universitar de top. Misiunea ta este să creezi o prezentare interactivă despre: "{date.subiect}".

            ESTE VITAL SĂ TE BAZEZI STRICT PE URMĂTOARELE INFORMAȚII EXTRASE DIN CURSURILE STUDENTULUI:
            \"\"\"{context_text}\"\"\"

            ═══════════════════════════════════════════════════
            REGULA #1 — ALEGEREA VIZUALULUI (CEA MAI IMPORTANTĂ REGULĂ)
            ═══════════════════════════════════════════════════

            Ai la dispoziție DOUĂ unelte vizuale. Pentru fiecare slide, alege UNA singură:

            ◆ OPȚIUNEA A — 'cod_diagrama_mermaid':
            Folosește-o pentru ORICE concept care nu are o formă fizică clară:
            - Concepte abstracte (registre, cache, memorie virtuală, protocoale)
            - Ierarhii și structuri logice (ex: Registre → Cache → RAM → HDD)
            - Algoritmi și fluxuri de execuție
            - Comparații între concepte (tabel flowchart)
            - Relații cauză-efect
            → DACĂ AI DUBII, ALEGE ÎNTOTDEAUNA ACEASTĂ OPȚIUNE.

            ◆ OPȚIUNEA B — 'prompt_imagine_en':
            Folosește-o DOAR când subiectul slide-ului este un obiect fizic REAL și RECOGNOSCIBIL:
            - Un stick de RAM, un HDD, un procesor fizic
            - O analogie din viața reală (ex: o bibliotecă pentru a ilustra RAM-ul)
            → NICIODATĂ pentru concepte abstracte, algoritmi sau ierarhii logice.
            → Promptul TREBUIE să conțină obligatoriu: "NO TEXT, NO WORDS, NO LABELS, 
                NO LETTERS, NO WRITING anywhere in the image, purely visual"

            ═══════════════════════════════════════════════════
            REGULA #2 — STRUCTURA RĂSPUNSULUI
            ═══════════════════════════════════════════════════

            Analizează subiectul ("{date.subiect}") și returnează EXCLUSIV JSON valid, 
            fără markdown, fără explicații, fără text în afara JSON-ului.

            VARIANTA A — Dacă subiectul NU are nicio legătură cu contextul:
            {{
                "eroare_context": "Subiectul cerut ('{date.subiect}') nu se regăsește în cursurile încărcate."
            }}

            VARIANTA B — Dacă subiectul este valid, generează prezentarea:
            {{
                "titlu_curs": "Titlu descriptiv al prezentării",
                "slide_uri": [
                    {{
                        "titlu": "Titlu clar și concis al slide-ului",
                        "idei_principale": [
                            "Idee completă și explicativă extrasă DIN TEXTUL SURSĂ",
                            "Minim 4, maxim 5 idei per slide",
                            "Fiecare idee = o propoziție completă, nu un cuvânt cheie"
                        ],
                        "text_pentru_voce": "Text fluid de 4-6 propoziții pentru vocea AI. Scris ca o explicație verbală naturală, nu ca o listă. Bazat STRICT pe textul sursă.",
                        "cod_diagrama_mermaid": "graph TD; A[Concept A] --> B[Concept B]; B --> C[Concept C]; (sau exact '' dacă ai ales opțiunea B)",
                        "prompt_imagine_en": "Detailed description of a clean, realistic, educational photograph, NO TEXT, NO WORDS, NO LABELS, NO LETTERS, NO WRITING anywhere in the image, purely visual (sau exact '' dacă ai ales opțiunea A)"
                    }}
                ]
            }}

            ═══════════════════════════════════════════════════
            REGULA #3 — CALITATE MERMAID
            ═══════════════════════════════════════════════════
            Când generezi o diagramă Mermaid, respectă:
            - Folosește graph TD (top-down) pentru ierarhii și graph LR (left-right) pentru fluxuri
            - Nodurile să aibă etichete clare și scurte (max 4 cuvinte)
            - Maxim 6-7 noduri per diagramă — nu supraaglomera
            - Sintaxă validă: fără caractere speciale românești în ID-uri (folosește ID simple: A, B, C sau cuvinte EN)
            - Exemplu corect: graph TD; A[Registre CPU] --> B[Cache L1]; B --> C[Cache L2]; C --> D[RAM];
            - Exemplu greșit: graph TD; Registre_CPU --> Memorie_Cache_L1_și_L2;
            - NU folosi etichete pe săgeți (fără sintaxa -->|text|)
              Dacă vrei să explici o relație, adaug-o ca nod separat
              Exemplu greșit:  A -->|Stocheaza| B
              Exemplu corect:  A --> B
            """

        response = await llm.ainvoke(prompt_prezentare)
        
        # Functie recursiva de extractie text din structuri imbricate
        def extrage_text_pur(obj):
            if isinstance(obj, str):
                return obj
            if hasattr(obj, 'content'): 
                return extrage_text_pur(obj.content)
            if isinstance(obj, list) and len(obj) > 0:
                return extrage_text_pur(obj[0]) 
            if isinstance(obj, dict):
                return extrage_text_pur(obj.get('content', obj.get('text', str(obj))))
            return str(obj)

        json_text = extrage_text_pur(response)
        json_text = json_text.strip()

        # Curatare formatare delimitatori block code Markdown
        if "{" in json_text and "}" in json_text:
            start_index = json_text.find("{")
            end_index = json_text.rfind("}") + 1
            json_text = json_text[start_index:end_index]
            
        # Validare si parsare JSON output
        try:
            date_json = json.loads(json_text)
            
            return {
                "success": True, 
                "prezentare": date_json
            }
            
        except json.JSONDecodeError as e:
            print(f"Eroare validare JSON: {e}")
            return {
                "success": False, 
                "message": f"Format output AI neconform: {str(e)}"
            }

    except Exception as e:
        print(f"Eroare pipeline prezentare: {e}")
        return {
            "success": False, 
            "message": str(e)
        }

class CerereImagine(BaseModel):
    prompt: str

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")

@app.post("/genereaza-imagine")
async def genereaza_imagine(cerere: CerereImagine):
    # Configurare request pentru endpoint-ul NVIDIA NIM - Stable Diffusion 3 Medium
    invoke_url = "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium"
    
    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    
    payload = {
        "prompt": cerere.prompt,
        "negative_prompt": "text, words, letters, labels, captions, watermark, signature, typography, writing, numbers, characters, fonts, inscriptions, annotations",
        "aspect_ratio": "16:9", 
        "mode": "text-to-image",
        "output_format": "jpeg"
    }
    
    try:
        # 🔥 FIX: Apel asincron cu httpx care nu blochează event loop-ul serverului
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(invoke_url, headers=headers, json=payload)
        
        if response.status_code == 200:
            # Procesare response si formatare MIME tip Base64
            data = response.json()
            imagine_b64 = data.get("image")
            
            imagine_formatata = f"data:image/jpeg;base64,{imagine_b64}"
            return {"success": True, "imagine": imagine_formatata}
        else:
            print(f"Eroare retea generare imagine. Status {response.status_code}: {response.text}")
            return {"success": False, "message": f"Eroare integrare API terta: {response.text}"}
            
    except Exception as e:
        print(f"Exceptie interna endpoint imagine: {e}")
        return {"success": False, "message": str(e)}

class TestCase(BaseModel):
    input: str
    expected: str
    hidden: bool = False

class CodeSubmission(BaseModel):
    code: str
    language: str
    problem_id: str

@app.get("/problem/{problem_id}")
async def get_problem(problem_id: str):
    try:
        # Folosim clientul tău 'supabase' deja existent
        response = supabase.table("coding_problems").select("*").eq("id", problem_id).execute()
        if not response.data:
            return {"error": "Problema nu a fost găsită"}
        return response.data[0]
    except Exception as e:
        return {"error": str(e)}

# --- 2. RUTA PRINCIPALĂ (Dynamic) ---
@app.post("/run_and_evaluate")
async def run_and_evaluate(submission: CodeSubmission):
    try:
        response = supabase.table("coding_problems").select("test_cases").eq("id", submission.problem_id).execute()
        
        if not response.data:
            return {"success": False, "test_results": [], "ai_feedback": "⚠️ Eroare: Problema nu a fost găsită în baza de date."}
            
        test_cases = response.data[0].get('test_cases', [])
        if not test_cases:
            return {"success": False, "test_results": [], "ai_feedback": "⚠️ Eroare: Problema nu are teste definite."}

        encoded_code = base64.b64encode(submission.code.encode()).decode()
        
        teste_picare = 0
        primul_mesaj_eroare = ""
        rezultate_teste = [] # 🔥 NOU: Lista de rezultate structurate pentru UI-ul HackerRank

        async with httpx.AsyncClient() as client:
            for idx, test in enumerate(test_cases):
                test_input = test.get('input', '')
                test_expected = test.get('expected', '')
                test_hidden = test.get('hidden', False)

                encoded_input = base64.b64encode(test_input.encode()).decode()
                encoded_expected = base64.b64encode(test_expected.encode()).decode()
                
                payload = {
                    "source_code": encoded_code,
                    "language_id": 54, # C++
                    "stdin": encoded_input,
                    "expected_output": encoded_expected,
                    "base64_encoded": True,
                    "wait": True
                }
                
                judge_res = await client.post("https://ce.judge0.com/submissions", json=payload, params={"base64_encoded": "true", "wait": "true"}, timeout=15.0)
                result = judge_res.json()
                
                status_id = result.get("status", {}).get("id")
                
                def decode_b64(b64_str):
                    return base64.b64decode(b64_str).decode('utf-8', errors='replace') if b64_str else ""
                
                stdout = decode_b64(result.get("stdout"))
                stderr = decode_b64(result.get("stderr"))
                compile_error = decode_b64(result.get("compile_output"))

                # Structura pe care o va citi React-ul
                test_result_obj = {
                    "id": idx,
                    "name": f"Test Case {idx}",
                    "hidden": test_hidden,
                    "passed": False,
                    "input": test_input.strip(),
                    "expected": test_expected.strip(),
                    "actual": stdout.strip() if stdout else "Nimic",
                    "error": compile_error or stderr
                }

                if compile_error:
                    teste_picare += 1
                    rezultate_teste.append(test_result_obj)
                    primul_mesaj_eroare = compile_error
                    break # Oprim la prima eroare de compilare

                if status_id == 3: # Accepted
                    test_result_obj["passed"] = True
                else:
                    teste_picare += 1
                    if not primul_mesaj_eroare:
                        primul_mesaj_eroare = f"Testul #{idx} a picat. Se aștepta '{test_expected.strip()}' dar s-a primit '{stdout.strip()}'."

                rezultate_teste.append(test_result_obj)

        # --- AI TUTOR ---
        ai_message = None
        if teste_picare > 0 and primul_mesaj_eroare:
            prompt_militar = f"""
            Ești un asistent educațional expert în C++. Codul studentului a picat la evaluare.
            Codul:
            ```cpp\n{submission.code}\n```
            Eroarea sau Testul picat: {primul_mesaj_eroare}
            Explică foarte scurt unde e greșeala și dă un indiciu fără să dai codul corect.
            """
            try:
                llm_evaluator = ChatGoogleGenerativeAI(model="models/gemini-flash-latest", temperature=0.3)
                response_ai = await llm_evaluator.ainvoke(prompt_militar)
                ai_message = response_ai.content[0].get('text', '') if isinstance(response_ai.content, list) else str(response_ai.content)
            except Exception as e:
                ai_message = "Verifică atent output-ul tău comparativ cu cel așteptat din consolă."

        return {
            "success": teste_picare == 0,
            "test_results": rezultate_teste,
            "ai_feedback": ai_message
        }

    except Exception as e:
        return {"success": False, "test_results": [], "ai_feedback": f"Eroare severă: {str(e)}"}

@app.get("/problems")
async def get_all_problems():
    try:
        # Tragem ID-ul, titlul și dificultatea din tabelul Supabase
        response = supabase.table("coding_problems").select("id, title, difficulty, category").execute()
        return response.data
    except Exception as e:
        return []

if __name__ == "__main__":
    import uvicorn
    # Initiere server ASGI local in mod dev
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)