import os
import sys
import threading
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional

from langchain_core.prompts import ChatPromptTemplate

app = FastAPI(title="IPC Legal RAG Assistant", description="Backend API & Frontend Server")

# Enable CORS for local development flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables for RAG components
embeddings = None
vector_store = None
prompt_template = None
llm = None
document_chain = None

# RAG Lifecycle State
rag_status = "idle"  # idle, initializing, ready, error
rag_error_detail = ""
status_lock = threading.Lock()

# Startup event: define the prompt template (fast)
@app.on_event("startup")
def startup_event():
    global prompt_template
    prompt_template = ChatPromptTemplate.from_template(
        """You are an AI legal assistant for the Indian Penal Code.

RULES:
1. Answer clearly, professionally, and accurately.
2. Mention specific IPC section numbers whenever possible.
3. Explain the legal concepts in simple, accessible language.
4. Keep answers concise but comprehensive enough to cover the core legal query.
5. ONLY use the provided context.
6. If the answer cannot be found or inferred from the context, say exactly:
   "Not found in IPC"

<context>
{context}
</context>

Question:
{input}

Professional Legal Response:"""
    )

def background_initialize_rag(api_key: str):
    global embeddings, vector_store, llm, document_chain, rag_status, rag_error_detail
    
    try:
        # Load heavy dependencies inside the thread to avoid blocking main thread startup
        from langchain_community.vectorstores import FAISS
        from langchain_community.embeddings import HuggingFaceEmbeddings
        from langchain_openai import ChatOpenAI
        from langchain_classic.chains import create_retrieval_chain
        from langchain_classic.chains.combine_documents import create_stuff_documents_chain

        with status_lock:
            rag_status = "initializing"
            
        print("Initializing HuggingFace Embeddings (sentence-transformers/all-MiniLM-L6-v2)...")
        embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
        
        print("Loading local FAISS vector store...")
        vector_store = FAISS.load_local(".", embeddings, allow_dangerous_deserialization=True)
        
        print("Initializing OpenRouter LLM (openai/gpt-4o-mini)...")
        llm = ChatOpenAI(
            model="openai/gpt-4o-mini",
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            temperature=0
        )
        
        document_chain = create_stuff_documents_chain(llm, prompt_template)
        
        with status_lock:
            rag_status = "ready"
        print("RAG components initialized successfully!")
    except Exception as e:
        import traceback
        error_msg = f"Initialization error: {str(e)}\n{traceback.format_exc()}"
        print(error_msg, file=sys.stderr)
        with status_lock:
            rag_status = "error"
            rag_error_detail = str(e)

# Request and Response schemas
class QueryRequest(BaseModel):
    question: str
    k: Optional[int] = 6  # Number of documents to retrieve

class SourceDoc(BaseModel):
    page_content: str
    metadata: dict

class QueryResponse(BaseModel):
    answer: str
    sources: List[SourceDoc]

class StartRequest(BaseModel):
    api_key: str

@app.get("/api/status")
async def get_status():
    return {
        "status": rag_status,
        "detail": rag_error_detail
    }

@app.post("/api/start")
async def start_server(request: StartRequest, background_tasks: BackgroundTasks):
    global rag_status
    if not request.api_key or request.api_key.strip() == "":
        raise HTTPException(status_code=400, detail="API Key is required.")
        
    with status_lock:
        if rag_status == "initializing":
            return {"status": "initializing", "message": "Server is already starting."}
        if rag_status == "ready":
            return {"status": "ready", "message": "Server is already running."}
            
        rag_status = "initializing"
        
    # Start the RAG initialization as a background task
    background_tasks.add_task(background_initialize_rag, request.api_key)
    return {"status": "initializing", "message": "Server initialization started."}

@app.post("/api/query", response_model=QueryResponse)
async def query_rag(request: QueryRequest):
    if rag_status != "ready":
        raise HTTPException(
            status_code=503, 
            detail=f"Server is not ready. Status: {rag_status}. Detail: {rag_error_detail}"
        )
    
    try:
        from langchain_classic.chains import create_retrieval_chain
        
        # Create retriever dynamically based on requested k
        retriever = vector_store.as_retriever(search_kwargs={"k": request.k})
        retrieval_chain = create_retrieval_chain(retriever, document_chain)
        
        # Run query
        response = retrieval_chain.invoke({"input": request.question})
        
        # Format sources
        sources = []
        if "context" in response:
            for doc in response["context"]:
                sources.append(
                    SourceDoc(
                        page_content=doc.page_content,
                        metadata=doc.metadata
                    )
                )
                
        return QueryResponse(
            answer=response.get("answer", "No answer generated."),
            sources=sources
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Serve static files for Frontend
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def get_index():
    index_path = os.path.join("static", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Server is running. Please create static/index.html to view the frontend."}

if __name__ == "__main__":
    import uvicorn
    # Run server on port 8001
    uvicorn.run("app:app", host="0.0.0.0", port=8001, reload=True)
