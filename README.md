## Nitro Snap

A React single-page application with a minimal PHP API for storing and retrieving PageSpeed-like reports. The frontend lives in `nitro-snap/` and the PHP endpoints live in `nitro-snap/api/`.

### Features
- Collect page performance results (with/without Nitro) for mobile and desktop
- Visualize metrics (e.g., performance score, FCP, LCP, TBT, CLS)
- Save and retrieve reports via a lightweight PHP API (MySQL backend)
- Export to PDF (via `jspdf`/`html2canvas`)

## Project Structure
```
nitro-snap/
  api/                 PHP API endpoints and helpers
    common.php         CORS, JSON helpers, PDO connection
    config.php         Database config (do not commit secrets)
    get_report.php     GET endpoint for reports
    save_report.php    POST endpoint to store a report
  public/              CRA public assets
  src/                 React application source
    components/        UI components (forms, charts, gauges)
    utils/             API and PSI utilities
  package.json         CRA scripts and dependencies
```

## Prerequisites
- Node.js 18+
- npm 9+
- PHP 8.1+ with PDO MySQL extension
- MySQL 8 (or compatible)

## Environment Variables

Create a `.env` file in `nitro-snap/` (same folder as `package.json`).

Recommended variables:
```
# Point the frontend to your API base URL. If you run the PHP server on port 8000:
REACT_APP_API_BASE=http://localhost:8000

# Optional: PSI API key if your UI passes it through to requests
# REACT_APP_PSI_KEY=your_google_psi_api_key
```

Notes:
- `src/utils/api.js` defaults `API_BASE` to `/api`. For local development where PHP runs on a different port, set `REACT_APP_API_BASE` accordingly.
- `api/common.php` enables CORS for `http://localhost:3000` by default.

## Database

The API expects a `reports` table. A minimal schema example:
```sql
CREATE TABLE reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_id VARCHAR(64) NOT NULL,
  case_id VARCHAR(128) NULL,
  url TEXT NOT NULL,
  device ENUM('mobile','desktop') NOT NULL,
  nitro_header VARCHAR(32) NULL,
  perf_with INT NULL,
  perf_without INT NULL,
  fcp_with_s DECIMAL(10,3) NULL,
  fcp_without_s DECIMAL(10,3) NULL,
  lcp_with_s DECIMAL(10,3) NULL,
  lcp_without_s DECIMAL(10,3) NULL,
  tbt_with_ms DECIMAL(10,3) NULL,
  tbt_without_ms DECIMAL(10,3) NULL,
  cls_with DECIMAL(10,3) NULL,
  cls_without DECIMAL(10,3) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Configure database access in `nitro-snap/api/config.php`:
```php
<?php
return [
  'host' => 'localhost',
  'db'   => 'YOUR_DB_NAME',
  'user' => 'YOUR_DB_USER',
  'pass' => 'YOUR_DB_PASS',
  'charset' => 'utf8mb4',
];
```
Do not commit real credentials. Consider using environment variables and loading them in `config.php`.

## Running Locally

### 1) Install frontend dependencies
```bash
cd nitro-snap
npm install
```

### 2) Start the PHP API (in a separate terminal)
Using PHP's built-in server:
```bash
cd nitro-snap/api
php -S localhost:8000
```
This serves the endpoints at `http://localhost:8000/*.php` (e.g., `http://localhost:8000/save_report.php`).

### 3) Start the React app
```bash
cd nitro-snap
npm start
```
Open `http://localhost:3000`. Ensure your `.env` sets `REACT_APP_API_BASE=http://localhost:8000` so the UI can reach the API.

## Available Scripts

From `nitro-snap/` directory:

### `npm start`
Runs the app in development mode on `http://localhost:3000`.

### `npm test`
Launches the test runner in watch mode.

### `npm run build`
Builds the app for production to the `build` folder.

### `npm run eject`
Ejects Create React App configuration (irreversible).

## API Reference

Base URL: `${REACT_APP_API_BASE}` (e.g., `http://localhost:8000`)

### POST `/save_report.php`
Insert a single report row.

Request body (JSON):
```json
{
  "group_id": "string",
  "case_id": "optional string",
  "url": "https://example.com/page",
  "device": "mobile | desktop",
  "nitro_header": "optional string",
  "perf_with": 95,
  "perf_without": 80,
  "fcp_with_s": 1.2,
  "fcp_without_s": 2.0,
  "lcp_with_s": 1.9,
  "lcp_without_s": 3.1,
  "tbt_with_ms": 75,
  "tbt_without_ms": 240,
  "cls_with": 0.02,
  "cls_without": 0.08
}
```

Response (200):
```json
{ "ok": true, "id": 123 }
```

Errors:
- 400 Missing required fields
- 500 Database errors

### GET `/get_report.php`
Fetch reports by different selectors.

Query options:
- `id`: fetch a single row by ID
- `url`: fetch recent rows by URL (use `limit`, default 10, max 100)
- `case_id`: fetch recent rows by case ID (use `limit`)
- `group_id`: fetch all rows for a run group (e.g., mobile + desktop)
- `limit`: integer up to 100 (where applicable)

Examples:
- `/get_report.php?id=123`
- `/get_report.php?url=https://example.com&limit=10`
- `/get_report.php?case_id=MYCASE&limit=5`
- `/get_report.php?group_id=1699999999999`

Responses:
- For `id`: a single object (404 if not found)
- For `url`, `case_id`, `group_id`: an array of objects

## PSI Utility

`src/utils/psi.js` provides a helper to call Google PageSpeed Insights v5 endpoint. You can supply an API key from the UI or environment.

```js
fetchPSIReport(url, strategy, apiKey)
```
- `url`: page to analyze
- `strategy`: `mobile` or `desktop`
- `apiKey`: Google PSI API key (recommended)

## Security & Configuration Notes
- Enable CORS carefully in `api/common.php` (adjust origin for production).
- Do not commit real database credentials. Replace `api/config.php` with environment-based loading in production.
- Validate and sanitize inputs server-side (the API currently validates presence and casts numerics).

## Deployment

Frontend:
- Build with `npm run build` and deploy the `build/` directory to your hosting (e.g., static hosting or behind a web server).

Backend (PHP):
- Serve `nitro-snap/api` via Apache/Nginx with PHP-FPM or similar. Map a route (e.g., `/api`) or serve directly.
- If served behind `/api`, set `REACT_APP_API_BASE` to that absolute URL.

## Troubleshooting
- CORS errors: ensure `Access-Control-Allow-Origin` in `api/common.php` matches your frontend origin.
- 404/Network errors: confirm `REACT_APP_API_BASE` points to the correct PHP server and port.
- DB connection issues: verify `api/config.php` credentials and that the `reports` table exists.
