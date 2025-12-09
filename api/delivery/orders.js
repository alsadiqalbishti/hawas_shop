// Delivery man orders API

const { requireDeliveryAuth, getRedis } = require('../utils/delivery');
const { canTransitionStatus, addStatusHistory, getStatusLabel } = require('../utils/orders');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // GET - Get orders assigned to delivery man
        if (req.method === 'GET') {
            const deliveryManId = requireDeliveryAuth(req, res);
            if (!deliveryManId) return;

            const redisClient = getRedis();
            const orderIds = await redisClient.smembers('orders');
            const orders = [];

            for (const orderId of orderIds) {
                const orderData = await redisClient.get(`order:${orderId}`);
                if (orderData) {
                    const order = JSON.parse(orderData);
                    // Only show orders assigned to this specific delivery man
                    if (order.deliveryManId === deliveryManId) {
                        // Get product info
                        const productData = await redisClient.get(`product:${order.productId}`);
                        if (productData) {
                            order.product = JSON.parse(productData);
                        }
                        orders.push(order);
                    }
                }
            }

            // Sort by newest first
            orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            return res.status(200).json(orders);
        }

        // PUT - Update order (delivery man can update status, shipping price, payment)
        if (req.method === 'PUT') {
            const deliveryManId = requireDeliveryAuth(req, res);
            if (!deliveryManId) return;

            const { id, status, shippingPrice, paymentReceived } = req.body;
            if (!id) {
                return res.status(400).json({ error: 'Order ID is required' });
            }

            const redisClient = getRedis();
            const orderData = await redisClient.get(`order:${id}`);
            if (!orderData) {
                return res.status(404).json({ error: 'Order not found' });
            }

            const order = JSON.parse(orderData);
            const currentStatus = order.status;
            const newStatus = status || currentStatus;
            
            // Validate status transition (delivery man role)
            if (newStatus !== currentStatus && !canTransitionStatus(currentStatus, newStatus, 'delivery')) {
                return res.status(400).json({ 
                    error: `Invalid status transition from ${getStatusLabel(currentStatus)} to ${getStatusLabel(newStatus)}`,
                    currentStatus: currentStatus,
                    newStatus: newStatus
                });
            }

            // Validate status value
            const validStatuses = ['assigned', 'preparing', 'in_transit', 'delivered'];
            if (newStatus && !validStatuses.includes(newStatus)) {
                return res.status(400).json({ 
                    error: 'Invalid status for delivery man', 
                    validStatuses: validStatuses 
                });
            }

            // Update order
            const updatedOrder = {
                ...order,
                status: newStatus,
                deliveryManId: deliveryManId,
                shippingPrice: shippingPrice !== undefined ? (shippingPrice ? parseFloat(shippingPrice) : null) : order.shippingPrice,
                paymentReceived: paymentReceived !== undefined ? (paymentReceived ? parseFloat(paymentReceived) : null) : order.paymentReceived,
                updatedAt: new Date().toISOString(),
                updatedBy: deliveryManId
            };

            // Add status history entry if status changed
            if (newStatus !== currentStatus) {
                addStatusHistory(updatedOrder, newStatus, deliveryManId, `Status updated by delivery man`);
            }

            await redisClient.set(`order:${id}`, JSON.stringify(updatedOrder));
            return res.status(200).json(updatedOrder);
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Delivery orders API error:', error);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
};

