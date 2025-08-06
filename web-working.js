// Fetch raw HTML for a Bing News search with cc
async function fetchSearchHTML(query, cc) {
    const params = new URLSearchParams({
        q: query,
        cc: cc
    });
    const response = await fetch(`https://www.bing.com/search?${params.toString()}`);
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

// Function to extract Bing Top Stories
function extractBingTopStories(root = document, limit = Infinity) {
  const newsCards = root.querySelectorAll('#ans_nws .na_card_wrp');
  const extractedNews = [];

  newsCards.forEach((card, index) => {
    if (index >= limit) return;

    const news = {};

    // Title
    const titleAnchor = card.querySelector('a.na_ccw, a.nws_itm_link');
    news.title = titleAnchor?.getAttribute('titletext')?.trim() || 'N/A';

    // Link
    news.link = titleAnchor?.href || 'N/A';

    // Source (Publisher)
    const source = card.querySelector('.cap_title') ||
                   card.querySelector('.caption cite') ||
                   card.querySelector('.big_pub_logo cite');
    news.source = source?.textContent.trim() || 'N/A';

    // Time Posted
    const time = card.querySelector('.cap_txt');
    news.time = time?.textContent.trim() || 'N/A';

    // Thumbnail Image
    const img = card.querySelector('img.rms_img');
    news.image = img?.src?.startsWith('//') ? 'https:' + img.src : img?.src || 'N/A';

    // Short Description
    const desc = card.querySelector('.na_cal_title, .na_t_news_caption, .itm_spt');
    news.description = desc?.textContent.trim() || 'N/A';

    extractedNews.push(news);
  });

  return extractedNews;
}

// Function to extract Bing organic search results with scoped image extraction
function extractBingOrganicResults(root = document) {
  const results = root.querySelectorAll('li.b_algo');
  const extractedResults = [];

  results.forEach((item, index) => {
    const result = {};

    // Position
    result.position = index + 1;

    // Title and Link
    const titleElem = item.querySelector('h2 > a');
    result.title = titleElem?.innerText?.trim() || 'N/A';
    result.link = titleElem?.href || 'N/A';

    // Domain
    const domainElem = item.querySelector('cite');
    result.domain = domainElem?.innerText?.trim() || 
                    (result.link ? new URL(result.link).hostname : 'N/A');

    // Snippet
    const snippetElem = item.querySelector('.b_snippet p') || 
                        item.querySelector('.b_imgcap_altitle p.b_lineclamp3');
    result.snippet = snippetElem?.innerText?.trim() || 'N/A';


    extractedResults.push(result);
  });

  return extractedResults;
}



// Function to extract Bing pagination links
function extractBingPagination(root = document) {
  const paginationLinks = root.querySelectorAll('ul.sb_pagF a');
  const paginationData = [];

  paginationLinks.forEach(link => {
    const data = {};

    // Link URL
    data.link = link.href || 'N/A';

    // "Next" button check
    if (link.classList.contains('sb_pagN')) {
      data.type = 'next';
      data.pageNumber = 'Next';
    } else {
      data.type = 'page';
      const label = link.getAttribute('aria-label') || '';
      const match = label.match(/Page (\d+)/);
      data.pageNumber = match ? parseInt(match[1], 10) : 'N/A';
    }

    paginationData.push(data);
  });

  return paginationData;
}

//related-searches

// Function to extract Bing related searches
function extractBingRelatedSearches(root = document) {
  const relatedItems = root.querySelectorAll('.b_rs ul.b_vList > li');
  const extractedData = [];

  relatedItems.forEach((item, index) => {
    const data = {};

    const anchor = item.querySelector('a');
    const textElement = item.querySelector('.b_suggestionText');

    data.position = index + 1;
    data.link = anchor?.href || 'N/A';
    data.title = textElement?.innerText.trim() || 'N/A';
    data.question = data.title; // Alias

    extractedData.push(data);
  });

  return extractedData;
}

// Function to extract Bing related questions (People Also Ask style)
function extractBingRelatedQuestions(root = document) {
  const relatedCards = root.querySelectorAll('.df_alsoAskCard');
  const extractedData = [];

  relatedCards.forEach((card, index) => {
    const data = {};

    // Question
    data.question = card.querySelector('.df_qntext')?.innerText.trim() || 'N/A';

    // Answer
    data.answer = card.querySelector('.df_alsocon')?.innerText.trim() || 'N/A';

    // Link
    const anchor = card.closest('a');
    data.link = anchor?.href || 'N/A';

    // Domain
    data.domain = card.querySelector('.qna_attr cite')?.innerText.trim() || 'N/A';

    // Title (e.g., section heading)
    data.title = card.querySelector('h2 span')?.innerText.trim() || 'N/A';

    // Position (optional metadata)
    data.position = index + 1;

    extractedData.push(data);
  });

  return extractedData;
}



// inline videos 

// Function to extract Bing video search results
function extractBingVideoResults(root = document) {
  const videoCards = root.querySelectorAll('.mc_vtvc');
  const extractedVideos = [];

  videoCards.forEach((card, index) => {
    const video = {};

    // Title
    const titleElement = card.querySelector('.mc_vtvc_title');
    video.title = titleElement?.innerText.trim() || 'N/A';

    // Duration
    const durationElement = card.querySelector('.mc_bc.items');
    video.duration = durationElement?.innerText.trim() || 'N/A';

    // Channel
    const channelElement = card.querySelector('.mc_vtvc_meta_row_channel');
    video.channel = channelElement?.innerText.trim() || 'N/A';

    // Video Link
    const videoLink = card.querySelector('a.mc_vtvc_link');
    video.videoLink = videoLink?.href || 'N/A';

    // Thumbnail
    const thumbnailImg = card.querySelector('.mc_vtvc_th img');
    video.thumbnail = thumbnailImg?.src || 'N/A';

    // Position (optional)
    video.position = index + 1;

    extractedVideos.push(video);
  });

  return extractedVideos;
}

// //tweets
// // Function to extract Bing tweet search results
// function extractBingTweetResults(root = document) {
//   const slides = root.querySelectorAll('.slide');
//   const tweetData = [];

//   slides.forEach((slide, index) => {
//     const data = {};

//     // Title (tweet author or headline)
//     const titleElem = slide.querySelector('.feeditem_title');
//     data.title = titleElem?.innerText.trim() || 'N/A';

//     // Snippet (tweet text)
//     const snippetElem = slide.querySelector('.feeditem_snippet');
//     data.snippet = snippetElem?.innerText.trim() || 'N/A';

//     // Link to tweet
//     const linkElem = slide.querySelector('a.feed_item');
//     data.link = linkElem?.href || 'N/A';

//     // Status / Source (e.g., Twitter username or verified status)
//     const sourceElem = slide.querySelector('.feeditem_sourceName');
//     data.status = sourceElem?.innerText.trim() || 'N/A';

//     // Position
//     data.position = index + 1;

//     // Time and Date – placeholders for now
//     data.time = 'N/A';
//     data.date = 'N/A';

//     tweetData.push(data);
//   });

//   return tweetData;
// }

//cast info
function extractCastData(root = document) {
  const castCards = root.querySelectorAll('.l_ecrd_car_item');
  const castData = [];

  castCards.forEach((card, index) => {
    const cast = {};

    // Position (1-based index)
    cast.position = index + 1;

    // Name
    const nameEl = card.querySelector('.b_strong');
    cast.name = nameEl?.innerText.trim() || 'N/A';

    // Character
    const charEl = nameEl?.nextElementSibling;
    cast.character = charEl?.innerText.trim() || 'N/A';

    // Image (prefer high-quality if available)
    const imgEl = card.querySelector('img');
    cast.image = imgEl?.getAttribute('data-src-hq') || imgEl?.src || 'N/A';

    castData.push(cast);
  });

  return castData;
}

//knwoledge graph
function extractKnowledgeGraphData(root = document) {
  const data = {
    type: "person",
    header_image: [],
    title: "",
    profile: [],
    website: "",
    timeline: [],
    explore_more: [],
    other_facts: []
  };

  // Extract header image
  const heroImage = root.querySelector('.l_ecrd_hero img');
  if (heroImage) {
    data.header_image.push({
      image: heroImage.src,
      source: heroImage.parentElement.href || ""
    });
  }

  // Extract title
  const titleElement = root.querySelector('.l_ecrd_hero_ttl h2');
  if (titleElement) {
    data.title = titleElement.textContent.trim();
  }

  // Extract profile links (Wikipedia, YouTube, IMDb)
  const profileLinks = root.querySelectorAll('.l_ecrd_webicons a');
  profileLinks.forEach(link => {
    const title = link.title || link.querySelector('img').alt;
    data.profile.push({
      title: title,
      link: link.href
    });
  });

  // Extract official website
  const websiteLink = root.querySelector('.l_ecrd_a1_officialsite a[href^="http"]');
  if (websiteLink) {
    data.website = websiteLink.href;
  }

  // Extract timeline items
  const timelineItems = root.querySelectorAll('.l_ecrd_tmln_itm');
  timelineItems.forEach(item => {
    const year = item.querySelector('.l_ecrd_txt_hlt')?.textContent.trim();
    const textElement = item.querySelector('.l_ecrd_txt_pln');
    const linkElement = item.querySelector('a');
    
    if (year && textElement) {
      data.timeline.push({
        year: year,
        text: textElement.textContent.trim(),
        link: linkElement?.href || ""
      });
    }
  });

  // Extract explore more items
  const exploreItems = root.querySelectorAll('#lite-entcard_04fee_Explore ~ ul li a');
  exploreItems.forEach(item => {
    const title = item.querySelector('.l_ecrd_rq_btxt')?.textContent.trim();
    const thumbnail = item.querySelector('img')?.src;
    
    if (title) {
      data.explore_more.push({
        title: title,
        link: item.href,
        thumbnail: thumbnail || ""
      });
    }
  });

  // Extract other facts (Born, Political party, etc.)
  const factRows = root.querySelectorAll('.l_ecrd_vqfcts_row');
  factRows.forEach(row => {
    const titleElement = row.querySelector('.lc_expfact_title');
    const valueElements = row.querySelectorAll('.lc_expfact_default > *:not(.lc_expfact_title)');
    
    if (titleElement) {
      const title = titleElement.textContent.trim();
      const values = [];
      let originalValue = "";
      
      valueElements.forEach(el => {
        if (el.tagName === 'A') {
          values.push({
            name: el.textContent.trim(),
            link: el.href
          });
          originalValue += el.textContent.trim() + " ";
        } else if (el.tagName === 'SPAN') {
          originalValue += el.textContent.trim() + " ";
        }
      });
      
      data.other_facts.push({
        name: title,
        original_value: originalValue.trim(),
        value: values
      });
    }
  });

  return data;
}




// Process a single query
async function processQuery(query,cc) {
    try {
        const params = new URLSearchParams({
            q: query,
            cc: cc
        });
        const url = `https://www.bing.com/search?${params.toString()}`;
        const res = await fetch(url);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        // Extract data
        const resultData = {
            query,
            title: extractTitle(html),
            top_stories: extractBingTopStories(doc),
            organic_results: extractBingOrganicResults(doc),
            pagination: extractBingPagination(doc),
            related_searches: extractBingRelatedSearches(doc),
            related_questions: extractBingRelatedQuestions(doc),
            video_results: extractBingVideoResults(doc),
            cast_data: extractCastData(doc),
            serp_result_count: extractResultCount(html)
            // knowoledge_graph: extractKnowledgeGraphData(doc)

        };

        // Filter out null, undefined, or empty array/object values
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
        return { success: false, query, error: error.message };
    }
}

// Handle multiple queries
async function fetchSearches(queries, cc = 'US') {
    return await Promise.all(queries.map(query => processQuery(query, cc)));
}


 fetchSearches(["pm modi"],'IN').then(results => {
        console.log(results);
        window.fetchResults = results;
    });