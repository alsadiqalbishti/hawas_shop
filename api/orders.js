const Redis = require('ioredis');
const { requireAuth, validateOrder } = require('./utils/auth');
const { 
    generateOrderNumber, 
    canTransitionStatus, 
    addStatusHistory,
    getStatusLabel,
    getStatusColor
} = require('./utils/orders');

// Initialize Redis connection
let redis;
let redisReady = false;

function getRedis() {
    if (!redis) {
        // Vercel auto-generates STORAGE_REDIS_URL when you connect Redis
        const redisUrl = process.env.STORAGE_REDIS_URL || process.env.REDIS_URL;
        if (!redisUrl) {
            console.error('Redis URL not configured');
            throw new Error('Redis URL not configured');
        }
        
        console.log('Initializing Redis connection...');
        redis = new Redis(redisUrl, {
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                console.log(`Redis retry attempt ${times}, delay: ${delay}ms`);
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableOfflineQueue: true, // Changed to true to queue commands
            connectTimeout: 15000,
            lazyConnect: false,
            showFriendlyErrorStack: true
        });
        
        redis.on('error', (err) => {
            console.error('Redis connection error:', err.message);
            redisReady = false;
            // Don't reset redis on error - let it try to reconnect
        });
        
        redis.on('connect', () => {
            console.log('Redis connecting...');
            redisReady = false;
        });
        
        redis.on('ready', () => {
            console.log('Redis connected and ready');
            redisReady = true;
        });
        
        redis.on('close', () => {
            console.log('Redis connection closed');
            redisReady = false;
        });
        
        redis.on('reconnecting', () => {
            console.log('Redis reconnecting...');
            redisReady = false;
        });
    }
    return redis;
}

// Helper to wait for Redis to be ready
async function waitForRedis(maxWait = 5000) {
    const startTime = Date.now();
    while (!redisReady && (Date.now() - startTime) < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return redisReady;
}

// Helper to safely execute Redis operations
async function safeRedisOperation(operation, errorMessage = 'Redis operation failed', allowEmpty = false) {
    try {
        const client = getRedis();
        
        // Wait for connection to be ready (with timeout)
        const isReady = await waitForRedis(3000);
        if (!isReady && !allowEmpty) {
            console.warn('Redis not ready, but proceeding with operation');
        }
        
        return await operation(client);
    } catch (error) {
        console.error('Redis operation error:', error.message);
        
        // For GET operations, return empty array instead of throwing
        if (allowEmpty) {
            console.log('Returning empty result due to Redis error');
            return [];
        }
        
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

    // Order number generation is now handled by generateOrderNumber() from utils/orders.js

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
                }, 'Failed to fetch orders', true); // allowEmpty = true for GET
                
                return res.status(200).json(orders || []);
            } catch (error) {
                console.error('Error fetching orders:', error);
                // Return empty array instead of error for GET requests
                return res.status(200).json([]);
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

                    // Generate professional order number
                    const orderNumber = await generateOrderNumber();

                    const order = {
                        id: orderNumber,
                        orderNumber: orderNumber, // Keep both for compatibility
                        ...validation.sanitized,
                        status: 'pending',
                        deliveryManId: null,
                        shippingPrice: null,
                        paymentReceived: null,
                        updatedBy: null,
                        statusHistory: [],
                        createdAt: new Date().toISOString()
                    };

                    // Add initial status history entry
                    addStatusHistory(order, 'pending', 'system', 'Order created');

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

        // PUT - Update order (requires auth)
        if (req.method === 'PUT') {
            if (!requireAuth(req, res)) return;
            
            const { id, status, deliveryManId, shippingPrice, paymentReceived, notes } = req.body;
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
                    const currentStatus = order.status;
                    const newStatus = status || currentStatus;
                    
                    // Determine final status (may be changed by delivery man assignment)
                    let finalStatusForValidation = newStatus;
                    if (deliveryManId !== undefined && deliveryManId && order.status === 'pending' && !status) {
                        finalStatusForValidation = 'assigned';
                    }
                    
                    // Validate status transition (admin role for now)
                    if (finalStatusForValidation !== currentStatus && !canTransitionStatus(currentStatus, finalStatusForValidation, 'admin')) {
                        throw new Error(`Invalid status transition from ${currentStatus} to ${finalStatusForValidation}`);
                    }

                    // Validate status value
                    const validStatuses = ['pending', 'assigned', 'preparing', 'in_transit', 'delivered', 'completed', 'cancelled', 'on_hold', 'returned', 'refunded'];
                    if (!validStatuses.includes(newStatus)) {
                        throw new Error(`Invalid status. Valid statuses: ${validStatuses.join(', ')}`);
                    }

                    // Build update object
                    let finalStatus = newStatus;
                    
                    // If assigning a delivery man to a pending order, automatically set status to "assigned"
                    if (deliveryManId !== undefined && deliveryManId && order.status === 'pending' && !status) {
                        finalStatus = 'assigned';
                    }
                    
                    const updated = {
                        ...order,
                        status: finalStatus,
                        updatedAt: new Date().toISOString()
                    };

                    // Update delivery man if provided
                    if (deliveryManId !== undefined) {
                        updated.deliveryManId = deliveryManId || null;
                    }

                    // Update shipping price if provided
                    if (shippingPrice !== undefined) {
                        updated.shippingPrice = shippingPrice ? parseFloat(shippingPrice) : null;
                    }

                    // Update payment received if provided
                    if (paymentReceived !== undefined) {
                        updated.paymentReceived = paymentReceived ? parseFloat(paymentReceived) : null;
                    }

                    // Add status history entry if status changed
                    if (finalStatus !== currentStatus) {
                        const changedBy = req.headers['x-user-id'] || 'admin'; // Could be extracted from JWT
                        const historyNote = notes || (deliveryManId && currentStatus === 'pending' && finalStatus === 'assigned' 
                            ? 'تم إسناد الطلب إلى مندوب التوصيل' 
                            : `Status changed to ${getStatusLabel(finalStatus)}`);
                        addStatusHistory(updated, finalStatus, changedBy, historyNote);
                    }

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
