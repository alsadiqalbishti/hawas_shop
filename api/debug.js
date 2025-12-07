const Redis = require('ioredis');

// Initialize Redis connection
let redis;
function getRedis() {
    if (!redis) {
        const redisUrl = process.env.STORAGE_REDIS_URL || process.env.REDIS_URL;
        if (!redisUrl) {
            throw new Error('Redis URL not configured');
        }
        redis = new Redis(redisUrl);
    }
    return redis;
}

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const redisClient = getRedis();

    try {
        // Get all product IDs
        const productIds = await redisClient.smembers('products');

        // Get all products
        const products = [];
        for (const productId of productIds) {
            const productData = await redisClient.get(`product:${productId}`);
            if (productData) {
                products.push(JSON.parse(productData));
            }
        }

        return res.status(200).json({
            redisUrl: process.env.STORAGE_REDIS_URL ? 'STORAGE_REDIS_URL is set' : 'Using REDIS_URL',
            productCount: products.length,
            productIds: productIds,
            products: products
        });

    } catch (error) {
        return res.status(500).json({
            error: error.message,
            redisUrl: process.env.STORAGE_REDIS_URL ? 'STORAGE_REDIS_URL is set' : (process.env.REDIS_URL ? 'REDIS_URL is set' : 'No Redis URL')
        });
    }
};
