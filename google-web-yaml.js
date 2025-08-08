// Configuration-based Google Web Search Extractor

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
        client: client,
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

    const url = `https://www.google.com/search?${params.toString()}`;
    
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

// Helper function to safely get element attribute or textContent
function getElementValue(element, config, doc = null) {
    if (!element && !config.selector) {
        // Handle special attributes
        switch (config.attribute) {
            case 'position':
                return element?.position || config.fallback;
            case 'domain_from_link':
                try {
                    const link = element?.querySelector('a')?.href;
                    return link ? new URL(link).hostname : config.fallback;
                } catch {
                    return config.fallback;
                }
            case 'visible_from_index':
                return element?.index < 3 ? 'true' : 'false';
            case 'static_text':
                return config.value || config.fallback;
            case 'result_count_from_text':
                try {
                    const countText = element?.textContent || "";
                    const match = countText.match(/About ([\d,]+) result/);
                    if (match) {
                        const countStr = match[1];
                        return parseInt(countStr.replace(/,/g, ''), 10);
                    }
                } catch (e) {
                    console.warn("Error extracting result count:", e);
                }
                return parseInt(config.fallback);
            default:
                return config.fallback;
        }
    }

    if (!element && config.selector) {
        element = doc?.querySelector(config.selector);
    }

    if (!element) return config.fallback;

    switch (config.attribute) {
        case 'textContent':
            return element.textContent?.trim() || config.fallback;
        case 'href':
            return element.href?.trim() || config.fallback;
        case 'src':
            return element.src?.trim() || config.fallback;
        case 'data-ts':
            return element.getAttribute('data-ts') || config.fallback;
        case 'data-cid':
            return element.getAttribute('data-cid') || config.fallback;
        case 'data-key':
            return element.getAttribute('data-key') || config.fallback;
        case 'data-lat':
            return element.getAttribute('data-lat') || config.fallback;
        case 'data-lng':
            return element.getAttribute('data-lng') || config.fallback;
        case 'domain_from_link':
            try {
                const link = element.querySelector('a')?.href || element.href;
                return link ? new URL(link).hostname : config.fallback;
            } catch {
                return config.fallback;
            }
        case 'business_type_from_text':
            const businessText = element.textContent || '';
            const infoParts = businessText.split("·").map(part => part.trim());
            return infoParts[infoParts.length - 1] || config.fallback;
        case 'price_from_text':
            const priceText = element.textContent || '';
            const priceParts = priceText.split("·").map(part => part.trim());
            return priceParts.find(part => /^[$₹€¥]+[\d\-–\s]*$/.test(part)) || config.fallback;
        case 'current_page_from_text':
            const pageText = element.textContent?.trim();
            return pageText && !element.querySelector('a.fl') ? parseInt(pageText) : null;
        case 'answer_from_multiple':
            const answerParts = [];
            const mainAnswer = element.querySelector('.IZ6rdc')?.textContent.trim();
            if (mainAnswer) answerParts.push(mainAnswer);
            const description = element.querySelector('.hgKElc')?.textContent.trim();
            if (description) answerParts.push(description);
            const tableRows = element.querySelectorAll('.ztXv9, .webanswers-webanswers_table__webanswers-table tr');
            tableRows.forEach(row => {
                const text = row.textContent.trim().replace(/\s+/g, ' ');
                if (text) answerParts.push(text);
            });
            return answerParts.join(' ').trim() || config.fallback;
        case 'domain_from_cite_or_link':
            const citeText = element.querySelector('cite.qLRx3b, .VuuXrf')?.textContent;
            if (citeText) {
                return citeText.split('›')[0].trim();
            } else {
                try {
                    const link = element.querySelector('a')?.href;
                    return link ? new URL(link).hostname : config.fallback;
                } catch {
                    return config.fallback;
                }
            }
        case 'website_from_parent':
            const container = element.closest(".VkpGBb")?.parentElement;
            if (container) {
                const websiteLink = Array.from(container.querySelectorAll("a")).find(link => 
                    link.textContent.trim() === "Website"
                );
                return websiteLink?.href || config.fallback;
            }
            return config.fallback;
        case 'directions_from_parent':
            const containerDir = element.closest(".VkpGBb")?.parentElement;
            if (containerDir) {
                const directionsLink = Array.from(containerDir.querySelectorAll("a")).find(link => 
                    link.textContent.trim() === "Directions"
                );
                return directionsLink?.href || config.fallback;
            }
            return config.fallback;
        case 'source_img_from_parent':
            return element.closest('.Pl0lPb')?.querySelector('img')?.src || config.fallback;
        case 'title_from_h1':
            return document.querySelector('h1.WQWxe')?.textContent || config.fallback;
        case 'position':
            return element.position || config.fallback;
        default:
            if (config.fallback_attribute) {
                return element.getAttribute(config.fallback_attribute) || config.fallback;
            }
            return element.getAttribute(config.attribute) || config.fallback;
    }
}

// Extract data based on configuration
function extractDataWithConfig(doc, sectionConfig, globalConfig = {}) {
    const results = [];
    
    if (!sectionConfig.container) return results;
    
    const containers = doc.querySelectorAll(sectionConfig.container);
    
    containers.forEach((container, index) => {
        const item = {};
        
        // Add position to each item
        item.position = index + 1;
        
        // Process each field
        Object.entries(sectionConfig.fields || {}).forEach(([fieldName, fieldConfig]) => {
            let element = container;
            
            // Find the specific element if selector is provided
            if (fieldConfig.selector) {
                element = container.querySelector(fieldConfig.selector);
            }
            
            // Special handling for position attribute
            if (fieldConfig.attribute === 'position') {
                element = { position: index + 1 };
            }
            
            // Get the value
            item[fieldName] = getElementValue(element, fieldConfig, doc);
        });
        
        // Skip empty results
        const hasContent = Object.values(item).some(value => 
            value && value !== 'N/A' && value !== '' && value !== null
        );
        
        if (hasContent) {
            results.push(item);
        }
    });
    
    return results;
}

// Extract organic results using config
function extractOrganicResultsWithConfig(doc, config) {
    const organicConfig = config.google_web?.organic_results;
    if (!organicConfig) return [];
    
    return extractDataWithConfig(doc, organicConfig);
}

// Extract local results using config
function extractLocalResultsWithConfig(doc, config) {
    const localConfig = config.google_web?.local_results;
    if (!localConfig) return [];
    
    return extractDataWithConfig(doc, localConfig);
}

// Extract pagination using config
function extractPaginationWithConfig(doc, config) {
    const paginationConfig = config.google_web?.pagination;
    if (!paginationConfig) return { pageLinks: [], currentPage: null, nextPageLink: null };
    
    const paginationData = {
        pageLinks: [],
        currentPage: null,
        nextPageLink: null
    };

    const paginationCells = doc.querySelectorAll(paginationConfig.container);
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

// Extract related searches using config
function extractRelatedSearchesWithConfig(doc, config) {
    const relatedConfig = config.google_web?.related_searches;
    if (!relatedConfig) return [];
    
    return extractDataWithConfig(doc, relatedConfig);
}

// Extract related questions using config
function extractQAInfoWithConfig(doc, config) {
    const qaConfig = config.google_web?.related_questions;
    if (!qaConfig) return [];
    
    return extractDataWithConfig(doc, qaConfig);
}

// Extract top stories using config
function extractTopStoriesWithConfig(doc, config) {
    const topStoriesConfig = config.google_web?.top_stories;
    if (!topStoriesConfig) return [];
    
    const articles = Array.from(doc.querySelectorAll(topStoriesConfig.container));
    const results = articles.map((article, index) => {
        const item = {
            "#": index + 1,
            "Visible": index < 3 ? "true" : "false"
        };
        
        // Process each field
        Object.entries(topStoriesConfig.fields || {}).forEach(([fieldName, fieldConfig]) => {
            let element = article;
            
            if (fieldConfig.selector) {
                element = article.querySelector(fieldConfig.selector);
            }
            
            let value = getElementValue(element, fieldConfig, doc);
            
            // Special handling for UTC date conversion
            if (fieldName === 'utc_date' && value && value !== 'N/A') {
                try {
                    value = new Date(parseInt(value) * 1000).toISOString();
                } catch {
                    value = 'N/A';
                }
            }
            
            // Map field names to expected output format
            const fieldMapping = {
                'title': 'Title',
                'source': 'Source',
                'date': 'Date',
                'utc_date': 'UTC Date',
                'link': 'Link'
            };
            
            const outputField = fieldMapping[fieldName] || fieldName;
            item[outputField] = value;
        });
        
        return item;
    });

    return results;
}

// Extract visual stories using config
function extractVisualStoriesWithConfig(doc, config) {
    const visualConfig = config.google_web?.visual_stories;
    if (!visualConfig) return [];
    
    return extractDataWithConfig(doc, visualConfig);
}

// Extract video results using config
function extractVideoResultsWithConfig(doc, config) {
    const videoConfig = config.google_web?.video_results;
    if (!videoConfig) return [];
    
    return extractDataWithConfig(doc, videoConfig);
}

// Extract tweets using config
function extractTweetsWithConfig(doc, config) {
    const tweetConfig = config.google_web?.tweet_results;
    if (!tweetConfig) return [];
    
    return extractDataWithConfig(doc, tweetConfig);
}

// Extract hotels using config
function extractHotelsWithConfig(doc, config) {
    const hotelConfig = config.google_web?.hotel_results;
    if (!hotelConfig) return [];
    
    const results = extractDataWithConfig(doc, hotelConfig);
    
    // Post-process review count (remove parentheses)
    results.forEach(hotel => {
        if (hotel.reviewCount && hotel.reviewCount !== 'N/A') {
            hotel.reviewCount = hotel.reviewCount.replace(/[()]/g, '').trim();
        }
    });
    
    return results;
}

// Extract movie data using config
function extractMovieDataWithConfig(doc, config) {
    const movieConfig = config.google_web?.movie_data;
    if (!movieConfig) return {
        castData: [],
        reviewsData: { rating: null, reviews: [], moreReviewsLinkText: null },
        servicesData: []
    };

    const finalData = {
        castData: [],
        reviewsData: {
            rating: null,
            reviews: [],
            moreReviewsLinkText: null
        },
        servicesData: []
    };

    // Extract cast data
    if (movieConfig.cast_data) {
        finalData.castData = extractDataWithConfig(doc, movieConfig.cast_data);
    }

    // Extract reviews data
    if (movieConfig.reviews_data) {
        // Rating
        if (movieConfig.reviews_data.rating) {
            const ratingElement = doc.querySelector(movieConfig.reviews_data.rating.selector);
            finalData.reviewsData.rating = ratingElement ? ratingElement.innerText.trim() : null;
        }
        
        // Reviews
        if (movieConfig.reviews_data.reviews) {
            finalData.reviewsData.reviews = extractDataWithConfig(doc, movieConfig.reviews_data.reviews);
        }
        
        // More reviews link
        if (movieConfig.reviews_data.more_reviews_link) {
            const moreReviewsButton = doc.querySelector(movieConfig.reviews_data.more_reviews_link.selector);
            finalData.reviewsData.moreReviewsLinkText = moreReviewsButton ? moreReviewsButton.innerText.trim() : null;
        }
    }

    // Extract services data
    if (movieConfig.services_data) {
        finalData.servicesData = extractDataWithConfig(doc, movieConfig.services_data);
    }

    return finalData;
}

// Extract page title using config
function extractTitleWithConfig(html, config) {
    const globalConfig = config.google_web?.global?.page_title;
    if (!globalConfig) {
        // Fallback to regex extraction
        const titleRegex = /<title>(.*?)<\/title>/g;
        let match, title = "";
        while ((match = titleRegex.exec(html)) !== null) {
            title = match[1].trim();
        }
        return title;
    }
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const element = doc.querySelector(globalConfig.selector);
    
    return getElementValue(element, globalConfig, doc);
}

// Extract result count using config
function extractResultCountWithConfig(doc, config) {
    const globalConfig = config.google_web?.global?.result_count;
    if (!globalConfig) {
        // Fallback method
        try {
            const resultStats = doc.getElementById("result-stats");
            const countText = resultStats?.textContent || "";
            const match = countText.match(/About ([\d,]+) result/);
            if (match) {
                const countStr = match[1];
                return parseInt(countStr.replace(/,/g, ''), 10);
            }
        } catch (e) {
            console.warn("Error extracting result count:", e);
        }
        return -1;
    }
    
    const element = doc.querySelector(globalConfig.selector);
    return getElementValue(element, globalConfig, doc);
}

// Main function to process a single query with configuration
async function processQueryWithConfig(query, config) {
    try {
        // Extract query string properly
        const queryString = typeof query === 'object' && query.query ? query.query : query;
        const queryId = typeof query === 'object' && query.query_id ? query.query_id : null;
        
        const html = await fetchSearchHTML(queryString);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const rawResult = {
            success: true,
            query: queryString, // Use the extracted query string
            query_id: queryId, // Include query_id if available
            title: extractTitleWithConfig(html, config),
            serp_result_count: extractResultCountWithConfig(doc, config),
            organic_results: extractOrganicResultsWithConfig(doc, config),
            local_results: extractLocalResultsWithConfig(doc, config),
            pagination: extractPaginationWithConfig(doc, config),
            relatedSearches: extractRelatedSearchesWithConfig(doc, config),
            topStories: extractTopStoriesWithConfig(doc, config),
            visualStories: extractVisualStoriesWithConfig(doc, config),
            videoResults: extractVideoResultsWithConfig(doc, config),
            tweetData: extractTweetsWithConfig(doc, config),
            hotelResults: extractHotelsWithConfig(doc, config),
            movieData: extractMovieDataWithConfig(doc, config)
        };

        const cleanedResult = Object.fromEntries(
            Object.entries(rawResult).filter(([_, value]) => {
                return value !== null && !(Array.isArray(value) && value.length === 0);
            })
        );

        // Check if at least one meaningful result exists
        const hasContent =
            cleanedResult.organic_results?.length > 0 ||
            cleanedResult.topStories?.length > 0 ||
            cleanedResult.videoResults?.length > 0 ||
            cleanedResult.visualStories?.length > 0 ||
            cleanedResult.local_results?.length > 0 ||
            cleanedResult.relatedSearches?.length > 0 ||
            cleanedResult.movieData?.castData?.length > 0 ||
            cleanedResult.tweetData?.length > 0 ||
            cleanedResult.hotelResults?.length > 0;

        if (!hasContent) {
            return {
                error: true,
                query: queryString,
                query_id: queryId,
                message: "No meaningful content found in result, Request limit reached"
            };
        }

        return cleanedResult;
    } catch (error) {
        const queryString = typeof query === 'object' && query.query ? query.query : query;
        const queryId = typeof query === 'object' && query.query_id ? query.query_id : null;
        
        return {
            success: false,
            error: true,
            query: queryString,
            query_id: queryId,
            message: error.message
        };
    }
}

// Helper: Promise with timeout for each query
function withTimeoutConfig(promise, ms, query) {
    const queryString = typeof query === 'object' && query.query ? query.query : query;
    const queryId = typeof query === 'object' && query.query_id ? query.query_id : null;
    
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve({ 
            error: true, 
            query: queryString,
            query_id: queryId,
            message: "Query timeout" 
        }), ms))
    ]);
}

// Handle multiple queries in parallel with a global timeout and configuration
async function fetchWebWithConfig(queries, timeoutMs = 40000, config) {
    const promises = queries.map(q => 
        withTimeoutConfig(processQueryWithConfig(q, config), timeoutMs, q)
    );
    return await Promise.all(promises);
}