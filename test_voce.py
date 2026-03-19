import asyncio
import edge_tts

# Textul pe care vrem să-l citească (am pus și semne de punctuație ca să auzi intonația)
TEXTO = "Salut, Gabi! Sunt Alina, asistentul tău virtual bazat pe inteligență artificială. Dacă totul merge bine, ar trebui să sun exact ca un om real. Cum ți se pare vocea mea?"

# Vocea neurală în limba română (poți testa și 'ro-RO-EmilNeural' pentru voce de bărbat)
VOCE = "ro-RO-AlinaNeural" 
FISIER_IESIRE = "test_alina.mp3"

async def genereaza_audio():
    print("⏳ Generăm vocea, te rog așteaptă...")
    comunicare = edge_tts.Communicate(TEXTO, VOCE)
    await comunicare.save(FISIER_IESIRE)
    print(f"✅ Gata! Am salvat fișierul: {FISIER_IESIRE}")

if __name__ == "__main__":
    # edge-tts folosește funcții asincrone, deci avem nevoie de asyncio
    asyncio.run(genereaza_audio())