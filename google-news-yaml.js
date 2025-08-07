// Google News scraping with YAML configuration support

// Utility function to safely get attribute or text content
function safeGetValue(element, selector, attribute, fallback = 'N/A') {
    try {
        let targetElement = element;
        
        if (selector) {
            targetElement = element.querySelector(selector);
            if (!targetElement) return fallback;
        }
        
        if (attribute === 'textContent') {
            return targetElement.textContent?.trim() || fallback;
        } else if (attribute === 'position') {
            return targetElement.getAttribute('position') || fallback;
        } else {
            return targetElement.getAttribute(attribute) || fallback;
        }
    } catch (error) {
        console.warn(`Error getting value for selector ${selector}:`, error);
        return fallback;
    }
}

// Utility function to extract domain from URL
function extractDomain(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return 'N/A';
    }
}

// Utility function to convert timestamp to various date formats
function convertTimestamp(timestampSec) {
    if (!timestampSec) return { dateUtc: 'N/A', timeOnly: 'N/A', dateOnly: 'N/A' };
    
    try {
        const dateObj = new Date(parseInt(timestampSec, 10) * 1000);
        return {
            dateUtc: dateObj.toISOString(),
            dateOnly: dateObj.toISOString().split('T')[0],
            timeOnly: dateObj.toISOString().split('T')[1].replace('Z', '')
        };
    } catch {
        return { dateUtc: 'N/A', timeOnly: 'N/A', dateOnly: 'N/A' };
    }
}

// Fetch search HTML with parameters
async function fetchSearchHTML(query, userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36", serpOptions = {}, config) {
    const { 
        hl = "en", 
        gl = "us",
        client = "safari",
        sort_by = "",
        time_period = "",
        device = "",
        location = ""
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
    const encoder = new TextEncoder();
    const encodedLocation = encoder.encode(locationName);
    const lengthByte = String.fromCharCode(encodedLocation.length);
    return `w+CAIQICI${btoa(lengthByte + locationName)}`;
}

// Extract title from HTML using config
function extractTitle(html, config) {
    const titleConfig = config.google_news?.global?.page_title;
    if (!titleConfig) return 'N/A';
    
    const titleRegex = /<title>(.*?)<\/title>/g;
    let match, title = "";
    while ((match = titleRegex.exec(html)) !== null) {
        title = match[1].trim();
    }
    return title || titleConfig.fallback;
}

// Extract result count using config
function extractResultCount(html, config) {
    const countConfig = config.google_news?.global?.result_count;
    if (!countConfig) return -1;
    
    const resultCountRegex = new RegExp(countConfig.regex);
    const resultCountMatch = resultCountRegex.exec(html);
    
    if (resultCountMatch) {
        return resultCountMatch[1].replace(/,/g, '');
    }
    return countConfig.fallback;
}

// Extract pagination data using config
function extractPagination(doc, config) {
    const paginationConfig = config.google_news?.pagination;
    if (!paginationConfig) return { pageLinks: [], currentPage: null, nextPageLink: null };

    const paginationData = {
        pageLinks: [],
        currentPage: null,
        nextPageLink: null
    };

    const paginationCells = doc.querySelectorAll(paginationConfig.container);
    paginationCells.forEach(cell => {
        const linkConfig = paginationConfig.fields.link;
        const pageConfig = paginationConfig.fields.page_number;
        
        const link = linkConfig.selector ? cell.querySelector(linkConfig.selector) : null;
        const pageNumber = cell.innerText.trim();

        if (link && pageNumber) {
            paginationData.pageLinks.push({
                page: parseInt(pageNumber),
                url: safeGetValue(link, null, linkConfig.attribute, linkConfig.fallback)
            });
        } else if (!link && pageNumber) {
            paginationData.currentPage = parseInt(pageNumber);
        }
    });

    // Extract next page link
    const nextPageConfig = paginationConfig.fields.next_page;
    const nextPageAnchor = doc.querySelector(nextPageConfig.selector);
    if (nextPageAnchor) {
        paginationData.nextPageLink = safeGetValue(nextPageAnchor, null, nextPageConfig.attribute, nextPageConfig.fallback);
    }

    return paginationData;
}

// Extract news data using config
function extractNewsData(doc, config) {
    const newsConfig = config.google_news;
    if (!newsConfig) return [];

    const containerSelector = newsConfig.container;
    const newsResults = doc.querySelectorAll(containerSelector);
    const extractedNews = [];

    newsResults.forEach((newsItem, index) => {
        const result = {};

        // Position
        result.position = index + 1;

        // Extract fields using config
        const fields = newsConfig.fields;
        
        // Link
        result.link = safeGetValue(newsItem, fields.link.selector, fields.link.attribute, fields.link.fallback);

        // Title
        result.title = safeGetValue(newsItem, fields.title.selector, fields.title.attribute, fields.title.fallback);

        // Snippet
        result.snippet = safeGetValue(newsItem, fields.snippet.selector, fields.snippet.attribute, fields.snippet.fallback);

        // Source
        result.source = safeGetValue(newsItem, fields.source.selector, fields.source.attribute, fields.source.fallback);

        // Domain
        result.domain = extractDomain(result.link);

        // Date and timestamp handling
        const timestampSec = safeGetValue(newsItem, fields.timestamp.selector, fields.timestamp.attribute, fields.timestamp.fallback);
        const readableTime = safeGetValue(newsItem, fields.date.selector, fields.date.attribute, fields.date.fallback);
        
        const dateInfo = convertTimestamp(timestampSec);
        result.date = readableTime;
        result['date-utc'] = dateInfo.dateUtc;
        result['time'] = dateInfo.timeOnly;
        result['date-only'] = dateInfo.dateOnly;

        // Thumbnail
        result.thumbnail = safeGetValue(newsItem, fields.thumbnail.selector, fields.thumbnail.attribute, fields.thumbnail.fallback);

        extractedNews.push(result);
    });

    return extractedNews;
}

// Extract top stories using config
function extractTopStories({ doc = null, htmlContent = '' } = {}, config) {
    // Parse HTML string if no DOM document provided
    if (!doc && htmlContent) {
        const parser = new DOMParser();
        doc = parser.parseFromString(htmlContent, 'text/html');
    }

    if (!doc) {
        console.warn("No valid document or HTML content provided.");
        return [];
    }

    const topStoriesConfig = config.google_news?.top_stories;
    if (!topStoriesConfig) return [];

    const articles = Array.from(doc.querySelectorAll(topStoriesConfig.container));
    const results = articles.map((article, index) => {
        const fields = topStoriesConfig.fields;
        
        const timestampSec = safeGetValue(article, fields.timestamp.selector, fields.timestamp.attribute, fields.timestamp.fallback);
        const dateInfo = convertTimestamp(timestampSec);

        return {
            "#": index + 1,
            "Visible": index < 3 ? "true" : "false",
            "Title": safeGetValue(article, fields.title.selector, fields.title.attribute, fields.title.fallback),
            "Source": safeGetValue(article, fields.source.selector, fields.source.attribute, fields.source.fallback),
            "Date": safeGetValue(article, fields.date.selector, fields.date.attribute, fields.date.fallback),
            "UTC Date": dateInfo.dateUtc,
            "Link": safeGetValue(article, fields.link.selector, fields.link.attribute, fields.link.fallback)
        };
    });

    return results;
}

// Process single query with config
async function processQuery(query, serpOptions = {}, config) {
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
            title: extractTitle(html, config),
            serp_result_count: extractResultCount(html, config),
            pagination: extractPagination(doc, config),
            news_results: extractNewsData(doc, config),
            top_stories: extractTopStories({ doc }, config)
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

// Main function to fetch multiple searches with config
async function fetchSearchesWithConfig(queries, timeoutMs = 10000, serpOptions = {}, config) {
    const promises = queries.map(query => 
        withTimeout(processQuery(query, serpOptions, config), timeoutMs, query, serpOptions)
    );
    
    try {
        const results = await Promise.all(promises);
        return results;
    } catch (error) {
        console.error('Error in fetchSearchesWithConfig:', error);
        return queries.map(query => ({
            query,
            serpOptions,
            error: error.message
        }));
    }
}