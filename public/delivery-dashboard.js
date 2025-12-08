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
        'in_transit': 'قيد التوصيل',
        'delivered': 'تم التوصيل',
        'completed': 'مكتمل',
        'cancelled': 'ملغي'
    };
    return labels[status] || status;
}

// Format price
function formatPrice(price) {
    if (!price) return '0.00';
    return parseFloat(price).toFixed(2);
}

// Load orders
async function loadOrders() {
    try {
        const response = await fetch(`${API_BASE}/api/delivery/orders`, {
            headers: {
                'Authorization': token
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
        container.innerHTML = '<div class="empty-state">لا توجد طلبات متاحة</div>';
        return;
    }

    container.innerHTML = orders.map(order => {
        const product = order.product || {};
        const statusClass = `status-${order.status}`;
        
        return `
            <div class="order-card" data-order-id="${order.id}">
                <div class="order-header">
                    <span class="order-id">طلب #${order.id.substring(0, 8)}</span>
                    <span class="order-status ${statusClass}">${getStatusLabel(order.status)}</span>
                </div>
                <div class="order-info">
                    <p><strong>العميل:</strong> ${escapeHtml(order.customerName)}</p>
                    <p><strong>الهاتف:</strong> ${escapeHtml(order.customerPhone)}</p>
                    <p><strong>العنوان:</strong> ${escapeHtml(order.customerAddress)}</p>
                    <p><strong>المنتج:</strong> ${escapeHtml(product.name || 'غير معروف')}</p>
                    <p><strong>السعر:</strong> ${formatPrice(product.price)} د.ع</p>
                    ${product.discountPrice ? `<p><strong>السعر بعد الخصم:</strong> ${formatPrice(product.discountPrice)} د.ع</p>` : ''}
                    <p><strong>تاريخ الطلب:</strong> ${new Date(order.createdAt).toLocaleDateString('ar')}</p>
                </div>
                <form class="order-form" onsubmit="updateOrder(event, '${order.id}')">
                    <div class="form-group">
                        <label for="status-${order.id}">حالة الطلب</label>
                        <select id="status-${order.id}" name="status" required>
                            <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>قيد الانتظار</option>
                            <option value="assigned" ${order.status === 'assigned' ? 'selected' : ''}>مُسند</option>
                            <option value="in_transit" ${order.status === 'in_transit' ? 'selected' : ''}>قيد التوصيل</option>
                            <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>تم التوصيل</option>
                            <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>مكتمل</option>
                            <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>ملغي</option>
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
                    <button type="submit" class="btn-update">تحديث الطلب</button>
                </form>
            </div>
        `;
    }).join('');
}

// Update order
async function updateOrder(e, orderId) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    
    const data = {
        id: orderId,
        status: formData.get('status'),
        shippingPrice: formData.get('shippingPrice') || null,
        paymentReceived: formData.get('paymentReceived') || null
    };

    try {
        const response = await fetch(`${API_BASE}/api/delivery/orders`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
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
            showNotification(result.error || 'حدث خطأ في تحديث الطلب');
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

