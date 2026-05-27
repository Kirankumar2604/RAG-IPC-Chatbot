# IPC Legal RAG Assistant

A FastAPI-based retrieval-augmented generation app for answering questions about the Indian Penal Code. The backend loads a local FAISS index, uses Hugging Face embeddings for retrieval, and sends the retrieved context to an OpenRouter model through LangChain. A simple browser UI in `static/` handles chat, API key entry, and source display.

## What this project does

- Serves a FastAPI backend from `app.py`
- Loads the local FAISS index from `index.faiss` and `index.pkl`
- Uses `sentence-transformers/all-MiniLM-L6-v2` embeddings for retrieval
- Uses OpenRouter with `openai/gpt-4o-mini` for responses
- Serves a frontend from `static/index.html`, `static/app.js`, and `static/style.css`
- Returns answer text plus source documents for each query

## Project Structure

- `app.py` - FastAPI server, startup flow, and `/api/*` routes
- `static/` - Browser frontend assets
- `data/Indian_Penal_Code.pdf` - Source document used to build the index
- `index.faiss` and `index.pkl` - Prebuilt FAISS vector store files
- `test_load.py` - Local script to verify the FAISS index and dependencies load correctly
- `artifacts/` - Supporting output files

## Setup

### 1. Create and activate a virtual environment

```bash
python3 -m venv venv
source venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Start the app

```bash
python app.py
```

The server runs on `http://localhost:8001`.

### 4. Open the UI

Open `http://localhost:8001` in your browser.

### 5. Add your OpenRouter API key

Paste your OpenRouter API key into the sidebar and click **Start Server**. The frontend sends the key to the backend, which then loads the embeddings and FAISS index in the background.

## Optional: Test the FAISS loader

Set your OpenRouter key in the environment and run the check script:

```bash
export OPENROUTER_API_KEY="your_key_here"
python test_load.py
```

## API Endpoints

- `GET /api/status` - Returns the current RAG startup status
- `POST /api/start` - Starts the backend RAG initialization with an OpenRouter key
- `POST /api/query` - Sends a question and returns the answer plus source documents

## Notes

- Do not commit your API key.
- The FAISS index files must remain in the project root for the app to load correctly.
- If you rebuild the index later, replace both `index.faiss` and `index.pkl` together.