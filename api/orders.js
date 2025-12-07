// In-memory storage (will reset on each deployment, but works for demo)
let ordersCache = [];

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
        // GET - List all orders
        if (req.method === 'GET') {
            // Sort by newest first
            const sortedOrders = [...ordersCache].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            return res.status(200).json(sortedOrders);
        }

        // POST - Create new order
        if (req.method === 'POST') {
            const { productId, customerName, customerPhone, customerAddress, quantity } = req.body;

            // Validation
            if (!productId || !customerName || !customerPhone || !customerAddress || !quantity) {
                return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
            }

            const newOrder = {
                id: generateId(),
                productId,
                customerName,
                customerPhone,
                customerAddress,
                quantity: parseInt(quantity),
                status: 'pending',
                createdAt: new Date().toISOString()
            };

            ordersCache.push(newOrder);

            return res.status(201).json(newOrder);
        }

        // PUT - Update order (mark as completed)
        if (req.method === 'PUT') {
            const { id, status } = req.body;

            const index = ordersCache.findIndex(o => o.id === id);
            if (index === -1) {
                return res.status(404).json({ error: 'Order not found' });
            }

            ordersCache[index] = {
                ...ordersCache[index],
                status: status || ordersCache[index].status,
                updatedAt: new Date().toISOString()
            };

            return res.status(200).json(ordersCache[index]);
        }

        // DELETE - Delete order
        if (req.method === 'DELETE') {
            const { id } = req.query;

            const initialLength = ordersCache.length;
            ordersCache = ordersCache.filter(o => o.id !== id);

            if (ordersCache.length === initialLength) {
                return res.status(404).json({ error: 'Order not found' });
            }

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Orders API error:', error);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
};
