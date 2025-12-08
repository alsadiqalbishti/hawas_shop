const Redis = require('ioredis');
const { requireAuth, validateProduct } = require('./utils/auth');

// Initialize Redis connection
let redis;
function getRedis() {
    if (!redis) {
        // Vercel auto-generates STORAGE_REDIS_URL when you connect Redis
        const redisUrl = process.env.STORAGE_REDIS_URL || process.env.REDIS_URL;
        if (!redisUrl) {
            throw new Error('Redis URL not configured');
        }
        redis = new Redis(redisUrl, {
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableOfflineQueue: false
        });
        
        redis.on('error', (err) => {
            console.error('Redis connection error:', err);
        });
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

    try {
        // GET - List all products or get single product (public, no auth required)
        if (req.method === 'GET') {
            let redisClient;
            try {
                redisClient = getRedis();
            } catch (redisError) {
                console.error('Redis connection failed:', redisError);
                return res.status(503).json({ 
                    error: 'Service temporarily unavailable',
                    message: 'Database connection failed'
                });
            }
            
            const { id } = req.query;

            if (id) {
                const productData = await redisClient.get(`product:${id}`);
                if (!productData) {
                    return res.status(404).json({ error: 'Product not found' });
                }
                return res.status(200).json(JSON.parse(productData));
            }

            // Get all product IDs
            let productIds;
            try {
                productIds = await redisClient.smembers('products');
            } catch (error) {
                console.error('Error fetching product IDs:', error);
                return res.status(500).json({ error: 'Failed to fetch products' });
            }
            
            const products = [];

            for (const productId of productIds) {
                try {
                    const productData = await redisClient.get(`product:${productId}`);
                    if (productData) {
                        products.push(JSON.parse(productData));
                    }
                } catch (error) {
                    console.error(`Error fetching product ${productId}:`, error);
                    // Continue with other products
                }
            }

            return res.status(200).json(products);
        }

        // POST - Create new product (requires auth)
        if (req.method === 'POST') {
            if (!requireAuth(req, res)) return;
            
            const redisClient = getRedis();
            
            // Validate and sanitize input
            const validation = validateProduct(req.body);
            if (!validation.valid) {
                return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
            }

            const newProduct = {
                id: generateId(),
                ...validation.sanitized,
                createdAt: new Date().toISOString()
            };

            // Save product to Redis
            await redisClient.set(`product:${newProduct.id}`, JSON.stringify(newProduct));
            await redisClient.sadd('products', newProduct.id);

            return res.status(201).json(newProduct);
        }

        // PUT - Update product (requires auth)
        if (req.method === 'PUT') {
            if (!requireAuth(req, res)) return;
            
            const redisClient = getRedis();
            
            const { id } = req.body;
            if (!id) {
                return res.status(400).json({ error: 'Product ID is required' });
            }

            const productData = await redisClient.get(`product:${id}`);
            if (!productData) {
                return res.status(404).json({ error: 'Product not found' });
            }

            const product = JSON.parse(productData);
            
            // Merge existing product with new data for validation
            const mergedData = {
                name: req.body.name !== undefined ? req.body.name : product.name,
                price: req.body.price !== undefined ? req.body.price : product.price,
                discountPrice: req.body.discountPrice !== undefined ? req.body.discountPrice : product.discountPrice,
                description: req.body.description !== undefined ? req.body.description : product.description,
                mediaUrl: req.body.mediaUrl !== undefined ? req.body.mediaUrl : product.mediaUrl,
                mediaUrls: req.body.mediaUrls !== undefined ? req.body.mediaUrls : product.mediaUrls,
                mediaType: req.body.mediaType !== undefined ? req.body.mediaType : product.mediaType
            };
            
            // Validate and sanitize
            const validation = validateProduct(mergedData);
            if (!validation.valid) {
                return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
            }

            const updatedProduct = {
                ...product,
                ...validation.sanitized,
                updatedAt: new Date().toISOString()
            };

            await redisClient.set(`product:${id}`, JSON.stringify(updatedProduct));
            return res.status(200).json(updatedProduct);
        }

        // DELETE - Delete product (requires auth)
        if (req.method === 'DELETE') {
            if (!requireAuth(req, res)) return;
            
            const redisClient = getRedis();
            
            const { id } = req.query;
            if (!id) {
                return res.status(400).json({ error: 'Product ID is required' });
            }

            const exists = await redisClient.exists(`product:${id}`);
            if (!exists) {
                return res.status(404).json({ error: 'Product not found' });
            }

            // Check if product has orders (referential integrity)
            const orderIds = await redisClient.smembers('orders');
            for (const orderId of orderIds) {
                const orderData = await redisClient.get(`order:${orderId}`);
                if (orderData) {
                    const order = JSON.parse(orderData);
                    if (order.productId === id) {
                        return res.status(400).json({ 
                            error: 'Cannot delete product with existing orders',
                            message: 'Please delete or complete all orders for this product first'
                        });
                    }
                }
            }

            await redisClient.del(`product:${id}`);
            await redisClient.srem('products', id);

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Products API error:', error);
        
        // Handle Redis connection errors gracefully
        if (error.message && error.message.includes('Redis')) {
            return res.status(503).json({ 
                error: 'Service temporarily unavailable', 
                message: 'Database connection failed. Please try again later.' 
            });
        }
        
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
};
