// Delivery man authentication endpoint

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const Redis = require('ioredis');
    const { generateId } = require('../utils/delivery');

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

    try {
        // POST - Login or Signup
        if (req.method === 'POST') {
            const { name, phone, password, action } = req.body;

            if (!name || !phone || !password) {
                return res.status(400).json({ error: 'الاسم ورقم الهاتف وكلمة المرور مطلوبة' });
            }

            const redisClient = getRedis();
            const deliveryManKey = `delivery:${phone}`;

            if (action === 'signup') {
                // Check if delivery man already exists
                const exists = await redisClient.exists(deliveryManKey);
                if (exists) {
                    return res.status(400).json({ error: 'رقم الهاتف مسجل بالفعل' });
                }

                // Create new delivery man
                const deliveryMan = {
                    id: generateId(),
                    name: name.trim(),
                    phone: phone.trim(),
                    password: password, // In production, hash this
                    createdAt: new Date().toISOString()
                };

                await redisClient.set(deliveryManKey, JSON.stringify(deliveryMan));
                await redisClient.sadd('delivery-men', deliveryMan.id);

                // Generate token
                const token = Buffer.from(`${deliveryMan.id}:${Date.now()}`).toString('base64');

                return res.status(201).json({
                    success: true,
                    token: token,
                    deliveryMan: {
                        id: deliveryMan.id,
                        name: deliveryMan.name,
                        phone: deliveryMan.phone
                    }
                });
            } else {
                // Login
                const deliveryManData = await redisClient.get(deliveryManKey);
                if (!deliveryManData) {
                    return res.status(401).json({ error: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
                }

                const deliveryMan = JSON.parse(deliveryManData);
                if (deliveryMan.password !== password) {
                    return res.status(401).json({ error: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
                }

                // Generate token
                const token = Buffer.from(`${deliveryMan.id}:${Date.now()}`).toString('base64');

                return res.status(200).json({
                    success: true,
                    token: token,
                    deliveryMan: {
                        id: deliveryMan.id,
                        name: deliveryMan.name,
                        phone: deliveryMan.phone
                    }
                });
            }
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Delivery auth error:', error);
        return res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
};

