// Delivery man dashboard

const API_BASE = window.location.origin;

// Check authentication
const token = localStorage.getItem('deliveryToken');
const deliveryMan = JSON.parse(localStorage.getItem('deliveryMan') || 'null');

if (!token || !deliveryMan) {
    window.location.href = 'delivery-login.html';
}

// Show notification
function showNotification(message, type = 'error') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#f44336' : '#4caf50'};
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        z-index: 10000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Logout
function logout() {
    localStorage.removeItem('deliveryToken');
    localStorage.removeItem('deliveryMan');
    window.location.href = 'delivery-login.html';
}

// Get status label in Arabic
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

// Format price
function formatPrice(price) {
    if (!price) return '0.00';
    return parseFloat(price).toFixed(2);
}

// Load stats and orders on page load
window.addEventListener('DOMContentLoaded', () => {
    loadOrders();
    // Refresh every 30 seconds
    setInterval(loadOrders, 30000);
});

// Load stats
function renderStats(orders) {
    const statsContainer = document.getElementById('statsContainer');
    if (!statsContainer) return;
    
    const total = orders.length;
    const inTransit = orders.filter(o => o.status === 'in_transit').length;
    const delivered = orders.filter(o => o.status === 'delivered' || o.status === 'completed').length;
    const totalEarnings = orders
        .filter(o => o.paymentReceived)
        .reduce((sum, o) => sum + parseFloat(o.paymentReceived || 0), 0);
    
    statsContainer.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon">📦</div>
            <div class="stat-value">${total}</div>
            <div class="stat-label">إجمالي الطلبات</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">🚚</div>
            <div class="stat-value">${inTransit}</div>
            <div class="stat-label">قيد التوصيل</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">✅</div>
            <div class="stat-value">${delivered}</div>
            <div class="stat-label">تم التوصيل</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">💰</div>
            <div class="stat-value">${totalEarnings.toFixed(2)}</div>
            <div class="stat-label">إجمالي الأرباح (د.ع)</div>
        </div>
    `;
}

// Load orders
async function loadOrders() {
    try {
        const response = await fetch(`${API_BASE}/api/delivery/orders`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            logout();
            return;
        }

        if (!response.ok) {
            throw new Error('HTTP error! status: ' + response.status);
        }

        const orders = await response.json();
        if (!Array.isArray(orders)) {
            throw new Error('Invalid response format');
        }

        renderStats(orders);
        renderOrders(orders);
    } catch (error) {
        console.error('Error loading orders:', error);
        document.getElementById('ordersList').innerHTML = 
            '<div class="empty-state"><div class="empty-state-icon">❌</div><h3>حدث خطأ في تحميل الطلبات</h3></div>';
    }
}

// Get status badge class
function getStatusBadgeClass(status) {
    const classes = {
        'pending': 'badge badge-warning',
        'assigned': 'badge badge-info',
        'preparing': 'badge badge-info',
        'in_transit': 'badge badge-primary',
        'delivered': 'badge badge-success',
        'completed': 'badge badge-success',
        'cancelled': 'badge badge-danger',
        'on_hold': 'badge badge-warning',
        'returned': 'badge badge-danger',
        'refunded': 'badge badge-danger'
    };
    return classes[status] || 'badge';
}

// Render orders
function renderOrders(orders) {
    const container = document.getElementById('ordersList');
    
    if (orders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <h3>لا توجد طلبات مُسندة إليك</h3>
                <p>سيتم إظهار الطلبات هنا بعد أن يقوم المدير بإسنادها إليك من لوحة التحكم</p>
            </div>
        `;
        return;
    }

    container.innerHTML = orders.map(order => {
        const product = order.product || {};
        const statusBadgeClass = getStatusBadgeClass(order.status);
        
        const orderNumber = order.orderNumber || order.id;
        const displayOrderNumber = orderNumber.startsWith('ORD-') ? orderNumber : `#${orderNumber.substring(0, 8)}`;
        
        // Quick action buttons based on status
        let quickActions = '';
        if (order.status === 'assigned') {
            quickActions = `<button onclick="quickUpdate('${order.id}', 'preparing')" class="btn-quick" style="background: var(--info);">⏳ بدء التحضير</button>`;
        } else if (order.status === 'preparing') {
            quickActions = `<button onclick="quickUpdate('${order.id}', 'in_transit')" class="btn-quick" style="background: var(--primary);">🚚 بدء التوصيل</button>`;
        } else if (order.status === 'in_transit') {
            quickActions = `<button onclick="quickUpdate('${order.id}', 'delivered')" class="btn-quick" style="background: var(--success);">✅ تم التوصيل</button>`;
        }
        
        return `
            <div class="order-card" data-order-id="${order.id}">
                <div class="order-header">
                    <span class="order-id">${displayOrderNumber}</span>
                    <span class="${statusBadgeClass}">${getStatusLabel(order.status)}</span>
                </div>
                <div class="order-info">
                    <div class="order-info-item">
                        <span class="order-info-label">العميل:</span>
                        <span class="order-info-value">${escapeHtml(order.customerName)}</span>
                    </div>
                    <div class="order-info-item">
                        <span class="order-info-label">الهاتف:</span>
                        <span class="order-info-value"><a href="tel:${escapeHtml(order.customerPhone)}">${escapeHtml(order.customerPhone)} 📞</a></span>
                    </div>
                    <div class="order-info-item">
                        <span class="order-info-label">العنوان:</span>
                        <span class="order-info-value">${escapeHtml(order.customerAddress)}</span>
                    </div>
                    <div class="order-info-item">
                        <span class="order-info-label">المنتج:</span>
                        <span class="order-info-value">${escapeHtml(product.name || 'غير معروف')}</span>
                    </div>
                    <div class="order-info-item">
                        <span class="order-info-label">الكمية:</span>
                        <span class="order-info-value">${order.quantity || 1}</span>
                    </div>
                    <div class="order-info-item">
                        <span class="order-info-label">السعر:</span>
                        <span class="order-info-value">${formatPrice(product.price)} د.ع</span>
                    </div>
                    ${product.discountPrice ? `
                    <div class="order-info-item">
                        <span class="order-info-label">السعر بعد الخصم:</span>
                        <span class="order-info-value" style="color: var(--success); font-weight: 600;">${formatPrice(product.discountPrice)} د.ع</span>
                    </div>
                    ` : ''}
                    <div class="order-info-item">
                        <span class="order-info-label">تاريخ الطلب:</span>
                        <span class="order-info-value">${new Date(order.createdAt).toLocaleDateString('ar')}</span>
                    </div>
                </div>
                ${quickActions ? `
                <div class="quick-actions">
                    <strong style="display: block; margin-bottom: var(--space-2); color: var(--text);">إجراء سريع:</strong>
                    ${quickActions}
                </div>
                ` : ''}
                <form class="order-form" onsubmit="updateOrder(event, '${order.id}')">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label" for="status-${order.id}">حالة الطلب</label>
                            <select id="status-${order.id}" name="status" class="form-input" required>
                                <option value="assigned" ${order.status === 'assigned' ? 'selected' : ''}>مُسند</option>
                                <option value="preparing" ${order.status === 'preparing' ? 'selected' : ''}>قيد التحضير</option>
                                <option value="in_transit" ${order.status === 'in_transit' ? 'selected' : ''}>قيد التوصيل</option>
                                <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>تم التوصيل</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="shippingPrice-${order.id}">سعر التوصيل (د.ع)</label>
                            <input type="number" id="shippingPrice-${order.id}" name="shippingPrice" class="form-input"
                                   value="${order.shippingPrice || ''}" step="0.01" min="0" placeholder="0.00">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="paymentReceived-${order.id}">المبلغ المستلم (د.ع)</label>
                            <input type="number" id="paymentReceived-${order.id}" name="paymentReceived" class="form-input"
                                   value="${order.paymentReceived || ''}" step="0.01" min="0" placeholder="0.00">
                        </div>
                    </div>
                    <button type="submit" class="btn btn-primary" style="width: 100%;">💾 تحديث الطلب</button>
                </form>
            </div>
        `;
    }).join('');
}

// Quick status update
async function quickUpdate(orderId, newStatus) {
    try {
        const response = await fetch(`${API_BASE}/api/delivery/orders`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                id: orderId,
                status: newStatus
            })
        });

        if (response.status === 401) {
            logout();
            return;
        }

        const result = await response.json();
        if (response.ok) {
            showNotification('تم تحديث حالة الطلب بنجاح', 'success');
            loadOrders();
        } else {
            showNotification(result.error || 'حدث خطأ في تحديث الطلب');
        }
    } catch (error) {
        showNotification('حدث خطأ في الاتصال بالخادم');
    }
}

// Update order
async function updateOrder(e, orderId) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    
    // Get values and convert empty strings to null
    const shippingPrice = formData.get('shippingPrice');
    const paymentReceived = formData.get('paymentReceived');
    
    const data = {
        id: orderId,
        status: formData.get('status'),
        shippingPrice: shippingPrice && shippingPrice.trim() !== '' ? parseFloat(shippingPrice) : null,
        paymentReceived: paymentReceived && paymentReceived.trim() !== '' ? parseFloat(paymentReceived) : null
    };

    // Validate status is provided
    if (!data.status) {
        showNotification('يجب اختيار حالة الطلب', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/delivery/orders`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        if (response.status === 401) {
            logout();
            return;
        }

        const result = await response.json();
        if (response.ok) {
            showNotification('تم تحديث الطلب بنجاح', 'success');
            loadOrders();
        } else {
            console.error('Update order error:', result);
            const errorMsg = result.error || result.message || 'حدث خطأ في تحديث الطلب';
            showNotification(errorMsg, 'error');
        }
    } catch (error) {
        showNotification('حدث خطأ في الاتصال بالخادم');
    }
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


