# GoRide — Smart Urban Ride Booking and Management System

> **Tagline:** Move Smarter. Ride Better.  
> **Academic Identity:** Software Engineering Academic Project  
> **Current Milestone:** Phase 1 — Project Foundation & UI Design System  

---

## 1. System Overview

GoRide is an urban transit booking and fleet management system built with a clean, decoupled architecture:
- **Frontend Client:** React 18 SPA powered by Vite, Tailwind CSS, and React Router.
- **Backend API:** Node.js Express REST API structured with ES modules.
- **Data Architecture:** Designed for relational MySQL using `mysql2`. Domain tables will be derived from the approved UML class diagram in Phase 2.
- **Zero Legacy Dependencies:** No MongoDB, Mongoose, or Atlas dependencies.
- **Operational Service Territory:** GoRide is explicitly constrained to 6 administrative jurisdictions within the Mumbai Metropolitan Region:
  1. **Mumbai City** (South & Central zones)
  2. **Mumbai Suburban** (Western & Eastern zones)
  3. **Palghar district** (Northern corridor)
  4. **Thane district** (Central urban zone)
  5. **Kalyan-Dombivli** (Eastern municipal zone)
  6. **Navi Mumbai** (Trans-Harbour & industrial zone)
  *(No countrywide or unauthorized operations are claimed).*

---

## 2. Phase 1 Scope & Boundary Restrictions

Phase 1 establishes the clean project foundation, visual design system, routing, and system health telemetry.

### Implemented in Phase 1:
- [x] Clean directory separation (`client`, `server`, `docs`).
- [x] Complete visual design system adhering to the strict color palette (Dark & Light themes).
- [x] Persistent theme toggling (`dark` / `light`) via `localStorage`.
- [x] Client-side routing with React Router for all 8 foundation pages:
  - Landing Page (`/`) with live backend telemetry probe
  - Sign In UI Prototype (`/login`)
  - Registration UI Prototype (`/register`)
  - Rider Booking Workspace Placeholder (`/rider`)
  - Driver Dispatch Console Placeholder (`/driver`)
  - Fleet Admin Console Placeholder (`/admin`)
  - Privacy Policy Placeholder (`/privacy`)
  - Terms & Conditions Placeholder (`/terms`)
  - 404 Route (`*`)
- [x] Backend Express application with centralized error handling, JSON parsers, request validation convention, and CORS.
- [x] Safe MySQL connectivity probe at `GET /api/health` that reports accurate status without crashing if MySQL is unreachable.
- [x] `.env.example` templates and strict `.gitignore` rules preventing secret leaks.
- [x] Academic documentation repository tracker in `docs/README.md`.

### Intentionally Deferred to Phase 2:
- User authentication and session token verification
- Ride booking creation, status lifecycle, and cancellations
- Driver dispatching algorithms and real-time matching
- GPS telemetry and live map integration
- Fare calculation engines and payment processing
- Relational MySQL schema creation (pending approved UML class diagram)

---

## 3. Visual Design System

The application features solid surfaces, restrained borders, and purposeful accentuation:

| Token | Dark Theme | Light Theme | Usage |
| :--- | :--- | :--- | :--- |
| **Background** | `#0B0A0F` | `#F7F5FC` | Canvas background |
| **Card Surfaces** | `#17141E` | `#FFFFFF` | Content cards and panels |
| **Input Surfaces** | `#100E16` | `#FFFFFF` | Form inputs and controls |
| **Secondary Surfaces** | `#17141E` | `#EEEAF7` | Sub-panels and pills |
| **Borders** | `#30283A` | `#E4DFEC` | Card, table, and divider borders |
| **Primary Accent** | `#8B5CF6` | `#7C3AED` | Primary actions and active states |
| **Hover Accent** | `#7C3AED` | `#6D28D9` | Button hover states |
| **Main Text** | `#FFFFFF` | `#17131F` | Primary headings and text |
| **Secondary Text** | `#A9A3B2` | `#6B6475` | Captions, labels, and secondary copy |

*Design Rule Enforced:* No purple gradients, no glowing neon effects, no excessive glassmorphism, no rounded pills everywhere, and no fake statistics or testimonials.

---

## 4. Directory Structure

```
D:\GoRide\
├── .gitignore               # Excludes node_modules, .env, dist, logs
├── README.md                # System documentation and instructions
├── docs/
│   └── README.md            # Academic SRS & UML diagram requirements tracker
├── server/                  # Backend Express REST API
│   ├── .env.example         # Environment template
│   ├── package.json
│   └── src/
│       ├── app.js           # Express app setup and middleware
│       ├── server.js        # Server listener and shutdown handlers
│       ├── config/
│       │   ├── env.js       # Environment configuration with defaults
│       │   └── db.js        # MySQL connection pool and health probe
│       ├── controllers/
│       │   └── healthController.js # Health probe controller
│       ├── middleware/
│       │   ├── errorHandler.js     # Centralized 404 & error handling
│       │   └── validateRequest.js  # Request validation convention
│       ├── routes/
│       │   ├── apiRoutes.js        # Root API router
│       │   └── healthRoutes.js     # /api/health route
│       └── services/
│           └── README.md           # Business services blueprint for Phase 2
└── client/                  # Frontend React SPA
    ├── .env.example         # Client environment template
    ├── index.html           # HTML5 entry with Inter font and SEO tags
    ├── package.json
    ├── postcss.config.js
    ├── tailwind.config.js   # Tailored theme tokens
    ├── vite.config.js       # Vite configuration
    └── src/
        ├── App.jsx          # Route configurations
        ├── main.jsx         # Application entrypoint with ThemeProvider
        ├── index.css        # CSS custom properties and scrollbar styling
        ├── context/
        │   └── ThemeContext.jsx    # Persistent Dark/Light theme state
        ├── components/
        │   ├── common/
        │   │   ├── Badge.jsx
        │   │   ├── Button.jsx
        │   │   ├── Card.jsx
        │   │   ├── EmptyState.jsx
        │   │   ├── Footer.jsx
        │   │   ├── Input.jsx
        │   │   ├── LoadingSpinner.jsx
        │   │   ├── Navbar.jsx
        │   │   ├── StatusNotice.jsx
        │   │   └── ThemeToggle.jsx
        │   └── layout/
        │       ├── MainLayout.jsx       # Public layout with header & footer
        │       └── DashboardLayout.jsx  # Workspace layout with role switcher
        └── pages/
            ├── LandingPage.jsx          # Public introduction & live probe
            ├── LoginPage.jsx            # Sign-in UI prototype
            ├── RegisterPage.jsx         # Registration UI prototype
            ├── RiderDashboardPage.jsx   # Booking workspace placeholder
            ├── DriverDashboardPage.jsx  # Driver console placeholder
            ├── AdminDashboardPage.jsx   # Fleet governance console
            ├── PrivacyPolicyPage.jsx    # Legal review placeholder
            ├── TermsConditionsPage.jsx  # Terms review placeholder
            └── NotFoundPage.jsx         # 404 handler
```

---

## 5. Prerequisites

- **Node.js:** v18.0.0 or later (Tested on Node v24.14.0)
- **npm:** v9.0.0 or later (Tested on npm v11.9.0)
- **MySQL Server:** Required in Phase 2 for persistent data storage. *(Optional in Phase 1; health probe handles absent MySQL safely)*

---

## 6. Installation & Setup

### Step 1: Install Backend Dependencies
```bash
cd D:\GoRide\server
npm install
```

### Step 2: Configure Backend Environment
```bash
# In D:\GoRide\server
copy .env.example .env
```
*(Optionally adjust `PORT`, `DB_USER`, `DB_PASSWORD` in `.env` if local MySQL is installed)*

### Step 3: Install Frontend Dependencies
```bash
cd D:\GoRide\client
npm install
```

### Step 4: Configure Frontend Environment
```bash
# In D:\GoRide\client
copy .env.example .env
```

---

## 7. Running the Application

### Start Backend API Server
```bash
cd D:\GoRide\server
npm run dev
# Or for standard execution:
npm start
```
The server will boot at `http://localhost:5000`.  
Verify the health probe directly in your browser or curl:
```bash
curl http://localhost:5000/api/health
```

### Start Frontend Client
```bash
cd D:\GoRide\client
npm run dev
```
The Vite development server will start at `http://localhost:5173`.

---

## 8. Verification & Test Checklist

| Component | Test Action | Expected Result | Status |
| :--- | :--- | :--- | :--- |
| **Backend Boot** | `node src/server.js` | Server starts on port 5000 without crashing | Verified |
| **Health API** | `GET /api/health` | Returns status 200 with operational metrics | Verified |
| **Database Probe** | `GET /api/health` | Gracefully reports `disconnected` when MySQL server is absent | Verified |
| **Frontend Build** | `npm run build` in client | Produces optimized production bundle in `dist/` | Tested |
| **Theme Switching** | Toggle Dark / Light button | DOM switches `.dark`/`.light` and saves in `localStorage` | Verified |
| **Client Routing** | Navigate all 8 routes | All views render without console errors | Verified |
| **Secrets Protection** | Inspect git status | `.env` files are ignored by version control | Verified |

---

## 9. Next Steps for Phase 2

Before beginning Phase 2, provide the academic reference documents in `docs/`:
1. Software Requirements Specification (SRS)
2. Approved UML Class Diagram
3. Sequence Diagrams (Booking & Settlement)
4. Use Case Diagram
