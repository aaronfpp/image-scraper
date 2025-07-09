const fetch = require('node-fetch');
const cheerio = require('cheerio');

exports.handler = async function(event) {
  const { sku, size, type, action, url, index } = event.queryStringParameters || {};
  console.log(`Received query parameters: ${JSON.stringify(event.queryStringParameters)}`);

  // Handle title scraping request
  if (action === 'getProductTitle') {
    if (!sku || !/^[0-9]{5}$/.test(String(sku).trim())) {
      console.error(`Invalid or missing SKU for getProductTitle: ${sku}`);
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid or missing SKU: Must be a 5-digit number' })
      };
    }

    console.log(`Processing title scrape for SKU: ${sku}`);
    const result = await scrapeIFSTAPage(sku);
    return {
      statusCode: result.statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result.body)
    };
  }

  // Handle site images scraping request
  if (action === 'getSiteImages') {
    console.log(`Processing site images scrape for URL: ${url}, index: ${index}`);
    const result = await scrapeSiteImages(url, parseInt(index) || 0);
    return {
      statusCode: result.statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result.body)
    };
  }

  // Handle sitemap URLs request
  if (action === 'getSitemapUrls') {
    console.log(`Processing sitemap URLs scrape`);
    const result = await scrapeSitemapUrls();
    return {
      statusCode: result.statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result.body)
    };
  }

  // Handle image fetching request
  console.log(`Processing image fetch request`);
  if (!sku || !size || !type) {
    console.error('Missing query parameters: sku, size, or type');
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing sku, size, or type parameter' })
    };
  }

  const imageUrl = `https://images.ifsta.org/products/${sku}/${size}${type}`;
  console.log(`Fetching URL: ${imageUrl}`);
  try {
    const response = await fetch(imageUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ImageScraper/1.0)' }
    });
    console.log(`Response status: ${response.status}, Content-Type: ${response.headers.get('content-type')}`);
    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    if (!contentType.startsWith('image/')) {
      throw new Error(`Invalid content type: ${contentType}`);
    }
    const buffer = await response.buffer();
    console.log(`Image fetched successfully, size: ${buffer.length} bytes`);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isBase64Encoded: true,
        body: buffer.toString('base64'),
        contentType: contentType
      })
    };
  } catch (error) {
    console.error(`Error fetching ${imageUrl}: ${error.message}`);
    return {
      statusCode: error.message.includes('Status 404') ? 404 : 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message })
    };
  }
};

async function scrapeIFSTAPage(sku) {
  try {
    const productUrl = `https://ifsta.org/shop/product/${sku}`;
    console.log(`Fetching product page: ${productUrl}`);
    const response = await fetch(productUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ImageScraper/1.0)' }
    });

    console.log(`Product page status for SKU ${sku}: ${response.status}`);
    if (!response.ok) {
      return {
        statusCode: response.status === 404 ? 404 : 500,
        body: { error: `Failed to fetch product page: Status ${response.status}` }
      };
    }

    const html = await response.text();
    console.log(`Fetched HTML length for SKU ${sku}: ${html.length} characters`);
    const $ = cheerio.load(html);

    // Check for error page indicators
    const pageTitle = $('title').text().trim();
    const pageHeader = $('h1').text().trim();
    if (pageTitle.match(/404|page not found/i) || pageHeader.match(/page not found|error/i)) {
      console.log(`Error page detected for SKU ${sku}: Title="${pageTitle}", Header="${pageHeader}"`);
      return {
        statusCode: 404,
        body: { error: 'Product page not found' }
      };
    }

    const selectors = [
      '[id^="node-"] > div > div:nth-child(1) > div:nth-child(2) > h2',
      'h2.product-title',
      'h2'
    ];

    // Filter titles to avoid invalid ones
    let title = null;
    for (const selector of selectors) {
      const element = $(selector).first();
      console.log(`Selector ${selector} tried for SKU ${sku}: ${element.text().trim() || 'Not found'}`);
      if (element.length) {
        const candidate = element.text().trim();
        if (candidate.length > 5 && !candidate.match(/search form|page not found|error|menu|cart|login|search|home/i)) {
          title = candidate;
          break;
        }
      }
    }

    if (!title) {
      console.log(`No title found for SKU ${sku}`);
      return {
        statusCode: 404,
        body: { error: 'Product title not found' }
      };
    }

    return {
      statusCode: 200,
      body: { title }
    };
  } catch (error) {
    console.error(`Error scraping SKU ${sku}: ${error.message}`);
    return {
      statusCode: 500,
      body: { error: `Error scraping product page: ${error.message}` }
    };
  }
}

async function scrapeSiteImages(pageUrl, index) {
  try {
    if (!pageUrl || !pageUrl.startsWith('https://www.ifsta.org/')) {
      console.error(`Invalid or missing URL: ${pageUrl}`);
      return {
        statusCode: 400,
        body: { error: 'Invalid or missing URL' }
      };
    }

    console.log(`Fetching page: ${pageUrl}`);
    const response = await fetch(pageUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ImageScraper/1.0)' }
    });

    console.log(`Page status: ${response.status}`);
    if (!response.ok) {
      return {
        statusCode: response.status === 404 ? 404 : 500,
        body: { error: `Failed to fetch page: Status ${response.status}` }
      };
    }

    const html = await response.text();
    console.log(`Fetched HTML length for page: ${html.length} characters`);
    const $ = cheerio.load(html);

    // Extract image URLs
    const imageUrls = [];
    $('img').each((i, elem) => {
      const src = $(elem).attr('src');
      if (src && src.match(/\/sites\/(default\/files\/((styles\/medium\/public\/|awards\/))?|all\/themes\/drupal_shop_theme\/images\/).*\.(jpg|png)(\?.*)?$/i)) {
        const fullUrl = src.startsWith('http') ? src : `https://www.ifsta.org${src}`;
        imageUrls.push(fullUrl);
        console.log(`Found image ${i}: ${fullUrl}`);
      }
    });

    // Validate image URLs and select the one at index
    const validImages = [];
    for (const url of imageUrls) {
      try {
        const headResponse = await fetch(url, {
          method: 'HEAD',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ImageScraper/1.0)' }
        });
        if (headResponse.ok && headResponse.headers.get('content-type').startsWith('image/')) {
          validImages.push(url);
          console.log(`Valid image found: ${url}`);
        } else {
          console.log(`Invalid image URL: ${url}, status: ${headResponse.status}`);
        }
      } catch (error) {
        console.error(`Error validating ${url}: ${error.message}`);
      }
    }

    if (validImages.length === 0) {
      console.log('No valid images found on page');
      return {
        statusCode: 404,
        body: { error: 'No valid images found' }
      };
    }

    if (index >= validImages.length) {
      console.log(`No image at index ${index}; only ${validImages.length} images found`);
      return {
        statusCode: 404,
        body: { error: `No image at index ${index}` }
      };
    }

    return {
      statusCode: 200,
      body: { image: validImages[index] }
    };
  } catch (error) {
    console.error(`Error scraping images for ${pageUrl}: ${error.message}`);
    return {
      statusCode: 500,
      body: { error: `Error scraping images: ${error.message}` }
    };
  }
}

async function scrapeSitemapUrls() {
  try {
    const sitemapUrl = 'https://www.ifsta.org/sitemap.xml';
    console.log(`Fetching sitemap: ${sitemapUrl}`);
    const response = await fetch(sitemapUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ImageScraper/1.0)' }
    });

    console.log(`Sitemap status: ${response.status}`);
    if (!response.ok) {
      return {
        statusCode: response.status === 404 ? 404 : 500,
        body: { error: `Failed to fetch sitemap: Status ${response.status}` }
      };
    }

    const xml = await response.text();
    console.log(`Fetched sitemap XML length: ${xml.length} characters`);
    const $ = cheerio.load(xml, { xmlMode: true });

    const urls = [];
    $('loc').each((i, elem) => {
      const url = $(elem).text().trim();
      if (url && url.startsWith('https://www.ifsta.org/')) {
        urls.push(url);
      }
    });

    if (urls.length === 0) {
      console.log('No URLs found in sitemap');
      return {
        statusCode: 404,
        body: { error: 'No URLs found in sitemap' }
      };
    }

    return {
      statusCode: 200,
      body: { urls }
    };
  } catch (error) {
    console.error(`Error scraping sitemap: ${error.message}`);
    return {
      statusCode: 500,
      body: { error: `Error scraping sitemap: ${error.message}` }
    };
  }
}
