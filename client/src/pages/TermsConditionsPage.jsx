import React from 'react';
import { FileText, AlertTriangle } from 'lucide-react';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import StatusNotice from '../components/common/StatusNotice';

export default function TermsConditionsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2">
          <Badge variant="warning" size="md">
            Pending Legal Review
          </Badge>
          <span className="text-xs text-theme-text-secondary">
            Draft Academic Terms
          </span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-theme-text">
          Terms and Conditions (Draft Placeholder)
        </h1>
        <p className="text-xs text-theme-text-secondary">
          Last revised: October 2026 • Document Version: 1.0.0-DRAFT
        </p>
      </div>

      <StatusNotice
        type="warning"
        title="Notice Concerning Legal Enforceability"
        message="These terms are provided solely as structural placeholders for educational demonstration in software engineering. They do not constitute an enforceable legal agreement and must undergo thorough review by legal professionals before production deployment."
      />

      <Card padding="p-8" className="space-y-6 text-sm text-theme-text leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-bold text-theme-text flex items-center gap-2">
            <span>1. Platform Identity & Scope</span>
            <span className="text-xs font-normal text-amber-500 font-mono">
              [Content requiring institutional review]
            </span>
          </h2>
          <p className="text-xs text-theme-text-secondary leading-relaxed">
            GoRide provides an algorithmic dispatch interface connecting independent riders seeking transit with authorized driver partners. GoRide does not own transit vehicles or employ drivers directly in an employer-employee relationship.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-theme-text flex items-center gap-2">
            <span>2. Account Eligibility & Responsibilities</span>
            <span className="text-xs font-normal text-amber-500 font-mono">
              [Content requiring institutional review]
            </span>
          </h2>
          <p className="text-xs text-theme-text-secondary leading-relaxed">
            Users must be at least 18 years of age to register as an independent rider or driver. Users agree to maintain accurate profile data and prevent unauthorized third parties from operating their authenticated sessions.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-theme-text flex items-center gap-2">
            <span>3. Booking, Cancellation & Fares</span>
            <span className="text-xs font-normal text-amber-500 font-mono">
              [Content requiring institutional review]
            </span>
          </h2>
          <p className="text-xs text-theme-text-secondary leading-relaxed">
            Fares are computed based on base fees, trip duration, transit distance, and optional surge coefficients. Cancellation fees apply if a rider cancels after a driver has been dispatched and accepted the transit request beyond the allowable grace threshold.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-theme-text flex items-center gap-2">
            <span>4. Driver Partner Obligations & Vehicle Compliance</span>
            <span className="text-xs font-normal text-amber-500 font-mono">
              [Content requiring institutional review]
            </span>
          </h2>
          <p className="text-xs text-theme-text-secondary leading-relaxed">
            Drivers must maintain valid operator licensure, clear background evaluations, and current vehicular inspections. Failure to satisfy municipal roadworthiness conditions results in immediate suspension from the dispatch queue.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-theme-text flex items-center gap-2">
            <span>5. Limitations of Liability & Warranty Disclaimer</span>
            <span className="text-xs font-normal text-amber-500 font-mono">
              [Content requiring institutional review]
            </span>
          </h2>
          <p className="text-xs text-theme-text-secondary leading-relaxed">
            The platform is provided on an "as is" and "as available" basis without warranties of uninterrupted uptime or error-free algorithm matching during extreme weather or network disruptions.
          </p>
        </section>
      </Card>
    </div>
  );
}
