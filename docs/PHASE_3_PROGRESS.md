# GoRide — Phase 3 Progress Report: Authentication, Role-Based Access, Driver Management & Ride Dispatch

**Milestone:** Phase 3, Part 2: Driver Management, Application Approval, and Ride Dispatch  
**Previous Milestone:** Phase 3, Part 1: Authentication, Role-Based Access Control, and Navigation (Complete)  
**Project:** GoRide — Smart Urban Ride Booking and Management System  
**Database:** MySQL Community Server 8.0.46 (`goride_db`)  
**Backend:** Node.js + Express.js (ES Modules), `mysql2/promise`, `bcryptjs`, `jsonwebtoken`  
**Frontend:** React 18 + Vite + Tailwind CSS  
**Date:** October 2026  
**Status:** Complete & Verified • Ready for Phase 3, Part 3 Approval  

---

## 1. Executive Summary

Phase 3 transitions GoRide into an enterprise-grade ride management platform. Building directly on Phase 3, Part 1 (authentication and role isolation), **Part 2 implements end-to-end driver partner management, administrative onboarding review, atomic ride dispatch, and lifecycle state transitions**:

1. **Part A — Driver Application & Administrative Approval:**
   - Drivers register with driving license, vehicle registration, and vehicle model numbers; their operational status initializes as `PENDING`.
   - Admin-only endpoints (`GET /api/admin/driver-applications`, `PATCH /api/admin/driver-applications/:id/approve`, `PATCH /api/admin/driver-applications/:id/reject`) allow fleet operators to verify documents and grant or revoke operating authority.
   - Unapproved drivers are strictly barred at the API layer from toggling shift duty (HTTP 403 `DRIVER_NOT_APPROVED`) and cannot view or accept rides in the dispatch queue.
2. **Part B — Atomic Ride Dispatch & Decline Strategy:**
   - Online, approved drivers query eligible rides via `GET /api/driver/dispatch-queue`. Requests display pickup, destination, territories, OSRM road distance, travel duration, vehicle tier, and fare.
   - Drivers can decline offers via `POST /api/driver/rides/:id/reject`. Rejections are recorded in `driver_booking_rejections` without cancelling the passenger's booking. The ride remains available in the dispatch pool for other active drivers.
   - Ride acceptance (`POST /api/driver/rides/:id/accept`) uses a **database transaction with clustered index row locking (`SELECT ... FOR UPDATE` by primary key)**. If two drivers attempt to accept the same booking concurrently, exactly one driver succeeds (HTTP 200 `CONFIRMED`), while the competing driver is cleanly rejected with HTTP 409 `BOOKING_ALREADY_ASSIGNED`.
3. **Part C — Ride Lifecycle State Machine:**
   - State transitions strictly follow the approved UML State and Sequence specifications:
     $$\text{REQUESTED} \longrightarrow \text{CONFIRMED} \longrightarrow \text{ONGOING} \longrightarrow \text{COMPLETED}$$
   - Only the assigned driver can start (`PATCH /api/driver/rides/:id/start`) or complete (`PATCH /api/driver/rides/:id/complete`) a trip. Unauthorized drivers are rejected with HTTP 403 `UNAUTHORIZED_DRIVER`.
   - Out-of-order transitions (e.g. attempting to start an already ongoing trip or completing an unstarted ride) are rejected with HTTP 400 `INVALID_STATUS_TRANSITION`.
   - Riders can cancel rides in `REQUESTED` or `CONFIRMED` states; cancellation of `ONGOING` trips is blocked with HTTP 400 `CANNOT_CANCEL_ONGOING`.
4. **Part D — Real-Data Console Experiences:**
   - Hardcoded metrics and fake driver records have been replaced with live MySQL data.
   - Driver console features shift controls, incoming dispatch cards, active trip lifecycle controls, passenger contact information, and a completed trip ledger with real earnings calculated directly from `SUM(total_fare)`.
   - Admin console includes the pending driver review table, system telemetry (user counts by role, driver approval counts, bookings by status, total revenue), and the full user authorization ledger.
   - Rider console reflects assigned driver partner name, vehicle details, and updated statuses in real time.

---

## 2. Relational Schema Migrations & Data Model

Safe, backward-compatible migrations were applied to `goride_db` using [`server/src/database/migrate.js`](file:///D:/GoRide/server/src/database/migrate.js) and [`server/src/database/schema.sql`](file:///D:/GoRide/server/src/database/schema.sql).

### 2.1 Relational Architecture Diagram

```
+----------------------------------------------------------------------------------------------------+
|                                         RELATIONAL SCHEMA                                          |
+----------------------------------------------------------------------------------------------------+
|  users                                                                                             |
|    user_id (INT, PK, AUTO_INCREMENT)                                                               |
|    name (VARCHAR 100, NOT NULL)                                                                    |
|    phone_no (VARCHAR 20, NOT NULL)                                                                 |
|    email (VARCHAR 120, UNIQUE, NOT NULL)                                                           |
|    password_hash (VARCHAR 255, NOT NULL)                                                           |
|    role (ENUM('RIDER', 'DRIVER', 'ADMIN'), NOT NULL DEFAULT 'RIDER')                               |
|    created_at, updated_at (TIMESTAMP)                                                             |
+----------------------------------------------------------------------------------------------------+
           |                                                      |
           | 1:1 (for DRIVER role)                                | 1:N (as Passenger)
           v                                                      v
+-----------------------------------------+    +-----------------------------------------------------+
|  driver_profiles                        |    |  bookings                                           |
|    driver_id (INT, PK, AUTO_INCREMENT)  |    |    booking_id (INT, PK, AUTO_INCREMENT)             |
|    user_id (INT, FK -> users, UQ)       |    |    user_id (INT, FK -> users, NOT NULL)            |
|    license_no (VARCHAR 50, NOT NULL)    |    |    driver_id (INT, FK -> driver_profiles, NULL)     |
|    vehicle_no (VARCHAR 50, NOT NULL)    |--->|    route_id (INT, FK -> routes, NULL)               |
|    vehicle_model (VARCHAR 100, NOT NULL)|    |    pickup_address, dest_address (VARCHAR 255)       |
|    rating (DECIMAL 3,2, DEFAULT 5.00)   |    |    pickup_zone, dest_zone (VARCHAR 50)              |
|    is_available (BOOLEAN, DEFAULT FALSE)|    |    vehicle_tier (ENUM('standard','comfort','xl'))  |
|    approval_status (ENUM('PENDING',     |    |    status (ENUM('REQUESTED','CONFIRMED','ONGOING',  |
|      'APPROVED','REJECTED'))            |    |                 'COMPLETED','CANCELLED'))           |
|    created_at, updated_at (TIMESTAMP)   |    |    total_fare (DECIMAL 10,2, NOT NULL)              |
+-----------------------------------------+    |    cancellation_reason, cancelled_at, booking_date  |
           |                                   +-----------------------------------------------------+
           | 1:N                                                          |
           v                                                              v
+----------------------------------------------------------------------------------------------------+
|  driver_booking_rejections                                                                         |
|    rejection_id (INT, PK, AUTO_INCREMENT)                                                          |
|    driver_id (INT, FK -> driver_profiles, ON DELETE CASCADE)                                      |
|    booking_id (INT, FK -> bookings, ON DELETE CASCADE)                                             |
|    created_at (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)                                                |
|    UNIQUE KEY uq_driver_booking_rej (driver_id, booking_id)                                        |
+----------------------------------------------------------------------------------------------------+
```

---

## 3. REST API Endpoint Reference & Role Matrix

| Endpoint | Method | Required Role | Description |
| :--- | :---: | :---: | :--- |
| **Authentication & Profile** | | | |
| `/api/auth/register` | `POST` | Public | Public registration for Riders or Drivers (sets `PENDING`). Blocks `ADMIN`. |
| `/api/auth/login` | `POST` | Public | Validates credentials against `bcryptjs`; issues JWT with trusted role. |
| `/api/auth/me` | `GET` | Authenticated | Retrieves authenticated user profile and trusted role from token. |
| `/api/driver/profile` | `GET` | `DRIVER` | Retrieves driver partner vehicle details, license, and approval status. |
| **Driver Shift & Dispatch Operations** | | | |
| `/api/driver/duty` | `PATCH` | `DRIVER` | Toggles duty availability (`isAvailable: true/false`). Rejects unapproved drivers with 403. |
| `/api/driver/dispatch-queue` | `GET` | `DRIVER` | Retrieves eligible ride offers in `REQUESTED` status excluding declined trips. |
| `/api/driver/rides/:id/accept` | `POST` | `DRIVER` | Atomically accepts a booking using transactional row locks. Returns 409 if claimed. |
| `/api/driver/rides/:id/reject` | `POST` | `DRIVER` | Declines offer for this driver without cancelling passenger request. |
| `/api/driver/rides/active` | `GET` | `DRIVER` | Returns driver's active trip in `CONFIRMED` or `ONGOING` status. |
| `/api/driver/rides/:id/start` | `PATCH` | `DRIVER` | Transitions trip from `CONFIRMED` to `ONGOING`. Verified against driver ownership. |
| `/api/driver/rides/:id/complete`| `PATCH` | `DRIVER` | Transitions trip from `ONGOING` to `COMPLETED`. Verified against driver ownership. |
| `/api/driver/rides/history` | `GET` | `DRIVER` | Retrieves completed trips and calculates driver total earnings from MySQL. |
| **Fleet Administration & Governance** | | | |
| `/api/admin/driver-applications`| `GET` | `ADMIN` | Lists pending driver partner applications requiring document verification. |
| `/api/admin/driver-applications/:id/approve` | `PATCH` | `ADMIN` | Approves driver application; unlocks duty controls and dispatch access. |
| `/api/admin/driver-applications/:id/reject`  | `PATCH` | `ADMIN` | Rejects driver application with optional reason. |
| `/api/admin/users` | `GET` | `ADMIN` | User role registry with driver vehicle credentials and verification statuses. |
| `/api/admin/system-stats` | `GET` | `ADMIN` | Live system telemetry: user counts, driver verification states, bookings, and revenue. |
| **Rider Booking Management** | | | |
| `/api/bookings` | `POST` | `RIDER` | Creates ride booking with OSRM actual road routing and upfront fare calculation. |
| `/api/bookings` | `GET` | `RIDER`, `ADMIN` | Lists bookings. Joins assigned driver name, phone, and vehicle details. |
| `/api/bookings/:id` | `GET` | `RIDER`, `ADMIN` | Fetches booking details with joined driver info. Prevents cross-passenger viewing. |
| `/api/bookings/:id/cancel` | `PATCH` | `RIDER`, `ADMIN` | Cancels ride before pickup (`REQUESTED` or `CONFIRMED`). Blocks cancellation if `ONGOING`. |

---

## 4. Verification Test Execution & Results

Two comprehensive automated test suites were executed against the live backend server:
1. **`test_phase3_p2.mjs`:** 29 test cases verifying driver onboarding, admin approval/rejection, dispatch queue, atomic concurrency protection, lifecycle transitions, role boundaries, driver earnings, and regression.
2. **`test_phase3_p1.mjs`:** 20 test cases verifying Phase 3, Part 1 authentication, token handling, and role protections.

### 4.1 Phase 3, Part 2 Verification Test Run Output

```bash
PS D:\GoRide\server> npm run test:p2

> goride-server@1.0.0 test:p2
> node test_phase3_p2.mjs

================================================================
 GoRide Phase 3 Part 2 - Verification Test Suite
 Driver Management, Application Approval, Dispatch & Lifecycle
================================================================

[PASS] Admin login succeeds
[PASS] Rider login succeeds

--- Test Section 1: Driver Application & Admin Approval/Rejection ---
[PASS] Driver 1 registers successfully
[PASS] Driver 1 profile is PENDING (Driver ID: 24)
[PASS] Driver 2 registers successfully
[PASS] Admin lists pending applications and finds Driver 1 & Driver 2 (Total pending: 5)
[PASS] Admin approves Driver 1 (approval_status: APPROVED)
[PASS] Admin rejects Driver 2 (approval_status: REJECTED)

--- Test Section 2: Approval Status Enforcement on Shift Controls ---
[PASS] Rejected driver blocked from going online (HTTP 403, error: DRIVER_NOT_APPROVED)
[PASS] Approved Driver 1 successfully sets duty status to ONLINE (is_available: true)

--- Test Section 3: Role Boundary Protections ---
[PASS] Rider blocked from Admin application approval (HTTP 403)
[PASS] Driver blocked from viewing Admin application list (HTTP 403)
[PASS] Rider blocked from GET /api/driver/dispatch-queue (HTTP 403)

--- Test Section 4: Ride Dispatch, Queue Visibility & Decline Strategy ---
[PASS] Passenger creates ride booking #12 with status 'REQUESTED'
[PASS] Driver 1 sees ride #12 in live dispatch queue (Route: Gateway of India -> BKC, Fare: ₹328.00)
[PASS] Driver 1 declines ride offer #12
[PASS] Ride #12 is removed from Driver 1's dispatch queue
[PASS] Rider's booking #12 remains intact with status 'REQUESTED' (not cancelled by driver decline)

--- Test Section 5: Competing Acceptance & Concurrency Protection ---
[PASS] Transactional row lock guaranteed exactly one driver won acceptance (Status codes: 200 vs 409)

--- Test Section 6: Ride Lifecycle State Machine & Driver Authorization ---
[PASS] Non-assigned driver blocked from starting the ride (HTTP 403 UNAUTHORIZED_DRIVER)
[PASS] Assigned driver starts trip: status transitioned to 'ONGOING'
[PASS] Attempting to start an already ONGOING ride returns HTTP 400 INVALID_STATUS_TRANSITION
[PASS] Rider cancellation blocked while ride is ONGOING (HTTP 400, code: CANNOT_CANCEL_ONGOING)
[PASS] Non-assigned driver blocked from completing the ride (HTTP 403)
[PASS] Assigned driver completes trip: status transitioned to 'COMPLETED'

--- Test Section 7: Rider Transparency & Driver Earnings Ledger ---
[PASS] Rider views completed booking with assigned driver info (Driver: Applicant Driver 3, Vehicle: MH-02-CD-3003)
[PASS] Winning driver history ledger reflects completed trip (Total completed: 1, Total earnings: ₹328)

--- Test Section 8: Phase 2 Routing & Booking Regression ---
[PASS] OSRM Road routing & fare estimation operational (Comfort fare: ₹556, Distance: 21.65 km)
[PASS] Passenger cancels REQUESTED booking #13 successfully

================================================================
 Test Suite Complete: 29 Passed, 0 Failed
================================================================
```

### 4.2 Phase 3, Part 1 Regression Verification Output

```bash
PS D:\GoRide\server> node test_phase3_p1.mjs

====================================================
 GoRide Phase 3 Part 1 - Verification Test Suite
====================================================

[PASS] Backend health probe is operational (HTTP 200, status: operational)
[PASS] Public registration cannot create Admin (HTTP 403, error code: ADMIN_REGISTRATION_FORBIDDEN)
[PASS] Public registration creates Rider account with role 'RIDER'
[PASS] Driver registration creates account with role 'DRIVER'
[PASS] New driver profile status is 'PENDING' (PENDING)
[PASS] Pending driver duty change is rejected with 403 DRIVER_NOT_APPROVED
[PASS] Admin login succeeds and returns role 'ADMIN'
[PASS] Approved Driver login succeeds and returns role 'DRIVER'
[PASS] Rider login succeeds and returns role 'RIDER'
[PASS] Rider blocked from GET /api/admin/users (HTTP 403)
[PASS] Rider blocked from GET /api/driver/profile (HTTP 403)
[PASS] Driver blocked from GET /api/admin/system-stats (HTTP 403)
[PASS] Driver blocked from POST /api/bookings (HTTP 403)
[PASS] Admin successfully accesses GET /api/admin/users (found 20 registered users in MySQL)
[PASS] Admin successfully accesses GET /api/admin/system-stats (real DB metrics retrieved)
[PASS] Approved driver successfully sets duty status to available (ONLINE)
[PASS] Fare estimation calculates real route fare (Standard: ₹287, Distance: 15.83 km)
[PASS] Authenticated Rider creates booking successfully (Booking ID: 14, Status: REQUESTED)
[PASS] Rider trip history returns the newly created booking ID 14
[PASS] Rider cancels booking successfully (Booking status: CANCELLED)

====================================================
 Test Summary: 20 Passed, 0 Failed
====================================================
```

### 4.3 Frontend Production Build

```bash
PS D:\GoRide\client> npm run build

> goride-client@1.0.0 build
> vite build

vite v6.4.4 building for production...
transforming...
✓ 1606 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   1.48 kB │ gzip:  0.81 kB
dist/assets/index-BkFvoE2d.css   25.64 kB │ gzip:  5.58 kB
dist/assets/index-CDlb9hkW.js   285.39 kB │ gzip: 78.32 kB
✓ built in 1.80s
```

---

## 5. Driver Completed Trips Ledger Investigation & Verification

### 5.1 Problem Statement & Background
During verification, a question was raised regarding why completed bookings `GR-BK-10` and `GR-BK-12` visible in the Rider Console were absent from the logged-in driver's (`driver@goride.internal`) **Driver Completed Trips Ledger**, whereas `GR-BK-8` appeared in both Rider and Driver consoles.

### 5.2 Database Record Inspection
Direct inspection of `goride_db` records for bookings 8, 10, and 12 revealed the following facts:

| Booking Reference | Database ID | Passenger (`user_id`) | Assigned Driver (`driver_id`) | Authenticated Driver Identity | Status | Fare (₹) | Completion Timestamp (`completed_at`) | Visible to Driver 1 (`driver@goride.internal`)? |
| :--- | :---: | :---: | :---: | :--- | :---: | :---: | :---: | :---: |
| **GR-BK-8** | 8 | 1 (`rider@goride.internal`) | **1** | Rajesh Kumar (`driver@goride.internal`) | `COMPLETED` | ₹270.00 | `2026-10-11 06:58:17` | **YES** (Owned by Driver 1) |
| **GR-BK-10** | 10 | 1 (`rider@goride.internal`) | **21** | Applicant Driver 3 (`driver_test3_...`) | `COMPLETED` | ₹328.00 | `2026-10-11 06:50:52` | **NO** (Owned by Driver 21) |
| **GR-BK-12** | 12 | 1 (`rider@goride.internal`) | **26** | Applicant Driver 3 (`driver_test3_...`) | `COMPLETED` | ₹328.00 | `2026-10-11 06:52:03` | **NO** (Owned by Driver 26) |

### 5.3 Root Cause Analysis
The root cause corresponds to **Investigation Case 6: Completed bookings assigned to different drivers**:
1. All three bookings were created by the demo passenger (`user_id: 1`, `rider@goride.internal`). Therefore, the Rider Console correctly displays all three completed trips.
2. `GR-BK-10` and `GR-BK-12` were created and claimed by distinct test driver accounts (`driver_id: 21` and `driver_id: 26`) during the execution of automated concurrent dispatch test suites.
3. The Driver Completed Trips Ledger endpoint (`GET /api/driver/rides/history`) filters strictly by `WHERE b.driver_id = ? AND b.status = 'COMPLETED'`.
4. When logged in as `driver@goride.internal` (`driver_id: 1`), `GR-BK-10` and `GR-BK-12` are **correctly excluded**. Displaying them to `driver@goride.internal` would violate multi-tenant driver privacy and RBAC isolation, as drivers must only see trips they personally completed and earned fares for.
5. `GR-BK-10` correctly appears in Driver 21's ledger, and `GR-BK-12` correctly appears in Driver 26's ledger.

### 5.4 Verified Improvements Applied
While the ledger filtering was verified to be architecturally sound and secure, two key consistency enhancements were implemented:
1. **Dedicated `completed_at` Column:** Added `completed_at TIMESTAMP NULL` to `goride_db.bookings`, populated at the moment of ride completion (`completeRide()`) and backfilled from `updated_at` for legacy completed trips.
2. **Unified Reference Formatting:** Standardized the booking reference prefix in [`client/src/pages/DriverDashboardPage.jsx`](file:///D:/GoRide/client/src/pages/DriverDashboardPage.jsx) from `#BK-{id}` to `GR-BK-{id}`, ensuring identical reference representation across Rider, Driver, and Admin workspaces.
3. **Dedicated Ledger Isolation & Consistency Tests:** Added 5 new automated assertions in `test_phase3_p2.mjs` verifying that:
   - A driver sees their own completed trips.
   - Competing drivers cannot view another driver's completed trips (Ledger Isolation).
   - Completed bookings retain their assigned driver.
   - Ledgers contain no duplicate records.
   - Driver earnings strictly equal the sum of their own completed trips.

---

## 6. Modified & Created Files

### Backend (`server/`)
- [`server/src/database/schema.sql`](file:///D:/GoRide/server/src/database/schema.sql): Added `driver_id` foreign key and `completed_at TIMESTAMP NULL` to `bookings`; created `driver_booking_rejections` table.
- [`server/src/database/migrate.js`](file:///D:/GoRide/server/src/database/migrate.js): Automated programmatic schema migration for `driver_id`, `completed_at`, and rejections table.
- [`server/src/services/driverService.js`](file:///D:/GoRide/server/src/services/driverService.js): Core service implementing dispatch queue filtering, decline tracking, transactional row-locked acceptance, ride lifecycle transitions, `completed_at` recording, and driver earnings calculation.
- [`server/src/services/bookingService.js`](file:///D:/GoRide/server/src/services/bookingService.js): Joined assigned driver partner details and `completed_at` in `getBookingById` and `listBookings`; guarded against cancellation of `ONGOING` rides.
- [`server/src/routes/driverRoutes.js`](file:///D:/GoRide/server/src/routes/driverRoutes.js): Mounted `/duty`, `/dispatch-queue`, `/rides/:id/accept`, `/rides/:id/reject`, `/rides/active`, `/rides/:id/start`, `/rides/:id/complete`, and `/rides/history`.
- [`server/src/routes/adminRoutes.js`](file:///D:/GoRide/server/src/routes/adminRoutes.js): Mounted `/driver-applications`, `/driver-applications/:id/approve`, `/driver-applications/:id/reject`, and updated telemetry stats.
- [`server/package.json`](file:///D:/GoRide/server/package.json): Added `--watch-path=src` to `dev` script and added `test:p2` test script.
- [`server/test_phase3_p2.mjs`](file:///D:/GoRide/server/test_phase3_p2.mjs): Comprehensive verification test suite for Part 2 (34 passed tests).

### Frontend (`client/`)
- [`client/src/pages/DriverDashboardPage.jsx`](file:///D:/GoRide/client/src/pages/DriverDashboardPage.jsx): Full dispatch queue UI with Accept and Decline actions, active ride card with Start/Complete trip lifecycle actions, real earnings summary, pending onboarding review, unified `GR-BK-` booking references, and `completed_at` timestamp display.
- [`client/src/pages/AdminDashboardPage.jsx`](file:///D:/GoRide/client/src/pages/AdminDashboardPage.jsx): Driver Partner Verification Queue with Approve and Reject actions, live user registry, and system telemetry metrics.
- [`client/src/pages/RiderDashboardPage.jsx`](file:///D:/GoRide/client/src/pages/RiderDashboardPage.jsx): Displays assigned driver partner name, vehicle model, and vehicle registration number in the trip ledger once assigned.

---

# Phase 3, Part 3: Payments and Post-Trip Ratings

**Status:** Complete & Verified  
**Verification Suite:**
- Part 1 Regression Suite (`node test_phase3_p1.mjs`): **20 passed, 0 failed**
- Part 2 Regression Suite (`npm run test:p2`): **34 passed, 0 failed**
- Part 3 Verification Suite (`npm run test:p3`): **48 passed, 0 failed**
- Frontend Production Build (`npm run build` in `client`): **Success (3.00s, 0 errors)**

---

## 1. Executive Summary

Phase 3, Part 3 introduces secure payment management and post-trip driver ratings as an incremental, database-backed extension of GoRide. All design decisions are directly grounded in the project's source authority documents:
- **UML Class Diagram:** Maps `Payment` class (`paymentID`, `amount`, `paymentMethod`, `paymentStatus`, `transactionID`, `paymentDate`, `makePayment()`, `getPaymentDetails()`), `PaymentMethod` enum (`Cash`, `Card`, `UPI`, `Wallet`, `NetBanking`), `paymentStatus` enum (`PENDING`, `SUCCESS`, `CONFIRMED`, `FAILED`, `REFUND`), and `Driver.rating`.
- **UML Sequence Diagram (`SequenceDiagram1`):** Mandates that payment occurs strictly after ride completion (`... completeRide -> makePayment -> paymentSuccess`).
- **Software Requirements Specification (SRS):** Section 3 specifies:
  - "Payments shall be processed only after ride completion."
  - "Rating and Review Screen: Once the ride is completed, users can: Provide Star Ratings (1–5), Submit Written Reviews."
  - "Ratings and reviews shall be submitted only after ride completion."
  - "The database shall maintain data integrity using primary keys, foreign keys, and appropriate constraints."

---

## 2. Database Migrations & Constraints

### 2.1 Migrations Added
1. **`goride_db.bookings`:**
   - Added `payment_status ENUM('UNPAID', 'PAID') NOT NULL DEFAULT 'UNPAID'` immediately following `status`.
2. **`goride_db.payments`:**
   - `payment_id INT AUTO_INCREMENT PRIMARY KEY`
   - `booking_id INT NOT NULL`
   - `user_id INT NOT NULL` (rider who made payment)
   - `amount DECIMAL(10, 2) NOT NULL` (sourced strictly from MySQL `bookings.total_fare`)
   - `payment_method ENUM('Cash', 'Card', 'UPI', 'Wallet', 'NetBanking') NOT NULL`
   - `payment_status ENUM('PENDING', 'SUCCESS', 'FAILED', 'REFUND') NOT NULL DEFAULT 'PENDING'`
   - `transaction_id VARCHAR(100) NOT NULL UNIQUE` (demo transaction reference: `TXN-GORIDE-...`)
   - `successful_booking_id INT GENERATED ALWAYS AS (IF(payment_status = 'SUCCESS', booking_id, NULL)) STORED`
   - `UNIQUE KEY uq_successful_payment (successful_booking_id)` — Guarantees at the database engine level that at most one successful payment can ever exist per booking, while permitting multiple prior failed retry attempts.
   - `FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)` (financial record integrity)
   - `FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE`
3. **`goride_db.ratings`:**
   - `rating_id INT AUTO_INCREMENT PRIMARY KEY`
   - `booking_id INT NOT NULL UNIQUE` (`uq_booking_rating` ensures exactly one rating per completed trip)
   - `user_id INT NOT NULL` (passenger)
   - `driver_id INT NOT NULL` (assigned driver partner)
   - `rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5)` (enforces 1–5 star scale at database level)
   - `comments VARCHAR(500) NULL` (optional review text up to 500 characters)
   - `FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE`
   - `FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE`
   - `FOREIGN KEY (driver_id) REFERENCES driver_profiles(driver_id) ON DELETE CASCADE`

---

## 3. Payment Management Architecture & Security

### 3.1 Eligibility & Lifecycle Sequence
- Payment is permitted **only** when `bookings.status === 'COMPLETED'`.
- Attempting payment for `REQUESTED`, `CONFIRMED`, `ONGOING`, or `CANCELLED` bookings is rejected with HTTP 400 `INVALID_BOOKING_STATUS`.
- Only the authenticated rider who owns the booking may initiate its payment (`booking.user_id === req.user.user_id`). Cross-user attempts return HTTP 403 `FORBIDDEN`.
- **Source of Truth for Fare:** The charged amount is read directly from `bookings.total_fare` in MySQL under transaction row lock (`FOR UPDATE`). Any client-supplied amount in the request payload is strictly ignored.

### 3.2 Safe Payment Simulation
- Academic project compliance: No real payment gateway or bank credentials (CVV, UPI PINs, netbanking passwords, OTPs) are ever requested or stored.
- Backend generates a demo transaction identifier (`TXN-GORIDE-<timestamp>-<hex>`).
- UI includes prominent academic simulation disclaimer badges.
- **Deterministic Simulated Failures:** Requests with `{ simulateFailure: true }` deterministically record a `FAILED` payment transaction and return HTTP 402 `PAYMENT_SIMULATION_FAILED`. The booking remains `UNPAID`, allowing safe rider retries.

### 3.3 Concurrency & Duplicate Prevention
- Duplicate payment attempts on an already-paid booking return HTTP 409 `ALREADY_PAID`.
- Payment execution wraps `SELECT ... FOR UPDATE` row locks inside a MySQL transaction.
- Concurrent payment requests on the same booking are serialized: exactly one transaction succeeds (HTTP 201) and subsequent or competing requests are rejected with HTTP 409 `ALREADY_PAID`.

---

## 4. Post-Trip Ratings Architecture

### 4.1 Rating Rules & Constraints
- Only the authenticated rider who owns the booking may submit a rating (`booking.user_id === req.user.user_id`).
- Ratings are permitted **only** after trip completion (`status === 'COMPLETED'`). Incomplete and cancelled rides return HTTP 400 `INVALID_BOOKING_STATUS`.
- Scale: strictly 1–5 stars. Ratings `< 1` or `> 5` return HTTP 400 `INVALID_RATING_VALUE`.
- Optional review comment: maximum 500 characters.
- Exactly one accepted rating per completed booking (`UNIQUE KEY (booking_id)`). Subsequent submissions return HTTP 409 `ALREADY_RATED`.
- Drivers cannot rate their own rides as passengers and cannot alter or delete submitted ratings.

### 4.2 Driver Aggregate Rating Calculation
- Submitting a rating atomically updates the driver partner's aggregate score in `driver_profiles.rating`.
- Calculation: `ROUND(AVG(rating), 2)` across all persisted ratings for that `driver_id` in MySQL.

---

## 5. API Endpoints Contract

### 5.1 Payment Endpoints
| Method | Route | Access | Description |
|---|---|---|---|
| `POST` | `/api/payments` | RIDER | Initiate simulated payment (`bookingId`, `paymentMethod`, `simulateFailure`). Sourced from DB fare. |
| `POST` | `/api/bookings/:id/pay` | RIDER | Convenient alias for initiating payment on booking ID `:id`. |
| `GET` | `/api/payments/booking/:bookingId` | RIDER (own) / ADMIN | Retrieve payment details and transaction reference. Drivers blocked with HTTP 403. |
| `GET` | `/api/bookings/:id/payment` | RIDER (own) / ADMIN | Convenient alias for retrieving booking payment details. |
| `GET` | `/api/payments/my-payments` | RIDER | Retrieve passenger payment history. |
| `GET` | `/api/payments/admin/all` | ADMIN | Fleet governance payment ledger and revenue collection telemetry. |

### 5.2 Rating Endpoints
| Method | Route | Access | Description |
|---|---|---|---|
| `POST` | `/api/ratings` | RIDER | Submit 1–5 star rating and optional comments for completed booking. |
| `POST` | `/api/bookings/:id/rate` | RIDER | Convenient alias for rating booking ID `:id`. |
| `GET` | `/api/ratings/booking/:bookingId` | Authenticated | Retrieve rating record and comments for a specific booking. |
| `GET` | `/api/bookings/:id/rating` | Authenticated | Convenient alias for retrieving booking rating details. |
| `GET` | `/api/ratings/driver/:driverId` | Authenticated | Retrieve driver partner rating summary and reviews. |

---

## 6. Frontend Integration

### 6.1 Rider Booking Workspace ([`RiderDashboardPage.jsx`](file:///D:/GoRide/client/src/pages/RiderDashboardPage.jsx))
- **Trips Ledger Enhancement:** Added settlement status badges (`PAID (Method)` vs `UNPAID`).
- **Interactive Payment Action:** For completed unpaid bookings, provides a primary `Pay ₹{fare}` action.
- **Simulated Payment Gateway Modal:**
  - Displays academic demo simulation banner with shield icon.
  - Sourced fare due strictly from MySQL database.
  - Method selector: `UPI`, `Card`, `Cash`, `Wallet`, `NetBanking`.
  - Simulate Failure toggle for deterministic test validation.
  - Payment receipt card showing demo transaction reference, settled amount, and timestamp.
- **Post-Trip Rating Modal:**
  - Displayed for completed paid bookings without prior ratings.
  - Interactive 5-star rating selector with hover states and qualitative labels (Poor to Excellent).
  - Optional review textarea with character counter (up to 500 chars).
  - Displays submitted rating inline (`★ 5/5`) and disables duplicate submissions.

### 6.2 Driver Dispatch Console ([`DriverDashboardPage.jsx`](file:///D:/GoRide/client/src/pages/DriverDashboardPage.jsx))
- Added `Settlement` status column (`PAID` vs `PENDING`) to the Completed Trips Ledger.
- Displayed real-time driver partner rating formatted to 2 decimals (`★ 4.50`) reflecting recalculations from MySQL ratings.

### 6.3 Administrator Governance Console ([`AdminDashboardPage.jsx`](file:///D:/GoRide/client/src/pages/AdminDashboardPage.jsx))
- Added `Settled Revenue` metric card to the top telemetry grid displaying total collected revenue from MySQL `payments` table alongside total transaction counts.

---

## 7. Automated Test Results

### 7.1 Phase 3 Part 3 Suite (`npm run test:p3`)
```
================================================================
 GoRide Phase 3 Part 3 - Verification Test Suite
 Payments Management & Post-Trip Ratings
================================================================

--- Setup: Account Authentication & Provisioning ---
[PASS] Admin login succeeds
[PASS] Rider 1 login succeeds
[PASS] Rider 2 registration succeeds
[PASS] Driver registration succeeds
[PASS] Admin approves test driver partner
[PASS] Approved driver sets duty status to ONLINE

--- Test Section 1: Payment Security & Authorization ---
[PASS] Unauthenticated payment attempt rejected (HTTP 401)
[PASS] Trip #1 completed successfully (Booking ID: 35, Fare: ₹328.00)
[PASS] Driver blocked from viewing private rider payment records (HTTP 403)
[PASS] Rider cannot pay for another passenger’s booking (HTTP 403)
[PASS] Rider cannot view payment details of another rider’s booking (HTTP 403)

--- Test Section 2: Ride Status Eligibility for Payment ---
[PASS] Payment for REQUESTED booking rejected (HTTP 400 INVALID_BOOKING_STATUS)
[PASS] Payment for CONFIRMED booking rejected (HTTP 400 INVALID_BOOKING_STATUS)
[PASS] Payment for ONGOING booking rejected (HTTP 400 INVALID_BOOKING_STATUS)

--- Test Section 3: Simulated Payment Processing & Retry Policy ---
[PASS] Simulated failure returns HTTP 402 PAYMENT_SIMULATION_FAILED
[PASS] Stored MySQL fare (₹328.00) used instead of manipulated client amount (₹1)
[PASS] Simulated failure recorded with status FAILED
[PASS] Booking remains UNPAID after failed payment attempt
[PASS] Retried payment succeeds (HTTP 201)
[PASS] Payment status is terminal SUCCESS
[PASS] Generated demo transaction reference: TXN-GORIDE-05730314-D96O9
[PASS] Charged amount strictly matches MySQL booking total_fare (₹328.00)
[PASS] Booking payment_status successfully transitioned to PAID
[PASS] Booking returns linked transaction ID

--- Test Section 4: Duplicate & Concurrent Payment Prevention ---
[PASS] Duplicate payment on already-paid booking rejected with HTTP 409 ALREADY_PAID
[PASS] Trip #2 completed (Booking ID: 37)
[PASS] Concurrency test: Exactly 1 payment succeeded (201) and 1 was rejected (409). Actual: [201, 409]
[PASS] Rider retrieves payment history list
[PASS] Rider payment history contains 11 transactions
[PASS] Admin accesses network payment ledger
[PASS] Admin summary reports collected revenue: ₹2296.00

--- Test Section 5: Post-Trip Rating Eligibility & Scale Constraints ---
[PASS] Unauthenticated rating attempt rejected (HTTP 401)
[PASS] Rating incomplete booking rejected (HTTP 400 INVALID_BOOKING_STATUS)
[PASS] Rider cannot rate another passenger’s booking (HTTP 403 FORBIDDEN)
[PASS] Rating 0 stars rejected (HTTP 400 INVALID_RATING_VALUE)
[PASS] Rating 6 stars rejected (HTTP 400 INVALID_RATING_VALUE)
[PASS] Rider rates completed trip successfully (HTTP 201)
[PASS] Rating score persists as 5 stars
[PASS] Written review comments persist
[PASS] Duplicate rating for same booking rejected with HTTP 409 ALREADY_RATED

--- Test Section 6: Driver Aggregate Rating Calculation ---
[PASS] Rider rates second trip with 4 stars
[PASS] Driver running average calculated correctly: 4.5 stars
[PASS] Driver profile API returns updated aggregate rating: 4.50
[PASS] Rating retrieved by booking ID
[PASS] Persisted rating matches submitted score (5 stars)
[PASS] Bookings list returns payment_status: PAID
[PASS] Bookings list returns rider_rating: 5
[PASS] Bookings list returns transaction ID: TXN-GORIDE-05730314-D96O9

================================================================
 Test Suite Complete: 48 Passed, 0 Failed
================================================================
```

### 7.2 Full Regression Summary
- **Part 1 Suite (`node test_phase3_p1.mjs`):** 20 passed, 0 failed.
- **Part 2 Suite (`npm run test:p2`):** 34 passed, 0 failed.
- **Part 3 Suite (`npm run test:p3`):** 48 passed, 0 failed.
- **Frontend Production Build (`npm run build` in `client`):** 0 errors, built in 3.00s.

---

## 8. Files Changed in Part 3

### Backend (`server/`)
- [`server/src/database/schema.sql`](file:///D:/GoRide/server/src/database/schema.sql): Added `payment_status` to `bookings`; added `payments` table (with virtual unique constraint `uq_successful_payment`) and `ratings` table (with `CHECK (rating >= 1 AND rating <= 5)`).
- [`server/src/database/migrate.js`](file:///D:/GoRide/server/src/database/migrate.js): Programmatic idempotent migration checks for `payment_status`, `payments`, and `ratings`.
- [`server/src/services/paymentService.js`](file:///D:/GoRide/server/src/services/paymentService.js): Core simulated payment processing, row locking, MySQL fare enforcement, duplicate check, transaction generation, and retry logic.
- [`server/src/services/ratingService.js`](file:///D:/GoRide/server/src/services/ratingService.js): Core rating submission, 1–5 scale validation, 500-char review length guard, duplicate rating rejection, and driver aggregate rating calculation.
- [`server/src/services/bookingService.js`](file:///D:/GoRide/server/src/services/bookingService.js): Joined `payment_status`, transaction details, and submitted ratings in `getBookingById` and `listBookings`.
- [`server/src/services/driverService.js`](file:///D:/GoRide/server/src/services/driverService.js): Added `payment_status` to completed trips query.
- [`server/src/routes/paymentRoutes.js`](file:///D:/GoRide/server/src/routes/paymentRoutes.js): Express routes for payments (`/payments`, `/payments/booking/:id`, `/payments/my-payments`, `/payments/admin/all`).
- [`server/src/routes/ratingRoutes.js`](file:///D:/GoRide/server/src/routes/ratingRoutes.js): Express routes for ratings (`/ratings`, `/ratings/booking/:id`, `/ratings/driver/:id`).
- [`server/src/routes/bookingRoutes.js`](file:///D:/GoRide/server/src/routes/bookingRoutes.js): Added aliases (`/:id/pay`, `/:id/rate`, `/:id/payment`, `/:id/rating`).
- [`server/src/routes/adminRoutes.js`](file:///D:/GoRide/server/src/routes/adminRoutes.js): Added collected revenue telemetry to `GET /admin/system-stats`.
- [`server/src/routes/apiRoutes.js`](file:///D:/GoRide/server/src/routes/apiRoutes.js): Mounted `paymentRoutes` and `ratingRoutes`.
- [`server/package.json`](file:///D:/GoRide/server/package.json): Added `test:p1` and `test:p3` test scripts.
- [`server/test_phase3_p3.mjs`](file:///D:/GoRide/server/test_phase3_p3.mjs): Automated verification suite covering all 10 payment and 8 rating specifications.

### Frontend (`client/`)
- [`client/src/pages/RiderDashboardPage.jsx`](file:///D:/GoRide/client/src/pages/RiderDashboardPage.jsx): Integrated Payment Simulation modal (methods selector, demo disclaimer, receipt card) and Post-Trip Rating modal (interactive 5 stars, review textarea), with live badges in the trips table.
- [`client/src/pages/DriverDashboardPage.jsx`](file:///D:/GoRide/client/src/pages/DriverDashboardPage.jsx): Added Settlement column to Completed Trips Ledger and formatted live driver rating to 2 decimal places.
- [`client/src/pages/AdminDashboardPage.jsx`](file:///D:/GoRide/client/src/pages/AdminDashboardPage.jsx): Added Settled Revenue metric card to top telemetry summary.

---

## 9. Phase Boundary & Known Limitations

In strict adherence to the project plan and user instructions:
1. **Live GPS Tracking & WebSockets:** Real-time continuous vehicle tracking remains intentionally deferred.
2. **Real Payment Gateways:** Real financial transactions and gateway credentials (e.g. Razorpay, Stripe, bank APIs) are strictly excluded; safe academic simulation is implemented.

---

## 10. Phase 4 Regression Verification

Phase 4 Consolidated SRS Gap Closure has been fully integrated and validated alongside all Phase 3 modules with zero regressions:
- **Phase 3 Part 1 Suite (`node test_phase3_p1.mjs`):** 20 passed, 0 failed.
- **Phase 3 Part 2 Suite (`npm run test:p2`):** 34 passed, 0 failed.
- **Phase 3 Part 3 Suite (`npm run test:p3`):** 48 passed, 0 failed.
- **Phase 4 Verification Suite (`npm run test:p4`):** 52 passed, 0 failed.
- **Master Regression Suite (`npm run test:all`):** 154 passed, 0 failed.
- **Frontend Production Build (`npm run build` in `client`):** Succeeded in 3.23s, 0 errors, 0 warnings.

For the complete Phase 4 implementation report, refer to [`docs/PHASE_4_PROGRESS.md`](file:///D:/GoRide/docs/PHASE_4_PROGRESS.md).
