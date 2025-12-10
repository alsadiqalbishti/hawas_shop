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

// Render orders - Compact list view
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

    // Create compact table view
    const table = document.createElement('table');
    table.style.cssText = 'width: 100%; border-collapse: collapse; background: var(--white); border-radius: var(--radius-lg); overflow: hidden;';
    
    // Table header
    const thead = document.createElement('thead');
    thead.style.cssText = 'background: var(--light);';
    thead.innerHTML = `
        <tr>
            <th style="padding: var(--space-3); text-align: right; font-weight: 600;">رقم الطلب</th>
            <th style="padding: var(--space-3); text-align: right; font-weight: 600;">العميل</th>
            <th style="padding: var(--space-3); text-align: right; font-weight: 600;">الهاتف</th>
            <th style="padding: var(--space-3); text-align: right; font-weight: 600;">المنتج</th>
            <th style="padding: var(--space-3); text-align: right; font-weight: 600;">الحالة</th>
            <th style="padding: var(--space-3); text-align: center; font-weight: 600;">الإجراءات</th>
        </tr>
    `;
    table.appendChild(thead);
    
    // Table body
    const tbody = document.createElement('tbody');
    
    orders.forEach(order => {
        const product = order.product || {};
        const statusBadgeClass = getStatusBadgeClass(order.status);
        const orderNumber = order.orderNumber || order.id;
        const displayOrderNumber = orderNumber.startsWith('ORD-') ? orderNumber : `#${orderNumber.substring(0, 8)}`;
        
        const row = document.createElement('tr');
        row.style.cssText = 'border-bottom: 1px solid var(--border-light); cursor: pointer; transition: background 0.2s;';
        row.onmouseenter = () => row.style.background = 'var(--light)';
        row.onmouseleave = () => row.style.background = '';
        row.onclick = (e) => {
            if (e.target.closest('button') || e.target.closest('form')) return;
            openDeliveryOrderDetailModal(order);
        };
        
        // Order number cell
        const orderNumCell = document.createElement('td');
        orderNumCell.style.cssText = 'padding: var(--space-3); font-weight: 600; color: var(--primary);';
        orderNumCell.textContent = displayOrderNumber;
        
        // Customer cell
        const customerCell = document.createElement('td');
        customerCell.style.cssText = 'padding: var(--space-3);';
        customerCell.textContent = order.customerName;
        
        // Phone cell
        const phoneCell = document.createElement('td');
        phoneCell.style.cssText = 'padding: var(--space-3);';
        const phoneLink = document.createElement('a');
        phoneLink.href = `tel:${order.customerPhone}`;
        phoneLink.style.cssText = 'color: var(--primary); text-decoration: none;';
        phoneLink.textContent = order.customerPhone;
        phoneLink.onclick = (e) => e.stopPropagation();
        phoneCell.appendChild(phoneLink);
        
        // Product cell
        const productCell = document.createElement('td');
        productCell.style.cssText = 'padding: var(--space-3); color: var(--text-light);';
        productCell.textContent = product.name || 'غير معروف';
        
        // Status cell
        const statusCell = document.createElement('td');
        statusCell.style.cssText = 'padding: var(--space-3);';
        const statusBadge = document.createElement('span');
        statusBadge.className = statusBadgeClass;
        statusBadge.textContent = getStatusLabel(order.status);
        statusCell.appendChild(statusBadge);
        
        // Actions cell
        const actionsCell = document.createElement('td');
        actionsCell.style.cssText = 'padding: var(--space-3); text-align: center;';
        actionsCell.onclick = (e) => e.stopPropagation();
        
        // Quick action button based on status
        if (order.status === 'assigned') {
            const quickBtn = document.createElement('button');
            quickBtn.className = 'btn btn-info btn-sm';
            quickBtn.style.cssText = 'margin: 0 2px;';
            quickBtn.textContent = '⏳ بدء التحضير';
            quickBtn.onclick = () => quickUpdate(order.id, 'preparing');
            actionsCell.appendChild(quickBtn);
        } else if (order.status === 'preparing') {
            const quickBtn = document.createElement('button');
            quickBtn.className = 'btn btn-primary btn-sm';
            quickBtn.style.cssText = 'margin: 0 2px;';
            quickBtn.textContent = '🚚 بدء التوصيل';
            quickBtn.onclick = () => quickUpdate(order.id, 'in_transit');
            actionsCell.appendChild(quickBtn);
        } else if (order.status === 'in_transit') {
            const quickBtn = document.createElement('button');
            quickBtn.className = 'btn btn-success btn-sm';
            quickBtn.style.cssText = 'margin: 0 2px;';
            quickBtn.textContent = '✅ تم التوصيل';
            quickBtn.onclick = () => quickUpdate(order.id, 'delivered');
            actionsCell.appendChild(quickBtn);
        }
        
        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn btn-info btn-sm';
        viewBtn.style.cssText = 'margin: 0 2px;';
        viewBtn.textContent = '👁️';
        viewBtn.onclick = () => openDeliveryOrderDetailModal(order);
        actionsCell.appendChild(viewBtn);
        
        row.appendChild(orderNumCell);
        row.appendChild(customerCell);
        row.appendChild(phoneCell);
        row.appendChild(productCell);
        row.appendChild(statusCell);
        row.appendChild(actionsCell);
        
        tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);
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

// Open delivery order detail modal
function openDeliveryOrderDetailModal(order) {
    const product = order.product || {};
    const statusBadgeClass = getStatusBadgeClass(order.status);
    const orderNumber = order.orderNumber || order.id;
    const displayOrderNumber = orderNumber.startsWith('ORD-') ? orderNumber : `#${orderNumber.substring(0, 8)}`;
    
    // Create modal if it doesn't exist
    let modal = document.getElementById('deliveryOrderDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'deliveryOrderDetailModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2>تفاصيل الطلب</h2>
                    <button class="modal-close" onclick="closeDeliveryOrderDetailModal()">✕</button>
                </div>
                <div class="modal-body" id="deliveryOrderDetailContent">
                    <!-- Content will be populated here -->
                </div>
                <div class="modal-footer" style="padding: var(--space-4); border-top: 1px solid var(--border-light);">
                    <button class="btn btn-secondary" onclick="closeDeliveryOrderDetailModal()">إغلاق</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    const content = document.getElementById('deliveryOrderDetailContent');
    
    let html = `
        <div style="display: grid; gap: var(--space-4);">
            <div style="background: var(--light); padding: var(--space-4); border-radius: var(--radius-lg);">
                <h3 style="margin-bottom: var(--space-3); color: var(--primary);">معلومات الطلب</h3>
                <div style="display: grid; gap: var(--space-2);">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600;">رقم الطلب:</span>
                        <span>${displayOrderNumber}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600;">الحالة:</span>
                        <span class="${statusBadgeClass}">${getStatusLabel(order.status)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600;">تاريخ الإنشاء:</span>
                        <span>${new Date(order.createdAt).toLocaleString('ar-EG')}</span>
                    </div>
                </div>
            </div>
            
            <div style="background: var(--light); padding: var(--space-4); border-radius: var(--radius-lg);">
                <h3 style="margin-bottom: var(--space-3); color: var(--primary);">معلومات العميل</h3>
                <div style="display: grid; gap: var(--space-2);">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600;">الاسم:</span>
                        <span>${escapeHtml(order.customerName)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600;">الهاتف:</span>
                        <a href="tel:${order.customerPhone}" style="color: var(--primary);">${order.customerPhone} 📞</a>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <span style="font-weight: 600;">العنوان:</span>
                        <span style="text-align: left; max-width: 60%; word-break: break-word;">${escapeHtml(order.customerAddress)}</span>
                    </div>
                </div>
            </div>
            
            <div style="background: var(--light); padding: var(--space-4); border-radius: var(--radius-lg);">
                <h3 style="margin-bottom: var(--space-3); color: var(--primary);">معلومات المنتج</h3>
                <div style="display: grid; gap: var(--space-2);">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600;">المنتج:</span>
                        <span>${escapeHtml(product.name || 'غير معروف')}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600;">الكمية:</span>
                        <span>${order.quantity || 1}</span>
                    </div>
                    ${product.price ? `
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600;">السعر:</span>
                        <span>${formatPrice(product.price)} د.ع</span>
                    </div>
                    ${product.discountPrice ? `
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600;">السعر بعد الخصم:</span>
                        <span style="color: var(--success); font-weight: 600;">${formatPrice(product.discountPrice)} د.ع</span>
                    </div>
                    ` : ''}
                    ` : ''}
                </div>
            </div>
            
            ${order.shippingPrice || order.paymentReceived ? `
            <div style="background: var(--light); padding: var(--space-4); border-radius: var(--radius-lg);">
                <h3 style="margin-bottom: var(--space-3); color: var(--primary);">المعلومات المالية</h3>
                <div style="display: grid; gap: var(--space-2);">
                    ${order.shippingPrice ? `
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600;">سعر التوصيل:</span>
                        <span>${formatPrice(order.shippingPrice)} د.ع</span>
                    </div>
                    ` : ''}
                    ${order.paymentReceived ? `
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600;">المبلغ المستلم:</span>
                        <span style="color: var(--success); font-weight: 600;">${formatPrice(order.paymentReceived)} د.ع</span>
                    </div>
                    ` : ''}
                </div>
            </div>
            ` : ''}
            
            <div style="background: var(--light); padding: var(--space-4); border-radius: var(--radius-lg);">
                <h3 style="margin-bottom: var(--space-3); color: var(--primary);">تحديث الطلب</h3>
                <form onsubmit="updateOrder(event, '${order.id}'); closeDeliveryOrderDetailModal(); return false;">
                    <div style="display: grid; gap: var(--space-3);">
                        <div>
                            <label class="form-label" for="delivery-status-${order.id}">حالة الطلب</label>
                            <select id="delivery-status-${order.id}" name="status" class="form-input" required style="width: 100%;">
                                <option value="preparing" ${order.status === 'preparing' ? 'selected' : ''}>قيد التحضير</option>
                                <option value="in_transit" ${order.status === 'in_transit' ? 'selected' : ''}>قيد التوصيل</option>
                                <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>تم التوصيل</option>
                                <option value="returned" ${order.status === 'returned' ? 'selected' : ''}>استرجاع</option>
                                <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>ملغية</option>
                            </select>
                        </div>
                        <div>
                            <label class="form-label" for="delivery-shippingPrice-${order.id}">سعر التوصيل (د.ع)</label>
                            <input type="number" id="delivery-shippingPrice-${order.id}" name="shippingPrice" class="form-input"
                                   value="${order.shippingPrice || ''}" step="0.01" min="0" placeholder="0.00" style="width: 100%;">
                        </div>
                        <div>
                            <label class="form-label" for="delivery-paymentReceived-${order.id}">المبلغ المستلم (د.ع)</label>
                            <input type="number" id="delivery-paymentReceived-${order.id}" name="paymentReceived" class="form-input"
                                   value="${order.paymentReceived || ''}" step="0.01" min="0" placeholder="0.00" style="width: 100%;">
                        </div>
                        <button type="submit" class="btn btn-primary" style="width: 100%;">💾 تحديث الطلب</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    content.innerHTML = html;
    modal.classList.add('active');
}

// Close delivery order detail modal
function closeDeliveryOrderDetailModal() {
    const modal = document.getElementById('deliveryOrderDetailModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


