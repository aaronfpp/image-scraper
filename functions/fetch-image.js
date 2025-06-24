import fetch from 'node-fetch';

export async function handler(event) {
  const { sku, size, type } = event.queryStringParameters;
  const url = `https://images.ifsta.org/products/${sku}/${size}${type}`;
  console.log(`Fetching URL: ${url}`);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ImageScraper/1.0)' }
    });
    console.log(`Response status: ${response.status}`);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const buffer = await response.buffer();
    return {
      statusCode: 200,
      headers: { 'Content-Type': response.headers.get('content-type') },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    };
  } catch (error) {
    console.error(`Error fetching ${url}: ${error.message}`);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}
