const Redis = require('ioredis');
const { requireAuth, validateOrder } = require('./utils/auth');

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
        // GET - List all orders (requires auth)
        if (req.method === 'GET') {
            if (!requireAuth(req, res)) return;
            
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
            let orderIds;
            try {
                orderIds = await redisClient.smembers('orders');
            } catch (error) {
                console.error('Error fetching order IDs:', error);
                return res.status(500).json({ error: 'Failed to fetch orders' });
            }
            
            const orders = [];

            for (const orderId of orderIds) {
                try {
                    const orderData = await redisClient.get(`order:${orderId}`);
                    if (orderData) {
                        orders.push(JSON.parse(orderData));
                    }
                } catch (error) {
                    console.error(`Error fetching order ${orderId}:`, error);
                    // Continue with other orders
                }
            }

            // Sort by newest first
            orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            return res.status(200).json(orders);
        }

        // POST - Create new order (public, but validate product exists)
        if (req.method === 'POST') {
            const redisClient = getRedis();
            
            // Validate and sanitize input
            const validation = validateOrder(req.body);
            if (!validation.valid) {
                return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
            }

            // Verify product exists
            const productData = await redisClient.get(`product:${validation.sanitized.productId}`);
            if (!productData) {
                return res.status(404).json({ error: 'Product not found' });
            }

            const newOrder = {
                id: generateId(),
                ...validation.sanitized,
                status: 'pending',
                createdAt: new Date().toISOString()
            };

            // Save order to Redis
            await redisClient.set(`order:${newOrder.id}`, JSON.stringify(newOrder));
            await redisClient.sadd('orders', newOrder.id);

            return res.status(201).json(newOrder);
        }

        // PUT - Update order (mark as completed) (requires auth)
        if (req.method === 'PUT') {
            if (!requireAuth(req, res)) return;
            
            const redisClient = getRedis();
            
            const { id, status } = req.body;
            if (!id) {
                return res.status(400).json({ error: 'Order ID is required' });
            }

            const orderData = await redisClient.get(`order:${id}`);
            if (!orderData) {
                return res.status(404).json({ error: 'Order not found' });
            }

            // Validate status
            const validStatuses = ['pending', 'completed', 'cancelled'];
            const newStatus = status || JSON.parse(orderData).status;
            if (!validStatuses.includes(newStatus)) {
                return res.status(400).json({ error: 'Invalid status', validStatuses });
            }

            const order = JSON.parse(orderData);
            const updatedOrder = {
                ...order,
                status: newStatus,
                updatedAt: new Date().toISOString()
            };

            await redisClient.set(`order:${id}`, JSON.stringify(updatedOrder));
            return res.status(200).json(updatedOrder);
        }

        // DELETE - Delete order (requires auth)
        if (req.method === 'DELETE') {
            if (!requireAuth(req, res)) return;
            
            const redisClient = getRedis();
            
            const { id } = req.query;
            if (!id) {
                return res.status(400).json({ error: 'Order ID is required' });
            }

            const exists = await redisClient.exists(`order:${id}`);
            if (!exists) {
                return res.status(404).json({ error: 'Order not found' });
            }

            await redisClient.del(`order:${id}`);
            await redisClient.srem('orders', id);

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Orders API error:', error);
        
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
