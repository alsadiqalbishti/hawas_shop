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
        // GET - List all orders (requires auth)
        if (req.method === 'GET') {
            if (!requireAuth(req, res)) return;
            
            try {
                const orders = await safeRedisOperation(async (client) => {
                    const orderIds = await client.smembers('orders');
                    const ordersList = [];

                    for (const orderId of orderIds) {
                        try {
                            const orderData = await client.get(`order:${orderId}`);
                            if (orderData) {
                                ordersList.push(JSON.parse(orderData));
                            }
                        } catch (error) {
                            console.error(`Error fetching order ${orderId}:`, error);
                            // Continue with other orders
                        }
                    }

                    // Sort by newest first
                    ordersList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                    return ordersList;
                });
                
                return res.status(200).json(orders);
            } catch (error) {
                console.error('Error fetching orders:', error);
                return res.status(503).json({ 
                    error: 'Service temporarily unavailable',
                    message: error.message
                });
            }
        }

        // POST - Create new order (public, but validate product exists)
        if (req.method === 'POST') {
            // Validate and sanitize input
            const validation = validateOrder(req.body);
            if (!validation.valid) {
                return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
            }

            try {
                const newOrder = await safeRedisOperation(async (client) => {
                    // Verify product exists
                    const productData = await client.get(`product:${validation.sanitized.productId}`);
                    if (!productData) {
                        throw new Error('Product not found');
                    }

                    const order = {
                        id: generateId(),
                        ...validation.sanitized,
                        status: 'pending',
                        createdAt: new Date().toISOString()
                    };

                    // Save order to Redis
                    await client.set(`order:${order.id}`, JSON.stringify(order));
                    await client.sadd('orders', order.id);
                    
                    return order;
                });
                
                return res.status(201).json(newOrder);
            } catch (error) {
                if (error.message === 'Product not found') {
                    return res.status(404).json({ error: 'Product not found' });
                }
                console.error('Error creating order:', error);
                return res.status(503).json({ 
                    error: 'Service temporarily unavailable',
                    message: error.message
                });
            }
        }

        // PUT - Update order (mark as completed) (requires auth)
        if (req.method === 'PUT') {
            if (!requireAuth(req, res)) return;
            
            const { id, status } = req.body;
            if (!id) {
                return res.status(400).json({ error: 'Order ID is required' });
            }

            try {
                const updatedOrder = await safeRedisOperation(async (client) => {
                    const orderData = await client.get(`order:${id}`);
                    if (!orderData) {
                        throw new Error('Order not found');
                    }

                    const order = JSON.parse(orderData);
                    
                    // Validate status
                    const validStatuses = ['pending', 'completed', 'cancelled'];
                    const newStatus = status || order.status;
                    if (!validStatuses.includes(newStatus)) {
                        throw new Error(`Invalid status. Valid statuses: ${validStatuses.join(', ')}`);
                    }

                    const updated = {
                        ...order,
                        status: newStatus,
                        updatedAt: new Date().toISOString()
                    };

                    await client.set(`order:${id}`, JSON.stringify(updated));
                    return updated;
                });
                
                return res.status(200).json(updatedOrder);
            } catch (error) {
                if (error.message === 'Order not found') {
                    return res.status(404).json({ error: 'Order not found' });
                }
                if (error.message.includes('Invalid status')) {
                    return res.status(400).json({ error: error.message });
                }
                console.error('Error updating order:', error);
                return res.status(503).json({ 
                    error: 'Service temporarily unavailable',
                    message: error.message
                });
            }
        }

        // DELETE - Delete order (requires auth)
        if (req.method === 'DELETE') {
            if (!requireAuth(req, res)) return;
            
            const { id } = req.query;
            if (!id) {
                return res.status(400).json({ error: 'Order ID is required' });
            }

            try {
                await safeRedisOperation(async (client) => {
                    const exists = await client.exists(`order:${id}`);
                    if (!exists) {
                        throw new Error('Order not found');
                    }

                    await client.del(`order:${id}`);
                    await client.srem('orders', id);
                });
                
                return res.status(200).json({ success: true });
            } catch (error) {
                if (error.message === 'Order not found') {
                    return res.status(404).json({ error: 'Order not found' });
                }
                console.error('Error deleting order:', error);
                return res.status(503).json({ 
                    error: 'Service temporarily unavailable',
                    message: error.message
                });
            }
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Orders API error:', error);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
};
