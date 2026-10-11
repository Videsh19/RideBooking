import React from 'react';
import Navbar from '../common/Navbar';
import Footer from '../common/Footer';

export default function MainLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-theme-bg text-theme-text transition-colors">
      <Navbar />
      <main className="flex-1 flex flex-col">{children}</main>
      <Footer />
    </div>
  );
}
