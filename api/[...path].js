// Single API Router - Consolidates all endpoints into one serverless function
// This reduces the function count from 10+ to just 1

const Redis = require('ioredis');
const { requireAuth, requireDeliveryAuth, validateProduct, validateOrder, sanitizeString } = require('./utils/auth');
const { 
    generateOrderNumber, 
    canTransitionStatus, 
    addStatusHistory,
    getStatusLabel,
    getStatusColor
} = require('./utils/orders');
const { getDeliveryManById, generateId: generateDeliveryId } = require('./utils/delivery');

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

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
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

    // Parse the path from the catch-all route
    // In Vercel, api/[...path].js receives paths like:
    // - req.query.path as array: ['delivery', 'list'] for /api/delivery/list
    // - req.url might be '/api/delivery/list' or '/delivery/list'
    let pathParts = [];
    
    // Method 1: Try req.query.path (Vercel's catch-all format)
    if (req.query && req.query.path !== undefined && req.query.path !== null) {
        const pathArray = req.query.path;
        if (Array.isArray(pathArray)) {
            pathParts = pathArray.filter(p => p && String(p).trim().length > 0).map(p => String(p).trim());
        } else if (typeof pathArray === 'string' && pathArray.trim().length > 0) {
            pathParts = pathArray.split('/').filter(p => p && p.trim().length > 0).map(p => p.trim());
        }
    }
    
    // Method 2: Parse from req.url if pathParts is still empty
    if (pathParts.length === 0 && req.url) {
        let urlPath = req.url.split('?')[0]; // Remove query string
        urlPath = urlPath.replace(/^\/+/, '').replace(/\/+$/, ''); // Remove leading/trailing slashes
        
        // Remove 'api' prefix if present (case insensitive)
        if (urlPath.toLowerCase().startsWith('api/')) {
            urlPath = urlPath.substring(4);
        } else if (urlPath.toLowerCase() === 'api') {
            urlPath = '';
        }
        
        // Split into parts
        if (urlPath && urlPath.trim().length > 0) {
            pathParts = urlPath.split('/').filter(p => p && p.trim().length > 0).map(p => p.trim());
        }
    }
    
    // Method 3: Try parsing from the full URL pathname (fallback)
    if (pathParts.length === 0 && req.url) {
        try {
            // Try to extract path from full URL
            const urlObj = new URL(req.url, 'http://localhost');
            let pathname = urlObj.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
            if (pathname.toLowerCase().startsWith('api/')) {
                pathname = pathname.substring(4);
            }
            if (pathname && pathname.trim().length > 0) {
                pathParts = pathname.split('/').filter(p => p && p.trim().length > 0).map(p => p.trim());
            }
        } catch (e) {
            // URL parsing failed, ignore
        }
    }
    
    // DIRECT URL MATCHING FIRST (before pathParts parsing)
    // Vercel's path parsing can be inconsistent, so we check the URL directly first
    const rawUrl = (req.url || '').toLowerCase();
    const urlLower = rawUrl;
    let urlPath = urlLower.split('?')[0]; // Remove query string
    
    // Normalize URL path - remove /api prefix if present
    if (urlPath.startsWith('/api/')) {
        urlPath = urlPath.substring(5);
    } else if (urlPath.startsWith('api/')) {
        urlPath = urlPath.substring(4);
    } else if (urlPath.startsWith('/')) {
        urlPath = urlPath.substring(1);
    }
    
    // Extract endpoint and subEndpoint from pathParts (fallback)
    let endpoint = (pathParts[0] || '').toLowerCase().trim();
    let subEndpoint = (pathParts[1] || '').toLowerCase().trim();
    
    // Explicit checks for delivery endpoints (check these FIRST - highest priority)
    // Check raw URL, normalized path, and pathParts - whichever matches first
    const allUrlChecks = (rawUrl + ' ' + urlPath + ' ' + urlLower).toLowerCase();
    
    if (allUrlChecks.includes('delivery/list') && req.method === 'GET') {
        endpoint = 'delivery';
        subEndpoint = 'list';
    } else if (allUrlChecks.includes('delivery/auth') && req.method === 'POST') {
        endpoint = 'delivery';
        subEndpoint = 'auth';
    } else if (allUrlChecks.includes('delivery/orders')) {
        endpoint = 'delivery';
        subEndpoint = 'orders';
    } else if (allUrlChecks.includes('delivery/info') && req.method === 'GET') {
        endpoint = 'delivery';
        subEndpoint = 'info';
    } else if (allUrlChecks.includes('delivery/')) {
        // Generic delivery endpoint extraction - try multiple patterns
        let deliveryMatch = allUrlChecks.match(/delivery\/([^\/\?\s]+)/);
        if (!deliveryMatch) {
            deliveryMatch = rawUrl.match(/delivery[\/\-_]([^\/\?\s]+)/i);
        }
        if (deliveryMatch) {
            endpoint = 'delivery';
            subEndpoint = deliveryMatch[1].toLowerCase().trim();
        }
    }
    
    // Debug logging
    console.log('API Request Debug:', {
        method: req.method,
        url: req.url,
        query: req.query,
        queryPath: req.query?.path,
        pathParts: pathParts,
        endpoint: endpoint,
        subEndpoint: subEndpoint,
        urlLower: (req.url || '').toLowerCase()
    });

    try {
        
        // ============================================
        // AUTH ENDPOINTS
        // ============================================
        if (endpoint === 'auth' && req.method === 'POST') {
            const { password } = req.body;
            const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
            
            if (password === adminPassword) {
                const timestamp = Date.now();
                const token = Buffer.from(`${password}:${timestamp}`).toString('base64');
                return res.status(200).json({
                    success: true,
                    token: token,
                    expiresIn: 24 * 60 * 60 * 1000
                });
            } else {
                return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
            }
        }

        // ============================================
        // PRODUCTS ENDPOINTS
        // ============================================
        if (endpoint === 'products') {
            // GET - List all products or get single product
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
                        return res.status(503).json({ error: 'Service temporarily unavailable' });
                    }
                }

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
                            }
                        }
                        return productsList;
                    }, 'Failed to fetch products', true);
                    return res.status(200).json(products || []);
                } catch (error) {
                    return res.status(200).json([]);
                }
            }

            // POST - Create product
            if (req.method === 'POST') {
                if (!requireAuth(req, res)) return;
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
                        await client.set(`product:${product.id}`, JSON.stringify(product));
                        await client.sadd('products', product.id);
                        return product;
                    });
                    return res.status(201).json(newProduct);
                } catch (error) {
                    return res.status(503).json({ error: 'Service temporarily unavailable' });
                }
            }

            // PUT - Update product
            if (req.method === 'PUT') {
                if (!requireAuth(req, res)) return;
                const { id } = req.body;
                if (!id) {
                    return res.status(400).json({ error: 'Product ID is required' });
                }

                try {
                    const updatedProduct = await safeRedisOperation(async (client) => {
                        const productData = await client.get(`product:${id}`);
                        if (!productData) throw new Error('Product not found');
                        
                        const product = JSON.parse(productData);
                        const mergedData = {
                            name: req.body.name !== undefined ? req.body.name : product.name,
                            price: req.body.price !== undefined ? req.body.price : product.price,
                            discountPrice: req.body.discountPrice !== undefined ? req.body.discountPrice : product.discountPrice,
                            stock: req.body.stock !== undefined ? req.body.stock : product.stock,
                            description: req.body.description !== undefined ? req.body.description : product.description,
                            mediaUrl: req.body.mediaUrl !== undefined ? req.body.mediaUrl : product.mediaUrl,
                            mediaUrls: req.body.mediaUrls !== undefined ? req.body.mediaUrls : product.mediaUrls,
                            mediaType: req.body.mediaType !== undefined ? req.body.mediaType : product.mediaType
                        };
                        
                        const validation = validateProduct(mergedData);
                        if (!validation.valid) {
                            throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
                        }

                        const updated = { ...product, ...validation.sanitized, updatedAt: new Date().toISOString() };
                        await client.set(`product:${id}`, JSON.stringify(updated));
                        return updated;
                    });
                    return res.status(200).json(updatedProduct);
                } catch (error) {
                    if (error.message === 'Product not found') {
                        return res.status(404).json({ error: 'Product not found' });
                    }
                    return res.status(400).json({ error: error.message });
                }
            }

            // DELETE - Delete product
            if (req.method === 'DELETE') {
                if (!requireAuth(req, res)) return;
                const { id } = req.query;
                if (!id) {
                    return res.status(400).json({ error: 'Product ID is required' });
                }

                try {
                    await safeRedisOperation(async (client) => {
                        if (!(await client.exists(`product:${id}`))) {
                            throw new Error('Product not found');
                        }
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
                        return res.status(400).json({ error: 'Cannot delete product with existing orders' });
                    }
                    return res.status(503).json({ error: 'Service temporarily unavailable' });
                }
            }
        }

        // ============================================
        // ORDERS ENDPOINTS
        // ============================================
        if (endpoint === 'orders') {
            // GET - List all orders
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
                            }
                        }
                        ordersList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                        return ordersList;
                    }, 'Failed to fetch orders', true);
                    return res.status(200).json(orders || []);
                } catch (error) {
                    return res.status(200).json([]);
                }
            }

            // POST - Create order
            if (req.method === 'POST') {
                const validation = validateOrder(req.body);
                if (!validation.valid) {
                    return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
                }

                try {
                    const newOrder = await safeRedisOperation(async (client) => {
                        const productData = await client.get(`product:${validation.sanitized.productId}`);
                        if (!productData) throw new Error('Product not found');
                        
                        const product = JSON.parse(productData);
                        if (product.stock !== null && product.stock !== undefined) {
                            const requestedQuantity = validation.sanitized.quantity || 1;
                            if (product.stock < requestedQuantity) {
                                throw new Error(`Insufficient stock. Available: ${product.stock}, Requested: ${requestedQuantity}`);
                            }
                        }

                        const orderNumber = await generateOrderNumber();
                        const order = {
                            id: orderNumber,
                            orderNumber: orderNumber,
                            ...validation.sanitized,
                            notes: validation.sanitized.notes || '',
                            status: 'pending',
                            deliveryManId: null,
                            shippingPrice: null,
                            paymentReceived: null,
                            updatedBy: null,
                            statusHistory: [],
                            createdAt: new Date().toISOString()
                        };
                        
                        if (product.stock !== null && product.stock !== undefined) {
                            product.stock -= (validation.sanitized.quantity || 1);
                            await client.set(`product:${product.id}`, JSON.stringify(product));
                        }

                        addStatusHistory(order, 'pending', 'system', 'Order created');
                        await client.set(`order:${order.id}`, JSON.stringify(order));
                        await client.sadd('orders', order.id);
                        return order;
                    });
                    return res.status(201).json(newOrder);
                } catch (error) {
                    if (error.message === 'Product not found') {
                        return res.status(404).json({ error: 'Product not found' });
                    }
                    return res.status(400).json({ error: error.message });
                }
            }

            // PUT - Update order
            if (req.method === 'PUT') {
                if (!requireAuth(req, res)) return;
                const { id, status, deliveryManId, shippingPrice, paymentReceived, notes } = req.body;
                if (!id) {
                    return res.status(400).json({ error: 'Order ID is required' });
                }

                try {
                    const updatedOrder = await safeRedisOperation(async (client) => {
                        const orderData = await client.get(`order:${id}`);
                        if (!orderData) throw new Error('Order not found');
                        
                        const order = JSON.parse(orderData);
                        const currentStatus = order.status;
                        let finalStatus = status || currentStatus;
                        
                        if (deliveryManId !== undefined && deliveryManId && order.status === 'pending' && !status) {
                            finalStatus = 'assigned';
                        }
                        
                        if (finalStatus !== currentStatus && !canTransitionStatus(currentStatus, finalStatus, 'admin')) {
                            throw new Error(`Invalid status transition from ${currentStatus} to ${finalStatus}`);
                        }

                        const validStatuses = ['pending', 'assigned', 'preparing', 'in_transit', 'delivered', 'completed', 'cancelled', 'on_hold', 'returned', 'refunded'];
                        if (!validStatuses.includes(finalStatus)) {
                            throw new Error(`Invalid status. Valid statuses: ${validStatuses.join(', ')}`);
                        }

                        const updated = {
                            ...order,
                            status: finalStatus,
                            updatedAt: new Date().toISOString()
                        };

                        if (deliveryManId !== undefined) updated.deliveryManId = deliveryManId || null;
                        if (shippingPrice !== undefined) updated.shippingPrice = shippingPrice ? parseFloat(shippingPrice) : null;
                        if (paymentReceived !== undefined) updated.paymentReceived = paymentReceived ? parseFloat(paymentReceived) : null;
                        if (notes !== undefined) updated.notes = notes ? notes.trim() : '';

                        if (finalStatus !== currentStatus) {
                            const changedBy = req.headers['x-user-id'] || 'admin';
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
                    return res.status(400).json({ error: error.message });
                }
            }

            // DELETE - Delete order
            if (req.method === 'DELETE') {
                if (!requireAuth(req, res)) return;
                const { id } = req.query;
                if (!id) {
                    return res.status(400).json({ error: 'Order ID is required' });
                }

                try {
                    await safeRedisOperation(async (client) => {
                        if (!(await client.exists(`order:${id}`))) {
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
                    return res.status(503).json({ error: 'Service temporarily unavailable' });
                }
            }
        }

        // ============================================
        // UPLOAD ENDPOINT
        // ============================================
        if (endpoint === 'upload' && req.method === 'POST') {
            if (!requireAuth(req, res)) return;
            
            const { mediaData, mediaType } = req.body;
            if (!mediaData) {
                return res.status(400).json({ error: 'No media data provided' });
            }

            const validTypes = ['image', 'video'];
            const type = mediaType || 'image';
            if (!validTypes.includes(type)) {
                return res.status(400).json({ error: 'Invalid media type' });
            }

            const maxSize = type === 'video' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
            const estimatedBinarySize = (mediaData.length * 3) / 4;
            
            if (estimatedBinarySize > maxSize) {
                const maxSizeMB = maxSize / (1024 * 1024);
                return res.status(400).json({ error: `File too large. Maximum size is ${maxSizeMB}MB for ${type}s` });
            }

            if (!mediaData.startsWith('data:') || !mediaData.includes(';base64,')) {
                return res.status(400).json({ error: 'Invalid base64 data format' });
            }

            return res.status(200).json({
                success: true,
                mediaUrl: mediaData,
                mediaType: type
            });
        }

        // ============================================
        // ANALYTICS ENDPOINT
        // ============================================
        if (endpoint === 'analytics' && req.method === 'GET') {
            if (!requireAuth(req, res)) return;

            try {
                const { period = 'all' } = req.query;
                let dateFrom = null;
                let dateTo = null;
                
                if (period === 'today') {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    dateFrom = today.toISOString();
                    dateTo = new Date().toISOString();
                } else if (period === 'week') {
                    const weekAgo = new Date();
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    weekAgo.setHours(0, 0, 0, 0);
                    dateFrom = weekAgo.toISOString();
                    dateTo = new Date().toISOString();
                } else if (period === 'month') {
                    const monthAgo = new Date();
                    monthAgo.setMonth(monthAgo.getMonth() - 1);
                    monthAgo.setHours(0, 0, 0, 0);
                    dateFrom = monthAgo.toISOString();
                    dateTo = new Date().toISOString();
                }

                const redisClient = getRedis();
                const orderIds = await redisClient.smembers('orders');
                const productIds = await redisClient.smembers('products');
                
                const orders = [];
                const products = [];
                
                for (const orderId of orderIds) {
                    const orderData = await redisClient.get(`order:${orderId}`);
                    if (orderData) {
                        const order = JSON.parse(orderData);
                        const orderDate = new Date(order.createdAt);
                        if (dateFrom && orderDate < new Date(dateFrom)) continue;
                        if (dateTo) {
                            const toDate = new Date(dateTo);
                            toDate.setHours(23, 59, 59, 999);
                            if (orderDate > toDate) continue;
                        }
                        orders.push(order);
                    }
                }
                
                for (const productId of productIds) {
                    const productData = await redisClient.get(`product:${productId}`);
                    if (productData) {
                        products.push(JSON.parse(productData));
                    }
                }
                
                const stats = {
                    orders: {
                        total: orders.length,
                        byStatus: {},
                        today: orders.filter(o => {
                            const today = new Date();
                            return new Date(o.createdAt).toDateString() === today.toDateString();
                        }).length,
                        thisWeek: orders.filter(o => {
                            const weekAgo = new Date();
                            weekAgo.setDate(weekAgo.getDate() - 7);
                            return new Date(o.createdAt) >= weekAgo;
                        }).length,
                        thisMonth: orders.filter(o => {
                            const monthAgo = new Date();
                            monthAgo.setMonth(monthAgo.getMonth() - 1);
                            return new Date(o.createdAt) >= monthAgo;
                        }).length
                    },
                    products: { total: products.length },
                    revenue: { total: 0, byStatus: {}, averageOrderValue: 0 },
                    topProducts: [],
                    deliveryMen: {}
                };
                
                orders.forEach(order => {
                    stats.orders.byStatus[order.status] = (stats.orders.byStatus[order.status] || 0) + 1;
                    const product = products.find(p => p.id === order.productId);
                    if (product) {
                        const price = product.discountPrice || product.price;
                        const orderValue = price * order.quantity;
                        stats.revenue.total += orderValue;
                        stats.revenue.byStatus[order.status] = (stats.revenue.byStatus[order.status] || 0) + orderValue;
                    }
                });
                
                if (orders.length > 0) {
                    stats.revenue.averageOrderValue = stats.revenue.total / orders.length;
                }
                
                const productOrders = {};
                orders.forEach(order => {
                    if (!productOrders[order.productId]) {
                        productOrders[order.productId] = { count: 0, revenue: 0 };
                    }
                    productOrders[order.productId].count += order.quantity;
                    const product = products.find(p => p.id === order.productId);
                    if (product) {
                        const price = product.discountPrice || product.price;
                        productOrders[order.productId].revenue += price * order.quantity;
                    }
                });
                
                stats.topProducts = Object.entries(productOrders)
                    .map(([productId, data]) => {
                        const product = products.find(p => p.id === productId);
                        return {
                            productId,
                            name: product ? product.name : 'غير معروف',
                            orders: data.count,
                            revenue: data.revenue
                        };
                    })
                    .sort((a, b) => b.orders - a.orders)
                    .slice(0, 10);
                
                const deliveryManStats = {};
                orders.forEach(order => {
                    if (order.deliveryManId) {
                        if (!deliveryManStats[order.deliveryManId]) {
                            deliveryManStats[order.deliveryManId] = { totalOrders: 0, delivered: 0, inTransit: 0 };
                        }
                        deliveryManStats[order.deliveryManId].totalOrders++;
                        if (order.status === 'delivered' || order.status === 'completed') {
                            deliveryManStats[order.deliveryManId].delivered++;
                        } else if (order.status === 'in_transit') {
                            deliveryManStats[order.deliveryManId].inTransit++;
                        }
                    }
                });
                stats.deliveryMen = deliveryManStats;
                
                const dailyTrends = {};
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                
                orders.filter(o => new Date(o.createdAt) >= thirtyDaysAgo).forEach(order => {
                    const date = new Date(order.createdAt).toISOString().split('T')[0];
                    if (!dailyTrends[date]) {
                        dailyTrends[date] = { orders: 0, revenue: 0 };
                    }
                    dailyTrends[date].orders++;
                    const product = products.find(p => p.id === order.productId);
                    if (product) {
                        const price = product.discountPrice || product.price;
                        dailyTrends[date].revenue += price * order.quantity;
                    }
                });
                
                stats.dailyTrends = Object.entries(dailyTrends)
                    .map(([date, data]) => ({ date, ...data }))
                    .sort((a, b) => a.date.localeCompare(b.date));
                
                return res.status(200).json(stats);
            } catch (error) {
                return res.status(500).json({ error: 'Server error', message: error.message });
            }
        }

        // ============================================
        // STORAGE ENDPOINT
        // ============================================
        if (endpoint === 'storage' && req.method === 'GET') {
            if (!requireAuth(req, res)) return;

            try {
                const redisClient = getRedis();
                const productIds = await redisClient.smembers('products');
                const orderIds = await redisClient.smembers('orders');
                const deliveryManIds = await redisClient.smembers('delivery-men');
                
                let totalSize = 0;
                let productsSize = 0;
                let ordersSize = 0;
                let deliveryMenSize = 0;
                let otherSize = 0;
                
                for (const productId of productIds) {
                    const productData = await redisClient.get(`product:${productId}`);
                    if (productData) {
                        const size = Buffer.byteLength(productData, 'utf8');
                        productsSize += size;
                        totalSize += size;
                    }
                }
                
                for (const orderId of orderIds) {
                    const orderData = await redisClient.get(`order:${orderId}`);
                    if (orderData) {
                        const size = Buffer.byteLength(orderData, 'utf8');
                        ordersSize += size;
                        totalSize += size;
                    }
                }
                
                const keys = await redisClient.keys('delivery:*');
                for (const key of keys) {
                    const data = await redisClient.get(key);
                    if (data) {
                        const deliveryMan = JSON.parse(data);
                        if (deliveryManIds.includes(deliveryMan.id)) {
                            const size = Buffer.byteLength(data, 'utf8');
                            deliveryMenSize += size;
                            totalSize += size;
                        }
                    }
                }
                
                const allKeys = await redisClient.keys('*');
                for (const key of allKeys) {
                    if (!key.startsWith('product:') && !key.startsWith('order:') && !key.startsWith('delivery:')) {
                        const type = await redisClient.type(key);
                        if (type === 'string') {
                            const data = await redisClient.get(key);
                            if (data) {
                                const size = Buffer.byteLength(data, 'utf8');
                                otherSize += size;
                                totalSize += size;
                            }
                        } else if (type === 'set') {
                            const members = await redisClient.smembers(key);
                            const size = Buffer.byteLength(JSON.stringify(members), 'utf8');
                            otherSize += size;
                            totalSize += size;
                        }
                    }
                }
                
                const maxStorage = 30 * 1024 * 1024;
                const usedStorage = totalSize;
                const freeStorage = maxStorage - usedStorage;
                const usagePercent = (usedStorage / maxStorage) * 100;
                
                return res.status(200).json({
                    total: {
                        used: usedStorage,
                        free: freeStorage,
                        max: maxStorage,
                        percent: Math.round(usagePercent * 100) / 100
                    },
                    breakdown: {
                        products: productsSize,
                        orders: ordersSize,
                        deliveryMen: deliveryMenSize,
                        other: otherSize
                    },
                    counts: {
                        products: productIds.length,
                        orders: orderIds.length,
                        deliveryMen: deliveryManIds.length
                    }
                });
            } catch (error) {
                return res.status(500).json({ error: 'Failed to calculate storage usage', message: error.message });
            }
        }

        // ============================================
        // DELIVERY ENDPOINTS
        // ============================================
        if (endpoint === 'delivery') {
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
                        return res.status(500).json({ error: 'Server error', message: error.message });
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
                        return res.status(500).json({ error: 'Server error', message: error.message });
                    }
                }
            }

            // Delivery list
            if (subEndpoint === 'list' && req.method === 'GET') {
                if (!requireAuth(req, res)) return;

                try {
                    const redisClient = getRedis();
                    const deliveryManIds = await redisClient.smembers('delivery-men');
                    const deliveryMen = [];

                    for (const id of deliveryManIds) {
                        const keys = await redisClient.keys('delivery:*');
                        for (const key of keys) {
                            const data = await redisClient.get(key);
                            if (data) {
                                const deliveryMan = JSON.parse(data);
                                if (deliveryMan.id === id) {
                                    const { password, ...safeInfo } = deliveryMan;
                                    deliveryMen.push(safeInfo);
                                    break;
                                }
                            }
                        }
                    }

                    const phoneKeys = await redisClient.keys('delivery:*');
                    for (const key of phoneKeys) {
                        if (key.startsWith('delivery:') && !key.includes(':')) {
                            const data = await redisClient.get(key);
                            if (data) {
                                const deliveryMan = JSON.parse(data);
                                if (!deliveryMen.find(dm => dm.id === deliveryMan.id)) {
                                    const { password, ...safeInfo } = deliveryMan;
                                    deliveryMen.push(safeInfo);
                                }
                            }
                        }
                    }

                    const uniqueDeliveryMen = deliveryMen.filter((dm, index, self) =>
                        index === self.findIndex(d => d.id === dm.id)
                    );

                    return res.status(200).json(uniqueDeliveryMen);
                } catch (error) {
                    return res.status(500).json({ error: 'Server error', message: error.message });
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
                    return res.status(500).json({ error: 'Server error', message: error.message });
                }
            }
        }

        // ============================================
        // 404 - Endpoint not found
        // ============================================
        console.log('404 - Endpoint not found:', {
            endpoint,
            subEndpoint,
            pathParts,
            url: req.url,
            method: req.method
        });
        return res.status(404).json({ 
            error: 'Endpoint not found', 
            endpoint: endpoint,
            pathParts: pathParts,
            url: req.url
        });

    } catch (error) {
        console.error('API Router error:', error);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
};

