import os
import json
import time
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

SOURCE_DIR = "biblioteca_txt"
OUTPUT_FILE = "quiz_bank.json"
MODEL_NAME = "models/gemini-1.5-flash-latest" # Recomandat sa folosesti versiunea stabila

def clean_json_string(text):
    text = text.replace("```json", "").replace("```", "").strip()
    return text

def generate_questions_for_text(text, topic_filename, num_questions=5):
    print(f"🎲 Generare întrebări pentru: {topic_filename}...")
    model = genai.GenerativeModel(MODEL_NAME)
    
    prompt = rf"""
    Ești un profesor expert de informatică. Pe baza textului de mai jos, generează {num_questions} întrebări tip grilă (multiple choice).
    REGULI: DOAR JSON valid, fără LaTeX, fără "Conform textului".
    
    TEXT SURSĂ: {text[:10000]}
    
    FORMAT JSON:
    [
      {{
        "topic": "{topic_filename}",
        "question_text": "...",
        "options": ["A", "B", "C", "D"],
        "correct_answer_index": 0
      }}
    ]
    """
    
    try:
        response = model.generate_content(prompt)
        cleaned_text = clean_json_string(response.text)
        return json.loads(cleaned_text)
    except Exception as e:
        print(f"⚠️ Eroare la {topic_filename}: {e}")
        return []

def main():
    # 1. Încărcăm progresul anterior dacă există
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
            all_questions = json.load(f)
    else:
        all_questions = []

    # Identificăm capitolele deja procesate
    processed_topics = set(q["topic"] for q in all_questions)
    
    if not os.path.exists(SOURCE_DIR):
        print(f"Eroare: Nu găsesc folderul {SOURCE_DIR}")
        return

    # 2. Iterăm prin fișiere
    for filename in os.listdir(SOURCE_DIR):
        if filename.endswith(".txt"):
            topic_name = filename.replace(".txt", "") 
            
            # SĂRIM peste fișier dacă avem deja întrebări pentru el
            if topic_name in processed_topics:
                print(f"⏭️ Sărim peste '{topic_name}' (deja procesat).")
                continue
            
            file_path = os.path.join(SOURCE_DIR, filename)
            with open(file_path, 'r', encoding='utf-8') as f:
                text = f.read()
            
            if len(text) < 50: continue
            
            questions = generate_questions_for_text(text, topic_name)
            
            if questions:
                all_questions.extend(questions)
                
                # 3. SALVĂM IMEDIAT (în interiorul buclei)
                with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
                    json.dump(all_questions, f, indent=2, ensure_ascii=False)
                print(f"  ✅ Progres salvat pentru '{topic_name}'")
            
            # Pauză mai mare pentru a evita blocarea API-ului (Rate Limit)
            time.sleep(10) 

    print("\n🚀 SUCCES! Toate fișierele disponibile au fost procesate.")

if __name__ == "__main__":
    main()