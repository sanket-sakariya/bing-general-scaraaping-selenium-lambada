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

    const url = `https://www.google.com/search?${params.toString()}&tbm=nws`;
    
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

// Extract pagination data
function extractPagination(doc) {
    const paginationData = {
        pageLinks: [],
        currentPage: null,
        nextPageLink: null
    };

    const paginationCells = doc.querySelectorAll('td');
    paginationCells.forEach(cell => {
        const link = cell.querySelector('a.fl');
        const pageNumber = cell.innerText.trim();

        if (link && pageNumber) {
            paginationData.pageLinks.push({
                page: parseInt(pageNumber),
                url: link.href
            });
        } else if (!link && pageNumber) {
            paginationData.currentPage = parseInt(pageNumber);
        }
    });

    const nextPageAnchor = doc.querySelector('a#pnnext');
    if (nextPageAnchor) {
        paginationData.nextPageLink = nextPageAnchor.href;
    }

    return paginationData;
}

// Extract news results from the page
function extractNewsData(doc, containerSelector = 'div[data-news-doc-id]') {
    const newsResults = doc.querySelectorAll(containerSelector);

    const extractedNews = [];

    newsResults.forEach((newsItem, index) => {
        const result = {};

        // Position
        result.position = index + 1;

        // Link
        const anchor = newsItem.querySelector('a.WlydOe');
        result.link = anchor?.href || 'N/A';

        // Title
        const titleBlock = newsItem.querySelector('.n0jPhd');
        result.title = titleBlock?.innerText.trim() || 'N/A';

        // Snippet
        const snippetBlock = newsItem.querySelector('.GI74Re');
        result.snippet = snippetBlock?.innerText.trim() || 'N/A';

        // Source
        const sourceBlock = newsItem.querySelector('.MgUUmf span');
        result.source = sourceBlock?.innerText.trim() || 'N/A';

        // Domain
        try {
            result.domain = new URL(result.link).hostname;
        } catch {
            result.domain = 'N/A';
        }

        // Date container
        const dateSpan = newsItem.querySelector('.OSrXXb span[data-ts]');
        const timestampSec = dateSpan?.getAttribute('data-ts');
        const readableTime = dateSpan?.textContent?.trim() || 'N/A';

        let dateUtc = 'N/A';
        let timeOnly = 'N/A';
        let dateOnly = 'N/A';

        if (timestampSec) {
            const dateObj = new Date(parseInt(timestampSec, 10) * 1000);
            dateUtc = dateObj.toISOString();
            dateOnly = dateObj.toISOString().split('T')[0];
            timeOnly = dateObj.toISOString().split('T')[1].replace('Z', '');
        }

        result.date = readableTime;
        result['date-utc'] = dateUtc;
        result['time'] = timeOnly;
        result['date-only'] = dateOnly;

        // Thumbnail
        const imgBlock = newsItem.querySelector('img[src^="data:image"], img[src^="http"]');
        result.thumbnail = imgBlock?.src || 'N/A';

        extractedNews.push(result);
    });

    return extractedNews;
}

// Top stories
function extractTopStories({ doc = null, htmlContent = '' } = {}) {
    // Parse HTML string if no DOM document provided
    if (!doc && htmlContent) {
        const parser = new DOMParser();
        doc = parser.parseFromString(htmlContent, 'text/html');
    }

    if (!doc) {
        console.warn("No valid document or HTML content provided.");
        return [];
    }

    const articles = Array.from(doc.querySelectorAll('.m7jPZ'));
    const results = articles.map((article, index) => {
        const linkEl = article.querySelector('a.WlydOe');
        const dateEl = article.querySelector('.OSrXXb span');
        const sourceEl = article.querySelector('.MgUUmf > span:last-child');
        const ts = dateEl?.dataset.ts;

        return {
            "#": index + 1,
            "Visible": index < 3 ? "true" : "false",
            "Title": article.querySelector('.n0jPhd.ynAwRc')?.textContent.trim() || '',
            "Source": sourceEl?.textContent.trim() || '',
            "Date": dateEl?.textContent.trim() || '',
            "UTC Date": ts ? new Date(parseInt(ts) * 1000).toISOString() : '',
            "Link": linkEl?.href || ''
        };
    });

    return results;
}

// Combine all extraction steps for a single query with SERP parameters
async function processQuery(query, serpOptions = {}) {
    try {
        const queryString = typeof query === 'object' && query !== null ? query.query : query;
        const queryId = typeof query === 'object' && query !== null ? query.query_id : undefined;
        const html = await fetchSearchHTML(queryString, undefined, serpOptions);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");


        const rawResult = {
            success: true,
            query: queryString,
            query_id: queryId,
            serpOptions,
            title: extractTitle(html),
            serp_result_count: extractResultCount(html),
            pagination: extractPagination(doc),
            news_results: extractNewsData(doc),
            top_stories: extractTopStories({ doc })
        };

        const cleanedResult = Object.fromEntries(
            Object.entries(rawResult).filter(([_, value]) => {
                return value !== null && !(Array.isArray(value) && value.length === 0);
            })
        );

        const hasContent =
            (cleanedResult.news_results && cleanedResult.news_results.length > 0) ||
            (cleanedResult.pagination && cleanedResult.pagination.pageLinks && cleanedResult.pagination.pageLinks.length > 0);

        if (!hasContent) {
            return {
                error: true,
                query,
                serpOptions,
                message: "No meaningful content found in result, Request limit reached out"
            };
        }

        return cleanedResult;
    } catch (error) {
        return {
            success: false,
            query,
            serpOptions,
            error: error.message
        };
    }
}

// Helper: Promise with timeout
function withTimeout(promise, ms, query, serpOptions) {
    return Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve({
            query,
            serpOptions,
            timeout: true,
            error: `Request timed out after ${ms}ms`
        }), ms))
    ]);
}

// Main function to fetch multiple searches
async function fetchSearches(queries, timeoutMs = 10000, serpOptions = {}) {
    const promises = queries.map(query => 
        withTimeout(processQuery(query, serpOptions), timeoutMs, query, serpOptions)
    );
    
    try {
        const results = await Promise.all(promises);
        return results;
    } catch (error) {
        console.error('Error in fetchSearches:', error);
        return queries.map(query => ({
            query,
            serpOptions,
            error: error.message
        }));
    }
}


// // Example usage
// // Example usage with all parameters
// const serpOptions = {
//     hl: "hi",          // Language
//     gl: "in",          // Country (India)
//     client: "",  // Client
//     sort_by: "date",   // Sort by date (options: "", "date")
//     time_period: "h",  // Time period: d (day), w (week), m (month), y (year)
//     device: "desktop" , // Device: "desktop" or "mobile"
//     location: "New Delhi,Delhi,India", 
// };

// // Run the search with all parameters
// fetchSearches(["pm modi"],40000, serpOptions)
//     .then(results => {
//         console.log("Search results:", results);
//         window.fetchResults = results;
//     })
//     .catch(error => {
//         console.error("Error:", error);
//     });