const fetch = require('node-fetch');
const cheerio = require('cheerio');

exports.handler = async function(event) {
  const { sku, size, type } = event.queryStringParameters || {};
  if (!sku || !size || !type) {
    console.error('Missing query parameters: sku, size, or type');
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing sku, size, or type parameter' })
    };
  }

  const url = `https://images.ifsta.org/products/${sku}/${size}${type}`;
  console.log(`Fetching URL: ${url}`);
  try {
    const response = await fetch(url, {
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
    console.error(`Error fetching ${url}: ${error.message}`);
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
    const response = await fetch(productUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch product page: ${response.status}`);
    }

    const cheerio = require('cheerio');
    const $ = cheerio.load(await response.text());

    const titleElement = $("#node-2079 > div > div.row.product > div:nth-child(2) > h2");
    if (!titleElement.length) {
      throw new Error('Product title element not found');
    }

    const title = titleElement.text().trim();

    const imageUrl = $('img.product-image').attr('src');
    if (!imageUrl) {
      throw new Error('Product image not found');
    }

    return {
      sku,
      title,
      imageUrl
    };
  } catch (error) {
    console.error(`Error scraping SKU ${sku}:`, error.message);
    return null;
  }
}
