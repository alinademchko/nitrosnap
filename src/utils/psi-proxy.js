const PSI_TIMEOUT_MS = 300_000; // 5 minutes for proxy requests
const RETRY_DELAYS_MS = [2000, 5000, 10000]; // 3 attempts with longer delays

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

//Fetch PSI report through our backend proxy to bypass blocking
export const fetchPSIReportProxy = async (url, strategy, apiKey) => {
  // Try different proxy paths in case the file is in different locations
  const proxyPaths = [
    '/api/psi-proxy.php',
    '/psi-proxy.php', 
    'http://localhost:3002/api/psi-proxy.php',
    'http://localhost:3000/api/psi-proxy.php'
  ];

  let attempt = 0;
  let lastError;

  while (attempt < RETRY_DELAYS_MS.length + 1) {
    try {
      console.log(`[PSI-PROXY] ${strategy.toUpperCase()} attempt ${attempt + 1}/${RETRY_DELAYS_MS.length + 1} for ${url}`);
      
      // Try each proxy path until one works
      let response = null;
      let proxyError = null;
      
      for (const proxyPath of proxyPaths) {
        try {
          const proxyUrl = `${proxyPath}?${new URLSearchParams({
            url,
            strategy,
            apiKey
          })}`;
          
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort('timeout'), PSI_TIMEOUT_MS);

          response = await fetch(proxyUrl, {
            signal: controller.signal,
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          });

          clearTimeout(timer);

          if (response.ok) {
            break; // Found working proxy path
          } else {
            proxyError = `HTTP ${response.status}`;
          }
        } catch (err) {
          proxyError = err.message;
          continue; // Try next proxy path
        }
      }

      if (!response || !response.ok) {
        throw new Error(`All proxy paths failed. Last error: ${proxyError}`);
      }

      const data = await response.json();
      console.log(`[PSI-PROXY] ${strategy.toUpperCase()} success for ${url}`);
      return data;

    } catch (err) {
      lastError = err;
      console.warn(`[PSI-PROXY] ${strategy.toUpperCase()} attempt ${attempt + 1} failed for ${url}:`, err.message);
      
      if (attempt < RETRY_DELAYS_MS.length) {
        const delayMs = RETRY_DELAYS_MS[attempt];
        console.log(`[PSI-PROXY] Retrying in ${delayMs}ms...`);
        await delay(delayMs);
      }
      attempt++;
    }
  }

  console.error(`[PSI-PROXY] All attempts failed for ${url}:`, lastError);
  return null;
};

//Smart PSI fetch with proxy fallback
export const fetchPSIReportSmart = async (url, strategy, apiKey) => {
  // First try direct PSI API (for sites that work)
  try {
    const directResult = await fetchPSIReportDirect(url, strategy, apiKey);
    if (directResult) {
      console.log(`[PSI] Direct API success for ${url}`);
      return directResult;
    }
  } catch (error) {
    console.log(`[PSI] Direct API failed for ${url}, trying proxy...`);
  }

  // If direct fails, try proxy
  try {
    console.log(`[PSI] Using proxy for ${url} to bypass Cloudflare...`);
    const proxyResult = await fetchPSIReportProxy(url, strategy, apiKey);
    if (proxyResult) {
      return proxyResult;
    }
  } catch (error) {
    console.warn(`[PSI] Proxy also failed for ${url}:`, error.message);
  }

  // If both fail, return null
  console.log(`[PSI] Both direct and proxy failed for ${url} - skipping`);
  return null;
};

//Direct PSI API call
async function fetchPSIReportDirect(url, strategy, apiKey) {
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('strategy', strategy);
  endpoint.searchParams.set('key', apiKey);
  endpoint.searchParams.set('category', 'performance');
  endpoint.searchParams.set('locale', 'en');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), 180_000);

  try {
    const response = await fetch(endpoint.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Google-PSI/1.0; +https://developers.google.com/speed/pagespeed/insights/)',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
