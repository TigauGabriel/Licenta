import os
import shutil
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

SOURCE_DIR = "biblioteca_txt"
DB_DIR = "db_chroma"
MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
COLLECTION_NAME = "structuri_de_date"

def main():
    print("Încep ingerarea... (Varianta LangChain Modernă)")
    
    if os.path.exists(DB_DIR):
        print(f"Șterg baza de date veche din '{DB_DIR}'...")
        shutil.rmtree(DB_DIR)

    print(f"Se încarcă modelul de embeddings '{MODEL_NAME}'...")
    embeddings_model = HuggingFaceEmbeddings(
        model_name=MODEL_NAME,
        model_kwargs={'device': 'cpu'}
    )
    
    print(f"Se încarcă documentele din '{SOURCE_DIR}'...")
    loader = DirectoryLoader(
        SOURCE_DIR, 
        glob="**/*.txt", 
        loader_cls=TextLoader,
        loader_kwargs={"encoding": "utf-8"}
    )
    documents = loader.load()

    if not documents:
        print(f"EROARE: Nu am găsit fișiere .txt în '{SOURCE_DIR}'.")
        return

    print(f"Se sparg {len(documents)} documente în bucăți (chunks)...")
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    chunks = text_splitter.split_documents(documents)

    print(f"Se stochează {len(chunks)} bucăți în ChromaDB...")
    Chroma.from_documents(
        chunks, 
        embeddings_model, 
        persist_directory=DB_DIR,
        collection_name=COLLECTION_NAME
    )
    
    print("\n--- GATA! 🚀 Baza de date LangChain e gata. ---")

if __name__ == "__main__":
    main()