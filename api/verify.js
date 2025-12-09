// Token verification endpoint

const { verifyToken } = require('./utils/auth');

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

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const authHeader = req.headers.authorization;
        const token = authHeader || req.headers['x-auth-token'];
        
        const verification = verifyToken(token);
        
        if (verification.valid) {
            return res.status(200).json({ valid: true });
        } else {
            return res.status(401).json({ valid: false, error: verification.error });
        }
    } catch (error) {
        console.error('Verify error:', error);
        return res.status(500).json({ valid: false, error: 'Server error' });
    }
};

