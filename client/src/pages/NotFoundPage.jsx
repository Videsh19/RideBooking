import React from 'react';
import { Link } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import Button from '../components/common/Button';

export default function NotFoundPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-12 h-12 rounded-xl bg-theme-surface border border-theme-border flex items-center justify-center text-theme-primary mb-4">
        <FileQuestion className="w-6 h-6" />
      </div>
      <h1 className="text-2xl font-bold text-theme-text mb-2">404 — Page Not Found</h1>
      <p className="text-xs text-theme-text-secondary max-w-sm mb-6 leading-relaxed">
        The requested routing URL does not match any registered GoRide application endpoints.
      </p>
      <Link to="/">
        <Button variant="primary" size="md">
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Return to Overview
        </Button>
      </Link>
    </div>
  );
}
