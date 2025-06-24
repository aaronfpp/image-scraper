const fetch = require('node-fetch');

exports.handler = async function(event) {
  const { sku, size, type } = event.queryStringParameters;
  const url = `https://images.ifsta.org/products/${sku}/${size}${type}`;
  try {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const buffer = await response.buffer();
    return {
      statusCode: 200,
      headers: { 'Content-Type': response.headers.get('content-type') },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
