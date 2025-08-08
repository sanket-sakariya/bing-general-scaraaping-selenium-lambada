// Fetch raw HTML for a search query
async function fetchSearchHTML(query, userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36", serpOptions = {}) {
    const { 
        hl = "en", 
        gl = "us",
        client = "safari",
        sort_by = "",
        time_period = "",
        device = "",
        location = ""  // New location parameter
    } = serpOptions;

    const params = new URLSearchParams({
        q: query,
        hl: hl,
        gl: gl,
        client: client
    });

    // Add location if specified (using uule parameter)
    if (location) {
        const uule = getUuleParameter(location);
        params.append('uule', uule);
    }

    // Add optional parameters
    if (sort_by) params.append('sort', sort_by);
    if (time_period) params.append('tbs', `qdr:${time_period}`);
    if (device) params.append('tbm', device === "mobile" ? "nws-mob" : "nws");

    const url = `https://www.google.com/search?${params.toString()}&tbm=isch`;
    
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': userAgent
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.error('Error fetching search HTML:', error);
        throw error;
    }
}

// Helper function to generate uule parameter
function getUuleParameter(locationName) {
    // This is a simplified version - in production you might want to use 
    // a more accurate geocoding service
    const encoder = new TextEncoder();
    const encodedLocation = encoder.encode(locationName);
    const lengthByte = String.fromCharCode(encodedLocation.length);
    return `w+CAIQICI${btoa(lengthByte + locationName)}`;
}

// Extract <title> content from HTML
function extractTitle(html) {
    const titleRegex = /<title>(.*?)<\/title>/g;
    let match, title = "";
    while ((match = titleRegex.exec(html)) !== null) {
        title = match[1].trim();
    }
    return title;
}

// Extract result count from the parsed DOM
function extractResultCount(html) {

    var resultCountRegex = /About ([\d,]+) result/;
    var resultCountMatch = resultCountRegex.exec(html);
    var serp_result_count = -1;
    if (resultCountMatch) {
        serp_result_count = resultCountMatch[1].replace(/,/g, '');
    }
    return serp_result_count;
}


// image search results extraction
function extractImageResults(doc,containerSelector = 'div[data-attrid="images universal"]') {
  const imageBlocks = doc.querySelectorAll(containerSelector);
  const imagesData = [];

  imageBlocks.forEach((block, index) => {
    const imageData = {};

    // Position
    imageData.position = index + 1;

    // Anchor tag containing title and image
    const anchor = block.querySelector('a.EZAeBe') || block.querySelector('a');
    imageData.link = anchor?.href || 'N/A';

    // Title
    const titleElement = block.querySelector('.toI8Rb') || block.querySelector('h3');
    imageData.title = titleElement?.innerText.trim() || 'N/A';

    // Domain
    const domainElement = block.querySelector('.guK3rf span');
    imageData.domain = domainElement?.innerText.trim() || 'N/A';

    // Image element
    const img = block.querySelector('img.YQ4gaf');
    imageData.image = img?.src || 'N/A';
    imageData.width = img?.width || 'N/A';
    imageData.height = img?.height || 'N/A';

    // Source details
    const sourceAnchor = block.querySelector('a.EZAeBe');
    const sourceName = domainElement?.innerText.trim() || 'N/A';
    let sourceDomain = 'N/A';
    try {
      sourceDomain = new URL(sourceAnchor?.href || '').hostname;
    } catch (e) {
      // ignore URL parsing error
    }

    imageData.source = {
      link: sourceAnchor?.href || 'N/A',
      domain: sourceDomain,
      name: sourceName
    };

    imagesData.push(imageData);
  });

  return imagesData;
}


// Combine all extraction steps for a single query
async function processQuery(query, serpOptions = {}) {
    try {
        const queryString = typeof query === 'object' && query !== null ? query.query : query;
        const queryId = typeof query === 'object' && query !== null ? query.query_id : undefined;
        const html = await fetchSearchHTML(queryString, undefined, serpOptions);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        // Extract all components
        const rawResult = {
            success: true,
            query: queryString,
            query_id: queryId,
            title: extractTitle(html),
            serp_result_count: extractResultCount(html),
            image_results: extractImageResults(doc)
        };

        // Remove keys that are null or empty array
        const cleanedResult = Object.fromEntries(
            Object.entries(rawResult).filter(([_, value]) => {
                return value !== null && !(Array.isArray(value) && value.length === 0);
            })
        );

        // Check if at least one meaningful result exists
        const hasContent =
            cleanedResult.image_results?.length > 0;

        if (!hasContent) {
            return {
                error : true,
                query: queryString,
                query_id: queryId,
                message: "No meaningful content found in result , Request limit reached out"
            };
        }

        return cleanedResult;
    } catch (error) {
        return {
            success: false,
            query: typeof query === 'object' && query !== null ? query.query : query,
            query_id: typeof query === 'object' && query !== null ? query.query_id : undefined,
            error: error.message
        };
    }
}
// Helper: Promise with timeout
// Helper: Promise with timeout for each query
function withTimeout(promise, ms, query, serpOptions) {
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve({ query }), ms))
    ]);
}

// Handle multiple queries in parallel with a global timeout
async function fetchSearches(queries, timeoutMs = 40000, serpOptions = {}) {
    const promises = queries.map(q => withTimeout(processQuery(q), timeoutMs, q));
    return await Promise.all(promises);
}

// Example usage
// // Example usage with all parameters
// const serpOptions = {
//     hl: "hi",          // Language
//     gl: "in",          // Country (India)
//     client: "",  // Client
//     sort_by: "date",   // Sort by date (options: "", "date")
//     time_period: "h",  // Time period: d (day), w (week), m (month), y (year)
//     device: "desktop" , // Device: "desktop" or "mobile"
//     // location: "New Delhi,Delhi,India", 
// };

// // Run the search with all parameters
// fetchSearches(["pm modi", "Rajkot"],4000, serpOptions)
//     .then(results => {
//         console.log("Search results:", results);
//         window.fetchResults = results;
//     })
//     .catch(error => {
//         console.error("Error:", error);
//     });