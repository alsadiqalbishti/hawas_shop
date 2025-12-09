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

// Load orders on page load
loadOrders();

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

        renderOrders(orders);
    } catch (error) {
        console.error('Error loading orders:', error);
        document.getElementById('ordersList').innerHTML = 
            '<div class="empty-state">حدث خطأ في تحميل الطلبات</div>';
    }
}

// Render orders
function renderOrders(orders) {
    const container = document.getElementById('ordersList');
    
    if (orders.length === 0) {
        container.innerHTML = '<div class="empty-state" style="text-align: center; padding: 3rem; color: #666;"><p style="font-size: 1.2rem; margin-bottom: 1rem;">لا توجد طلبات مُسندة إليك</p><p style="color: #999;">سيتم إظهار الطلبات هنا بعد أن يقوم المدير بإسنادها إليك من لوحة التحكم</p></div>';
        return;
    }

    container.innerHTML = orders.map(order => {
        const product = order.product || {};
        const statusClass = `status-${order.status}`;
        
        const orderNumber = order.orderNumber || order.id;
        const displayOrderNumber = orderNumber.startsWith('ORD-') ? orderNumber : `#${orderNumber.substring(0, 8)}`;
        
        // Quick action buttons based on status
        let quickActions = '';
        if (order.status === 'assigned') {
            quickActions = `<button onclick="quickUpdate('${order.id}', 'preparing')" class="btn-quick" style="background: #2196f3;">⏳ بدء التحضير</button>`;
        } else if (order.status === 'preparing') {
            quickActions = `<button onclick="quickUpdate('${order.id}', 'in_transit')" class="btn-quick" style="background: #9c27b0;">🚚 بدء التوصيل</button>`;
        } else if (order.status === 'in_transit') {
            quickActions = `<button onclick="quickUpdate('${order.id}', 'delivered')" class="btn-quick" style="background: #4caf50;">✅ تم التوصيل</button>`;
        }
        
        return `
            <div class="order-card" data-order-id="${order.id}">
                <div class="order-header">
                    <span class="order-id">${displayOrderNumber}</span>
                    <span class="order-status ${statusClass}">${getStatusLabel(order.status)}</span>
                </div>
                <div class="order-info">
                    <p><strong>العميل:</strong> ${escapeHtml(order.customerName)}</p>
                    <p><strong>الهاتف:</strong> <a href="tel:${escapeHtml(order.customerPhone)}" style="color: #1877f2; text-decoration: none;">${escapeHtml(order.customerPhone)} 📞</a></p>
                    <p><strong>العنوان:</strong> ${escapeHtml(order.customerAddress)}</p>
                    <p><strong>المنتج:</strong> ${escapeHtml(product.name || 'غير معروف')}</p>
                    <p><strong>الكمية:</strong> ${order.quantity || 1}</p>
                    <p><strong>السعر:</strong> ${formatPrice(product.price)} د.ع</p>
                    ${product.discountPrice ? `<p><strong>السعر بعد الخصم:</strong> ${formatPrice(product.discountPrice)} د.ع</p>` : ''}
                    <p><strong>تاريخ الطلب:</strong> ${new Date(order.createdAt).toLocaleDateString('ar')}</p>
                </div>
                ${quickActions ? `<div style="margin: 15px 0; padding: 10px; background: #f0f2f5; border-radius: 5px;">
                    <strong>إجراء سريع:</strong><br>
                    ${quickActions}
                </div>` : ''}
                <form class="order-form" onsubmit="updateOrder(event, '${order.id}')">
                    <div class="form-group">
                        <label for="status-${order.id}">حالة الطلب</label>
                        <select id="status-${order.id}" name="status" required>
                            <option value="assigned" ${order.status === 'assigned' ? 'selected' : ''}>مُسند</option>
                            <option value="preparing" ${order.status === 'preparing' ? 'selected' : ''}>قيد التحضير</option>
                            <option value="in_transit" ${order.status === 'in_transit' ? 'selected' : ''}>قيد التوصيل</option>
                            <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>تم التوصيل</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="shippingPrice-${order.id}">سعر التوصيل (د.ع)</label>
                        <input type="number" id="shippingPrice-${order.id}" name="shippingPrice" 
                               value="${order.shippingPrice || ''}" step="0.01" min="0">
                    </div>
                    <div class="form-group">
                        <label for="paymentReceived-${order.id}">المبلغ المستلم (د.ع)</label>
                        <input type="number" id="paymentReceived-${order.id}" name="paymentReceived" 
                               value="${order.paymentReceived || ''}" step="0.01" min="0">
                    </div>
                    <button type="submit" class="btn-update">💾 تحديث الطلب</button>
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

// Load orders on page load
loadOrders();
// Refresh every 30 seconds
setInterval(loadOrders, 30000);

