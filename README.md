# CivicLens — AI Triage for Citizen Complaints

**"Your Voice. Our Action. Smarter Cities."**

CivicLens is an end-to-end smart civic complaint management platform built with React, TypeScript, Tailwind CSS, Three.js, Express, SQLite (`node:sqlite`), and Google Gemini AI (`@google/genai`).

---

## Core Architecture & Features

- **Zero-Login Citizen Access (Accessible in Every Language):** Citizens report issues directly in any language (text or browser voice dictation) and track tickets or explore the live 3D Smart Grid without creating an account. Gemini AI auto-detects the language, translates to English for municipal crews, and generates a localized confirmation reply (`citizen_reply_localized`).
- **8-Language UI Switcher:** Instant switching across English, Hindi, Kannada, Telugu, Tamil, Spanish, French, and Arabic (with automatic RTL layout).
- **Suspected Duplicate Detection:** Automatically detects when multiple citizens report the same issue at the same ward/landmark and flags `is_suspected_duplicate` + increases `community_impact_count`, allowing municipal officers to confirm or dismiss duplicate cluster links.
- **Transparent Multi-Factor Priority Scoring (0–100):**
  - **AI Severity (0–35 pts):** Gemini multimodal inspection of text & site photos (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`).
  - **Critical Area (0–25 pts):** Proximity to schools, colleges, hospitals, transit hubs, substations, or waterworks.
  - **People Affected (0–20 pts):** Estimated impacted population + duplicate cluster size.
  - **Hours Affected (0–20 pts):** Elapsed unresolved hours since submission.
- **Live 3D Smart City Priority Grid (`Three.js`):** Interactive 3D city grid showing color-coded priority beacons (`#F43F5E` Critical, `#F97316` High, `#FBBF24` Medium, `#34D399` Low) and orbital Violet (`#818CF8`) halos for duplicate clusters, with smooth damped Zoom In, Zoom Out, Reset, and Ward Fly-To animations.
- **Officer-Only Authentication Console:** Municipal Officers sign in with secure `scrypt`-hashed credentials and HMAC-SHA256 JWT sessions (`HttpOnly; SameSite=None; Secure; Partitioned`) to manage the priority queue, review suspected duplicates, view Recharts analytics, and query the Gemini AI Assistant.

---

## Demo Officer Credentials

- **Officer Email:** `officer@civiclens.demo`
- **Password:** `Officer@2026`
- Or click **"Sign In →"** on the Demo Officer card inside the Officer Sign-In modal.

---

## Local Setup & Run

### 1. Environment Variables
Create a `.env` file (or configure in AI Studio Secrets):
```env
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
JWT_SECRET="replace-with-a-random-32-char-secret"
OFFICER_INVITE_CODE="CIVICLENS-OFFICER-2026"
```

### 2. Install Dependencies & Start Server

**macOS / Linux:**
```bash
npm install
npm run dev
```

**Windows (PowerShell):**
```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.
