async function fetchImagesWithConfig(queries, cc, config) {
    async function processQuery(queryObj, cc) {
        // Extract query string from object or use as string
        const query = (typeof queryObj === 'object' && queryObj.query) ? queryObj.query : queryObj;
        const queryId = (typeof queryObj === 'object' && queryObj.query_id) ? queryObj.query_id : null;
        
        const params = new URLSearchParams({ q: query, cc: cc });
        const url = `https://www.bing.com/images/search?${params.toString()}`;
        const res = await fetch(url);
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const items = doc.querySelectorAll(config.bing_images.container);
        const results = [];
        
        items.forEach((item, idx) => {
            const data = {};
            for (const [field, conf] of Object.entries(config.bing_images.fields)) {
                let value = conf.fallback || 'N/A';
                
                if (conf.selector) {
                    const el = item.querySelector(conf.selector);
                    if (el) {
                        if (conf.attribute === 'm' && conf.parse_json) {
                            try {
                                const meta = el.getAttribute('m');
                                const metaData = meta ? JSON.parse(meta.replace(/&quot;/g, '"')) : {};
                                value = metaData?.[conf.json_key] || conf.fallback;
                            } catch { 
                                value = conf.fallback; 
                            }
                        } else if (conf.parse_domain) {
                            try {
                                const href = el.getAttribute(conf.attribute);
                                value = href ? new URL(href).hostname : conf.fallback;
                            } catch { 
                                value = conf.fallback; 
                            }
                        } else {
                            value = el.getAttribute(conf.attribute) || el.textContent || conf.fallback;
                        }
                    }
                }
                data[field] = value;
            }
            data.position = idx + 1;
            results.push(data);
        });
        
        // Global fields - extract title and result count
        const titleElement = doc.querySelector(config.bing_images.global.page_title.selector);
        const title = titleElement ? 
            (titleElement.getAttribute(config.bing_images.global.page_title.attribute) || titleElement.textContent) : 
            config.bing_images.global.page_title.fallback;
        
        const resultCountMatch = html.match(new RegExp(config.bing_images.global.result_count.regex));
        const result_count = resultCountMatch ? 
            resultCountMatch[1].replace(/,/g, '') : 
            config.bing_images.global.result_count.fallback;
        
        return { 
            success: true, 
            query, 
            query_id: queryId,
            title, 
            result_count, 
            image_results: results 
        };
    }
    
    return await Promise.all(queries.map(q => processQuery(q, cc)));
}