import os
from fastapi import FastAPI
from fastapi import Form
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
from supabase import create_client, Client
from langchain_community.vectorstores import SupabaseVectorStore
import edge_tts
import uuid
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List
import json
import json
import re
import requests
from pydantic import BaseModel
import base64

from langchain_classic.chains import RetrievalQA
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

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

# Variabile globale pentru instantierea componentelor AI
qa_chain = None
vector_db = None
llm = None
def init_ai():
    global qa_chain, vector_db, llm
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

@app.post("/chat")
async def chat_cu_ai(mesaj: Mesaj):
    global vector_db, qa_chain # Presupunem că ai acces la vector_db aici
    
    if qa_chain is None:
        return StreamingResponse(iter(["AI-ul nu este pornit."]), media_type="text/plain")

    async def generator():
        try:
            # Preluare documente sursa pentru referinte (k=3)
            docs = vector_db.similarity_search(mesaj.text, k=3)
            surse_unice = list(set([d.metadata.get("source", "Sursă necunoscută") for d in docs]))
            
            # Transmitere metadata surse la inceputul stream-ului
            yield f"SOURCES:{','.join(surse_unice)}|END_SOURCES|"

            # Transmitere raspuns LLM generat asincron (streaming)
            async for chunk in qa_chain.astream({"query": mesaj.text}):
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

@app.post("/upload")
async def incarca_document(
    file: UploadFile = File(...), 
    user_id: str = Form(...)
):
    global vector_db 
    try:
        content = await file.read()
        text = ""

        # Extractie text pe baza extensiei fisierului
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

        # Segmentare document pentru encodare vectoriala
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = splitter.split_text(text)
        
        # Atribuire metadata (fisier sursa si user_id)
        docs = [
            Document(
                page_content=c, 
                metadata={"source": file.filename, "user_id": user_id} 
            ) for c in chunks
        ]

        # Insertie embedinguri in Supabase
        vector_db.add_documents(docs)

        # Apelare pipeline LLM pentru extragere test
        topic_name = file.filename.rsplit('.', 1)[0]
        new_questions = await generate_quiz_from_text(text, topic_name)
        
        # Persistenta testului in baza de date
        if new_questions:
            try:
                supabase.table("quizzes").insert({
                    "user_id": user_id,
                    "course_name": topic_name,
                    "questions": new_questions
                }).execute()
                
                mesaj_quiz = f"Am generat {len(new_questions)} întrebări salvate în contul tău!"
            except Exception as e:
                print(f"Eroare la salvarea quiz-ului în DB: {e}")
                mesaj_quiz = "Document asimilat, dar testul nu a putut fi salvat în DB."
        else:
            mesaj_quiz = "Nu s-au putut genera întrebări noi."

        return {
            "success": True, 
            "message": f"Documentul '{file.filename}' a fost asimilat. {mesaj_quiz}"
        }

    except Exception as e:
        print(f"Eroare gravă la upload: {e}")
        return {"success": False, "message": f"Eroare: {str(e)}"}

class VideoQuery(BaseModel):
    query: str

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
    return {
        "is_accurate": True, 
        "score": 100, 
        "explanation": "Fact-checking dezactivat temporar pentru teste. (Resurse salvate!)"
    }
    # try:
    #     if llm is None or vector_db is None:
    #         return {"score": 0, "reason": "Sistemul AI sau baza de date nu este activă."}

    #     # 1. Recuperăm din nou contextul pentru a-l compara cu răspunsul
    #     docs = vector_db.similarity_search(request.query, k=3)
    #     context = "\n\n".join([d.page_content for d in docs])
        
    #     # 2. Agentul 5 evaluează
    #     prompt = f"""
    #     Ești un auditor extrem de strict. Compară RĂSPUNSUL generat de AI cu CONTEXTUL extras din document.
    #     Dacă AI-ul a folosit informații inventate (halucinații) care nu se regăsesc în context, scorul scade dramatic.
        
    #     CONTEXT EXTRAS: {context}
    #     ÎNTREBARE: {request.query}
    #     RĂSPUNS AI: {request.answer}
        
    #     Returnează DOAR un format JSON valid, exact cu această structură:
    #     {{
    #         "score": 100, 
    #         "reason": "Scurtă explicație a scorului (ex: Răspunsul este perfect susținut de context)."
    #     }}
    #     """
        
    #     response = llm.invoke(prompt)
    #     res_text = response.content.replace("```json", "").replace("```", "").strip()
        
    #     start_idx = res_text.find('{')
    #     end_idx = res_text.rfind('}') + 1
    #     if start_idx != -1 and end_idx != -1:
    #         res_text = res_text[start_idx:end_idx]
            
    #     import json
    #     data = json.loads(res_text)
    #     return {"score": data.get("score", 0), "reason": data.get("reason", "Evaluare completă.")}
        
    # except Exception as e:
    #     print(f"⚠️ Eroare Fact-Checker: {e}")
    #     return {"score": None, "reason": "Nu s-a putut verifica acuratețea."}


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
        docs = vector_db.similarity_search(date.subiect, k=5)
        context_text = "\n\n".join([d.page_content for d in docs])
        
        if not context_text.strip():
            print("Avertizare RAG: Nu au fost gasite referinte in documentele utilizatorului.")
            context_text = "Nu s-au găsit informații specifice în cursuri. Te rog să generezi pe baza cunoștințelor tale generale."

        # Faza 2: Constructie si procesare prompt
        prompt_prezentare = f"""
        Acționează ca un profesor universitar de top. Creează o scurtă prezentare interactivă despre: "{date.subiect}".
        
        ESTE VITAL SĂ TE BAZEZI STRICT PE URMĂTOARELE INFORMAȚII EXTRASE DIN CURSURILE STUDENTULUI:
        \"\"\"{context_text}\"\"\"
        
        Reguli pentru partea vizuală:
        Ai la dispoziție DOUĂ unelte vizuale. Alege-o pe cea mai bună pentru fiecare slide:
        1. 'cod_diagrama_mermaid': Folosește-o pentru procese, algoritmi, ierarhii (ex: RAM->Cache->CPU) sau concepte logice.
        2. 'prompt_imagine_en': Folosește-o DOAR pentru structuri fizice, analogii vizuale sau secțiuni transversale. Trebuie să fie o descriere în ENGLEZĂ pentru o ilustrație EDUCAȚIONALĂ curată. NU cere poze generice sci-fi.
        
        Returnează RĂSPUNSUL STRICT ÎN FORMAT JSON:
        {{
          "titlu_curs": "Titlul aici",
          "slide_uri": [
            {{
              "titlu": "Titlu Slide",
              "idei_principale": [
                "Scrie 4 sau 5 idei principale detaliate extrase DIN TEXTUL SURSĂ", 
                "Fiecare idee trebuie să fie o propoziție completă și explicativă"
              ],
              "text_pentru_voce": "Text fluid de explicat pentru vocea AI, bazat STRICT pe textul sursă...",
              "cod_diagrama_mermaid": "graph TD; A-->B; (sau lasă '' dacă folosești imagine)",
              "prompt_imagine_en": "Ex: 'A clean, 3D educational textbook illustration...' (sau lasă '' dacă ai folosit diagrama mermaid)"
            }}
          ]
        }}
        """

        response = llm.invoke(prompt_prezentare)
        
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
        "aspect_ratio": "16:9", 
        "mode": "text-to-image",
        "output_format": "jpeg"
    }
    
    try:
        response = requests.post(invoke_url, headers=headers, json=payload)
        
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

if __name__ == "__main__":
    import uvicorn
    # Initiere server ASGI local in mod dev
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)