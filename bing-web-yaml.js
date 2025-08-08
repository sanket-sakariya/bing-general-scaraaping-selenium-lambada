// Utility function to extract value based on config
function extractValue(element, fieldConfig, index = 0) {
    if (!element || !fieldConfig) return fieldConfig?.fallback || 'N/A';
    
    const { selector, attribute, fallback, parse_json, json_key, parse_domain } = fieldConfig;
    
    try {
        let targetElement = element;
        
        if (selector) {
            targetElement = element.querySelector(selector);
            if (!targetElement) return fallback || 'N/A';
        }
        
        let value = fallback || 'N/A';
        
        if (attribute === 'position') {
            value = index + 1;
        } else if (attribute === 'textContent') {
            value = targetElement.textContent?.trim() || fallback || 'N/A';
        } else if (attribute === 'href') {
            value = targetElement.href || fallback || 'N/A';
        } else if (attribute === 'src') {
            let src = targetElement.src || fallback || 'N/A';
            if (src.startsWith('//')) {
                src = 'https:' + src;
            }
            value = src;
        } else if (attribute === 'data-src-hq') {
            value = targetElement.getAttribute('data-src-hq') || targetElement.src || fallback || 'N/A';
        } else if (attribute === 'closest_a') {
            const closestA = targetElement.closest('a');
            value = closestA?.href || fallback || 'N/A';
        } else if (attribute === 'class') {
            if (targetElement.classList.contains('sb_pagN')) {
                value = 'next';
            } else {
                value = 'page';
            }
        } else if (attribute === 'aria-label') {
            const label = targetElement.getAttribute('aria-label') || '';
            const match = label.match(/Page (\d+)/);
            if (fieldConfig.selector?.includes('sb_pagN') || targetElement.classList.contains('sb_pagN')) {
                value = 'Next';
            } else {
                value = match ? parseInt(match[1], 10) : fallback || 'N/A';
            }
        } else if (attribute) {
            value = targetElement.getAttribute(attribute) || fallback || 'N/A';
        }
        
        // Parse JSON if needed
        if (parse_json && json_key && value !== (fallback || 'N/A')) {
            try {
                const jsonData = JSON.parse(value);
                value = jsonData[json_key] || fallback || 'N/A';
            } catch (e) {
                value = fallback || 'N/A';
            }
        }
        
        // Parse domain if needed
        if (parse_domain && value !== (fallback || 'N/A')) {
            try {
                const url = new URL(value);
                value = url.hostname;
            } catch (e) {
                value = fallback || 'N/A';
            }
        }
        
        // Handle special character field for cast data
        if (selector === '.b_strong + *') {
            const nameElement = element.querySelector('.b_strong');
            if (nameElement && nameElement.nextElementSibling) {
                value = nameElement.nextElementSibling.textContent?.trim() || fallback || 'N/A';
            }
        }
        
        return value;
        
    } catch (error) {
        console.error('Error extracting value:', error);
        return fallback || 'N/A';
    }
}

// Extract data for a specific section
function extractSectionData(doc, sectionConfig) {
    if (!sectionConfig) return [];
    
    const { container, fields } = sectionConfig;
    const elements = doc.querySelectorAll(container);
    const results = [];
    
    elements.forEach((element, index) => {
        const item = {};
        
        Object.keys(fields).forEach(fieldName => {
            const fieldConfig = fields[fieldName];
            item[fieldName] = extractValue(element, fieldConfig, index);
        });
        
        results.push(item);
    });
    
    return results;
}

// Extract global data (page-level information)
function extractGlobalData(html, doc, globalConfig) {
    const globalData = {};
    
    Object.keys(globalConfig).forEach(key => {
        const config = globalConfig[key];
        
        if (config.regex) {
            const regex = new RegExp(config.regex);
            const match = regex.exec(html);
            globalData[key] = match ? match[1].replace(/,/g, '') : config.fallback || 'N/A';
        } else if (config.selector) {
            const element = doc.querySelector(config.selector);
            globalData[key] = extractValue(element, config);
        }
    });
    
    return globalData;
}

// Process a single query with YAML config
async function processWebQuery(query, cc, config) {
    try {
        const params = new URLSearchParams({
            q: typeof query === 'object' ? query.query : query,
            cc: cc
        });
        const url = `https://www.bing.com/search?${params.toString()}`;
        const res = await fetch(url);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const webConfig = config.bing_web;
        const globalConfig = webConfig.global;
        
        // Extract all sections
        const resultData = {
            query: typeof query === 'object' ? query.query : query,
            query_id: typeof query === 'object' ? query.query_id : null
        };
        
        // Extract global data first
        const globalData = extractGlobalData(html, doc, globalConfig);
        Object.assign(resultData, globalData);
        
        // Extract each section
        const sections = ['top_stories', 'organic_results', 'pagination', 'related_searches', 
                         'related_questions', 'video_results', 'cast_data'];
        
        sections.forEach(sectionName => {
            if (webConfig[sectionName]) {
                const sectionData = extractSectionData(doc, webConfig[sectionName]);
                resultData[sectionName] = sectionData;
            }
        });

        // Filter out empty arrays and null values
        const filteredData = Object.fromEntries(
            Object.entries(resultData).filter(([key, value]) =>
                value !== null &&
                value !== undefined &&
                !(Array.isArray(value) && value.length === 0) &&
                !(typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
            )
        );

        return { success: true, ...filteredData };
    } catch (error) {
        console.error('Error processing web query:', error);
        return { 
            success: false, 
            query: typeof query === 'object' ? query.query : query,
            query_id: typeof query === 'object' ? query.query_id : null,
            error: error.message 
        };
    }
}

// Handle multiple web queries with config
async function fetchWebWithConfig(queries, cc = 'US', config) {
    return await Promise.all(queries.map(query => processWebQuery(query, cc, config)));
}