# GoRide — Vehicle Category Classification and Booking Enforcement Report

**Project:** GoRide — Smart Urban Ride Booking and Management System  
**Feature:** Vehicle Category Classification and Dispatch Enforcement  
**Date:** October 2026  
**Stack:** React + Vite + Tailwind CSS | Node.js + Express.js (ES Modules) | MySQL 8.0 (`goride_db`) | OSRM Road Routing  
**Status:** Implemented, Integrated, and Verified  

---

## 1. Executive Summary

Vehicle category classification (`STANDARD`, `COMFORT`, `XL`) has been implemented across the entire GoRide vertical stack. The implementation enforces strict compatibility between requested booking categories and driver vehicle capabilities across all dispatch channels (broadcast queue, nearest-driver geospatial assignment, and atomic ride acceptance) without trusting client-side fare data or compromising database integrity.

### Verification Summary
- **Master Regression Suite (`npm run test:all`):** **190 passed, 0 failed** across 5 suites:
  - Phase 3 Part 1 Suite (`node test_phase3_p1.mjs`): **20 passed, 0 failed**
  - Phase 3 Part 2 Suite (`node test_phase3_p2.mjs`): **34 passed, 0 failed**
  - Phase 3 Part 3 Suite (`node test_phase3_p3.mjs`): **48 passed, 0 failed**
  - Phase 4 Suite (`node test_phase4.mjs`): **52 passed, 0 failed**
  - Vehicle Categories Suite (`node test_vehicle_categories.mjs`): **36 passed, 0 failed**
- **Frontend Production Build (`npm run build` in `client`):** **Success (2.13s, 0 errors, 0 warnings)**

---

## 2. Approved Vehicle Categories & Fare Rules

Support is strictly limited to the three authorized categories:
- **`STANDARD`**: Compact & sedan vehicles for regular city commutes (Capacity: 4 seats).
- **`COMFORT`**: Premium sedans with enhanced space and climate control (Capacity: 4 seats).
- **`XL`**: Extended SUVs / MUVs for group travel and luggage (Capacity: 6 seats).

### Fare Formula & Pricing Parameters
All fares are computed server-side from actual OSRM road distance using the formula:
$$\text{Total Fare} = \max(\text{Minimum Fare}, \operatorname{round}(\text{Base Fare} + (\text{Road Distance (km)} \times \text{Rate Per Km})))$$

| Category | Base Fare | Rate Per Km | Minimum Fare | 10 km Road Route Sample |
| :--- | :---: | :---: | :---: | :---: |
| **STANDARD** | ₹50.00 | ₹15.00/km | ₹70.00 | ₹200.00 |
| **COMFORT** | ₹80.00 | ₹22.00/km | ₹110.00 | ₹300.00 |
| **XL** | ₹130.00 | ₹32.00/km | ₹180.00 | ₹450.00 |

*Note: Frontend-supplied fares are never trusted. All calculations are executed server-side via `calculateFareFromDistance()`.*

---

## 3. Database Schema and Migration Safety

### Applied Migrations
1. **`driver_profiles.vehicle_category`**:
   - Column: `ENUM('STANDARD', 'COMFORT', 'XL') NULL`
   - Index: `idx_driver_vehicle_category (vehicle_category)`
   - Safe migration: Added without default value (`NULL`). Existing legacy driver records are preserved as `NULL` (unclassified).
2. **`bookings.vehicle_tier`**:
   - Safely migrated to uppercase `ENUM('STANDARD', 'COMFORT', 'XL') NOT NULL DEFAULT 'STANDARD'` via temporary `VARCHAR(20)` cast and uppercase update. Historical booking records and their original fares were strictly preserved without data loss.

### Legacy Driver Policy
- Legacy drivers whose vehicle category is `NULL` (unclassified) are safely preserved.
- Unclassified drivers are barred from the live dispatch queue (`getAvailableDispatchQueue` returns empty list if `!profile.vehicle_category`).
- Direct API acceptance attempts by unclassified drivers are rejected with HTTP 403 `INCOMPATIBLE_VEHICLE_CATEGORY`.
- Driver console displays an amber warning banner notifying the driver that administrative classification is required before dispatching rides.

---

## 4. Dispatch and Acceptance Compatibility Enforcement

### 1. Broadcast Dispatch Queue
`getAvailableDispatchQueue(userId)`:
- Validates driver approval (`approval_status === 'APPROVED'`) and duty status (`is_available === true`).
- Validates classification (`!profile.vehicle_category` returns empty array).
- Filters available ride offers strictly by `b.vehicle_tier = profile.vehicle_category`.
- Standard drivers cannot see Comfort or XL offers; Comfort drivers cannot see Standard or XL offers; XL drivers cannot see Standard or Comfort offers.

### 2. Atomic Row-Lock Acceptance (`acceptBooking`)
- Obtains clustered row lock `SELECT booking_id, status, driver_id, vehicle_tier FROM bookings WHERE booking_id = ? FOR UPDATE`.
- Enforces category match:
  ```javascript
  if (!profile.vehicle_category || profile.vehicle_category.toUpperCase() !== String(targetRows[0].vehicle_tier).toUpperCase()) {
    await connection.rollback();
    throw { statusCode: 403, code: 'INCOMPATIBLE_VEHICLE_CATEGORY', message: '...' };
  }
  ```
- Any direct API attempt by an incompatible or unclassified driver fails with HTTP 403.
- Concurrent driver acceptance race conditions are handled via transaction rollback and return HTTP 409 `BOOKING_ALREADY_ASSIGNED` for the loser.

### 3. Nearest-Driver Assignment (`assignNearestDriver`)
- `findNearestAvailableDrivers(bookingId)` filters candidates by `d.vehicle_category = bookingCategory`.
- If no compatible drivers are online with location telemetry, returns `assigned: false`, `compatibleDriversFound: false`, and a clear message without performing silent category substitution.

---

## 5. Frontend Dashboard Updates

1. **Driver Registration (`RegisterPage.jsx`)**:
   - Added required `Vehicle Category Classification` interactive selector (`STANDARD`, `COMFORT`, `XL`).
   - Validates on form submission; sends `vehicleCategory` to `POST /api/auth/register`.
2. **Rider Workspace (`RiderDashboardPage.jsx`)**:
   - Standardized vehicle tier selection to uppercase constants (`STANDARD`, `COMFORT`, `XL`).
   - Displays category badges in booking confirmation banner, upfront fare estimate, and the Passenger Rides Ledger.
3. **Driver Console (`DriverDashboardPage.jsx`)**:
   - Shows driver's vehicle category in the Assigned Vehicle shift card.
   - Displays unclassified warning banner if driver category is `NULL`.
   - Displays category badge on all live dispatch queue offers.
   - Displays category under submitted credentials in the pending verification state.
4. **Admin Console (`AdminDashboardPage.jsx`)**:
   - Shows vehicle category badge in the Driver Partner Onboarding & Verification queue table.
   - Shows driver vehicle category in the User Role Registry table.
   - Shows booking vehicle category in the Payment Oversight & Administrative Refunds table.

---

## 6. Files Changed

| Component | File Path | Description |
| :--- | :--- | :--- |
| **Database** | `server/src/database/schema.sql` | Added `vehicle_category` to `driver_profiles` and updated `bookings.vehicle_tier` ENUM. |
| **Database** | `server/src/database/migrate.js` | Added safe migration for `vehicle_category` column, index, and demo driver update. |
| **Backend Auth** | `server/src/controllers/authController.js` | Destructured `vehicleCategory` from registration body. |
| **Backend Auth** | `server/src/services/authService.js` | Enforced required vehicle category validation for driver registration. |
| **Backend Driver** | `server/src/services/driverService.js` | Updated `getDriverProfile`, `getAvailableDispatchQueue`, `acceptBooking`, `findNearestAvailableDrivers`, `assignNearestDriver`, and `getPendingDriverApplications` for category filtering. |
| **Backend Booking** | `server/src/services/bookingService.js` | Enforced strict category validation in `calculateFareFromDistance`, `estimateFare`, and `createBooking`. |
| **Backend Admin** | `server/src/routes/adminRoutes.js` | Selected `d.vehicle_category` in `GET /api/admin/users`. |
| **Backend Payment**| `server/src/services/paymentService.js` | Selected `b.vehicle_tier AS booking_tier` and `vehicle_category` in admin payments list. |
| **Frontend Register**| `client/src/pages/RegisterPage.jsx` | Added vehicle category radio selector in driver registration form. |
| **Frontend Rider** | `client/src/pages/RiderDashboardPage.jsx` | Standardized tier IDs to uppercase, updated fare estimate and trips ledger category badges. |
| **Frontend Driver**| `client/src/pages/DriverDashboardPage.jsx` | Added vehicle category badge in vehicle card, unclassified warning banner, and pending credentials review. |
| **Frontend Admin** | `client/src/pages/AdminDashboardPage.jsx` | Added category badges in driver applications table, user registry, and payments oversight table. |
| **Tests** | `server/test_vehicle_categories.mjs` | Created dedicated test suite covering requirements 1 through 12. |
| **Tests** | `server/test_phase3_p1.mjs` | Added `vehicleCategory: 'STANDARD'` to driver registration payload. |
| **Tests** | `server/test_phase3_p2.mjs` | Added `vehicleCategory: 'STANDARD'` to driver 1–4 registration payloads. |
| **Tests** | `server/test_phase3_p3.mjs` | Added `vehicleCategory: 'STANDARD'` to test driver registration payload. |
| **Tests** | `server/test_phase4.mjs` | Added `vehicleCategory: 'STANDARD'` to test drivers registration payloads. |
| **Server Config** | `server/package.json` | Added `test:categories` script and included it in `test:all`. |

---

## 7. Automated Test Results

### 1. Dedicated Vehicle Categories Suite (`node test_vehicle_categories.mjs`)
- **Test 1:** Driver registration saves chosen category: **PASS**
- **Test 2:** Invalid categories rejected on registration, estimation, and booking: **PASS**
- **Test 3:** Rider bookings persist chosen category in database: **PASS**
- **Test 4:** Fare estimation respects category-specific rules: **PASS**
- **Test 5:** Standard bookings exclude Comfort and XL drivers: **PASS**
- **Test 6:** Comfort bookings exclude Standard and XL drivers: **PASS**
- **Test 7:** XL bookings exclude Standard and Comfort drivers: **PASS**
- **Test 8:** Direct API acceptance attempts by incompatible drivers rejected with HTTP 403: **PASS**
- **Test 9:** Unclassified legacy drivers blocked from dispatch queue and acceptance: **PASS**
- **Test 10:** No-compatible-driver behavior handled cleanly without silent substitution: **PASS**
- **Test 11:** Concurrent acceptance allows at most one driver to win: **PASS**
- **Test 12:** Ride lifecycle, payments, ratings, and cancellations remain functional: **PASS**
- **Result:** **36 Passed, 0 Failed** (Exit code 0)

### 2. Master Regression Suite (`npm run test:all`)
- `test:p1`: **20 Passed, 0 Failed**
- `test:p2`: **34 Passed, 0 Failed**
- `test:p3`: **48 Passed, 0 Failed**
- `test:p4`: **52 Passed, 0 Failed**
- `test:categories`: **36 Passed, 0 Failed**
- **Total:** **190 Passed, 0 Failed** (Exit code 0)

### 3. Frontend Production Build (`npm run build`)
```
✓ 1606 modules transformed.
dist/index.html                   1.48 kB │ gzip:  0.81 kB
dist/assets/index-BZOecI0l.css   30.11 kB │ gzip:  6.21 kB
dist/assets/index-PMUX-v94.js   317.90 kB │ gzip: 84.78 kB
✓ built in 2.13s
```

---

## 8. Stakeholder Approval Items & Proposed Rules

The following item is documented for stakeholder and project sponsor sign-off:

1. **Vehicle Eligibility & Model Classification Guidelines:**
   - *Current Implementation:* The driver chooses from `STANDARD`, `COMFORT`, or `XL` upon registration. An admin verifies the vehicle make and model during document and application review before approving the driver.
   - *Proposed Rule for Approval:*
     - **STANDARD**: Hatchbacks and compact sedans (e.g. Maruti Suzuki WagonR, Swift, Dzire, Hyundai i10/i20). Passenger capacity up to 4.
     - **COMFORT**: Premium sedans and mid-size sedans with air conditioning and top driver ratings (e.g. Honda City, Hyundai Verna, Hyundai Aura, Skoda Slavia). Passenger capacity up to 4.
     - **XL**: Extended 6-seater/7-seater SUVs and MUVs (e.g. Toyota Innova, Maruti Suzuki Ertiga, Mahindra XUV700). Passenger capacity up to 6.
   - *Status:* Pending stakeholder formal approval. Current system enforces category matching based on verified vehicle classification without inventing unapproved constraints.
