const fetch = require('node-fetch');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

exports.handler = async function(event) {
  const { sku, size, type, action } = event.queryStringParameters || {};

  // Handle product title fetching
  if (action === 'getProductTitle') {
    console.log(`Fetching product page for SKU: ${sku}`);
    if (!sku || !/^[0-9]{5}$/.test(sku)) {
      console.error('Invalid or missing SKU for getProductTitle');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid or missing SKU: Must be a 5-digit number' })
      };
    }

    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      let browser;
      try {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
        browser = await puppeteer.launch({
          args: chromium.args,
          executablePath: await chromium.executablePath,
          headless: chromium.headless,
          timeout: 15000
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (compatible; ImageScraper/1.0)');
        const url = `https://www.ifsta.org/shop/product/${sku}`;
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        const data = await page.evaluate(() => {
          const title = document.querySelector('#node-2079 > div > div.row.product > div:nth-child(2) > h2')?.textContent?.trim() || null;
          return { title };
        });
        await page.close();
        await browser.close();
        if (!data.title) {
          console.log(`No title found for SKU ${sku}`);
          return {
            statusCode: 404,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Product title not found' })
          };
        }
        console.log(`Data fetched for SKU ${sku}: ${JSON.stringify(data)}`);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        };
      } catch (error) {
        retryCount++;
        console.error(`Attempt ${retryCount} failed for SKU ${sku}: ${error.message}`);
        if (browser) await browser.close();
        if (retryCount >= maxRetries) {
          return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: `Failed to fetch product page after ${maxRetries} attempts` })
          };
        }
      }
    }
  }

  // Handle image fetching
  if (!sku || !size || !type) {
    console.error('Missing query parameters: sku, size, or type');
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing sku, size, or type parameter' })
    };
  }

  // Validate parameters
  if (!/^[0-9]{5}$/.test(sku)) {
    console.error('Invalid SKU: Must be a 5-digit number');
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid SKU: Must be a 5-digit number' })
    };
  }
  const validSizes = ["default", "thumb", "69", "100", "130", "150", "180", "200", "200x200", "420"];
  const validTypes = [".png", ".webp"];
  if (!validSizes.includes(size)) {
    console.error(`Invalid size: ${size}`);
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid size parameter' })
    };
  }
  if (!validTypes.includes(type)) {
    console.error(`Invalid type: ${type}`);
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid type parameter' })
    };
  }

  const url = `https://images.ifsta.org/products/${sku}/${size}${type}`;
  console.log(`Fetching image URL: ${url}`);
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ImageScraper/1.0)' }
      });
      console.log(`Response status: ${response.status}, Content-Type: ${response.headers.get('content-type')}`);
      if ([429, 503].includes(response.status)) {
        retryCount++;
        console.log(`Retrying ${url}: Status ${response.status}, Attempt ${retryCount}`);
        if (retryCount >= maxRetries) {
          throw new Error(`Status ${response.status} after ${maxRetries} attempts`);
        }
        continue;
      }
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
      retryCount++;
      console.error(`Error fetching ${url}: ${error.message}, Attempt ${retryCount}`);
      if (retryCount >= maxRetries) {
        return {
          statusCode: error.message.includes('Status 404') ? 404 : 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: error.message })
        };
      }
    }
  }
};
