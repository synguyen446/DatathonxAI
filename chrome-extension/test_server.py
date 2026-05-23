from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import random, math, os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

class UrlRequest(BaseModel):
    image_url: str

def generate_heatmap(label: str, size: int = 8):
    grid = [[0.0] * size for _ in range(size)]

    if label == "FAKE":
        # Place 2-4 Gaussian blobs to simulate AI artifact hotspots
        for _ in range(random.randint(2, 4)):
            cx = random.uniform(1, size - 2)
            cy = random.uniform(1, size - 2)
            intensity = random.uniform(0.65, 1.0)
            radius = random.uniform(1.2, 2.5)
            for i in range(size):
                for j in range(size):
                    d = math.sqrt((i - cy) ** 2 + (j - cx) ** 2)
                    grid[i][j] = min(1.0, grid[i][j] + intensity * math.exp(-d**2 / (2 * radius**2)))
        # Light noise floor
        for i in range(size):
            for j in range(size):
                grid[i][j] = min(1.0, grid[i][j] + random.uniform(0, 0.15))
    else:
        # REAL: low uniform noise, no hotspots
        for i in range(size):
            for j in range(size):
                grid[i][j] = random.uniform(0.0, 0.2)

    return [[round(v, 3) for v in row] for row in grid]

def mock_predict(name=""):
    label = random.choice(["REAL", "FAKE"])
    confidence = round(random.uniform(0.72, 0.99), 2)
    heatmap = generate_heatmap(label)
    print(f"[predict] {label} ({confidence*100:.0f}%) — {name[:60]}")
    return {"label": label, "confidence": confidence, "heatmap": heatmap}

@app.post("/predict")
def predict_url(req: UrlRequest):
    return mock_predict(req.image_url)

@app.post("/predict-upload")
async def predict_upload(file: UploadFile = File(...)):
    return mock_predict(file.filename)

# Serve the website
website_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(website_dir):
    app.mount("/", StaticFiles(directory=website_dir, html=True), name="website")
