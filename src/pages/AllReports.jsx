import React from "react";
import ReportsSearch from "../components/ReportsSearch";

export default function AllReports() {
  return (
    <section>
      <h1 className="text-2xl font-bold mb-2">All Reports</h1>
      <p className="text-gray-500 mb-4">
        Browse previously run reports. Click any card to open the full run.
      </p>
      <ReportsSearch listAll />
    </section>
  );
}
