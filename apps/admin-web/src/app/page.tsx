export default function AdminHomePage() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center font-bold text-slate-950">
            RA
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">RoadAid Admin</h1>
            <p className="text-xs text-slate-400">BUILT FOR CERTAINTY · Abuja Operations</p>
          </div>
        </div>
        <div className="flex items-center space-x-4 text-sm">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            Live
          </span>
          <span className="text-slate-300">Phase 0 Foundation</span>
        </div>
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">System State</h2>
          <p className="mt-2 text-2xl font-bold text-slate-900">Online</p>
          <p className="text-xs text-slate-500 mt-1">Modular monolith API + PostGIS + Redis</p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Active Services</h2>
          <p className="mt-2 text-2xl font-bold text-slate-900">3 Services</p>
          <p className="text-xs text-slate-500 mt-1">Fuel Delivery, Towing, Lockout</p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Target Region</h2>
          <p className="mt-2 text-2xl font-bold text-slate-900">Abuja, Nigeria</p>
          <p className="text-xs text-slate-500 mt-1">Single operational boundary</p>
        </div>
      </div>
    </main>
  );
}
