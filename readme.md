# Truth Lens 🔍

**Your personal guard against online scams.**

Truth Lens is a tool designed to detect whether images are real or AI-generated to protect you from misinformation and fake content online. This repository contains the full stack: a local web application, a Chrome extension, a FastAPI backend, and the machine learning model.

---

## Frontend

The client side consists of two main components that communicate with the local backend to analyze images and display heatmaps of manipulated regions.

### 1. Local Web App (`frontend/`)
A sleek, modern web interface that allows users to:
- Paste image URLs for quick analysis.
- Upload up to 10 images at once.
- View confidence scores and visual heatmaps highlighting fake/real image regions.

**To view:** The web app is automatically served by the FastAPI backend at `http://localhost:8001`.

### 2. Chrome Extension (`chrome-extension/`)
A browser extension that integrates seamlessly into your web browsing experience.
- **Right-Click Scan:** Right-click any image and select "Check if AI Generated".
- **Full Page Scan:** Right-click anywhere on a page to scan and highlight all images (Green = Real, Red = AI).

**To install:** Load the `chrome-extension` folder as an "unpacked extension" in Chrome via `chrome://extensions/`.

---

## Backend (`backend/`)

The backend is powered by **FastAPI** and **PyTorch**, serving both the API endpoints and the frontend static files.

### Key Features:
- **FastAPI Server:** High-performance async API server.
- **YOLO11 Nano & ResNet18 Integration:** Uses object detection to crop subjects, native patches, and a ResNet18 classifier to determine authenticity.
- **Grad-CAM Heatmaps:** Generates visual explanations (heatmaps) of the model's predictions.
- **Multi-view Patch Sampling:** Samples native-resolution 32x32 patches across the image (corners, center, random) to catch localized AI artifacts that get lost in downscaling.

### Endpoints:
- `GET /health` - Check the server status, device (CPU/GPU), and model checkpoint.
- `POST /predict` - Analyze an image from a provided URL.
- `POST /predict-upload` - Analyze an uploaded image file (multipart/form-data).

**To start the backend:**
```bash
cd backend
uvicorn server:app --port 8001
```

---

## Team Members email:
- anhnguyenphi2501@gmail.com
- nsyn1312@gmail.com
- shawnlin26@gmail.com

---
