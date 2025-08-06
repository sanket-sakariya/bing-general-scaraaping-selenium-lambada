// Fetch raw HTML for a Bing image search
async function fetchSearchHTML(query, cc = 'US', qft = 'interval="4"') {
    const params = new URLSearchParams({
        q: query,
        cc: cc,
        qft: qft
    });
    const response = await fetch(`https://www.bing.com/news/search?${params.toString()}`);
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

// Extract news from Bing HTML
function extractBingNews(root = document) {
  const newsCards = root.querySelectorAll('.news-card.newsitem');
  const extractedNews = [];

  newsCards.forEach((card, index) => {
    const news = {};

    // Position
    news.position = index + 1;

    // Title and Link
    const titleAnchor = card.querySelector('a.title');
    news.link = titleAnchor?.href || 'N/A';
    news.title = titleAnchor?.textContent.trim() || 'N/A';

    // Snippet
    const snippet = card.querySelector('.snippet');
    news.snippet = snippet?.textContent.trim() || 'N/A';

    // Source
    const sourceImg = card.querySelector('.pubimg');
    news.source = sourceImg?.title?.trim() || 'N/A';

    // Domain
    const domainUrl = card.getAttribute('url') || card.getAttribute('data-url');
    try {
      news.domain = new URL(domainUrl).hostname;
    } catch {
      news.domain = 'N/A';
    }

    // Relative time
    const relativeDate = card.querySelector('.caption .source span[tabindex="0"]')?.textContent.trim() || 'N/A';
    news.time = relativeDate;

    // Convert to UTC Date (if possible)
    const now = new Date();
    if (relativeDate.endsWith('h')) {
      const hoursAgo = parseInt(relativeDate);
      news.dateUTC = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString();
    } else if (relativeDate.endsWith('m')) {
      const minutesAgo = parseInt(relativeDate);
      news.dateUTC = new Date(now.getTime() - minutesAgo * 60 * 1000).toISOString();
    } else {
      news.dateUTC = 'N/A';
    }

    extractedNews.push(news);
  });

  return extractedNews;
}



// Process a single query with cc and qft
async function processQuery(queryObj, cc, qft) {
    const query = typeof queryObj === 'object' && queryObj.query ? queryObj.query : queryObj;
    try {
        const params = new URLSearchParams({
            q: query,
            cc: cc,
            qft: qft
        });
        const url = `https://www.bing.com/news/search?${params.toString()}`;
        const res = await fetch(url);
        const html = await res.text();
        const title = extractTitle(html);
        const result_count = extractResultCount(html);
        const news_results = extractBingNews(new DOMParser().parseFromString(html, 'text/html'));
        return { success: true, query, title, news_results, result_count };
    } catch (error) {
        return { success: false, query, error: error.message };
    }
}


// Handle multiple queries
async function fetchSearches(queries,cc, qft) {
    return await Promise.all(queries.map(query => processQuery(query, cc, qft)));
}
