const multiparty = require('multiparty');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const rename = promisify(fs.rename);
const mkdir = promisify(fs.mkdir);

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
        const form = new multiparty.Form();

        form.parse(req, async (err, fields, files) => {
            if (err) {
                return res.status(400).json({ error: 'Upload failed' });
            }

            const uploadedFile = files.media?.[0];
            if (!uploadedFile) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            // Create uploads directory if it doesn't exist
            const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
            try {
                await mkdir(uploadsDir, { recursive: true });
            } catch (e) {
                // Directory might already exist
            }

            // Generate unique filename
            const ext = path.extname(uploadedFile.originalFilename);
            const filename = `${Date.now()}-${Math.random().toString(36).substr(2)}${ext}`;
            const newPath = path.join(uploadsDir, filename);

            // Move file
            await rename(uploadedFile.path, newPath);

            // Determine media type
            const mediaType = uploadedFile.headers['content-type'].startsWith('video/') ? 'video' : 'image';

            return res.status(200).json({
                success: true,
                mediaUrl: `/uploads/${filename}`,
                mediaType: mediaType
            });
        });

    } catch (error) {
        console.error('Upload error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
};
