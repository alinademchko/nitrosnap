import React from "react";
import SpeedSnapshotForm from "./components/SpeedSnapshotForm";
import { Routes, Route, Link } from "react-router-dom";
import AllReports from "./pages/AllReports";

export default function App() {
  return (
    <div className="app">
      <header className="p-4 border-b flex gap-4">
        <Link to="/" className="font-bold">
          NitroSnap
        </Link>
        <nav className="flex gap-3">
          <Link to="/reports">All reports</Link>
        </nav>
      </header>

      <main className="p-4">
        <Routes>
          <Route path="/" element={<SpeedSnapshotForm />} />
          <Route path="/reports" element={<AllReports />} />
        </Routes>
      </main>
    </div>
  );
}
