const PSI_TIMEOUT_MS = 180_000; // 3 minutes - How long to wait for a single PSI request before aborting (per request)

const RETRY_DELAYS_MS = [1000, 3000, 7000]; // 3 attempts total

// Safe mode delays (for rate-limited sites)
const SAFE_MODE_DELAYS_MS = [15000, 30000, 60000]; // 3 attempts with very long delays
const SAFE_MODE_TIMEOUT_MS = 600_000; // 10 minutes for safe mode

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/*Fetch with timeout and PSI-like headers.*/
async function fetchWithTimeout(url, { timeout = PSI_TIMEOUT_MS, ...opts } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort('timeout'), timeout);

  try {
    const res = await fetch(url, { 
      ...opts, 
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Google-PSI/1.0; +https://developers.google.com/speed/pagespeed/insights/)',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        ...opts.headers
      }
    });

    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch (_) {}
      const snippet = body ? ` :: ${body.slice(0, 200)}` : '';
      throw new Error(`HTTP ${res.status} ${res.statusText}${snippet}`);
    }

    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function buildPsiUrl(targetUrl, strategy, apiKey) {
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', targetUrl);
  endpoint.searchParams.set('strategy', strategy);
  if (apiKey) endpoint.searchParams.set('key', apiKey);
  
  // Add parameters that mimic the official PSI tool
  endpoint.searchParams.set('category', 'performance');
  endpoint.searchParams.set('locale', 'en');
  
  return endpoint.toString();
}

//Detect if error indicates rate limiting/firewall issues
function isRateLimitError(err) {
  const message = err?.message || '';
  const status = err?.status || '';
  
  // Only trigger safe mode for actual rate limiting, not website blocking
  return (
    status === 403 || status === 429 ||
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('too many requests')
  );
}

//Detect if error indicates website blocking (not rate limiting)
function isWebsiteBlockingError(err) {
  const message = err?.message || '';
  const status = err?.status || '';
  
  // Detect website blocking patterns
  return (
    status === 400 ||
    message.includes('FAILED_DOCUMENT_REQUEST') ||
    message.includes('unable to reliably load') ||
    message.includes('Lighthouse returned error')
  );
}

/*Fetch a PSI report with smart fallback for rate-limited sites.
 * Returns the JSON on success, or null on final failure (and logs a detailed error).*/
export const fetchPSIReport = async (url, strategy, apiKey, options = {}) => {
  const requestUrl = buildPsiUrl(url, strategy, apiKey);
  const { useSafeMode = false } = options;

  // Choose retry strategy based on mode
  const delays = useSafeMode ? SAFE_MODE_DELAYS_MS : RETRY_DELAYS_MS;
  const timeout = useSafeMode ? SAFE_MODE_TIMEOUT_MS : PSI_TIMEOUT_MS;
  const maxAttempts = delays.length + 1;
  
  let attempt = 0;
  let lastError;
  let detectedRateLimit = false;

  while (attempt < maxAttempts) {
    try {
      return await fetchWithTimeout(requestUrl, { timeout });
    } catch (err) {
      lastError = err;
      const isLast = attempt === maxAttempts - 1;
      
      // Detect rate limiting on first failure
      if (attempt === 0 && isRateLimitError(err)) {
        detectedRateLimit = true;
        console.warn(`[PSI] Rate limit detected for ${url} - consider using safe mode`);
      }

      console.error(
        `[PSI] ${strategy.toUpperCase()} attempt ${attempt + 1}/${maxAttempts} failed for`,
        url,
        '→',
        err?.message || err
      );

      if (isLast) break;
      await delay(delays[attempt]);
      attempt++;
    }
  }

  // Return error info for smart retry logic
  return {
    success: false,
    error: lastError,
    rateLimited: detectedRateLimit,
    url,
    strategy
  };
};

//Ultra-safe mode with URL modifications and different strategies
export const fetchPSIReportUltraSafe = async (url, strategy, apiKey) => {
  console.log(`[PSI] Ultra-safe mode for ${url} - trying different approaches...`);
  
  // Try different URL variations that might work better
  const urlVariations = [
    url,
    url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(),
    url + (url.includes('?') ? '&' : '?') + 'v=1',
  ];
  
  for (let i = 0; i < urlVariations.length; i++) {
    const testUrl = urlVariations[i];
    console.log(`[PSI] Ultra-safe attempt ${i + 1}/3 with URL: ${testUrl}`);
    
    try {
      if (i > 0) {
        await delay(20000 + (i * 10000)); // 20s, 30s, 40s delays
      }
      
      const result = await fetchPSIReport(testUrl, strategy, apiKey, { useSafeMode: true });
      if (result && !result.success) {
        return result; // Got a result, even if it's an error object
      }
      return result;
    } catch (error) {
      console.warn(`[PSI] Ultra-safe attempt ${i + 1} failed:`, error.message);
      if (i === urlVariations.length - 1) {
        return null; // All attempts failed
      }
    }
  }
  
  return null;
};

//Smart PSI fetch with intelligent error handling
export const fetchPSIReportSmart = async (url, strategy, apiKey) => {
  // First attempt: normal mode
  const result = await fetchPSIReport(url, strategy, apiKey, { useSafeMode: false });
  
  // If it's a successful result, return it
  if (result && !result.success) {
    return null; // Normal failure, no fallback needed
  }
  
  // Check what type of error we got
  if (result && result.error) {
    if (isWebsiteBlockingError(result.error)) {
      console.log(`[PSI] Website blocking detected for ${url} - skipping safe mode (won't help)`);
      return null;
    }
    
    if (result.rateLimited) {
      console.log(`[PSI] Rate limiting detected for ${url} - trying ultra-safe mode...`);
      await delay(5000); // Longer pause before ultra-safe mode
      
      // Add a timeout to prevent endless waiting
      const ultraSafePromise = fetchPSIReportUltraSafe(url, strategy, apiKey);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Ultra-safe mode timeout')), 600000) // 10 minute timeout
      );
      
      try {
        const ultraSafeResult = await Promise.race([ultraSafePromise, timeoutPromise]);
        if (ultraSafeResult && !ultraSafeResult.success) {
          return null; // Ultra-safe mode also failed
        }
        return ultraSafeResult;
      } catch (timeoutError) {
        console.warn(`[PSI] Ultra-safe mode timed out for ${url}`);
        return null;
      }
    }
  }
  
  return result;
};
