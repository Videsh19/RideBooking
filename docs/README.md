# GoRide — Academic & Engineering Documentation Repository

**Project Title:** GoRide — Smart Urban Ride Booking and Management System  
**Tagline:** Move Smarter. Ride Better.

---

## Academic Documents Status & Requirements

As mandated in Phase 1 planning, business logic and database schema implementations must strictly mirror approved academic software engineering artifacts. The technical foundation has been established in Phase 1. Before implementing domain logic, authentication, booking workflows, and relational tables in subsequent phases, the following reference documents must be placed in this directory or made available for review:

1. **Software Requirements Specification (SRS)**
   - Functional requirements: Rider booking flow, driver dispatching, fare estimation rules, trip states, cancellation policies.
   - Non-functional requirements: Latency targets, security and privacy constraints, session timeouts.
   - User personas and role boundaries: Rider, Driver, Dispatcher/Admin.

2. **UML Class Diagram**
   - Object entities: `User`, `Rider`, `Driver`, `Vehicle`, `Ride`, `Booking`, `Payment`, `FareRule`, `Admin`.
   - Entity attributes, primary and foreign keys, cardinalities (1-to-1, 1-to-many, many-to-many).
   - Method signatures and inheritance hierarchies.
   - *Note:* The relational MySQL database schema in Phase 2 will be directly derived from this approved diagram.

3. **UML Sequence Diagrams**
   - Ride Booking & Driver Dispatch sequence: Rider requests ride -> System calculates fare -> Nearest available driver notified -> Driver accepts/rejects -> Ride initiated.
   - Trip Completion & Settlement sequence: Driver ends trip -> Telemetry logged -> Final fare computed -> Payment recorded.
   - Authentication & Role verification sequence.

4. **UML Use Case Diagram**
   - Actors: Rider, Driver, Administrator.
   - Use cases and extend/include relationships (e.g., `Book Ride` includes `Calculate Fare`, `Cancel Ride` extends `Book Ride`).

5. **Software Engineering Experiment / Lab Reports**
   - Module test specifications, architectural rationale, and evaluation metrics.

6. **Operational Service Area & Territorial Boundaries**
   - **Restricted Operating Territory:** GoRide is strictly constrained to the following six administrative jurisdictions:
     1. `Mumbai City` (South and Central zones)
     2. `Mumbai Suburban` (Western and Eastern zones)
     3. `Palghar district` (Northern corridor)
     4. `Thane district` (Central urban zone)
     5. `Kalyan-Dombivli` (Eastern municipal zone)
     6. `Navi Mumbai` (Trans-Harbour and industrial zone)
   - **Future Business Validation Rule:** In the booking and dispatch modules, pickup coordinates (`pickup_lat`, `pickup_lng`) and dropoff coordinates (`dropoff_lat`, `dropoff_lng`) must fall within polygons enclosing these 6 districts/municipalities. Trips originating or terminating outside these 6 zones must be rejected with `OUT_OF_SERVICE_AREA`.
   - **Academic Note:** Do not claim countrywide operations. Regional focus is strictly the Mumbai Metropolitan Region (MMR).

---

## Document Intake Directory Structure

When ready, place reference files into their respective subdirectories:

```
docs/
├── srs/                     # SRS specification PDF or Markdown
├── uml/
│   ├── class-diagram/       # Approved class diagrams (PNG/PlantUML/Mermaid)
│   ├── sequence-diagrams/   # Booking, dispatch, and settlement flows
│   └── use-case/            # Actor & use case diagrams
└── experiment-reports/      # Software Engineering lab deliverables
```

*Status:* Technical foundation established. Awaiting approved academic documents before implementing Phase 2 business logic and relational schema.
