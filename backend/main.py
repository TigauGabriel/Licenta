import os
from fastapi import FastAPI
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
from pydantic import BaseModel
from youtube_search import YoutubeSearch

# Importuri specifice pentru configurația ta
from langchain_classic.chains import RetrievalQA
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

load_dotenv()

app = FastAPI()

# Permitem comunicarea cu React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Variabilă globală pentru lanțul de AI
qa_chain = None
vector_db = None
llm = None
def init_ai():
    global qa_chain, vector_db, llm
    try:
        # 1. Verificare Cheie API
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            print("❌ EROARE: GOOGLE_API_KEY lipsește din .env!")
            return

        # 2. Setăm modelul tău multilingv (Trebuie să fie identic cu cel de la crearea DB)
        print("📂 Încărcăm modelul local: paraphrase-multilingual-MiniLM-L12-v2...")
        embeddings = HuggingFaceEmbeddings(model_name="paraphrase-multilingual-MiniLM-L12-v2")

        # 3. Deschidem baza de date Chroma
        if not os.path.exists("./db"):
            print("❌ EROARE: Folderul './db' nu a fost găsit lângă main.py!")
            return
            
        vector_db = Chroma(persist_directory="./db", embedding_function=embeddings)
        
        # 4. Configurăm modelul Gemini specificat de tine
        print("🤖 Inițializăm models/gemini-flash-latest...")
        llm = ChatGoogleGenerativeAI(
            model="models/gemini-2.0-flash-lite", 
            google_api_key=api_key,
            temperature=0.3,
            streaming=True
        )
        
        # 5. Cream lanțul de Retrieval folosind pachetul CLASSIC
        qa_chain = RetrievalQA.from_chain_type(
            llm=llm,
            chain_type="stuff",
            retriever=vector_db.as_retriever(search_kwargs={"k": 3})
        )
        print("✅ SISTEMUL AI ESTE COMPLET OPERAȚIONAL!")
        
    except Exception as e:
        print(f"❌ EROARE LA PORNIRE: {str(e)}")

# Pornim inițializarea
init_ai()

class Mesaj(BaseModel):
    text: str
    username: str

@app.post("/chat")
async def chat_cu_ai(mesaj: Mesaj):
    global qa_chain
    if qa_chain is None:
        return StreamingResponse(iter(["AI-ul nu este pornit."]), media_type="text/plain")

    async def generator():
        try:
            # Folosim astream log pentru a vedea tot ce "mișcă" în lanț
            async for chunk in qa_chain.astream({"query": mesaj.text}):
                # În RetrievalQA, textul final vine de obicei în chunk["result"]
                if isinstance(chunk, dict) and "result" in chunk:
                    # Dacă fragmentul conține rezultatul, îl trimitem cuvânt cu cuvânt
                    # sau bucată cu bucată
                    text_bucata = chunk["result"]
                    yield text_bucata
                elif isinstance(chunk, str):
                    yield chunk
                
                # Mic delay pentru a lăsa browserul să randeze
                await asyncio.sleep(0.01)
        except Exception as e:
            print(f"Eroare stream: {e}")
            yield f"\n[Eroare procesare: {str(e)}]"

    return StreamingResponse(generator(), media_type="text/plain")

@app.get("/get-quiz")
async def get_quiz():
    try:
        # Căutăm fișierul tău generat anterior de Agent 3
        with open("quiz_bank.json", "r", encoding="utf-8") as f:
            banca_completa = json.load(f)
            
        if not banca_completa:
            raise HTTPException(status_code=404, detail="Banca de întrebări este goală.")
            
        # Extragem maxim 5 întrebări aleatoare, exact ca în Streamlit
        numar_intrebari = min(5, len(banca_completa))
        intrebari_alese = random.sample(banca_completa, numar_intrebari)
        
        return {"quiz": intrebari_alese}
        
    except FileNotFoundError:
        # Dacă nu există fișierul, înseamnă că nu ai încărcat niciun curs cu Agentul 1 încă
        raise HTTPException(status_code=404, detail="Fișierul quiz_bank.json nu a fost găsit. Ai încărcat materia?")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
def clean_romanian_pdf_text(text):
    replacements = {
        "s,i": "și", "t,i": "ți", "s,": "ș", "t,": "ț",
        "S,": "Ș", "T,": "Ț", "ˆın": "în", "ˆı": "î",
        "˘a": "ă", "˘A": "Ă", "ˆA": "Â", "ˆa": "â"
    }
    for bad_char, good_char in replacements.items():
        text = text.replace(bad_char, good_char)
    return text

async def generate_quiz_from_text(text: str, topic_name: str):
    global llm 
    
    try:
        # Nu mai tăiem textul! Îi dăm să citească tot documentul.
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
        
        # Trimitem textul întreg la AI
        response = llm.invoke(prompt)
        res_text = response.content
        
        if isinstance(res_text, list): 
            res_text = res_text[0].get('text', str(res_text))
            
        # Curățăm formatul exact ca în varianta ta stabilă
        json_str = res_text.replace("```json", "").replace("```", "").strip()
        
        start_idx = json_str.find('[')
        end_idx = json_str.rfind(']') + 1
        
        if start_idx != -1 and end_idx != -1:
            json_str = json_str[start_idx:end_idx]
            
        intrebari_generate = json.loads(json_str)
        
        # Amestecăm variantele
        for q in intrebari_generate:
            text_corect = q["options"][q["correct_answer_index"]]
            import random
            random.shuffle(q["options"])
            q["correct_answer_index"] = q["options"].index(text_corect)
            
        return intrebari_generate
        
    except Exception as e:
        print(f"⚠️ Eroare Agent 3 (Generare Quiz Dinamic): {e}")
        return []

@app.post("/upload")
async def incarca_document(file: UploadFile = File(...)):
    global vector_db
    try:
        # Citim conținutul fișierului
        content = await file.read()
        text = ""

        # Extragem textul în funcție de extensie
        if file.filename.endswith(".pdf"):
            doc = fitz.open(stream=content, filetype="pdf")
            for page in doc:
                text += page.get_text()
        elif file.filename.endswith(".txt"):
            text = content.decode("utf-8")
        else:
            return {"success": False, "message": "Format nesuportat. Te rog încarcă PDF sau TXT."}

        # Curățăm diacriticele
        text = clean_romanian_pdf_text(text)

        if not text.strip():
            return {"success": False, "message": "Fișierul pare să fie gol sau este o imagine scanată fără text."}

        # Tăiem textul în bucăți (chunking)
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = splitter.split_text(text)
        
        # Creăm documentele pentru LangChain
        docs = [Document(page_content=c, metadata={"source": file.filename}) for c in chunks]

        # Inserăm în baza de date Chroma
        # vector_db a fost inițializat în funcția init_ai()
        global vector_db 
        vector_db.add_documents(docs)

        print("🧠 Agentul 3 generează întrebările...")
        topic_name = file.filename.rsplit('.', 1)[0] # Scoatem .pdf din nume
        
        # Chemăm funcția de mai sus
        new_questions = await generate_quiz_from_text(text, topic_name)
        
        mesaj_quiz = "Însă nu s-au putut genera întrebări noi."
        
        if new_questions:
            quiz_file = "quiz_bank.json"
            current_bank = []
            
            # Citim întrebările vechi (dacă există)
            if os.path.exists(quiz_file):
                try:
                    with open(quiz_file, 'r', encoding='utf-8') as f:
                        current_bank = json.load(f)
                except:
                    pass
                    
            # Le adăugăm pe cele noi
            current_bank.extend(new_questions)
            
            # Salvăm noul fișier
            with open(quiz_file, 'w', encoding='utf-8') as f:
                json.dump(current_bank, f, indent=2, ensure_ascii=False)
                
            mesaj_quiz = f"Și am generat {len(new_questions)} întrebări grilă pentru teste!"

        return {"success": True, "message": f"Documentul '{file.filename}' a fost procesat și asimilat cu succes!"}

    except Exception as e:
        print(f"Eroare la procesarea fișierului: {e}")
        return {"success": False, "message": f"Eroare internă: {str(e)}"}

class VideoQuery(BaseModel):
    query: str

@app.post("/search-video")
async def search_video(request: VideoQuery):
    global llm
    try:
        user_query = request.query
        search_term = user_query # Setăm căutarea implicită ca fiind exact ce a scris utilizatorul
        folosit_ai = False

        print(f"🎬 Solicitare video pentru: {user_query}")

        # --- 1. AGENT 4: ÎNCERCĂM OPTIMIZAREA CU AI ---
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
                print(f"🧠 Agent 4 a optimizat căutarea în: {search_term}")
            except Exception as ai_err:
                # DACĂ AI-UL DĂ EROARE (EX: 429 LIMITA ATINSĂ), TRECEM MAI DEPARTE FĂRĂ EL
                print(f"⚠️ AI indisponibil (Limita atinsă?). Trecem pe Planul B (Căutare directă). Eroare: {ai_err}")

        # --- 2. CĂUTAREA EFECTIVĂ PE YOUTUBE (Cu sau fără AI) ---
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

        # Returnăm și un mesaj ca să știe React dacă a fost ajutat de AI sau nu
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
        if llm is None or vector_db is None:
            return {"score": 0, "reason": "Sistemul AI sau baza de date nu este activă."}

        # 1. Recuperăm din nou contextul pentru a-l compara cu răspunsul
        docs = vector_db.similarity_search(request.query, k=3)
        context = "\n\n".join([d.page_content for d in docs])
        
        # 2. Agentul 5 evaluează
        prompt = f"""
        Ești un auditor extrem de strict. Compară RĂSPUNSUL generat de AI cu CONTEXTUL extras din document.
        Dacă AI-ul a folosit informații inventate (halucinații) care nu se regăsesc în context, scorul scade dramatic.
        
        CONTEXT EXTRAS: {context}
        ÎNTREBARE: {request.query}
        RĂSPUNS AI: {request.answer}
        
        Returnează DOAR un format JSON valid, exact cu această structură:
        {{
            "score": 100, 
            "reason": "Scurtă explicație a scorului (ex: Răspunsul este perfect susținut de context)."
        }}
        """
        
        response = llm.invoke(prompt)
        res_text = response.content.replace("```json", "").replace("```", "").strip()
        
        start_idx = res_text.find('{')
        end_idx = res_text.rfind('}') + 1
        if start_idx != -1 and end_idx != -1:
            res_text = res_text[start_idx:end_idx]
            
        import json
        data = json.loads(res_text)
        return {"score": data.get("score", 0), "reason": data.get("reason", "Evaluare completă.")}
        
    except Exception as e:
        print(f"⚠️ Eroare Fact-Checker: {e}")
        return {"score": None, "reason": "Nu s-a putut verifica acuratețea."}