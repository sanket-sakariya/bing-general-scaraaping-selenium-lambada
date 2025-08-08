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

// Extract <title> content from HTML using configuration
function extractTitleWithConfig(html, config) {
    const titleConfig = config.google_images?.global?.page_title;
    if (titleConfig?.selector) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const element = doc.querySelector(titleConfig.selector);
        return element ? element[titleConfig.attribute || 'textContent'].trim() : titleConfig.fallback || 'N/A';
    }

    // Fallback to regex
    const titleRegex = /<title>(.*?)<\/title>/g;
    let match, title = "";
    while ((match = titleRegex.exec(html)) !== null) {
        title = match[1].trim();
    }
    return title || 'N/A';
}

// Extract result count from the parsed DOM using configuration
function extractResultCountWithConfig(html, config) {
    const resultCountConfig = config.google_images?.global?.result_count;
    if (resultCountConfig?.regex) {
        const resultCountRegex = new RegExp(resultCountConfig.regex);
        const resultCountMatch = resultCountRegex.exec(html);
        if (resultCountMatch) {
            return resultCountMatch[1].replace(/,/g, '');
        }
    }

    // Fallback
    var resultCountRegex = /About ([\d,]+) result/;
    var resultCountMatch = resultCountRegex.exec(html);
    var serp_result_count = -1;
    if (resultCountMatch) {
        serp_result_count = resultCountMatch[1].replace(/,/g, '');
    }
    return serp_result_count;
}

// Helper function to safely get element attribute or text content
function safeGetElementValue(element, attribute, fallback = 'N/A') {
    if (!element) return fallback;

    try {
        if (attribute === 'textContent') {
            return element.textContent?.trim() || fallback;
        } else if (attribute === 'position') {
            // Position is handled separately
            return fallback;
        } else if (attribute === 'closest_a') {
            const closestA = element.closest('a');
            return closestA?.href || fallback;
        } else {
            return element.getAttribute(attribute) || element[attribute] || fallback;
        }
    } catch (error) {
        console.error('Error getting element value:', error);
        return fallback;
    }
}

// Helper function to extract domain from URL
function extractDomainFromUrl(url) {
    try {
        return new URL(url).hostname;
    } catch (e) {
        return 'N/A';
    }
}

// Image search results extraction using YAML configuration
function extractImageResultsWithConfig(doc, config) {
    const imageConfig = config.google_images;
    if (!imageConfig) {
        console.error('Google Images configuration not found');
        return [];
    }

    const containerSelector = imageConfig.container;
    const fieldsConfig = imageConfig.fields;
    const imageBlocks = doc.querySelectorAll(containerSelector);
    const imagesData = [];

    imageBlocks.forEach((block, index) => {
        const imageData = {};

        // Process each field according to configuration
        Object.entries(fieldsConfig).forEach(([fieldName, fieldConfig]) => {
            let value = fieldConfig.fallback || 'N/A';

            try {
                if (fieldName === 'position') {
                    // Position is calculated based on index
                    value = index + 1;
                } else if (fieldConfig.selector) {
                    // Find element using selector
                    const element = block.querySelector(fieldConfig.selector);
                    value = safeGetElementValue(element, fieldConfig.attribute, fieldConfig.fallback);
                } else if (fieldConfig.attribute === 'position') {
                    // Handle position attribute
                    value = index + 1;
                }

                // Post-processing based on field configuration
                if (fieldConfig.parse_domain && value && value !== 'N/A') {
                    value = extractDomainFromUrl(value);
                }

                if (fieldConfig.parse_json && value && value !== 'N/A') {
                    try {
                        const jsonData = JSON.parse(value);
                        if (fieldConfig.json_key && jsonData[fieldConfig.json_key]) {
                            value = jsonData[fieldConfig.json_key];
                        }
                    } catch (e) {
                        console.error('Error parsing JSON for field:', fieldName, e);
                        value = fieldConfig.fallback || 'N/A';
                    }
                }

            } catch (error) {
                console.error(`Error extracting field ${fieldName}:`, error);
                value = fieldConfig.fallback || 'N/A';
            }

            imageData[fieldName] = value;
        });

        // Create source object if we have source-related fields
        if (imageData.source_link || imageData.source_name || imageData.domain) {
            imageData.source = {
                link: imageData.source_link || 'N/A',
                domain: extractDomainFromUrl(imageData.source_link || imageData.link || ''),
                name: imageData.source_name || imageData.domain || 'N/A'
            };

            // Sync missing title/link from source
            if (imageData.title === 'N/A' && imageData.source.name) {
                imageData.title = imageData.source.name;
            }
            if (imageData.link === 'N/A' && imageData.source.link) {
                imageData.link = imageData.source.link;
            }

            // Remove duplicates
            if (imageData.title === imageData.source.name) {
                delete imageData.title;
            }
            if (imageData.link === imageData.source.link) {
                delete imageData.link;
            }
            if (imageData.domain === imageData.source.name) {
                delete imageData.domain;
            }

            // Clean up individual source fields
            delete imageData.source_link;
            delete imageData.source_name;
        }

        imagesData.push(imageData);
    });

    return imagesData;
}

// Combine all extraction steps for a single query using YAML configuration
async function processQueryWithConfig(query, serpOptions = {}, config) {
    try {
        const queryString = typeof query === 'object' && query !== null ? query.query : query;
        const queryId = typeof query === 'object' && query !== null ? query.query_id : undefined;
        const html = await fetchSearchHTML(queryString, undefined, serpOptions);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        // Extract all components using configuration
        const rawResult = {
            success: true,
            query: queryString,
            query_id: queryId,
            title: extractTitleWithConfig(html, config),
            serp_result_count: extractResultCountWithConfig(html, config),
            image_results: extractImageResultsWithConfig(doc, config)
        };

        // Remove keys that are null or empty array
        const cleanedResult = Object.fromEntries(
            Object.entries(rawResult).filter(([_, value]) => {
                return value !== null && !(Array.isArray(value) && value.length === 0);
            })
        );

        // Check if at least one meaningful result exists
        const hasContent = cleanedResult.image_results?.length > 0;

        if (!hasContent) {
            return {
                error: true,
                query: queryString,
                query_id: queryId,
                message: "No meaningful content found in result, Request limit reached out"
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
function withTimeoutConfig(promise, ms, query, serpOptions) {
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve({ query }), ms))
    ]);
}

// Handle multiple queries in parallel with a global timeout using YAML configuration
async function fetchSearchesWithConfig(queries, timeoutMs = 40000, serpOptions = {}, config) {
    if (!config) {
        throw new Error('Configuration is required');
    }

    const promises = queries.map(q => withTimeoutConfig(processQueryWithConfig(q, serpOptions, config), timeoutMs, q));
    return await Promise.all(promises);
}