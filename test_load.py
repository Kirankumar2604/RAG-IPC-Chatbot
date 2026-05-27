import os
import sys

api_key = os.environ.get("OPENROUTER_API_KEY")
if not api_key:
    print("Set OPENROUTER_API_KEY before running this test.")
    sys.exit(1)

try:
    from langchain_community.vectorstores import FAISS
    from langchain_community.embeddings import HuggingFaceEmbeddings
    from langchain_openai import ChatOpenAI
    from langchain.chains import create_retrieval_chain
    from langchain.chains.combine_documents import create_stuff_documents_chain
    from langchain_core.prompts import ChatPromptTemplate

    print("Imports successful!")

    print("Loading HuggingFace Embeddings...")
    embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

    print("Loading FAISS local store from current directory...")
    # FAISS files index.faiss and index.pkl are in the current directory
    vector_store = FAISS.load_local(".", embeddings, allow_dangerous_deserialization=True)
    print("FAISS index loaded successfully!")

    print("Testing retriever...")
    retriever = vector_store.as_retriever(search_kwargs={"k": 2})
    docs = retriever.invoke("What is the punishment for murder?")
    print(f"Retrieved {len(docs)} documents. First document snippet:")
    if docs:
        print(docs[0].page_content[:200])

except Exception as e:
    print(f"Error occurred: {e}")
    sys.exit(1)
