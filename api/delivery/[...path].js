// Delivery API Router - Handles all /api/delivery/* endpoints
// This is a separate function to ensure proper routing for multi-segment paths

const Redis = require('ioredis');
const { requireAuth, requireDeliveryAuth } = require('../utils/auth');
const { 
    canTransitionStatus, 
    addStatusHistory,
    getStatusLabel
} = require('../utils/orders');
const { getDeliveryManById, generateId: generateDeliveryId } = require('../utils/delivery');

// Shared Redis connection
let redis;
let redisReady = false;

function getRedis() {
    if (!redis) {
        const redisUrl = process.env.STORAGE_REDIS_URL || process.env.REDIS_URL;
        if (!redisUrl) {
            throw new Error('Redis URL not configured');
        }
        
        redis = new Redis(redisUrl, {
            retryStrategy: (times) => Math.min(times * 50, 2000),
            maxRetriesPerRequest: 3,
            enableOfflineQueue: true,
            connectTimeout: 15000,
            lazyConnect: false
        });
        
        redis.on('error', (err) => {
            console.error('Redis connection error:', err.message);
            redisReady = false;
        });
        
        redis.on('ready', () => {
            redisReady = true;
        });
        
        redis.on('close', () => {
            redisReady = false;
        });
    }
    return redis;
}

async function waitForRedis(maxWait = 5000) {
    const startTime = Date.now();
    while (!redisReady && (Date.now() - startTime) < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return redisReady;
}

async function safeRedisOperation(operation, errorMessage = 'Redis operation failed', allowEmpty = false) {
    try {
        const client = getRedis();
        await waitForRedis(3000);
        return await operation(client);
    } catch (error) {
        console.error('Redis operation error:', error.message);
        if (allowEmpty) return [];
        throw new Error(`${errorMessage}: ${error.message}`);
    }
}

// CORS headers
function setCORS(res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
}

module.exports = async (req, res) => {
    setCORS(res);
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Parse the sub-endpoint from the path
    // For /api/delivery/list, req.query["...path"] will be ["list"]
    // For /api/delivery/auth, req.query["...path"] will be ["auth"]
    const pathArray = req.query?.['...path'] || req.query?.path;
    let subEndpoint = '';
    
    if (Array.isArray(pathArray) && pathArray.length > 0) {
        subEndpoint = String(pathArray[0] || '').toLowerCase().trim();
    } else if (typeof pathArray === 'string') {
        subEndpoint = pathArray.split('/')[0].toLowerCase().trim();
    }
    
    console.log('🚚 DELIVERY ROUTER - subEndpoint:', subEndpoint, 'method:', req.method);

    // Delivery list
    if (subEndpoint === 'list' && req.method === 'GET') {
        if (!requireAuth(req, res)) return;

        try {
            const deliveryMen = await safeRedisOperation(async (client) => {
                const deliveryManIds = await client.smembers('delivery-men') || [];
                const deliveryMenList = [];

                // Get delivery men by ID
                for (const id of deliveryManIds) {
                    try {
                        if (!id) continue;
                        const keys = await client.keys('delivery:*');
                        for (const key of keys) {
                            try {
                                const data = await client.get(key);
                                if (data) {
                                    const deliveryMan = JSON.parse(data);
                                    if (deliveryMan.id === id) {
                                        const { password, ...safeInfo } = deliveryMan;
                                        deliveryMenList.push(safeInfo);
                                        break;
                                    }
                                }
                            } catch (error) {
                                console.error(`Error parsing delivery man from key ${key}:`, error);
                            }
                        }
                    } catch (error) {
                        console.error(`Error processing delivery man ID ${id}:`, error);
                    }
                }

                // Also get delivery men by phone keys
                try {
                    const phoneKeys = await client.keys('delivery:*');
                    for (const key of phoneKeys) {
                        try {
                            if (key.startsWith('delivery:') && key.split(':').length === 2) {
                                const data = await client.get(key);
                                if (data) {
                                    const deliveryMan = JSON.parse(data);
                                    if (!deliveryMenList.find(dm => dm.id === deliveryMan.id)) {
                                        const { password, ...safeInfo } = deliveryMan;
                                        deliveryMenList.push(safeInfo);
                                    }
                                }
                            }
                        } catch (error) {
                            console.error(`Error processing delivery key ${key}:`, error);
                        }
                    }
                } catch (error) {
                    console.error('Error getting delivery phone keys:', error);
                }

                // Remove duplicates
                return deliveryMenList.filter((dm, index, self) =>
                    index === self.findIndex(d => d.id === dm.id)
                );
            }, 'Failed to fetch delivery men', true);

            return res.status(200).json(deliveryMen || []);
        } catch (error) {
            console.error('Error in GET /api/delivery/list:', error);
            return res.status(200).json([]);
        }
    }

    // Delivery auth
    if (subEndpoint === 'auth' && req.method === 'POST') {
        const { name, phone, password, action } = req.body;
        if (!phone || !password) {
            return res.status(400).json({ error: 'رقم الهاتف وكلمة المرور مطلوبة' });
        }
        if (action === 'signup' && !name) {
            return res.status(400).json({ error: 'الاسم مطلوب للتسجيل' });
        }

        try {
            const redisClient = getRedis();
            const deliveryManKey = `delivery:${phone}`;

            if (action === 'signup') {
                if (await redisClient.exists(deliveryManKey)) {
                    return res.status(400).json({ error: 'رقم الهاتف مسجل بالفعل' });
                }

                const deliveryMan = {
                    id: generateDeliveryId(),
                    name: name.trim(),
                    phone: phone.trim(),
                    password: password,
                    createdAt: new Date().toISOString()
                };

                await redisClient.set(deliveryManKey, JSON.stringify(deliveryMan));
                await redisClient.sadd('delivery-men', deliveryMan.id);

                const token = Buffer.from(`${deliveryMan.id}:${Date.now()}`).toString('base64');
                return res.status(201).json({
                    success: true,
                    token: token,
                    deliveryMan: { id: deliveryMan.id, name: deliveryMan.name, phone: deliveryMan.phone }
                });
            } else {
                const deliveryManData = await redisClient.get(deliveryManKey);
                if (!deliveryManData) {
                    return res.status(401).json({ error: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
                }

                const deliveryMan = JSON.parse(deliveryManData);
                if (deliveryMan.password !== password) {
                    return res.status(401).json({ error: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
                }

                const token = Buffer.from(`${deliveryMan.id}:${Date.now()}`).toString('base64');
                return res.status(200).json({
                    success: true,
                    token: token,
                    deliveryMan: { id: deliveryMan.id, name: deliveryMan.name, phone: deliveryMan.phone }
                });
            }
        } catch (error) {
            return res.status(500).json({ error: 'حدث خطأ في الخادم' });
        }
    }

    // Delivery orders
    if (subEndpoint === 'orders') {
        // GET - Get orders assigned to delivery man
        if (req.method === 'GET') {
            const deliveryManId = requireDeliveryAuth(req, res);
            if (!deliveryManId) return;

            try {
                const redisClient = getRedis();
                const orderIds = await redisClient.smembers('orders');
                const orders = [];

                for (const orderId of orderIds) {
                    const orderData = await redisClient.get(`order:${orderId}`);
                    if (orderData) {
                        const order = JSON.parse(orderData);
                        if (order.deliveryManId === deliveryManId) {
                            const productData = await redisClient.get(`product:${order.productId}`);
                            if (productData) {
                                order.product = JSON.parse(productData);
                            }
                            orders.push(order);
                        }
                    }
                }

                orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                return res.status(200).json(orders);
            } catch (error) {
                console.error('Error in delivery orders GET:', error);
                return res.status(200).json([]);
            }
        }

        // PUT - Update order
        if (req.method === 'PUT') {
            const deliveryManId = requireDeliveryAuth(req, res);
            if (!deliveryManId) return;

            const { id, status, shippingPrice, paymentReceived } = req.body;
            if (!id) {
                return res.status(400).json({ error: 'Order ID is required' });
            }

            try {
                const redisClient = getRedis();
                const orderData = await redisClient.get(`order:${id}`);
                if (!orderData) {
                    return res.status(404).json({ error: 'Order not found' });
                }

                const order = JSON.parse(orderData);
                const currentStatus = order.status;
                const newStatus = status || currentStatus;
                
                if (newStatus !== currentStatus && !canTransitionStatus(currentStatus, newStatus, 'delivery')) {
                    return res.status(400).json({ 
                        error: `Invalid status transition from ${getStatusLabel(currentStatus)} to ${getStatusLabel(newStatus)}`
                    });
                }

                const validStatuses = ['assigned', 'preparing', 'in_transit', 'delivered'];
                if (newStatus && !validStatuses.includes(newStatus)) {
                    return res.status(400).json({ error: 'Invalid status for delivery man' });
                }

                const updatedOrder = {
                    ...order,
                    status: newStatus,
                    deliveryManId: deliveryManId,
                    shippingPrice: shippingPrice !== undefined ? (shippingPrice ? parseFloat(shippingPrice) : null) : order.shippingPrice,
                    paymentReceived: paymentReceived !== undefined ? (paymentReceived ? parseFloat(paymentReceived) : null) : order.paymentReceived,
                    updatedAt: new Date().toISOString(),
                    updatedBy: deliveryManId
                };

                if (newStatus !== currentStatus) {
                    addStatusHistory(updatedOrder, newStatus, deliveryManId, `Status updated by delivery man`);
                }

                await redisClient.set(`order:${id}`, JSON.stringify(updatedOrder));
                return res.status(200).json(updatedOrder);
            } catch (error) {
                console.error('Error in delivery orders PUT:', error);
                return res.status(400).json({ error: 'Failed to update order', message: error.message });
            }
        }
    }

    // Delivery info
    if (subEndpoint === 'info' && req.method === 'GET') {
        if (!requireAuth(req, res)) return;

        const { id } = req.query;
        if (!id) {
            return res.status(400).json({ error: 'Delivery man ID is required' });
        }

        try {
            const deliveryMan = await getDeliveryManById(id);
            if (!deliveryMan) {
                return res.status(404).json({ error: 'Delivery man not found' });
            }

            const { password, ...safeInfo } = deliveryMan;
            return res.status(200).json(safeInfo);
        } catch (error) {
            console.error('Error in GET /api/delivery/info:', error);
            return res.status(500).json({ error: 'Failed to fetch delivery man info' });
        }
    }

    // 404 - Endpoint not found
    return res.status(404).json({ 
        error: 'Delivery endpoint not found', 
        subEndpoint: subEndpoint,
        method: req.method
    });
};

