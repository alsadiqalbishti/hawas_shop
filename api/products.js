const Redis = require('ioredis');

// Initialize Redis connection
let redis;
function getRedis() {
    if (!redis) {
        // Vercel auto-generates STORAGE_REDIS_URL when you connect Redis
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
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Helper to generate unique ID
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    const redisClient = getRedis();

    try {
        // GET - List all products or get single product
        if (req.method === 'GET') {
            const { id } = req.query;

            if (id) {
                const productData = await redisClient.get(`product:${id}`);
                if (!productData) {
                    return res.status(404).json({ error: 'Product not found' });
                }
                return res.status(200).json(JSON.parse(productData));
            }

            // Get all product IDs
            const productIds = await redisClient.smembers('products');
            const products = [];

            for (const productId of productIds) {
                const productData = await redisClient.get(`product:${productId}`);
                if (productData) {
                    products.push(JSON.parse(productData));
                }
            }

            return res.status(200).json(products);
        }

        // POST - Create new product
        if (req.method === 'POST') {
            const { name, price, description, mediaUrl, mediaType } = req.body;

            const newProduct = {
                id: generateId(),
                name,
                price: parseFloat(price),
                description: description || '',
                mediaUrl: mediaUrl || '',
                mediaType: mediaType || 'image',
                createdAt: new Date().toISOString()
            };

            // Save product to Redis
            await redisClient.set(`product:${newProduct.id}`, JSON.stringify(newProduct));
            await redisClient.sadd('products', newProduct.id);

            return res.status(201).json(newProduct);
        }

        // PUT - Update product
        if (req.method === 'PUT') {
            const { id, name, price, description, mediaUrl, mediaType } = req.body;

            const productData = await redisClient.get(`product:${id}`);
            if (!productData) {
                return res.status(404).json({ error: 'Product not found' });
            }

            const product = JSON.parse(productData);
            const updatedProduct = {
                ...product,
                name: name || product.name,
                price: price ? parseFloat(price) : product.price,
                description: description !== undefined ? description : product.description,
                mediaUrl: mediaUrl !== undefined ? mediaUrl : product.mediaUrl,
                mediaType: mediaType || product.mediaType,
                updatedAt: new Date().toISOString()
            };

            await redisClient.set(`product:${id}`, JSON.stringify(updatedProduct));
            return res.status(200).json(updatedProduct);
        }

        // DELETE - Delete product
        if (req.method === 'DELETE') {
            const { id } = req.query;

            const exists = await redisClient.exists(`product:${id}`);
            if (!exists) {
                return res.status(404).json({ error: 'Product not found' });
            }

            await redisClient.del(`product:${id}`);
            await redisClient.srem('products', id);

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Products API error:', error);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
};
