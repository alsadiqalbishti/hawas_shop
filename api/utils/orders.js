// Order utility functions for professional order management

const Redis = require('ioredis');

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

/**
 * Generate professional order number
 * Format: ORD-YYYY-XXXXX (5 digits)
 * Example: ORD-2024-00123
 */
async function generateOrderNumber() {
    try {
        const redisClient = getRedis();
        const year = new Date().getFullYear();
        const counterKey = `order:counter:${year}`;
        
        // Atomically increment counter for this year
        const counter = await redisClient.incr(counterKey);
        
        // Format: ORD-YYYY-XXXXX (5 digits, zero-padded)
        const orderNumber = `ORD-${year}-${String(counter).padStart(5, '0')}`;
        
        return orderNumber;
    } catch (error) {
        console.error('Error generating order number:', error);
        // Fallback to timestamp-based ID if Redis fails
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 5).toUpperCase();
        return `ORD-${timestamp}-${random}`;
    }
}

/**
 * Get order number from order ID (if already formatted)
 */
function getOrderNumber(orderId) {
    if (orderId && orderId.startsWith('ORD-')) {
        return orderId;
    }
    return orderId; // Return as-is if not formatted
}

/**
 * Validate status transition
 */
function canTransitionStatus(currentStatus, newStatus, userRole = 'admin') {
    const validTransitions = {
        'pending': ['assigned', 'cancelled', 'on_hold'],
        'assigned': ['preparing', 'cancelled', 'on_hold'],
        'preparing': ['in_transit', 'cancelled', 'on_hold'],
        'in_transit': ['delivered', 'cancelled', 'on_hold'],
        'delivered': ['completed', 'returned', 'on_hold'],
        'on_hold': ['pending', 'assigned', 'preparing', 'in_transit', 'cancelled'],
        'returned': ['refunded', 'cancelled'],
        'refunded': [], // Terminal state
        'completed': [], // Terminal state
        'cancelled': [] // Terminal state
    };

    // Admin can always cancel
    if (newStatus === 'cancelled' && userRole === 'admin') {
        return true;
    }

    // Admin can mark as completed from delivered
    if (newStatus === 'completed' && currentStatus === 'delivered' && userRole === 'admin') {
        return true;
    }

    // Delivery man can only transition through delivery workflow
    if (userRole === 'delivery') {
        const deliveryTransitions = ['assigned', 'preparing', 'in_transit', 'delivered'];
        if (deliveryTransitions.includes(newStatus) && deliveryTransitions.includes(currentStatus)) {
            const currentIndex = deliveryTransitions.indexOf(currentStatus);
            const newIndex = deliveryTransitions.indexOf(newStatus);
            return newIndex === currentIndex + 1; // Only forward transitions
        }
        return false;
    }

    // Check if transition is valid
    const allowed = validTransitions[currentStatus] || [];
    return allowed.includes(newStatus);
}

/**
 * Get status label in Arabic
 */
function getStatusLabel(status) {
    const labels = {
        'pending': 'قيد الانتظار',
        'assigned': 'مُسند',
        'preparing': 'قيد التحضير',
        'in_transit': 'قيد التوصيل',
        'delivered': 'تم التوصيل',
        'completed': 'مكتمل',
        'cancelled': 'ملغي',
        'on_hold': 'معلق',
        'returned': 'مرتجع',
        'refunded': 'مسترد'
    };
    return labels[status] || status;
}

/**
 * Get status color class
 */
function getStatusColor(status) {
    const colors = {
        'pending': 'warning',
        'assigned': 'info',
        'preparing': 'primary',
        'in_transit': 'purple',
        'delivered': 'success',
        'completed': 'success',
        'cancelled': 'danger',
        'on_hold': 'secondary',
        'returned': 'warning',
        'refunded': 'danger'
    };
    return colors[status] || 'secondary';
}

/**
 * Add status history entry
 */
function addStatusHistory(order, newStatus, changedBy, notes = '') {
    if (!order.statusHistory) {
        order.statusHistory = [];
    }

    order.statusHistory.push({
        status: newStatus,
        timestamp: new Date().toISOString(),
        changedBy: changedBy,
        notes: notes
    });

    return order;
}

/**
 * Get order statistics
 */
async function getOrderStats(startDate, endDate) {
    try {
        const redisClient = getRedis();
        const orderIds = await redisClient.smembers('orders');
        const stats = {
            total: 0,
            byStatus: {},
            byDeliveryMan: {},
            revenue: 0,
            averageOrderValue: 0
        };

        for (const orderId of orderIds) {
            const orderData = await redisClient.get(`order:${orderId}`);
            if (orderData) {
                const order = JSON.parse(orderData);
                const orderDate = new Date(order.createdAt);

                // Filter by date range if provided
                if (startDate && orderDate < new Date(startDate)) continue;
                if (endDate && orderDate > new Date(endDate)) continue;

                stats.total++;
                
                // Count by status
                stats.byStatus[order.status] = (stats.byStatus[order.status] || 0) + 1;
                
                // Count by delivery man
                if (order.deliveryManId) {
                    stats.byDeliveryMan[order.deliveryManId] = (stats.byDeliveryMan[order.deliveryManId] || 0) + 1;
                }

                // Calculate revenue (if product price available)
                // Note: This would need product data, simplified here
            }
        }

        if (stats.total > 0) {
            stats.averageOrderValue = stats.revenue / stats.total;
        }

        return stats;
    } catch (error) {
        console.error('Error getting order stats:', error);
        return null;
    }
}

module.exports = {
    generateOrderNumber,
    getOrderNumber,
    canTransitionStatus,
    getStatusLabel,
    getStatusColor,
    addStatusHistory,
    getOrderStats,
    getRedis
};

