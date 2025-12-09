// List all delivery men (for admin panel)

const { getRedis } = require('../utils/delivery');
const { requireAuth } = require('../utils/auth');

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

    // Require admin auth
    if (!requireAuth(req, res)) return;

    try {
        if (req.method === 'GET') {
            const redisClient = getRedis();
            const deliveryManIds = await redisClient.smembers('delivery-men');
            const deliveryMen = [];

            for (const id of deliveryManIds) {
                // Try to find by ID first
                const keys = await redisClient.keys('delivery:*');
                for (const key of keys) {
                    const data = await redisClient.get(key);
                    if (data) {
                        const deliveryMan = JSON.parse(data);
                        if (deliveryMan.id === id) {
                            // Don't return password
                            const { password, ...safeInfo } = deliveryMan;
                            deliveryMen.push(safeInfo);
                            break;
                        }
                    }
                }
            }

            // Also get delivery men by phone key pattern
            const phoneKeys = await redisClient.keys('delivery:*');
            for (const key of phoneKeys) {
                if (key.startsWith('delivery:') && !key.includes(':')) {
                    const data = await redisClient.get(key);
                    if (data) {
                        const deliveryMan = JSON.parse(data);
                        // Check if already added
                        if (!deliveryMen.find(dm => dm.id === deliveryMan.id)) {
                            const { password, ...safeInfo } = deliveryMan;
                            deliveryMen.push(safeInfo);
                        }
                    }
                }
            }

            // Remove duplicates
            const uniqueDeliveryMen = deliveryMen.filter((dm, index, self) =>
                index === self.findIndex(d => d.id === dm.id)
            );

            return res.status(200).json(uniqueDeliveryMen);
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Delivery list API error:', error);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
};

