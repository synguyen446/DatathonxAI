# Truth Lens - Frontend & Chrome Extension

Welcome to the frontend repository for **Truth Lens**, your personal guard against online scams. This project helps detect whether images are real or AI-generated to protect you from misinformation and fake content online.

This folder and its siblings contain two main client-facing components:
1. A **Local Web App** (located here in `frontend/`)
2. A **Chrome Extension** (located in the `chrome-extension/` folder)

---

## 1. Local Web App

The web application provides a sleek, user-friendly interface to upload images or paste image URLs for analysis. It features visual heatmaps that show exactly which parts of an image the AI model flagged as fake or real.

### How to run the Website
The website is automatically served by the FastAPI backend. 
1. Ensure your backend server is running (`uvicorn server:app --port 8001` from the `backend` folder).
2. Open your web browser and navigate to: **http://localhost:8001**
3. You can now paste URLs or upload up to 10 images at once to scan them!

---

## 2. Chrome Extension

The Truth Lens Chrome Extension allows you to analyze images seamlessly while browsing the web. 
- **Right-Click Scan:** Right-click any image and select "Check if AI Generated".
- **Full Page Scan:** Right-click anywhere on a page and select "Scan All Images on Page" to analyze and highlight every image on the site.

### How to install the Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle switch in the top right corner).
3. Click the **Load unpacked** button in the top left.
4. Select the `chrome-extension` folder located in your main project directory.
5. The Truth Lens icon will appear in your browser toolbar! *(Note: Make sure your local backend server is running so the extension can communicate with it to analyze images).*

---
*Powered by a local CNN model and FastAPI backend.*