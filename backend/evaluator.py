import json
import random

# Definim numele fișierelor
PROFILE_FILE = "student_profile.json"
QUIZ_BANK_FILE = "quiz_bank.json"

def load_data(filename):
    """Funcție ajutătoare pentru a încărca un fișier JSON."""
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"EROARE: Fișierul '{filename}' nu a fost găsit.")
        return None
    except json.JSONDecodeError:
        print(f"EROARE: Fișierul '{filename}' nu este un JSON valid.")
        return None

def save_profile(profile_data):
    """Funcție ajutătoare pentru a salva profilul studentului."""
    try:
        with open(PROFILE_FILE, 'w', encoding='utf-8') as f:
            json.dump(profile_data, f, indent=2)
        print("\n[Profilul studentului a fost actualizat.]")
    except Exception as e:
        print(f"EROARE la salvarea profilului: {e}")

def run_evaluation():
    """Funcția principală a Agentului Evaluator."""
    
    # 1. Încărcăm datele
    print("Agentul Evaluator pornește...")
    profile = load_data(PROFILE_FILE)
    quiz_bank = load_data(QUIZ_BANK_FILE)

    if profile is None or quiz_bank is None:
        print("Evaluarea nu poate continua. Verifică fișierele JSON.")
        return

    print(f"Salut, {profile['student_id']}! Să vedem ce știi.")
    
    # 2. Găsim subiectul cu cel mai mic scor
    scores = profile.get("knowledge_scores", {})
    if not scores:
        print("EROARE: Profilul tău nu are definite subiecte (knowledge_scores).")
        return
        
    # Găsește subiectul cu scorul minim
    weakest_topic = min(scores, key=scores.get)
    print(f"Se pare că subiectul cu cel mai mic scor este: '{weakest_topic}'. Hai să testăm asta.\n")
    
    # 3. Selectăm o întrebare pentru acel subiect
    # Filtrăm banca de întrebări doar pentru subiectul slab
    topic_questions = [q for q in quiz_bank if q.get("topic") == weakest_topic]
    
    if not topic_questions:
        print(f"EROARE: Nu am găsit întrebări în 'quiz_bank.json' pentru subiectul '{weakest_topic}'.")
        return

    # Alegem o întrebare la întâmplare din lista filtrată
    question = random.choice(topic_questions)
    
    # 4. Punem întrebarea
    print("--- ÎNTREBARE ---")
    print(question["question_text"])
    print("-------------------")
    
    # Afișăm opțiunile (A, B, C, D)
    options_map = {} # Mapăm 1->A, 2->B etc.
    for i, option in enumerate(question["options"]):
        letter = chr(65 + i) # A, B, C, D...
        options_map[letter] = i # 'A' maps to index 0
        print(f"  {letter}. {option}")
        
    print("-------------------")

    # 5. Obținem și validăm răspunsul
    correct_index = question["correct_answer_index"]
    correct_letter = chr(65 + correct_index) # Răspunsul corect ca literă

    while True:
        user_answer = input(f"Răspunsul tău (A, B, C, D): ").strip().upper()
        if user_answer in options_map:
            break
        else:
            print("Răspuns invalid. Te rog introdu doar litera (ex: 'A').")

    # 6. Evaluăm și actualizăm profilul
    user_index = options_map[user_answer]
    
    if user_index == correct_index:
        print(f"\nCORRECT! 👍 Răspunsul a fost {correct_letter}.")
        # Creștem scorul cu 0.1, dar nu mai mult de 1.0
        new_score = min(scores[weakest_topic] + 0.1, 1.0)
        scores[weakest_topic] = round(new_score, 2)
        print(f"Scorul tău la '{weakest_topic}' a crescut la: {new_score}")
    else:
        print(f"\nGREȘIT. 👎 Răspunsul corect era {correct_letter}.")
        # Scădem scorul cu 0.05, dar nu mai puțin de 0.0
        new_score = max(scores[weakest_topic] - 0.05, 0.0)
        scores[weakest_topic] = round(new_score, 2)
        print(f"Scorul tău la '{weakest_topic}' a scăzut la: {new_score}")
        
    # 7. Salvăm noul profil
    profile["last_test_timestamp"] = "azi" 
    save_profile(profile)

if __name__ == "__main__":
    run_evaluation()