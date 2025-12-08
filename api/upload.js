const { requireAuth } = require('./utils/auth');

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

    // Require authentication for uploads
    if (!requireAuth(req, res)) return;

    try {
        const { mediaData, mediaType } = req.body;

        if (!mediaData) {
            return res.status(400).json({ error: 'No media data provided' });
        }

        // Validate media type
        const validTypes = ['image', 'video'];
        const type = mediaType || 'image';
        if (!validTypes.includes(type)) {
            return res.status(400).json({ error: 'Invalid media type' });
        }

        // Check base64 data size (max 5MB for images, 10MB for videos)
        // Base64 is ~33% larger than binary, so we check the base64 string length
        const maxSize = type === 'video' ? 10 * 1024 * 1024 : 5 * 1024 * 1024; // 10MB or 5MB
        const base64Size = mediaData.length;
        
        // Approximate binary size (base64 is ~4/3 of original)
        const estimatedBinarySize = (base64Size * 3) / 4;
        
        if (estimatedBinarySize > maxSize) {
            const maxSizeMB = maxSize / (1024 * 1024);
            return res.status(400).json({ 
                error: `File too large. Maximum size is ${maxSizeMB}MB for ${type}s` 
            });
        }

        // Validate base64 format
        if (!mediaData.startsWith('data:') || !mediaData.includes(';base64,')) {
            return res.status(400).json({ error: 'Invalid base64 data format' });
        }

        // Return the base64 data URL (stored in Redis for now)
        // TODO: In production, upload to cloud storage (S3, Cloudinary, etc.)
        return res.status(200).json({
            success: true,
            mediaUrl: mediaData,
            mediaType: type
        });

    } catch (error) {
        console.error('Upload error:', error);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
};
