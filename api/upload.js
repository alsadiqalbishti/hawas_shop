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
        const { mediaData, mediaType } = req.body;

        if (!mediaData) {
            return res.status(400).json({ error: 'No media data provided' });
        }

        // Return the base64 data URL directly
        return res.status(200).json({
            success: true,
            mediaUrl: mediaData,
            mediaType: mediaType || 'image'
        });

    } catch (error) {
        console.error('Upload error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
};
