const PSI_TIMEOUT_MS = 180_000; // 3 minutes for proxy requests
const RETRY_DELAYS_MS = [1000, 3000]; // 2 attempts with shorter delays

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export const fetchPSIReportClientProxy = async (url, strategy, apiKey) => {
  let attempt = 0;
  let lastError;

  while (attempt < RETRY_DELAYS_MS.length + 1) {
    try {
      console.log(`[PSI-CLIENT-PROXY] ${strategy.toUpperCase()} attempt ${attempt + 1}/${RETRY_DELAYS_MS.length + 1} for ${url}`);
      
      const psiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
      psiUrl.searchParams.set('url', url);
      psiUrl.searchParams.set('strategy', strategy);
      psiUrl.searchParams.set('key', apiKey);
      psiUrl.searchParams.set('category', 'performance');
      psiUrl.searchParams.set('locale', 'en');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort('timeout'), PSI_TIMEOUT_MS);

      const response = await fetch(psiUrl.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Google-PSI/1.0; +https://developers.google.com/speed/pagespeed/insights/)',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://developers.google.com/speed/pagespeed/insights/'
        }
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log(`[PSI-CLIENT-PROXY] ${strategy.toUpperCase()} success for ${url}`);
      return data;

    } catch (err) {
      lastError = err;
      console.warn(`[PSI-CLIENT-PROXY] ${strategy.toUpperCase()} attempt ${attempt + 1} failed for ${url}:`, err.message);
      
      if (attempt < RETRY_DELAYS_MS.length) {
        const delayMs = RETRY_DELAYS_MS[attempt];
        console.log(`[PSI-CLIENT-PROXY] Retrying in ${delayMs}ms...`);
        await delay(delayMs);
      }
      attempt++;
    }
  }

  console.error(`[PSI-CLIENT-PROXY] All attempts failed for ${url}:`, lastError);
  return null;
};

/*fast proxy with minimal retries*/
export const fetchPSIReportSimpleProxy = async (url, strategy, apiKey) => {
  console.log(`[PSI-SIMPLE] Trying simple proxy for ${url}...`);
  
  const psiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  psiUrl.searchParams.set('url', url);
  psiUrl.searchParams.set('strategy', strategy);
  psiUrl.searchParams.set('key', apiKey);
  psiUrl.searchParams.set('category', 'performance');
  psiUrl.searchParams.set('locale', 'en');

  // Try with just 2 attempts and simple headers
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      console.log(`[PSI-SIMPLE] Attempt ${attempt + 1}/2 for ${url}`);
      
      const response = await fetch(psiUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Google-PSI/1.0; +https://developers.google.com/speed/pagespeed/insights/)',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://developers.google.com/speed/pagespeed/insights/'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[PSI-SIMPLE] Success for ${url}`);
        return data;
      } else {
        console.warn(`[PSI-SIMPLE] HTTP ${response.status} for ${url}`);
      }
    } catch (error) {
      console.warn(`[PSI-SIMPLE] Attempt ${attempt + 1} failed:`, error.message);
    }
    
    // Small delay between attempts
    if (attempt === 0) {
      await delay(2000);
    }
  }
  
  console.log(`[PSI-SIMPLE] Failed for ${url}`);
  return null;
};


//fast fallback
export const fetchPSIReportSmart = async (url, strategy, apiKey) => {
  // try direct PSI API - for sites that work
  try {
    const directResult = await fetchPSIReportDirect(url, strategy, apiKey);
    if (directResult) {
      console.log(`[PSI] Direct API success for ${url}`);
      return directResult;
    }
  } catch (error) {
    console.log(`[PSI] Direct API failed for ${url}, trying client proxy...`);
  }

  // If direct fails, try client proxy
  try {
    console.log(`[PSI] Using client proxy for ${url}...`);
    const proxyResult = await fetchPSIReportClientProxy(url, strategy, apiKey);
    if (proxyResult) {
      return proxyResult;
    }
  } catch (error) {
    console.warn(`[PSI] Client proxy also failed for ${url}:`, error.message);
  }

  // If both fail, return null
  console.log(`[PSI] Both approaches failed for ${url} - skipping`);
  return null;
};

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