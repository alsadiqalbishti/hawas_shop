// Analytics API endpoint

const { requireAuth } = require('./utils/auth');
const { getOrderStats, getRedis } = require('./utils/orders');

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

    if (req.method === 'GET') {
        if (!requireAuth(req, res)) return;

        try {
            const { period = 'all', startDate, endDate } = req.query;
            
            // Calculate date range based on period
            let dateFrom = null;
            let dateTo = null;
            
            if (period === 'today') {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                dateFrom = today.toISOString();
                dateTo = new Date().toISOString();
            } else if (period === 'week') {
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                weekAgo.setHours(0, 0, 0, 0);
                dateFrom = weekAgo.toISOString();
                dateTo = new Date().toISOString();
            } else if (period === 'month') {
                const monthAgo = new Date();
                monthAgo.setMonth(monthAgo.getMonth() - 1);
                monthAgo.setHours(0, 0, 0, 0);
                dateFrom = monthAgo.toISOString();
                dateTo = new Date().toISOString();
            } else if (startDate && endDate) {
                dateFrom = new Date(startDate).toISOString();
                dateTo = new Date(endDate).toISOString();
            }

            const redisClient = getRedis();
            const orderIds = await redisClient.smembers('orders');
            const productIds = await redisClient.smembers('products');
            
            const orders = [];
            const products = [];
            
            // Get all orders
            for (const orderId of orderIds) {
                const orderData = await redisClient.get(`order:${orderId}`);
                if (orderData) {
                    const order = JSON.parse(orderData);
                    const orderDate = new Date(order.createdAt);
                    
                    // Filter by date range if provided
                    if (dateFrom && orderDate < new Date(dateFrom)) continue;
                    if (dateTo) {
                        const toDate = new Date(dateTo);
                        toDate.setHours(23, 59, 59, 999);
                        if (orderDate > toDate) continue;
                    }
                    
                    orders.push(order);
                }
            }
            
            // Get all products
            for (const productId of productIds) {
                const productData = await redisClient.get(`product:${productId}`);
                if (productData) {
                    products.push(JSON.parse(productData));
                }
            }
            
            // Calculate statistics
            const stats = {
                orders: {
                    total: orders.length,
                    byStatus: {},
                    today: orders.filter(o => {
                        const today = new Date();
                        const orderDate = new Date(o.createdAt);
                        return orderDate.toDateString() === today.toDateString();
                    }).length,
                    thisWeek: orders.filter(o => {
                        const weekAgo = new Date();
                        weekAgo.setDate(weekAgo.getDate() - 7);
                        return new Date(o.createdAt) >= weekAgo;
                    }).length,
                    thisMonth: orders.filter(o => {
                        const monthAgo = new Date();
                        monthAgo.setMonth(monthAgo.getMonth() - 1);
                        return new Date(o.createdAt) >= monthAgo;
                    }).length
                },
                products: {
                    total: products.length
                },
                revenue: {
                    total: 0,
                    byStatus: {},
                    averageOrderValue: 0
                },
                topProducts: [],
                deliveryMen: {}
            };
            
            // Calculate order status distribution
            orders.forEach(order => {
                stats.orders.byStatus[order.status] = (stats.orders.byStatus[order.status] || 0) + 1;
                
                // Calculate revenue (simplified - would need product price)
                const product = products.find(p => p.id === order.productId);
                if (product) {
                    const price = product.discountPrice || product.price;
                    const orderValue = price * order.quantity;
                    stats.revenue.total += orderValue;
                    
                    // Revenue by status
                    stats.revenue.byStatus[order.status] = (stats.revenue.byStatus[order.status] || 0) + orderValue;
                }
            });
            
            // Calculate average order value
            if (orders.length > 0) {
                stats.revenue.averageOrderValue = stats.revenue.total / orders.length;
            }
            
            // Calculate top products
            const productOrders = {};
            orders.forEach(order => {
                if (!productOrders[order.productId]) {
                    productOrders[order.productId] = { count: 0, revenue: 0 };
                }
                productOrders[order.productId].count += order.quantity;
                const product = products.find(p => p.id === order.productId);
                if (product) {
                    const price = product.discountPrice || product.price;
                    productOrders[order.productId].revenue += price * order.quantity;
                }
            });
            
            stats.topProducts = Object.entries(productOrders)
                .map(([productId, data]) => {
                    const product = products.find(p => p.id === productId);
                    return {
                        productId,
                        name: product ? product.name : 'غير معروف',
                        orders: data.count,
                        revenue: data.revenue
                    };
                })
                .sort((a, b) => b.orders - a.orders)
                .slice(0, 10);
            
            // Calculate delivery man stats
            const deliveryManStats = {};
            orders.forEach(order => {
                if (order.deliveryManId) {
                    if (!deliveryManStats[order.deliveryManId]) {
                        deliveryManStats[order.deliveryManId] = {
                            totalOrders: 0,
                            delivered: 0,
                            inTransit: 0
                        };
                    }
                    deliveryManStats[order.deliveryManId].totalOrders++;
                    if (order.status === 'delivered' || order.status === 'completed') {
                        deliveryManStats[order.deliveryManId].delivered++;
                    } else if (order.status === 'in_transit') {
                        deliveryManStats[order.deliveryManId].inTransit++;
                    }
                }
            });
            
            stats.deliveryMen = deliveryManStats;
            
            // Daily order trends (last 30 days)
            const dailyTrends = {};
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            orders.filter(o => new Date(o.createdAt) >= thirtyDaysAgo).forEach(order => {
                const date = new Date(order.createdAt).toISOString().split('T')[0];
                if (!dailyTrends[date]) {
                    dailyTrends[date] = { orders: 0, revenue: 0 };
                }
                dailyTrends[date].orders++;
                const product = products.find(p => p.id === order.productId);
                if (product) {
                    const price = product.discountPrice || product.price;
                    dailyTrends[date].revenue += price * order.quantity;
                }
            });
            
            stats.dailyTrends = Object.entries(dailyTrends)
                .map(([date, data]) => ({ date, ...data }))
                .sort((a, b) => a.date.localeCompare(b.date));
            
            return res.status(200).json(stats);
        } catch (error) {
            console.error('Analytics API error:', error);
            return res.status(500).json({ error: 'Server error', message: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};

