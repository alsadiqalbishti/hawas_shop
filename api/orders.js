const Redis = require('ioredis');

// Initialize Redis connection
let redis;
function getRedis() {
    if (!redis) {
        redis = new Redis(process.env.REDIS_URL);
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
        // GET - List all orders
        if (req.method === 'GET') {
            const orderIds = await redisClient.smembers('orders');
            const orders = [];

            for (const orderId of orderIds) {
                const orderData = await redisClient.get(`order:${orderId}`);
                if (orderData) {
                    orders.push(JSON.parse(orderData));
                }
            }

            // Sort by newest first
            orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            return res.status(200).json(orders);
        }

        // POST - Create new order
        if (req.method === 'POST') {
            const { productId, customerName, customerPhone, customerAddress, quantity } = req.body;

            // Validation
            if (!productId || !customerName || !customerPhone || !customerAddress || !quantity) {
                return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
            }

            const newOrder = {
                id: generateId(),
                productId,
                customerName,
                customerPhone,
                customerAddress,
                quantity: parseInt(quantity),
                status: 'pending',
                createdAt: new Date().toISOString()
            };

            // Save order to Redis
            await redisClient.set(`order:${newOrder.id}`, JSON.stringify(newOrder));
            await redisClient.sadd('orders', newOrder.id);

            return res.status(201).json(newOrder);
        }

        // PUT - Update order (mark as completed)
        if (req.method === 'PUT') {
            const { id, status } = req.body;

            const orderData = await redisClient.get(`order:${id}`);
            if (!orderData) {
                return res.status(404).json({ error: 'Order not found' });
            }

            const order = JSON.parse(orderData);
            const updatedOrder = {
                ...order,
                status: status || order.status,
                updatedAt: new Date().toISOString()
            };

            await redisClient.set(`order:${id}`, JSON.stringify(updatedOrder));
            return res.status(200).json(updatedOrder);
        }

        // DELETE - Delete order
        if (req.method === 'DELETE') {
            const { id } = req.query;

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
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
};
