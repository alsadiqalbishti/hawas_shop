// In-memory storage (will reset on each deployment, but works for demo)
// For production, use Vercel KV, PostgreSQL, or MongoDB
let productsCache = [];

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

    // Helper to generate unique ID
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    try {
        // GET - List all products or get single product
        if (req.method === 'GET') {
            const { id } = req.query;

            if (id) {
                const product = productsCache.find(p => p.id === id);
                if (!product) {
                    return res.status(404).json({ error: 'Product not found' });
                }
                return res.status(200).json(product);
            }

            return res.status(200).json(productsCache);
        }

        // POST - Create new product
        if (req.method === 'POST') {
            const { name, price, description, mediaUrl, mediaType } = req.body;

            const newProduct = {
                id: generateId(),
                name,
                price: parseFloat(price),
                description: description || '',
                mediaUrl: mediaUrl || '',
                mediaType: mediaType || 'image',
                createdAt: new Date().toISOString()
            };

            productsCache.push(newProduct);

            return res.status(201).json(newProduct);
        }

        // PUT - Update product
        if (req.method === 'PUT') {
            const { id, name, price, description, mediaUrl, mediaType } = req.body;

            const index = productsCache.findIndex(p => p.id === id);
            if (index === -1) {
                return res.status(404).json({ error: 'Product not found' });
            }

            productsCache[index] = {
                ...productsCache[index],
                name: name || productsCache[index].name,
                price: price ? parseFloat(price) : productsCache[index].price,
                description: description !== undefined ? description : productsCache[index].description,
                mediaUrl: mediaUrl !== undefined ? mediaUrl : productsCache[index].mediaUrl,
                mediaType: mediaType || productsCache[index].mediaType,
                updatedAt: new Date().toISOString()
            };

            return res.status(200).json(productsCache[index]);
        }

        // DELETE - Delete product
        if (req.method === 'DELETE') {
            const { id } = req.query;

            const initialLength = productsCache.length;
            productsCache = productsCache.filter(p => p.id !== id);

            if (productsCache.length === initialLength) {
                return res.status(404).json({ error: 'Product not found' });
            }

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Products API error:', error);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
};
