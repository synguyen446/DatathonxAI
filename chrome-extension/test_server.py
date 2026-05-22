from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import random, os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

class UrlRequest(BaseModel):
    image_url: str

def mock_predict():
    label = random.choice(["REAL", "FAKE"])
    confidence = round(random.uniform(0.70, 0.99), 2)
    return {"label": label, "confidence": confidence}

@app.post("/predict")
def predict_url(req: UrlRequest):
    result = mock_predict()
    print(f"[URL]    {result['label']} ({result['confidence']*100:.0f}%) — {req.image_url[:60]}")
    return result

@app.post("/predict-upload")
async def predict_upload(file: UploadFile = File(...)):
    result = mock_predict()
    print(f"[UPLOAD] {result['label']} ({result['confidence']*100:.0f}%) — {file.filename}")
    return result

# Serve the website at http://localhost:8000/
website_dir = os.path.join(os.path.dirname(__file__), "..", "website")
if os.path.exists(website_dir):
    app.mount("/", StaticFiles(directory=website_dir, html=True), name="website")
