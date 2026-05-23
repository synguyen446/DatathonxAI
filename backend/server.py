import json
from io import BytesIO
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel
import requests
import torch
import torch.nn.functional as F
from torch import nn
from torchvision import models, transforms

try:
    from ultralytics import YOLO
    yolo_detector = YOLO("yolo11n.pt")  # Using the newest YOLO11 Nano model!
except ImportError:
    yolo_detector = None


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
CHECKPOINT_PATH = BASE_DIR / "model" / "best_model.pth"
CONFIG_PATH = BASE_DIR / "resnet18_classification_config.json"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

CLASS_NAMES = ["FAKE", "REAL"]
FAKE_INDEX = CLASS_NAMES.index("FAKE")
REAL_INDEX = CLASS_NAMES.index("REAL")
IMAGE_SIZE = 32

app = FastAPI(title="AI Image Detector Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class UrlRequest(BaseModel):
    image_url: str


def build_model() -> nn.Module:
    model = models.resnet18(weights=None)
    # This MUST be kernel_size=3 to match your current [64, 3, 3, 3] checkpoint
    model.conv1 = nn.Conv2d(
        in_channels=3,
        out_channels=64,
        kernel_size=3,
        stride=1,
        padding=1,
        bias=False,
    )
    model.maxpool = nn.Identity()
    model.fc = nn.Sequential(
        nn.Dropout(0.2),
        nn.Linear(model.fc.in_features, len(CLASS_NAMES)),
    )
    return model


transform = transforms.Compose(
    [
        transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.4914, 0.4822, 0.4465],
            std=[0.2023, 0.1994, 0.2010],
        ),
    ]
)

# New transform to look at raw pixel data without resizing blur
patch_transform = transforms.Compose(
    [
        transforms.CenterCrop(IMAGE_SIZE),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.4914, 0.4822, 0.4465], std=[0.2023, 0.1994, 0.2010]),
    ]
)

# Dynamically load the mathematically optimal threshold if it exists
OPTIMAL_THRESHOLD = 0.60
if CONFIG_PATH.exists():
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            config_data = json.load(f)
            if "fake_threshold" in config_data:
                OPTIMAL_THRESHOLD = float(config_data["fake_threshold"])
    except Exception as e:
        print(f"Warning: Could not load config threshold, using default. {e}")

model = build_model().to(DEVICE)
model_lock = Lock()


def load_checkpoint() -> bool:
    if not CHECKPOINT_PATH.exists():
        return False

    state_dict = torch.load(CHECKPOINT_PATH, map_location=DEVICE)
    model.load_state_dict(state_dict, strict=True)
    return True


checkpoint_loaded = load_checkpoint()
model.eval()


def read_image_bytes(data: bytes) -> Image.Image:
    try:
        return Image.open(BytesIO(data)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="Input is not a valid image") from exc


def download_image(url: str) -> Image.Image:
    if not url.lower().startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="image_url must start with http or https")

    try:
        response = requests.get(
            url,
            timeout=10,
            headers={"User-Agent": "AIImageDetector/1.0"},
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=400, detail=f"Could not download image: {exc}") from exc

    return read_image_bytes(response.content)


def grad_cam(image_tensor: torch.Tensor, class_index: int) -> list[list[float]]:
    activations = None
    gradients = None

    def forward_hook(_module, _inputs, output):
        nonlocal activations
        activations = output

    def backward_hook(_module, _grad_input, grad_output):
        nonlocal gradients
        gradients = grad_output[0]

    target_layer = model.layer4[-1]
    forward_handle = target_layer.register_forward_hook(forward_hook)
    backward_handle = target_layer.register_full_backward_hook(backward_hook)

    try:
        logits = model(image_tensor)
        score = logits[:, class_index].sum()
        model.zero_grad(set_to_none=True)
        score.backward()

        if activations is None or gradients is None:
            return [[0.0] * 8 for _ in range(8)]

        weights = gradients.mean(dim=(2, 3), keepdim=True)
        cam = (weights * activations).sum(dim=1, keepdim=True)
        cam = F.relu(cam)
        cam = F.interpolate(cam, size=(8, 8), mode="bilinear", align_corners=False)
        cam = cam[0, 0]
        cam -= cam.min()
        max_value = cam.max()
        if max_value > 0:
            cam /= max_value

        return [[round(float(value), 3) for value in row] for row in cam.detach().cpu()]
    finally:
        forward_handle.remove()
        backward_handle.remove()


def predict_image(image: Image.Image) -> dict:
    # 1. Determine views (Original + YOLO Crop)
    views = [image]
    if yolo_detector is not None:
        results = yolo_detector(image, verbose=False)
        detected_boxes = []
        for result in results:
            for box in result.boxes.xyxy:
                x1, y1, x2, y2 = map(int, box.tolist())
                detected_boxes.append((x1, y1, x2, y2))
                
        # Check up to the 5 largest detected objects in the image
        detected_boxes = sorted(detected_boxes, key=lambda b: (b[2]-b[0])*(b[3]-b[1]), reverse=True)[:5]
        
        for box in detected_boxes:
            views.append(image.crop(box))

    # We use the original image (views[0]) for the main tensor and Grad-CAM so the whole image is highlighted
    primary_view = views[0]
    image_tensor = transform(primary_view).unsqueeze(0).to(DEVICE)
    image_tensor.requires_grad_(True) 

    fake_scores = []
    with model_lock:
        for view in views:
            # View 1: Resized to 32x32 (Global context)
            view_tensor = transform(view).unsqueeze(0).to(DEVICE)
            
            # View 2: Raw 32x32 center patch (Local texture context) - only if image is big enough
            if view.width > IMAGE_SIZE and view.height > IMAGE_SIZE:
                view_patch = patch_transform(view).unsqueeze(0).to(DEVICE)
                batch = torch.cat([view_tensor, view_patch])
            else:
                batch = view_tensor
            
            # TTA: Horizontal Flips
            batch_flipped = torch.flip(batch, [3])
            full_batch = torch.cat([batch, batch_flipped])
            
            with torch.no_grad():
                logits = model(full_batch)
                probs = torch.softmax(logits, dim=1)
                # Extract the FAKE probabilities for all versions of this view
                fake_scores.extend(probs[:, FAKE_INDEX].tolist())

        # ACCURACY IMPROVEMENT: Average the top 5 highest fake scores.
        # This requires more consistency than top 3, smoothing out noisy camera patches 
        # while still being highly sensitive to genuine AI artifacts.
        # detecting AI artifacts across multiple views/flips.
        fake_scores.sort(reverse=True)
        top_k = min(5, len(fake_scores))
        fake_probability = sum(fake_scores[:top_k]) / top_k if fake_scores else 0.0
        
        # Use the objectively calculated threshold (or fallback default)
        classification_threshold = OPTIMAL_THRESHOLD
        class_index = FAKE_INDEX if fake_probability >= classification_threshold else REAL_INDEX
        confidence = fake_probability if class_index == FAKE_INDEX else 1.0 - fake_probability
        
        # Run Grad-CAM
        heatmap = grad_cam(image_tensor, class_index)

    return {
        "label": CLASS_NAMES[class_index],
        "confidence": round(confidence, 4),
        "fake_probability": round(fake_probability, 4),
        "classification_threshold": classification_threshold,
        "heatmap": heatmap,
        "model": "resnet18",
        "checkpoint_loaded": checkpoint_loaded,
    }


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": "resnet18",
        "device": str(DEVICE),
        "checkpoint_loaded": checkpoint_loaded,
        "checkpoint_path": str(CHECKPOINT_PATH),
        "class_names": CLASS_NAMES,
        "image_size": IMAGE_SIZE,
    }


@app.post("/predict")
def predict_url(req: UrlRequest):
    return predict_image(download_image(req.image_url))


@app.post("/predict-upload")
async def predict_upload(file: UploadFile = File(...)):
    image = read_image_bytes(await file.read())
    return predict_image(image)


frontend_dir = PROJECT_DIR / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
