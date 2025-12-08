// Get delivery man info by ID (for admin panel)

const { getRedis, getDeliveryManById } = require('../utils/delivery');
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
            const { id } = req.query;
            if (!id) {
                return res.status(400).json({ error: 'Delivery man ID is required' });
            }

            const deliveryMan = await getDeliveryManById(id);
            if (!deliveryMan) {
                return res.status(404).json({ error: 'Delivery man not found' });
            }

            // Don't return password
            const { password, ...safeInfo } = deliveryMan;
            return res.status(200).json(safeInfo);
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Delivery info API error:', error);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
};

