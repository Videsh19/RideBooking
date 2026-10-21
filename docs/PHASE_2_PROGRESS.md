# GoRide — Phase 2 Completion Report: MySQL Integration, Real Road Routing & Ride Booking Management

**Milestone:** Phase 2: MySQL Integration and Ride Booking Management (with Real Road Routing Correction)  
**Project:** GoRide — Smart Urban Ride Booking and Management System  
**Database:** MySQL Community Server 8.0.46 (`goride_db`)  
**Backend:** Node.js + Express (ES Modules)  
**Frontend:** React 18 + Vite + Tailwind CSS  
**Routing Provider:** Road Routing API (OSRM) + OpenStreetMap Geocoding  
**Date:** October 2026  
**Status:** Complete & Verified • Ready for Phase 3 Approval  

---

## 1. Executive Summary & UI Correction Overview

In accordance with architectural review and user direction, the rider booking form was updated to **eliminate fixed territory-to-territory distance estimation** and replace manual territory dropdowns with **location autocomplete, coordinate capture, and real road routing**:

1. **Removed Territory Distance Matrix:** Completely deleted `ZONE_DISTANCE_MATRIX` from [`server/src/services/bookingService.js`](file:///D:/GoRide/server/src/services/bookingService.js). Distance is never calculated from fixed zone-to-zone tables or fictitious matrices.
2. **Location Autocomplete & Coordinate Capture:** Implemented location autocomplete ([`client/src/components/common/LocationSearchInput.jsx`](file:///D:/GoRide/client/src/components/common/LocationSearchInput.jsx)) and endpoint `GET /api/bookings/places?q=...`. Selecting an origin or destination captures exact geographic latitude and longitude.
3. **Real Driving Road Routing:** Road distance and driving duration are calculated using actual coordinates through a road routing API (`ROUTING_API_URL`, OSRM).
4. **Geocoder-Resolved Areas:** Search results come from the configured Photon-compatible geocoder without a Mumbai bounding box or curated coordinate presets. Area labels are taken from geocoder metadata; map pins, road estimates, and bookings use the selected result coordinates. Actual availability depends on the configured geocoder and routing provider coverage.
5. **Dynamic Fare Calculation:** Fare is computed dynamically whenever pickup, destination, or vehicle tier changes, using the approved fare formula:
   $$\text{Total Fare} = \max(\text{Min Fare}, \text{round}(\text{Base Fare} + \text{Distance}_{\text{km}} \times \text{Rate}_{\text{per km}}))$$
6. **Relational MySQL Persistence:** Full trip telemetry—including pickup/destination addresses, latitude, longitude, actual road distance, driving duration, and total fare—is persisted transactionally in MySQL tables (`locations`, `routes`, `bookings`).
7. **Strict Configuration Requirement:** If `ROUTING_API_URL` is unconfigured, the backend returns HTTP 503 `ROUTING_API_NOT_CONFIGURED` and never falls back to fixed territory matrices.

---

## 2. Relational Schema & MySQL Mapping

The relational schema maps to the approved UML Class Diagram ([`docs/uml/ClassDiagram.pdf`](file:///D:/GoRide/docs/uml/ClassDiagram.pdf)) and SRS REQ-018 to REQ-028:

```
+----------------------------------------------------------------------------------------------------+
|                                         RELATIONAL SCHEMA                                          |
+----------------------------------------------------------------------------------------------------+
|  users                                                                                             |
|    user_id (PK), name, phone_no, email (UQ), password_hash, created_at, updated_at                 |
+----------------------------------------------------------------------------------------------------+
|  locations                                                                                         |
|    location_id (PK), address, service_zone, latitude (DECIMAL 10,7), longitude (DECIMAL 10,7)      |
+----------------------------------------------------------------------------------------------------+
|  routes                                                                                            |
|    route_id (PK), pickup_location_id (FK), dest_location_id (FK), distance_km, estimated_duration |
+----------------------------------------------------------------------------------------------------+
|  bookings                                                                                          |
|    booking_id (PK), user_id (FK), route_id (FK), pickup_address, dest_address,                     |
|    pickup_zone, dest_zone, vehicle_tier, status (ENUM), total_fare, cancellation_reason, ...       |
+----------------------------------------------------------------------------------------------------+
```

---

## 3. Vehicle Tier Rates & Fare Formula

Derived from SRS REQ-020 and REQ-021:

| Vehicle Class | Base Fare (₹) | Rate per KM (₹) | Minimum Fare (₹) | Vehicle Capacity |
| :--- | :---: | :---: | :---: | :--- |
| **GoRide Standard** | ₹50 | ₹15 | ₹70 | 4 Seats (Compact / Sedan) |
| **GoRide Comfort** | ₹80 | ₹22 | ₹110 | 4 Seats (Spacious / AC) |
| **GoRide XL** | ₹130 | ₹32 | ₹180 | 6 Seats (SUV / Van) |

---

## 4. REST API Endpoint Reference

| Endpoint | Method | Status | Description |
| :--- | :---: | :---: | :--- |
| `/api/bookings/places` | `GET` | 200 | Location autocomplete using the configured geocoder and returning provider-resolved names, addresses, coordinates, and area metadata where available. |
| `/api/bookings/estimate` | `POST` | 200 | Upfront route and fare estimation using actual road routing (OSRM). Recalculates dynamically when coordinates or tier change. |
| `/api/bookings` | `POST` | 201 | Creates ride booking (`Booking.bookRide()`), stores coordinates in `locations`, route metrics in `routes`, and booking in `bookings`. |
| `/api/bookings` | `GET` | 200 | Lists passenger ride bookings from MySQL with joined coordinates, route distance, and duration. |
| `/api/bookings/:id` | `GET` | 200 | Retrieves single booking status and details (`Booking.getBookingStatus()`). |
| `/api/bookings/:id/cancel` | `PATCH` | 200 | Cancels ride before pickup (`Booking.cancelRide()`). Rejects cancellation of completed rides. |

---

## 5. Test Verification Logs

### Test Suite A: Intra-Territory Routes (Verifying Different Distances Within Same Territory)

Under the former zone matrix, all intra-territory rides were assigned a static distance (e.g., 8 km). With actual coordinate road routing:

1. **Intra-Mumbai City Route 1:** Gateway of India (`18.9220°N, 72.8347°E`) $\to$ Dadar Western Station (`19.0180°N, 72.8444°E`)
   - *Detected Zones:* Mumbai City $\to$ Mumbai City
   - *Road Distance:* **12.14 km** | *Duration:* **13 mins**
   - *Standard Fare:* ₹50 + 12.14 $\times$ 15 = **₹232**
2. **Intra-Mumbai City Route 2:** Gateway of India (`18.9220°N, 72.8347°E`) $\to$ Worli Sea Face (`19.0068°N, 72.8159°E`)
   - *Detected Zones:* Mumbai City $\to$ Mumbai City
   - *Road Distance:* **11.24 km** | *Duration:* **14 mins**
   - *Standard Fare:* ₹50 + 11.24 $\times$ 15 = **₹219**
3. **Intra-Mumbai Suburban Route 1:** BKC (`19.0607°N, 72.8547°E`) $\to$ Andheri Metro Station (`19.1197°N, 72.8468°E`)
   - *Detected Zones:* Mumbai Suburban $\to$ Mumbai Suburban
   - *Road Distance:* **10.08 km** | *Duration:* **11 mins**
   - *Standard Fare:* ₹50 + 10.08 $\times$ 15 = **₹201**
4. **Intra-Mumbai Suburban Route 2:** BKC (`19.0607°N, 72.8547°E`) $\to$ Borivali Railway Station (`19.2288°N, 72.8541°E`)
   - *Detected Zones:* Mumbai Suburban $\to$ Mumbai Suburban
   - *Road Distance:* **24.04 km** | *Duration:* **22 mins**
   - *Standard Fare:* ₹50 + 24.04 $\times$ 15 = **₹411**

*Result:* **PASS** — Addresses within the same territory produce distinctly different driving route distances, durations, and fares matching real geography.

---

### Test Suite B: Cross-Territory Routes

1. **BKC $\to$ Vashi Plaza (Mumbai Suburban $\to$ Navi Mumbai):**
   - *Road Distance:* **19.06 km** | *Duration:* **17 mins** | *Standard Fare:* **₹336**
2. **Dadar $\to$ Thane Station (Mumbai City $\to$ Thane district):**
   - *Road Distance:* **26.58 km** | *Duration:* **23 mins** | *Standard Fare:* **₹449**
3. **Thane Station $\to$ Kalyan Junction (Thane district $\to$ Kalyan-Dombivli):**
   - *Road Distance:* **24.16 km** | *Duration:* **21 mins** | *Standard Fare:* **₹412**
4. **Borivali $\to$ Vasai Road (Mumbai Suburban $\to$ Palghar district):**
   - *Road Distance:* **32.52 km** | *Duration:* **29 mins** | *Standard Fare:* **₹538**

*Result:* **PASS** — Multi-territory transit across all 6 MMR zones accurately routed and priced.

---

### Test Suite C: Historical Out-of-Service-Area Rejection

- *Test Coordinates:* Pune Railway Station (`18.5204°N, 73.8567°E`) $\to$ Dadar Station (`19.0180°N, 72.8444°E`)
- *API Status:* **HTTP 400 Bad Request**
- *Error Code:* `OUT_OF_SERVICE_AREA`
- *Error Message:* `Pickup coordinates (18.5204, 73.8567) are outside GoRide's supported service area (Mumbai City, Mumbai Suburban, Palghar district, Thane district, Kalyan-Dombivli, Navi Mumbai).`
- *Historical Result:* **PASS** — This records the former MMR-only boundary behavior and is superseded by the dynamic geocoding update below.

---

### Test Suite D: Missing Routing API Configuration

- *Scenario:* `ROUTING_API_URL` environment variable removed.
- *API Status:* **HTTP 503 Service Unavailable**
- *Error Code:* `ROUTING_API_NOT_CONFIGURED`
- *Error Message:* `Routing service is not configured. Please define ROUTING_API_URL in server environment variables.`
- *Result:* **PASS** — Fails fast with clear dependency instruction; never silently invents estimates or uses fallback matrices.

---

### Test Suite E: MySQL Relational Persistence

Executed `POST /api/bookings` with real coordinates:
- *Origin:* Gateway of India, Colaba (`18.9220`, `72.8347`)
- *Destination:* Dadar Western Railway Station (`19.0180`, `72.8444`)
- *Vehicle Class:* `comfort`

**API Response (HTTP 201):**
```json
{
  "success": true,
  "data": {
    "booking_id": 5,
    "user_id": 1,
    "passenger_name": "Videsh Tambe",
    "pickup_address": "Gateway of India, Colaba",
    "dest_address": "Dadar Western Railway Station",
    "pickup_zone": "Mumbai City",
    "dest_zone": "Mumbai City",
    "vehicle_tier": "comfort",
    "status": "REQUESTED",
    "total_fare": "347.00",
    "distance_km": "12.14",
    "estimated_duration_min": 13,
    "pickup_latitude": "18.9220000",
    "pickup_longitude": "72.8347000",
    "dest_latitude": "19.0180000",
    "dest_longitude": "72.8444000"
  }
}
```

**Direct MySQL Inspection (`goride_db`):**
- `locations`: Rows inserted with exact `latitude` and `longitude` (`DECIMAL(10, 7)`) and assigned `service_zone`.
- `routes`: Row inserted linking pickup and destination locations with `distance_km = 12.14` and `estimated_duration_min = 13`.
- `bookings`: Row inserted with `route_id = 5`, `vehicle_tier = 'comfort'`, `total_fare = 347.00`, and `status = 'REQUESTED'`.

*Result:* **PASS** — End-to-end relational data integrity verified.

---

### Test Suite F: Production Bundle Verification

Command: `npm run build` in `client/`
```
vite v6.4.4 building for production...
transforming...
✓ 1604 modules transformed.
rendering chunks...
dist/index.html                   1.48 kB │ gzip:  0.81 kB
dist/assets/index-cwdmGBtG.css   24.58 kB │ gzip:  5.36 kB
dist/assets/index-84AgJn7F.js   261.62 kB │ gzip: 74.17 kB
✓ built in 1.86s
```
*Result:* **PASS** — Zero build errors, zero warnings.

---

---

## 7. Role-Based Authentication & Console Navigation Refinement

In strict compliance with software engineering requirements, the application was updated so that **Rider, Driver, and Admin are separate role-based experiences**, eliminating arbitrary console switching from the navigation bar:

### A. Authentication Architecture & Trusted Role Determination
1. **Database Schema Enhancement:**
   - Added `role ENUM('RIDER', 'DRIVER', 'ADMIN') NOT NULL DEFAULT 'RIDER'` to the `users` table.
   - Created `driver_profiles` table mapping directly to the approved UML `Driver` class (`license_no`, `vehicle_no`, `vehicle_model`, `rating`, `is_available`, `approval_status`).
2. **Backend Authentication & Authorization:**
   - Implemented `POST /api/auth/register`: Public registration creates `RIDER` or `DRIVER` accounts only. Public requests attempting `role: 'ADMIN'` are strictly rejected with HTTP 403 `ADMIN_REGISTRATION_FORBIDDEN`.
   - Driver registrations are flagged with `approval_status = 'PENDING'`. Drivers cannot go online until approved.
   - Implemented `POST /api/auth/login`: Authenticates credentials against bcrypt hashes in MySQL and issues signed JWT tokens containing trusted identities.
   - Implemented `GET /api/auth/me`: Validates session tokens and returns trusted database profile.
   - Created `authenticateToken` and `requireRole()` middleware enforcing server-side RBAC on all protected endpoints.
3. **Protection of Core Endpoints:**
   - `POST /api/bookings`: Restricted strictly to `RIDER` role. User ID is extracted from the trusted token (`req.user.user_id`), ignoring client-supplied IDs.
   - `GET /api/driver/profile` & `PATCH /api/driver/duty`: Restricted strictly to `DRIVER` role.
   - `GET /api/admin/users` & `GET /api/admin/system-stats`: Restricted strictly to `ADMIN` role.

### B. Navbar Redesign & Navigation Boundaries
1. **Global Role Switchers Removed:**
   - Removed all global console links (`Rider Workspace`, `Driver Console`, `Admin Console`) from the public navigation header in [`client/src/components/common/Navbar.jsx`](file:///D:/GoRide/client/src/components/common/Navbar.jsx).
   - Removed the role tab switcher in [`client/src/components/layout/DashboardLayout.jsx`](file:///D:/GoRide/client/src/components/layout/DashboardLayout.jsx).
2. **Role-Appropriate Navigation:**
   - Unauthenticated visitors see public navigation: `Overview`, `Sign In`, `Register`.
   - Authenticated users see only their designated console:
     - `RIDER` $\to$ `Rider Workspace` (`/rider`)
     - `DRIVER` $\to$ `Driver Console` (`/driver`)
     - `ADMIN` $\to$ `Admin Console` (`/admin`)
   - Header displays authenticated user identity, role badge, and a clear `Sign Out` button.
3. **Route Guards (`ProtectedRoute`):**
   - Protected routes (`/rider`, `/driver`, `/admin`) check authentication state and trusted roles.
   - Unauthenticated direct URL visits redirect to `/login` with return intent.
   - Cross-role visits (e.g. Rider attempting `/admin` or Driver attempting `/admin`) render an explicit **403 Access Restricted** state with guidance to return to their own console.

### C. Seeded Accounts for Testing
- **Passenger Rider:** `rider@goride.internal` | `Password123!` (Role: `RIDER`)
- **Driver Partner:** `driver@goride.internal` | `Password123!` (Role: `DRIVER`, Status: `APPROVED`)
- **Fleet Administrator:** `admin@goride.internal` | `AdminPassword123!` (Role: `ADMIN`, Pre-provisioned)

---

## 8. Role-Based Access Control Test Results

| Test Scenario | Action / Endpoint | Authenticated Role | Response / Outcome | Result |
| :--- | :--- | :---: | :---: | :---: |
| **Public Admin Registration** | `POST /api/auth/register` (role: `ADMIN`) | Unauthenticated | **HTTP 403** `ADMIN_REGISTRATION_FORBIDDEN` | **PASS** |
| **Public Rider Registration** | `POST /api/auth/register` (role: `RIDER`) | Unauthenticated | **HTTP 201** (Token issued, role `RIDER`) | **PASS** |
| **Public Driver Registration** | `POST /api/auth/register` (role: `DRIVER`) | Unauthenticated | **HTTP 201** (Token issued, status `PENDING`) | **PASS** |
| **Pending Driver Duty Lock** | `PATCH /api/driver/duty` | `DRIVER` (`PENDING`) | **HTTP 403** `DRIVER_NOT_APPROVED` | **PASS** |
| **Approved Driver Duty Toggle** | `PATCH /api/driver/duty` | `DRIVER` (`APPROVED`) | **HTTP 200** (Duty toggled to `ONLINE`) | **PASS** |
| **Cross-Role: Rider $\to$ Admin** | `GET /api/admin/users` | `RIDER` | **HTTP 403** `FORBIDDEN` (Requires `ADMIN`) | **PASS** |
| **Cross-Role: Driver $\to$ Admin** | `GET /api/admin/system-stats` | `DRIVER` | **HTTP 403** `FORBIDDEN` (Requires `ADMIN`) | **PASS** |
| **Cross-Role: Driver $\to$ Booking**| `POST /api/bookings` | `DRIVER` | **HTTP 403** `FORBIDDEN` (Requires `RIDER`) | **PASS** |
| **Authorized Admin Access** | `GET /api/admin/users` | `ADMIN` | **HTTP 200** (Retrieved all registered accounts) | **PASS** |
| **Authorized Rider Booking** | `POST /api/bookings` | `RIDER` | **HTTP 201** (Created booking for token user) | **PASS** |
| **Direct URL Guard (Unauth)** | Direct navigation to `/admin` | Unauthenticated | Redirects to `/login` | **PASS** |
| **Direct URL Guard (Cross-Role)**| Direct navigation to `/admin` | `RIDER` | Renders 403 Access Denied screen | **PASS** |

---

## 9. Dependency Documentation & Out-of-Scope Workflows

In accordance with scope constraints, the following features have been intentionally preserved for subsequent phase authorization:
1. **Driver Approval Workflow:** Public driver registrations are created with `approval_status = 'PENDING'`. An administrative verification workflow (document review, vehicle inspection approval, background check) is required before new driver partners can go online.
2. **Ride Dispatch Algorithm:** Matching available online drivers to rider bookings remains an approved Phase 3 item.
3. **Payment Gateways & Settlement:** Financial transactions and settlement workflows remain for the approved Payment phase.

---

## 10. Operational Status

* **Backend API:** [http://localhost:5000](http://localhost:5000) (Running with `node --watch src/server.js`, MySQL pool connected, JWT authentication enabled)
* **Frontend Web App:** [http://localhost:5173](http://localhost:5173) (Running Vite dev server with role-based navigation and route guards)
* **Database Service:** `MySQL80` running on port 3306 with `goride_db`

Phase 2 and Role-Based Authentication Refinements are complete. Awaiting your review before beginning Phase 3.

## 11. Dynamic Location Selection Update — 2026-10-21

Pickup and destination search now uses the configured Photon-compatible
geocoder without curated location pins or an MMR bounding box. The selected
geocoder coordinates are used for map markers, OSRM-compatible road routing,
fare estimation, and booking persistence. The previous MMR-only service-area
rejection is removed; successful routes still depend on the configured
geocoder and routing provider supporting the requested locations. Geocoding
and routing errors are returned explicitly, and no straight-line route or
default pin is substituted.

`node server/test_location_search.mjs` verifies unrelated geocoded places,
coordinate-preserving route requests, returned route geometry, and surfaced
geocoder connection failures. Live provider spot checks resolved places in
Australia and the United Kingdom and returned a London road route; this does
not verify the application against a live database or browser session.
