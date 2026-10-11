import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Car,
  Navigation,
  Shield,
  Server,
  ArrowRight,
  Database,
  CheckCircle2,
  MapPin,
} from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import StatusNotice from '../components/common/StatusNotice';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function LandingPage() {
  const [healthData, setHealthData] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState(null);

  const serviceAreas = [
    { name: 'Mumbai City', region: 'South & Central' },
    { name: 'Mumbai Suburban', region: 'Western & Eastern' },
    { name: 'Palghar district', region: 'Northern Corridor' },
    { name: 'Thane district', region: 'Central Urban' },
    { name: 'Kalyan-Dombivli', region: 'Eastern Belt' },
    { name: 'Navi Mumbai', region: 'Trans-Harbour' },
  ];

  useEffect(() => {
    let isMounted = true;
    async function checkHealth() {
      try {
        setHealthLoading(true);
        const res = await fetch('http://localhost:5000/api/health');
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const json = await res.json();
        if (isMounted) {
          setHealthData(json.data);
          setHealthError(null);
        }
      } catch (err) {
        if (isMounted) {
          setHealthError(err.message);
          setHealthData(null);
        }
      } finally {
        if (isMounted) setHealthLoading(false);
      }
    }

    checkHealth();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-16 pb-16">
      {/* Hero Section */}
      <section className="border-b border-theme-border bg-theme-card/30 py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2">
              <Badge variant="purple" size="md">
                Platform Preview
              </Badge>
              <span className="text-xs text-theme-text-secondary">
                Urban Transit System
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-theme-text leading-tight">
              GoRide — Smart Urban Ride Booking and Management System
            </h1>

            <p className="text-lg font-medium text-theme-primary">
              Move Smarter. Ride Better.
            </p>

            <p className="text-sm sm:text-base text-theme-text-secondary leading-relaxed max-w-2xl">
              An engineering-grade urban transit platform built with React, Express, and a relational MySQL architecture. Serving Mumbai City, Mumbai Suburban, Palghar, Thane, Kalyan-Dombivli and Navi Mumbai with coordinated passenger booking, driver dispatching, and fleet governance.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link to="/rider" id="hero-cta-rider">
                <Button variant="primary" size="lg">
                  Explore Rider Workspace
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
              <Link to="/driver" id="hero-cta-driver">
                <Button variant="secondary" size="lg">
                  Driver Console
                </Button>
              </Link>
              <Link to="/admin" id="hero-cta-admin">
                <Button variant="outline" size="lg">
                  Admin Console
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Operational Service Territory Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card
          title="Operational Service Territory"
          subtitle="Designated coverage zones across the Mumbai Metropolitan Region"
        >
          <div className="space-y-4">
            <p className="text-xs text-theme-text-secondary leading-relaxed">
              Serving Mumbai City, Mumbai Suburban, Palghar, Thane, Kalyan-Dombivli and Navi Mumbai. GoRide is specifically planned for transit operations within these six administrative territories.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {serviceAreas.map((area) => (
                <div
                  key={area.name}
                  className="p-3 rounded-lg border border-theme-border bg-theme-surface flex flex-col justify-between"
                >
                  <div className="flex items-center gap-1.5 text-theme-primary mb-1">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-theme-text-secondary">
                      Zone
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-theme-text">
                    {area.name}
                  </span>
                  <span className="text-[10px] text-theme-text-secondary mt-1">
                    {area.region}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-theme-text-secondary pt-1">
              * Note: Service is planned strictly for these six designated territories. Geospatial boundary validation and pickup eligibility checks will be handled during transit dispatching.
            </p>
          </div>
        </Card>
      </section>

      {/* Backend Health & Connectivity Probe */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card
          title="Backend Service & Database Probe"
          subtitle="Real-time verification of Express REST API and MySQL driver state"
          className="bg-theme-card"
        >
          {healthLoading ? (
            <div className="py-4">
              <LoadingSpinner label="Querying backend health endpoint at http://localhost:5000/api/health..." />
            </div>
          ) : healthError ? (
            <StatusNotice
              type="warning"
              title="Backend Server Offline or Unreachable"
              message={`Could not connect to http://localhost:5000/api/health (${healthError}). Ensure the Express backend is running via 'npm run dev' or 'npm start' in the server directory.`}
            />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-3.5 rounded-lg border border-theme-border bg-theme-surface">
                  <span className="text-[11px] font-medium text-theme-text-secondary block">
                    API Status
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-semibold capitalize text-theme-text">
                      {healthData?.status}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg border border-theme-border bg-theme-surface">
                  <span className="text-[11px] font-medium text-theme-text-secondary block">
                    Environment
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <Server className="w-4 h-4 text-theme-primary" />
                    <span className="text-sm font-semibold text-theme-text">
                      {healthData?.environment}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg border border-theme-border bg-theme-surface">
                  <span className="text-[11px] font-medium text-theme-text-secondary block">
                    Database Driver
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <Database className="w-4 h-4 text-theme-primary" />
                    <span className="text-sm font-semibold text-theme-text">
                      {healthData?.database?.driver} (MySQL)
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg border border-theme-border bg-theme-surface">
                  <span className="text-[11px] font-medium text-theme-text-secondary block">
                    MySQL Connection Probe
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        healthData?.database?.isConnected
                          ? 'bg-emerald-500'
                          : 'bg-amber-500'
                      }`}
                    />
                    <span className="text-sm font-semibold capitalize text-theme-text">
                      {healthData?.database?.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-xs text-theme-text-secondary p-3 rounded-lg bg-theme-surface/50 border border-theme-border leading-relaxed">
                <strong>Probe Diagnostic:</strong> {healthData?.database?.message}
                {healthData?.database?.errorCode && (
                  <span className="ml-1 text-amber-500 font-mono">
                    (Code: {healthData?.database?.errorCode})
                  </span>
                )}
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* Platform Pillars */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-theme-text tracking-tight">
            Core Architecture Pillars
          </h2>
          <p className="text-xs text-theme-text-secondary mt-1">
            Separated functional domains designed according to software engineering specifications
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Rider Pillar */}
          <Card
            className="flex flex-col justify-between"
            padding="p-6"
            title="1. Rider Booking Workspace"
            subtitle="Passenger workflow interface"
          >
            <p className="text-xs text-theme-text-secondary leading-relaxed mb-4">
              Provides route origin and destination entry, vehicle category selection (Standard, Comfort, XL), and trip preview containers. Geared for fast passenger initiation and clear status feedback.
            </p>
            <div className="space-y-2 mb-6 text-xs text-theme-text-secondary">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-theme-primary" />
                <span>Pickup and drop-off coordinates layout</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-theme-primary" />
                <span>Ride tier classification</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-theme-primary" />
                <span>Trip history ledger placeholder</span>
              </div>
            </div>
            <Link to="/rider" className="block">
              <Button variant="secondary" size="sm" className="w-full">
                Open Rider Workspace
              </Button>
            </Link>
          </Card>

          {/* Driver Pillar */}
          <Card
            className="flex flex-col justify-between"
            padding="p-6"
            title="2. Driver Dispatch Console"
            subtitle="Operator operations interface"
          >
            <p className="text-xs text-theme-text-secondary leading-relaxed mb-4">
              Built for driver partners with an availability toggle, assigned vehicle configuration card, shift summary previews, and an honest dispatch queue placeholder.
            </p>
            <div className="space-y-2 mb-6 text-xs text-theme-text-secondary">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-theme-primary" />
                <span>Availability status toggle (UI)</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-theme-primary" />
                <span>Vehicle configuration overview</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-theme-primary" />
                <span>Empty dispatch queue layout</span>
              </div>
            </div>
            <Link to="/driver" className="block">
              <Button variant="secondary" size="sm" className="w-full">
                Open Driver Console
              </Button>
            </Link>
          </Card>

          {/* Admin Pillar */}
          <Card
            className="flex flex-col justify-between"
            padding="p-6"
            title="3. Fleet Admin Console"
            subtitle="System governance & telemetry"
          >
            <p className="text-xs text-theme-text-secondary leading-relaxed mb-4">
              Platform management dashboard providing infrastructure probes, user registry placeholders, and trip monitoring tables for centralized transit governance.
            </p>
            <div className="space-y-2 mb-6 text-xs text-theme-text-secondary">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-theme-primary" />
                <span>Live backend health check probe</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-theme-primary" />
                <span>User directory structure layout</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-theme-primary" />
                <span>Database connectivity monitor</span>
              </div>
            </div>
            <Link to="/admin" className="block">
              <Button variant="secondary" size="sm" className="w-full">
                Open Admin Console
              </Button>
            </Link>
          </Card>
        </div>
      </section>
    </div>
  );
}
