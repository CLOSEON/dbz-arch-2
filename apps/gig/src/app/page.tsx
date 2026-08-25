'use client';

import { auth } from '@dabzzo/shared-auth';

export default function GigHomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
        <span className="text-4xl mb-4 block">⚡</span>
        <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Hello, Gig Panel</h1>
        <p className="text-sm font-medium text-slate-500 mb-6">
          Welcome to gig.dabzzo.in. On-demand shifts & task management.
        </p>
        <div className="p-3 bg-slate-50 rounded-xl text-xs font-mono text-slate-600">
          Firebase Status: {auth ? 'Connected' : 'Disconnected'}
        </div>
      </div>
    </main>
  );
}
