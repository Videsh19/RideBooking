import React from 'react';
import { Shield, FileText, AlertTriangle } from 'lucide-react';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import StatusNotice from '../components/common/StatusNotice';

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2">
          <Badge variant="warning" size="md">
            Pending Legal Review
          </Badge>
          <span className="text-xs text-theme-text-secondary">
            Draft Academic Specification
          </span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-theme-text">
          Privacy Policy (Draft Placeholder)
        </h1>
        <p className="text-xs text-theme-text-secondary">
          Last revised: October 2026 • Document Version: 1.0.0-DRAFT
        </p>
      </div>

      <StatusNotice
        type="warning"
        title="Notice Concerning Legal Compliance"
        message="This document is an academic engineering placeholder created for system architecture demonstration. It has not been reviewed by qualified legal counsel and does not constitute a legally binding privacy agreement or certified GDPR/CCPA compliance."
      />

      <Card padding="p-8" className="space-y-6 text-sm text-theme-text leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-bold text-theme-text flex items-center gap-2">
            <span>1. Information Collection & Ingestion</span>
            <span className="text-xs font-normal text-amber-500 font-mono">
              [Content requiring institutional review]
            </span>
          </h2>
          <p className="text-xs text-theme-text-secondary leading-relaxed">
            During operations, the GoRide system may collect user identifiers including full name, telephone contact details, and institutional email addresses during registration. In this system preview, no persistent records are saved to relational storage.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-theme-text flex items-center gap-2">
            <span>2. Geolocation and Telemetry Ingestion</span>
            <span className="text-xs font-normal text-amber-500 font-mono">
              [Content requiring institutional review]
            </span>
          </h2>
          <p className="text-xs text-theme-text-secondary leading-relaxed">
            Transit services rely fundamentally on geospatial data. GPS coordinates are intended solely for trip routing, accurate fare calculation, and driver matching. Real-time background location tracking is strictly disabled in this phase.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-theme-text flex items-center gap-2">
            <span>3. Relational Database Retention (MySQL)</span>
            <span className="text-xs font-normal text-amber-500 font-mono">
              [Content requiring institutional review]
            </span>
          </h2>
          <p className="text-xs text-theme-text-secondary leading-relaxed">
            Once relational tables are instantiated according to the approved class diagram, user account entities will be stored with hashed passwords (bcrypt/argon2). Financial transaction ledgers will follow ACID transactional guarantees.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-theme-text flex items-center gap-2">
            <span>4. Third-Party Sharing Restrictions</span>
            <span className="text-xs font-normal text-amber-500 font-mono">
              [Content requiring institutional review]
            </span>
          </h2>
          <p className="text-xs text-theme-text-secondary leading-relaxed">
            Personal data will not be sold or brokered. Data exchanges will be limited strictly to necessary payment gateway APIs and mapping tile providers as specified in future technical requirements.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-theme-text flex items-center gap-2">
            <span>5. User Rights and Data Deletion</span>
            <span className="text-xs font-normal text-amber-500 font-mono">
              [Content requiring institutional review]
            </span>
          </h2>
          <p className="text-xs text-theme-text-secondary leading-relaxed">
            Users retain the right to inspect stored profile attributes, export trip histories, and request account erasure. Administrative APIs for account retirement will be incorporated in future administrative sprints.
          </p>
        </section>
      </Card>
    </div>
  );
}
