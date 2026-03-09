import warnings
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI
import getpass

# Suprimăm avertismentele
warnings.filterwarnings("ignore")

DB_DIR = "db_chroma"
EMBEDDING_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
GENERATIVE_MODEL_NAME = "models/gemini-flash-latest" # Folosim cel mai nou
COLLECTION_NAME = "structuri_de_date"

def main():
    # --- 1. SETĂM CHEIA API ---
    try:
        GOOGLE_API_KEY = getpass.getpass("Te rog introdu cheia ta Google AI API: ")
    except Exception as e:
        print(f"Eroare la citirea cheii: {e}")
        return
    if not GOOGLE_API_KEY:
        print("Cheia API este goală. Programul se va opri.")
        return

    # --- 2. ÎNCĂRCĂM UNELTELE LOCALE ---
    print("Se încarcă modelul de embeddings (pentru căutare)...")
    embeddings_model = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL_NAME,
        model_kwargs={'device': 'cpu'}
    )
    
    print("Se încarcă baza de date ChromaDB...")
    vector_store = Chroma(
        persist_directory=DB_DIR, 
        embedding_function=embeddings_model,
        collection_name=COLLECTION_NAME
    )
    retriever = vector_store.as_retriever(search_kwargs={"k": 2})
    print("Baza de date și bibliotecarul sunt gata.")

    # --- 3. ÎNCĂRCĂM MODELUL GENERATIV (Tutorul) ---
    print(f"Se încarcă modelul generativ ({GENERATIVE_MODEL_NAME})...")
    llm = ChatGoogleGenerativeAI(
        model=GENERATIVE_MODEL_NAME, 
        google_api_key=GOOGLE_API_KEY,
        temperature=0.3
    )
    print("Modelul generativ este gata.")

    # --- 4. CREAREA "CONDUCTEI" (RAG CHAIN MODERN) ---
    prompt_template = """
Ești un tutore AI prietenos, specializat în Structuri de Date și Algoritmi.
Răspunde la următoarea întrebare bazându-te EXCLUSIV pe contextul furnizat.
Răspunde clar și la obiect, în limba română.

CONTEXT:
{context}

ÎNTREBARE:
{question}

RĂSPUNS:
"""
    prompt = PromptTemplate(
        template=prompt_template, 
        input_variables=["context", "question"]
    )

    def format_docs(docs):
        return "\n\n".join(doc.page_content for doc in docs)

    # Aici este magia LangChain (LCEL)
    rag_chain = (
        {"context": retriever | format_docs, "question": RunnablePassthrough()}
        | prompt
        | llm
        | StrOutputParser()
    )

    print("--- TUTORELE LANGCHAIN ESTE PREGĂTIT ---")
    print("Acum poți pune întrebări. Scrie 'exit' pentru a ieși.\n")

    # --- 5. BUCLA DE ÎNTREBĂRI ---
    while True:
        query = input("Întrebarea ta: ")
        if query.lower() == 'exit':
            print("La revedere!")
            break
        if not query.strip():
            continue

        print("Tutorele se gândește...")
        try:
            answer = rag_chain.invoke(query)
            print("\n--- Răspunsul Tutorului ---")
            print(answer)
            print("---------------------------\n")
        except Exception as e:
            print(f"A apărut o eroare: {e}")

if __name__ == "__main__":
    main()