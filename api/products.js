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
            enableOfflineQueue: false,
            connectTimeout: 10000,
            lazyConnect: false
        });
        
        redis.on('error', (err) => {
            console.error('Redis connection error:', err);
            // Reset redis on error so it can reconnect
            redis = null;
        });
        
        redis.on('connect', () => {
            console.log('Redis connected successfully');
        });
    }
    return redis;
}

// Helper to safely execute Redis operations
async function safeRedisOperation(operation, errorMessage = 'Redis operation failed') {
    try {
        const client = getRedis();
        return await operation(client);
    } catch (error) {
        console.error('Redis operation error:', error);
        throw new Error(`${errorMessage}: ${error.message}`);
    }
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
            const { id } = req.query;

            if (id) {
                try {
                    const productData = await safeRedisOperation(async (client) => {
                        return await client.get(`product:${id}`);
                    });
                    
                    if (!productData) {
                        return res.status(404).json({ error: 'Product not found' });
                    }
                    return res.status(200).json(JSON.parse(productData));
                } catch (error) {
                    console.error('Error fetching product:', error);
                    return res.status(503).json({ 
                        error: 'Service temporarily unavailable',
                        message: error.message
                    });
                }
            }

            // Get all products
            try {
                const products = await safeRedisOperation(async (client) => {
                    const productIds = await client.smembers('products');
                    const productsList = [];

                    for (const productId of productIds) {
                        try {
                            const productData = await client.get(`product:${productId}`);
                            if (productData) {
                                productsList.push(JSON.parse(productData));
                            }
                        } catch (error) {
                            console.error(`Error fetching product ${productId}:`, error);
                            // Continue with other products
                        }
                    }
                    return productsList;
                });
                
                return res.status(200).json(products);
            } catch (error) {
                console.error('Error fetching products:', error);
                return res.status(503).json({ 
                    error: 'Service temporarily unavailable',
                    message: error.message
                });
            }
        }

        // POST - Create new product (requires auth)
        if (req.method === 'POST') {
            if (!requireAuth(req, res)) return;
            
            // Validate and sanitize input
            const validation = validateProduct(req.body);
            if (!validation.valid) {
                return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
            }

            try {
                const newProduct = await safeRedisOperation(async (client) => {
                    const product = {
                        id: generateId(),
                        ...validation.sanitized,
                        createdAt: new Date().toISOString()
                    };

                    // Save product to Redis
                    await client.set(`product:${product.id}`, JSON.stringify(product));
                    await client.sadd('products', product.id);
                    
                    return product;
                });
                
                return res.status(201).json(newProduct);
            } catch (error) {
                console.error('Error creating product:', error);
                return res.status(503).json({ 
                    error: 'Service temporarily unavailable',
                    message: error.message
                });
            }
        }

        // PUT - Update product (requires auth)
        if (req.method === 'PUT') {
            if (!requireAuth(req, res)) return;
            
            const { id } = req.body;
            if (!id) {
                return res.status(400).json({ error: 'Product ID is required' });
            }

            try {
                const updatedProduct = await safeRedisOperation(async (client) => {
                    const productData = await client.get(`product:${id}`);
                    if (!productData) {
                        throw new Error('Product not found');
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
                        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
                    }

                    const updated = {
                        ...product,
                        ...validation.sanitized,
                        updatedAt: new Date().toISOString()
                    };

                    await client.set(`product:${id}`, JSON.stringify(updated));
                    return updated;
                });
                
                return res.status(200).json(updatedProduct);
            } catch (error) {
                if (error.message === 'Product not found') {
                    return res.status(404).json({ error: 'Product not found' });
                }
                if (error.message.includes('Validation failed')) {
                    return res.status(400).json({ error: error.message });
                }
                console.error('Error updating product:', error);
                return res.status(503).json({ 
                    error: 'Service temporarily unavailable',
                    message: error.message
                });
            }
        }

        // DELETE - Delete product (requires auth)
        if (req.method === 'DELETE') {
            if (!requireAuth(req, res)) return;
            
            const { id } = req.query;
            if (!id) {
                return res.status(400).json({ error: 'Product ID is required' });
            }

            try {
                await safeRedisOperation(async (client) => {
                    const exists = await client.exists(`product:${id}`);
                    if (!exists) {
                        throw new Error('Product not found');
                    }

                    // Check if product has orders (referential integrity)
                    const orderIds = await client.smembers('orders');
                    for (const orderId of orderIds) {
                        const orderData = await client.get(`order:${orderId}`);
                        if (orderData) {
                            const order = JSON.parse(orderData);
                            if (order.productId === id) {
                                throw new Error('Cannot delete product with existing orders');
                            }
                        }
                    }

                    await client.del(`product:${id}`);
                    await client.srem('products', id);
                });
                
                return res.status(200).json({ success: true });
            } catch (error) {
                if (error.message === 'Product not found') {
                    return res.status(404).json({ error: 'Product not found' });
                }
                if (error.message.includes('existing orders')) {
                    return res.status(400).json({ 
                        error: 'Cannot delete product with existing orders',
                        message: 'Please delete or complete all orders for this product first'
                    });
                }
                console.error('Error deleting product:', error);
                return res.status(503).json({ 
                    error: 'Service temporarily unavailable',
                    message: error.message
                });
            }
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Products API error:', error);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
};
