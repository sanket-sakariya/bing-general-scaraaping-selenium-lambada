// Bing News Configuration-Based Scraper
// Load your YAML config and convert to JSON before using these functions

// Helper function to safely extract data from elements
function safeExtract(element, selector, attribute = 'textContent', fallback = 'N/A') {
    try {
        let targetElement;
        
        if (selector === null) {
            targetElement = element;
        } else {
            targetElement = element.querySelector(selector);
        }
        
        if (!targetElement) return fallback;
        
        if (attribute === 'textContent') {
            return targetElement.textContent.trim();
        } else if (attribute === 'innerHTML') {
            return targetElement.innerHTML.trim();
        } else {
            return targetElement.getAttribute(attribute) || fallback;
        }
    } catch (error) {
        console.warn(`Error extracting ${selector}:`, error);
        return fallback;
    }
}

// Enhanced time conversion function with better pattern matching
function convertRelativeTimeToUTC(timeString, timePatterns) {
    if (!timeString || timeString === 'N/A') {
        return 'N/A';
    }

    const now = new Date();
    const cleanTimeString = timeString.toLowerCase().trim();
    
    console.log(`Converting time string: "${timeString}" (cleaned: "${cleanTimeString}")`);
    
    // Enhanced patterns with multiple variations
    const enhancedPatterns = [
        // Hours patterns
        { pattern: /(\d+)\s*h(?:our)?s?\s*ago/i, type: 'hours' },
        { pattern: /(\d+)\s*h$/i, type: 'hours' },
        { pattern: /(\d+)\s*hr?s?\s*ago/i, type: 'hours' },
        
        // Minutes patterns
        { pattern: /(\d+)\s*m(?:in)?(?:ute)?s?\s*ago/i, type: 'minutes' },
        { pattern: /(\d+)\s*m$/i, type: 'minutes' },
        { pattern: /(\d+)\s*min?s?\s*ago/i, type: 'minutes' },
        
        // Days patterns
        { pattern: /(\d+)\s*d(?:ay)?s?\s*ago/i, type: 'days' },
        { pattern: /(\d+)\s*d$/i, type: 'days' },
        
        // Special cases
        { pattern: /just\s+now/i, type: 'minutes', value: 0 },
        { pattern: /a\s+few\s+minutes?\s+ago/i, type: 'minutes', value: 2 },
        { pattern: /an?\s+hour\s+ago/i, type: 'hours', value: 1 },
        { pattern: /a\s+day\s+ago/i, type: 'days', value: 1 },
        { pattern: /yesterday/i, type: 'days', value: 1 },
        { pattern: /today/i, type: 'hours', value: 0 }
    ];
    
    // Try enhanced patterns first
    for (const pattern of enhancedPatterns) {
        const match = cleanTimeString.match(pattern.pattern);
        if (match) {
            const value = pattern.value !== undefined ? pattern.value : parseInt(match[1]);
            let offsetMs = 0;
            
            switch (pattern.type) {
                case 'hours':
                    offsetMs = value * 60 * 60 * 1000;
                    break;
                case 'minutes':
                    offsetMs = value * 60 * 1000;
                    break;
                case 'days':
                    offsetMs = value * 24 * 60 * 60 * 1000;
                    break;
            }
            
            const resultDate = new Date(now.getTime() - offsetMs);
            console.log(`Matched pattern: ${pattern.pattern}, value: ${value}, type: ${pattern.type}, result: ${resultDate.toISOString()}`);
            return resultDate.toISOString();
        }
    }
    
    // Try config patterns as fallback
    if (timePatterns && Array.isArray(timePatterns)) {
        for (const pattern of timePatterns) {
            try {
                const regex = new RegExp(pattern.pattern, 'i'); // Add case insensitive flag
                const match = cleanTimeString.match(regex);
                if (match) {
                    const value = parseInt(match[1]);
                    let offsetMs = 0;
                    
                    switch (pattern.type) {
                        case 'hours':
                            offsetMs = value * 60 * 60 * 1000;
                            break;
                        case 'minutes':
                            offsetMs = value * 60 * 1000;
                            break;
                        case 'days':
                            offsetMs = value * 24 * 60 * 60 * 1000;
                            break;
                    }
                    
                    const resultDate = new Date(now.getTime() - offsetMs);
                    console.log(`Config pattern matched: ${pattern.pattern}, value: ${value}, type: ${pattern.type}, result: ${resultDate.toISOString()}`);
                    return resultDate.toISOString();
                }
            } catch (error) {
                console.warn(`Error with pattern ${pattern.pattern}:`, error);
            }
        }
    }
    
    console.log(`No pattern matched for time string: "${timeString}"`);
    return 'N/A';
}

// Extract Bing news using configuration
function extractBingNewsWithConfig(root, config) {
    const newsConfig = config.bing_news;
    const newsCards = root.querySelectorAll(newsConfig.container);
    const extractedNews = [];

    console.log(`Found ${newsCards.length} news cards with selector: ${newsConfig.container}`);

    newsCards.forEach((card, index) => {
        const news = { position: index + 1 };

        // Extract each field based on config
        Object.entries(newsConfig.fields).forEach(([fieldName, fieldConfig]) => {
            if (fieldConfig.selector === null && fieldConfig.attribute) {
                // Handle container attributes (like domain_url)
                let value = card.getAttribute(fieldConfig.attribute);
                
                // Try fallback attribute if main one fails
                if (!value && fieldConfig.fallback_attribute) {
                    value = card.getAttribute(fieldConfig.fallback_attribute);
                }
                
                news[fieldName] = value || fieldConfig.fallback;
                
                // Extract domain from URL if this is domain_url field
                if (fieldName === 'domain_url' && value && value !== 'N/A' && config.processing && config.processing.domain_extraction) {
                    try {
                        news.domain = new URL(value).hostname;
                    } catch {
                        news.domain = fieldConfig.fallback;
                    }
                }
            } else {
                // Regular selector-based extraction
                const extractedValue = safeExtract(
                    card, 
                    fieldConfig.selector, 
                    fieldConfig.attribute, 
                    fieldConfig.fallback
                );
                news[fieldName] = extractedValue;
                
                // Log time extraction for debugging
                if (fieldName === 'time') {
                    console.log(`Extracted time for article ${index + 1}: "${extractedValue}" using selector: ${fieldConfig.selector}`);
                }
            }
        });

        // Convert relative time to UTC if configured and time exists
        if (news.time && news.time !== 'N/A') {
            const timePatterns = config.processing && config.processing.time_patterns ? config.processing.time_patterns : null;
            news.dateUTC = convertRelativeTimeToUTC(news.time, timePatterns);
        } else {
            news.dateUTC = 'N/A';
            console.log(`No time found for article ${index + 1}, setting dateUTC to N/A`);
        }

        extractedNews.push(news);
    });

    return extractedNews;
}

// Extract global data (page title, result count)
function extractGlobalData(root, config) {
    const globalConfig = config.bing_news.global;
    const globalData = {};
    
    Object.entries(globalConfig).forEach(([key, globalFieldConfig]) => {
        if (globalFieldConfig.regex) {
            // Use regex extraction for result count
            const bodyText = root.querySelector('body')?.innerHTML || '';
            const match = bodyText.match(new RegExp(globalFieldConfig.regex));
            globalData[key] = match ? match[1].replace(/,/g, '') : globalFieldConfig.fallback;
        } else {
            // Regular selector extraction
            globalData[key] = safeExtract(
                root,
                globalFieldConfig.selector,
                globalFieldConfig.attribute,
                globalFieldConfig.fallback
            );
        }
    });
    
    return globalData;
}

// Updated processQuery function using configuration
async function processQueryWithConfig(queryObj, cc, qft, config) {
    const query = typeof queryObj === 'object' && queryObj.query ? queryObj.query : queryObj;
    try {
        const params = new URLSearchParams({
            q: query,
            cc: cc,
            qft: qft
        });
        
        const url = `https://www.bing.com/news/search?${params.toString()}`;
        console.log(`Fetching URL: ${url}`);
        
        const res = await fetch(url);
        const html = await res.text();
        
        const dom = new DOMParser().parseFromString(html, 'text/html');
        
        // Log page structure for debugging
        const newsCards = dom.querySelectorAll(config.bing_news.container);
        console.log(`Page loaded, found ${newsCards.length} news cards`);
        
        if (newsCards.length > 0) {
            // Check time selector on first card for debugging
            const firstCard = newsCards[0];
            const timeElement = firstCard.querySelector(config.bing_news.fields.time.selector);
            if (timeElement) {
                console.log(`First article time element found: "${timeElement.textContent.trim()}"`);
            } else {
                console.log(`Time element not found using selector: ${config.bing_news.fields.time.selector}`);
                // Try to find any time-like elements for debugging
                const allTimeElements = firstCard.querySelectorAll('span, time, div');
                allTimeElements.forEach((el, idx) => {
                    const text = el.textContent.trim();
                    if (text.match(/\d+[hmd]|ago|hour|minute|day/i)) {
                        console.log(`Potential time element ${idx}: "${text}" (selector: ${el.tagName.toLowerCase()}${el.className ? '.' + el.className.split(' ').join('.') : ''})`);
                    }
                });
            }
        }
        
        // Extract using configuration
        const newsResults = extractBingNewsWithConfig(dom, config);
        const globalData = extractGlobalData(dom, config);
        
        return {
            success: true,
            query,
            title: globalData.page_title,
            news_results: newsResults,
            result_count: globalData.result_count
        };
    } catch (error) {
        console.error(`Error processing query "${query}":`, error);
        return {
            success: false,
            query,
            error: error.message
        };
    }
}

// Handle multiple queries with configuration
async function fetchSearchesWithConfig(queries, cc, qft, config) {
    return await Promise.all(queries.map(query => processQueryWithConfig(query, cc, qft, config)));
}