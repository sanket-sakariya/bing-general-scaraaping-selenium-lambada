// Fetch raw HTML for a Bing News search with cc and qft
async function fetchSearchHTML(query, cc) {
    const params = new URLSearchParams({
        q: query,
        cc: cc
    });
    const response = await fetch(`https://www.bing.com/images/search?${params.toString()}`);
    return await response.text();
}

// Extract <title> from HTML string
function extractTitle(html) {
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : '';
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

// Extract image URLs from Bing HTML
function extractImagesFromHTML(html, maxImages = 100) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const imageItems = doc.querySelectorAll('li[data-idx]');
    const extractedImages = [];

    imageItems.forEach((item, index) => {
        if (extractedImages.length >= maxImages) return;

        try {
            const data = {};
            const anchor = item.querySelector('a.iusc');
            const meta = anchor?.getAttribute('m');
            const metaData = meta ? JSON.parse(meta.replace(/&quot;/g, '"')) : {};
            const image = item.querySelector('.mimg');

            const domainLink = item.querySelector('.lnkw a')?.href || '';
            const domain = domainLink ? new URL(domainLink).hostname : 'N/A';

            data.position = index + 1;
            data.title = metaData?.t || 'N/A';
            data.link = metaData?.murl || 'N/A';
            data.domain = domain;
            data.width = image?.getAttribute('width') || 'N/A';
            data.height = image?.getAttribute('height') || 'N/A';

            extractedImages.push(data);
        } catch (error) {
            console.warn('Error extracting image at index', index, error);
        }
    });

    return extractedImages;
}


// Process a single query with cc 
async function processQuery(query, cc) {
    try {
        const params = new URLSearchParams({
            q: query,
            cc: cc
        });

        const url = `https://www.bing.com/images/search?${params.toString()}`;
        const res = await fetch(url);
        const html = await res.text();
        const title = extractTitle(html);
        const serp_result_count = extractResultCount(html);
        const image_results = extractImagesFromHTML(html);

        return { success: true, query, title, serp_result_count, image_results };
    } catch (error) {
        return { success: false, query, error: error.message };
    }
}

// Handle multiple queries
async function fetchSearches(queries, cc = 'US') {
    return await Promise.all(queries.map(query => processQuery(query, cc)));
}

// fetchSearches(["pm mod","Rajkot"],'AU').then(results => {
//         console.log(results);
//         window.fetchResults = results;
//     });