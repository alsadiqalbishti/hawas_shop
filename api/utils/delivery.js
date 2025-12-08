// Delivery man utility functions

const Redis = require('ioredis');

// Initialize Redis connection
let redis;
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
            connectTimeout: 15000
        });
    }
    return redis;
}

/**
 * Verify delivery man token
 */
function verifyDeliveryToken(token) {
    if (!token) {
        return { valid: false, error: 'No token provided' };
    }

    try {
        const cleanToken = token.replace(/^Bearer\s+/, '');
        const decoded = Buffer.from(cleanToken, 'base64').toString('utf-8');
        const [deliveryManId, timestamp] = decoded.split(':');
        
        if (!deliveryManId || !timestamp) {
            return { valid: false, error: 'Invalid token format' };
        }

        // Check token expiration (24 hours)
        const tokenAge = Date.now() - parseInt(timestamp);
        const maxAge = 24 * 60 * 60 * 1000;
        
        if (tokenAge > maxAge) {
            return { valid: false, error: 'Token expired' };
        }

        return { valid: true, deliveryManId };
    } catch (error) {
        return { valid: false, error: 'Invalid token' };
    }
}

/**
 * Require delivery man authentication
 */
function requireDeliveryAuth(req, res) {
    const authHeader = req.headers.authorization;
    const token = authHeader || req.headers['x-auth-token'];
    
    const verification = verifyDeliveryToken(token);
    
    if (!verification.valid) {
        res.status(401).json({ error: 'Unauthorized', message: verification.error });
        return null;
    }
    
    return verification.deliveryManId;
}

/**
 * Get delivery man by ID
 */
async function getDeliveryManById(deliveryManId) {
    try {
        const redisClient = getRedis();
        const deliveryMen = await redisClient.keys('delivery:*');
        
        for (const key of deliveryMen) {
            const data = await redisClient.get(key);
            if (data) {
                const man = JSON.parse(data);
                if (man.id === deliveryManId) {
                    return man;
                }
            }
        }
        return null;
    } catch (error) {
        console.error('Error getting delivery man:', error);
        return null;
    }
}

/**
 * Generate unique ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

module.exports = {
    verifyDeliveryToken,
    requireDeliveryAuth,
    getDeliveryManById,
    getRedis,
    generateId
};

