const fetch = require('node-fetch');
const puppeteer = require('puppeteer');

exports.handler = async function(event) {
  const { sku, size, type, action } = event.queryStringParameters || {};

  if (action === 'getProductTitle') {
    console.log(`Fetching product page for SKU: ${sku}`);
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();
      const url = `https://www.ifsta.org/shop/product/${sku}`;
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      const title = await page.evaluate(() => {
        const element = document.querySelector('#node-2079 > div > div.row.product > div:nth-child(2) > h2');
        return element ? element.textContent.trim() : null;
      });
      
      await browser.close();
      
      if (!title) {
        console.log(`No title found for SKU ${sku}`);
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Product title not found' })
        };
      }
      
      console.log(`Title fetched for SKU ${sku}: ${title}`);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      };
    } catch (error) {
      console.error(`Error fetching product page for SKU ${sku}: ${error.message}`);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Failed to fetch product page: ${error.message}` })
      };
    }
  }

  if (!sku || !size || !type) {
    console.error('Missing query parameters: sku, size, or type');
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing sku, size, or type parameter' })
    };
  }

  const url = `https://images.ifsta.org/products/${sku}/${size}${type}`;
  console.log(`Fetching image URL: ${url}`);
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
