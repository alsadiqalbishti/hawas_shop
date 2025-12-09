const fs = require('fs');
const path = require('path');

// Simple authentication endpoint
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

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { password } = req.body;

        // Get admin password from environment or use default
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

        if (password === adminPassword) {
            // Generate token with expiration (24 hours)
            const timestamp = Date.now();
            const token = Buffer.from(`${password}:${timestamp}`).toString('base64');

            return res.status(200).json({
                success: true,
                token: token,
                expiresIn: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
            });
        } else {
            return res.status(401).json({
                error: 'كلمة المرور غير صحيحة'
            });
        }
    } catch (error) {
        console.error('Auth error:', error);
        return res.status(500).json({
            error: 'حدث خطأ في الخادم'
        });
    }
};
