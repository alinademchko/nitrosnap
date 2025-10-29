import React from "react";
import ReportsSearch from "../components/ReportsSearch";

export default function AllReports() {
  return (
    <section>
      <p className="text-gray-500 mb-4">
        Browse previously run reports. Click any card to open the full run.
      </p>
      <ReportsSearch listAll />
    </section>
  );
}
