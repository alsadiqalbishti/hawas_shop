// Storage usage API endpoint

const { requireAuth } = require('./utils/auth');
const { getRedis } = require('./utils/orders');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method === 'GET') {
        if (!requireAuth(req, res)) return;

        try {
            const redisClient = getRedis();
            
            // Get all keys
            const productIds = await redisClient.smembers('products');
            const orderIds = await redisClient.smembers('orders');
            const deliveryManIds = await redisClient.smembers('delivery-men');
            
            // Calculate sizes
            let totalSize = 0;
            let productsSize = 0;
            let ordersSize = 0;
            let deliveryMenSize = 0;
            let otherSize = 0;
            
            // Calculate products size
            for (const productId of productIds) {
                const productData = await redisClient.get(`product:${productId}`);
                if (productData) {
                    const size = Buffer.byteLength(productData, 'utf8');
                    productsSize += size;
                    totalSize += size;
                }
            }
            
            // Calculate orders size
            for (const orderId of orderIds) {
                const orderData = await redisClient.get(`order:${orderId}`);
                if (orderData) {
                    const size = Buffer.byteLength(orderData, 'utf8');
                    ordersSize += size;
                    totalSize += size;
                }
            }
            
            // Calculate delivery men size
            for (const deliveryManId of deliveryManIds) {
                // Get delivery man by iterating through all delivery: keys
                // We need to find the key - let's use a pattern search
                const keys = await redisClient.keys('delivery:*');
                for (const key of keys) {
                    const data = await redisClient.get(key);
                    if (data) {
                        const deliveryMan = JSON.parse(data);
                        if (deliveryMan.id === deliveryManId) {
                            const size = Buffer.byteLength(data, 'utf8');
                            deliveryMenSize += size;
                            totalSize += size;
                            break;
                        }
                    }
                }
            }
            
            // Calculate other keys size (sets, counters, etc.)
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
            
            // Vercel free plan limit: 30MB
            const maxStorage = 30 * 1024 * 1024; // 30MB in bytes
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
            console.error('Storage calculation error:', error);
            return res.status(500).json({ 
                error: 'Failed to calculate storage usage',
                message: error.message 
            });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};

