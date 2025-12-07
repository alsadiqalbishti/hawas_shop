const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const ORDERS_FILE = path.join(process.cwd(), 'data', 'orders.json');

// Helper to read orders
async function readOrders() {
    try {
        const data = await readFile(ORDERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

// Helper to write orders
async function writeOrders(orders) {
    await writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

// Helper to generate unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

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

    try {
        // GET - List all orders
        if (req.method === 'GET') {
            const orders = await readOrders();
            // Sort by newest first
            orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            return res.status(200).json(orders);
        }

        // POST - Create new order
        if (req.method === 'POST') {
            const orders = await readOrders();
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

            orders.push(newOrder);
            await writeOrders(orders);

            // TODO: Send to Google Sheets if enabled
            // await syncToGoogleSheets(newOrder);

            return res.status(201).json(newOrder);
        }

        // PUT - Update order (mark as completed)
        if (req.method === 'PUT') {
            const orders = await readOrders();
            const { id, status } = req.body;

            const index = orders.findIndex(o => o.id === id);
            if (index === -1) {
                return res.status(404).json({ error: 'Order not found' });
            }

            orders[index] = {
                ...orders[index],
                status: status || orders[index].status,
                updatedAt: new Date().toISOString()
            };

            await writeOrders(orders);
            return res.status(200).json(orders[index]);
        }

        // DELETE - Delete order
        if (req.method === 'DELETE') {
            const orders = await readOrders();
            const { id } = req.query;

            const filteredOrders = orders.filter(o => o.id !== id);

            if (filteredOrders.length === orders.length) {
                return res.status(404).json({ error: 'Order not found' });
            }

            await writeOrders(filteredOrders);
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Orders API error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
};
