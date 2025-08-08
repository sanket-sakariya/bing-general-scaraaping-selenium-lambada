// Fetch raw HTML for a search query
async function fetchSearchHTML(query) {
    const params = new URLSearchParams({ 'q': query, 'client': 'safari' });
    const response = await fetch(`https://www.google.com/search?${params.toString()}`);
    return await response.text();
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
function extractResultCount() {
    try {
        const resultStats = document.getElementById("result-stats");
        const countText = resultStats?.textContent || "";
        const match = countText.match(/About ([\d,]+) result/);
        if (match) {
            const countStr = match[1] || match[2];
            return parseInt(countStr.replace(/,/g, ''), 10);
        }
    } catch (e) {
        console.warn("Error extracting result count:", e);
    }
    return -1;
}

// Extract organic results
function extractOrganicResults(doc) {
    const results = [];
    const blocks = doc.querySelectorAll("div.MjjYud");
    blocks.forEach((block, i) => {
        try {
            const title = block.querySelector("h3")?.textContent?.trim() || "";
            const link = block.querySelector("a")?.href?.trim() || "";
            const snippet = block.querySelector(".VwiC3b")?.textContent?.trim() || "";
            const image = block.querySelector("img.XNo5Ab")?.src?.trim() || "";
            const domain = link ? new URL(link).hostname : "";

            // Skip if both title and link are empty
            if (!title && !link) return; 

            results.push({
                position: i + 1,
                title,
                link,
                domain,
                snippet,
                image
            });
        } catch (err) {
            console.warn("Error processing organic result:", err);
        }
    });
    return results;
}

// Extract local business results
function extractLocalResults(doc) {
    const localResults = [];
    doc.querySelectorAll("div.cXedhc").forEach((block, index) => {
        try {
            const title = block.querySelector(".dbg0pd .OSrXXb")?.textContent || "";
            const snippet = block.querySelector(".pJ3Ci span")?.textContent || "";
            const detailDivs = block.querySelectorAll(".rllt__details > div");
            const address = detailDivs[2]?.textContent || "";
            const ratingBlock = detailDivs[1]?.textContent || "";
            const infoParts = ratingBlock.split("·").map(part => part.trim());
            const business_type = infoParts[infoParts.length - 1] || "";
            const price = infoParts.find(part => /^[$₹€¥]+[\d\-–\s]*$/.test(part)) || "";
            const rating = block.querySelector(".yi40Hd")?.textContent || "";
            const review = block.querySelector(".RDApEe")?.textContent.replace(/[()]/g, "") || "";
            const data_cid = block.querySelector("a[data-cid]")?.getAttribute("data-cid") || "";
            const image = block.querySelector("img.YQ4gaf")?.src || "";

            let website = "", directions = "";
            const container = block.closest(".VkpGBb")?.parentElement;
            if (container) {
                container.querySelectorAll("a").forEach(link => {
                    const text = link.textContent.trim();
                    if (text === "Website") website = link.href;
                    if (text === "Directions") directions = link.href;
                });
            }

            localResults.push({
                position: index + 1,
                title,
                snippet,
                address,
                business_type,
                price,
                rating,
                review,
                data_cid,
                image,
                website,
                directions
            });
        } catch (e) {
            console.warn("Error parsing local result:", e);
        }
    });
    return localResults;
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

//related-searches

function extractRelatedSearches(doc = document, selector = "a.ngTNl.ggLgoc") {
    const relatedSearches = [];

    doc.querySelectorAll(selector).forEach((el, index) => {
        const title = el.querySelector("span.dg6jd")?.innerText.trim() || "";
        const link = el.href || "";
        relatedSearches.push({
            position: index + 1,
            title,
            link
        });
    });

    return relatedSearches;
}

// related-questions-answers
function extractQAInfo({ htmlContent = '', doc = null } = {}) {
    // Parse HTML content if no DOM document is passed
    if (!doc && htmlContent) {
        const parser = new DOMParser();
        doc = parser.parseFromString(htmlContent, 'text/html');
    }

    if (!doc) {
        console.warn("No valid document or HTML content provided.");
        return [];
    }

    const results = [];
    const qaBlocks = doc.querySelectorAll('div.wQiwMc.related-question-pair');

    qaBlocks.forEach((block, index) => {
        const question = block.querySelector('.CSkcDe')?.textContent.trim() || '';

        const answerParts = [];

        const mainAnswer = block.querySelector('.IZ6rdc')?.textContent.trim();
        if (mainAnswer) answerParts.push(mainAnswer);

        const description = block.querySelector('.hgKElc')?.textContent.trim();
        if (description) answerParts.push(description);

        const tableRows = block.querySelectorAll('.ztXv9, .webanswers-webanswers_table__webanswers-table tr');
        tableRows.forEach(row => {
            const text = row.textContent.trim().replace(/\s+/g, ' ');
            if (text) answerParts.push(text);
        });

        const answer = answerParts.join(' ').trim();

        let link = '', title = '', domain = '';
        const linkAnchor = block.querySelector('a.zReHs');

        if (linkAnchor) {
            link = linkAnchor.getAttribute('href') || '';
            title = linkAnchor.querySelector('h3.LC20lb')?.textContent.trim() || '';

            const citeText = linkAnchor.querySelector('cite.qLRx3b, .VuuXrf')?.textContent;
            if (citeText) {
                domain = citeText.split('›')[0].trim();
            } else {
                try {
                    domain = new URL(link).hostname;
                } catch (_) {
                    domain = '';
                }
            }
        }

        results.push({
            question,
            answer,
            link,
            domain,
            title,
            blockposition: index
        });
    });

    return results;
}

//top stories


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

//inline images

function extractVisualStories({ doc = null, htmlContent = '' } = {}) {
    // Parse HTML string if DOM not provided
    if (!doc && htmlContent) {
        const parser = new DOMParser();
        doc = parser.parseFromString(htmlContent, 'text/html');
    }

    if (!doc) {
        console.warn("No valid document or HTML content provided.");
        return [];
    }

    const results = [];

    doc.querySelectorAll("div.w43QB.EXH1Ce").forEach((block, index) => {
        try {
            const anchor = block.querySelector("a.ddkIM");
            const link = anchor?.href || "";

            const titleElement = block.querySelector("span.Yt787");
            const title = titleElement?.innerText || "";

            const image = block.querySelector("img[id^='dimg_']")?.src || "";

            results.push({
                position: index + 1,
                title,
                image,
                link
            });
        } catch (err) {
            console.warn("Error parsing block at position", index, err);
        }
    });

    return results;
}

// inline videos 

function extractVideoResults({ doc = null, htmlContent = '' } = {}) {
    // Parse HTML if raw content is provided
    if (!doc && htmlContent) {
        const parser = new DOMParser();
        doc = parser.parseFromString(htmlContent, 'text/html');
    }

    if (!doc) {
        console.warn("No valid document or HTML content provided.");
        return [];
    }

    const videoResults = [];

    doc.querySelectorAll("div.Tu1FGd").forEach(block => {
        try {
            const title = block.querySelector("div.OSrXXb span")?.innerText || "";
            const duration = block.querySelector(".kSFuOd span")?.innerText || "";
            const channel = block.querySelector(".Sg4azc")?.innerText || "";
            const videoLink = block.querySelector("a.rIRoqf")?.href || "";
            const thumbnail = block.querySelector("img")?.src || "";

            videoResults.push({
                title,
                duration,
                channel,
                videoLink,
                thumbnail
            });
        } catch (e) {
            console.warn("Error parsing video block:", e);
        }
    });

    return videoResults;
}

//tweets
function extractTweets(doc) {
  const tweetBlocks = doc.querySelectorAll('.fy7gGf');
  const tweets = [];

  tweetBlocks.forEach(block => {
    try {
      const tweet = {};

      // Snippet text
      const snippetElem = block.querySelector('.ZgGG5b .xcQxib');
      tweet.snippet = snippetElem?.innerText.trim() || '';

      // Tweet status link
      const linkElem = block.querySelector('a.h4kbcd');
      tweet.statusLink = linkElem?.href || '';

      // Image (if present)
      const imageElem = block.querySelector('img');
      tweet.image = imageElem?.src || '';

      // Title/Source - You can customize this as needed
      tweet.title = "Tweet from embedded source";

      // Timestamp
      const timeElem = block.querySelector('.PygIW');
      tweet.time = timeElem?.innerText || '';

      tweets.push(tweet);
    } catch (e) {
      console.warn("Error parsing tweet block:", e);
    }
  });

  return tweets;
}

//inline-hotels
function extractHotels(doc) {
  const hotelCards = doc.querySelectorAll('a[jsname][role="link"].NANqI');

  const hotels = Array.from(hotelCards).map((card, index) => {
    const position = index + 1;

    const dataKey = card.getAttribute('data-key') || null;
    const lat = card.getAttribute('data-lat') || null;
    const lng = card.getAttribute('data-lng') || null;

    const name = card.querySelector('.KmZaZb .BTPx6e')?.textContent.trim() || null;
    const priceText = card.querySelector('.c4RtQd .sRlU8b')?.textContent.trim() || null;

    let rating = null;
    let reviewCount = null;
    const ratingElem = card.querySelector('.j4Tqqd .Y0A0hc');
    if (ratingElem) {
      rating = ratingElem.querySelector('.yi40Hd')?.textContent?.trim() || null;
      reviewCount = ratingElem.querySelector('.RDApEe')?.textContent?.replace(/[()]/g, '')?.trim() || null;
    }

    const snippet = card.querySelector('.dLtZ8b')?.textContent.trim() || null;
    const type = card.querySelector('.j4Tqqd .NAkmnc')?.textContent.trim() || null;

    return {
      position,
      dataKey,
      lat,
      lng,
      name,
      price: priceText,
      rating,
      reviewCount,
      snippet,
      type,
      blockPosition: index
    };
  });

  return hotels;
}

// film-information
function extractMovieData(doc) {
  const finalData = {
    castData: [],
    reviewsData: {
      rating: null,
      reviews: [],
      moreReviewsLinkText: null
    },
    servicesData: []
  };

  // 1️⃣ Extract Cast Members
  const castMembers = doc.querySelectorAll('.XRVJtc.bnmjfe.aKByQb');
  castMembers.forEach(member => {
    const name = member.querySelector('.yVCOtc.CvgGZ.LJEGod.aKoISd')?.textContent.trim() || 'N/A';
    const character = member.querySelector('.PeZnd')?.textContent.trim() || 'N/A';
    const imgElement = member.querySelector('img');
    const imageUrl = imgElement?.getAttribute('data-src') || imgElement?.getAttribute('src') || 'N/A';

    finalData.castData.push({ name, character, imageUrl });
  });

  // 2️⃣ Extract Reviews
  const ratingElement = doc.querySelector('div.xt8Uw.q8U8x');
  finalData.reviewsData.rating = ratingElement ? ratingElement.innerText.trim() : null;

  const reviewBlocks = doc.querySelectorAll('div.e8eHnd');
  reviewBlocks.forEach(block => {
    const description = block.querySelector('span')?.innerText.trim() || null;
    const sourceImg = block.closest('.Pl0lPb')?.querySelector('img')?.src || null;

    finalData.reviewsData.reviews.push({
      description: description,
      source: sourceImg
    });
  });

  const moreReviewsButton = doc.querySelector('g-more-link .Z4Cazf');
  finalData.reviewsData.moreReviewsLinkText = moreReviewsButton ? moreReviewsButton.innerText.trim() : null;

  // 3️⃣ Extract Service Providers
  doc.querySelectorAll('.eGiiEf.ngmM2 .bLddW.U5EKEf.coTbne.ZEISdd').forEach(serviceBlock => {
    const linkElement = serviceBlock.querySelector('a.coTbne');
    const title = doc.querySelector('h1.WQWxe')?.innerText || "Unknown Title";

    const link = linkElement?.href || "N/A";
    const serviceName = linkElement?.querySelector('.ellip.bclEt')?.innerText || "N/A";
    const price = linkElement?.querySelector('.ellip.rsj3fb')?.innerText || "N/A";
    const imageUrl = linkElement?.querySelector('img')?.src || "N/A";

    finalData.servicesData.push({
      title,
      serviceName,
      price,
      link,
      imageUrl
    });
  });

  return finalData;
}


// Combine all extraction steps for a single query
async function processQuery(query) {
    try {
        const html = await fetchSearchHTML(query);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const rawResult = {
            success: true,
            query,
            title: extractTitle(html),
            serp_result_count: extractResultCount(html),
            organic_results: extractOrganicResults(doc),
            local_results: extractLocalResults(doc),
            pagination: extractPagination(doc),
            relatedSearches: extractRelatedSearches(doc),
            topStories: extractTopStories({ doc, htmlContent: html }),
            visualStories: extractVisualStories({ doc, htmlContent: html }),
            videoResults: extractVideoResults({ doc, htmlContent: html }),
            tweetData: extractTweets(doc),
            hotelResults: extractHotels(doc)
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
            cleanedResult.tweetData?.length > 0 ||
            cleanedResult.hotelResults?.length > 0;

        if (!hasContent) {
            return {
                error : true,
                query,
                message: "No meaningful content found in result , Resquest limit reached out"
            };
        }

        return cleanedResult;
    } catch (error) {
        return {
            response: false,
            error: true,
            query,
            error: error.message
        };
    }
}





// Helper: Promise with timeout for each query
function withTimeout(promise, ms, query) {
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve({ query }), ms))
    ]);
}

// Handle multiple queries in parallel with a global timeout
async function fetchSearches(queries, timeoutMs = 40000) {
    const promises = queries.map(q => withTimeout(processQuery(q), timeoutMs, q));
    return await Promise.all(promises);
}

