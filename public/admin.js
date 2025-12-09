// Global state
let authToken = localStorage.getItem('adminToken');
let currentProducts = [];
let filteredProducts = [];
let currentOrders = [];
let filteredOrders = [];
let editingProductId = null;

// Utility: Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Utility: Show notification (replaces alert)
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--primary)'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        max-width: 400px;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add CSS for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Check authentication on load
window.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        showAdminPanel();
    }
});

// Login
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('passwordInput').value;
    const errorDiv = document.getElementById('loginError');

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const data = await response.json();

        if (response.ok) {
            authToken = data.token;
            localStorage.setItem('adminToken', authToken);
            showAdminPanel();
        } else {
            errorDiv.textContent = data.error || 'كلمة مرور خاطئة';
            errorDiv.classList.remove('hidden');
        }
    } catch (error) {
        errorDiv.textContent = 'حدث خطأ في الاتصال';
        errorDiv.classList.remove('hidden');
    }
});

// Show admin panel
function showAdminPanel() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
    loadProducts();
    loadOrders();
}

// Logout
function logout() {
    localStorage.removeItem('adminToken');
    authToken = null;
    location.reload();
}

// Switch tabs
// Load analytics dashboard
async function loadAnalytics() {
    const container = document.getElementById('analyticsContainer');
    const period = document.getElementById('analyticsPeriod')?.value || 'all';
    
    try {
        container.innerHTML = '<div class="spinner"></div>';
        
        const response = await fetch(`/api/analytics?period=${period}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                logout();
            return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const stats = await response.json();
        renderAnalyticsDashboard(stats);
    } catch (error) {
        console.error('Error loading analytics:', error);
        container.innerHTML = `<div class="alert alert-error">حدث خطأ في تحميل الإحصائيات: ${error.message}</div>`;
    }
}

// Render analytics dashboard
function renderAnalyticsDashboard(stats) {
    const container = document.getElementById('analyticsContainer');
    
    // Overview cards
    const cardsHtml = `
        <div class="analytics-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
            <div class="analytics-card" style="background: var(--card-bg); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border);">
                <h3 style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 0.5rem;">إجمالي الطلبات</h3>
                <p style="font-size: 2rem; font-weight: bold; color: var(--primary); margin: 0;">${stats.orders.total}</p>
            </div>
            <div class="analytics-card" style="background: var(--card-bg); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border);">
                <h3 style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 0.5rem;">طلبات اليوم</h3>
                <p style="font-size: 2rem; font-weight: bold; color: var(--success); margin: 0;">${stats.orders.today}</p>
            </div>
            <div class="analytics-card" style="background: var(--card-bg); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border);">
                <h3 style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 0.5rem;">إجمالي الإيرادات</h3>
                <p style="font-size: 2rem; font-weight: bold; color: var(--success); margin: 0;">${formatPrice(stats.revenue.total)} د.ع</p>
            </div>
            <div class="analytics-card" style="background: var(--card-bg); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border);">
                <h3 style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 0.5rem;">متوسط قيمة الطلب</h3>
                <p style="font-size: 2rem; font-weight: bold; color: var(--primary); margin: 0;">${formatPrice(stats.revenue.averageOrderValue)} د.ع</p>
            </div>
        </div>
    `;
    
    // Charts container
    const chartsHtml = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
            <div style="background: var(--card-bg); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border);">
                <h3 style="margin-bottom: 1rem;">توزيع الطلبات حسب الحالة</h3>
                <canvas id="statusChart" style="max-height: 300px;"></canvas>
            </div>
            <div style="background: var(--card-bg); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border);">
                <h3 style="margin-bottom: 1rem;">الاتجاه اليومي (آخر 30 يوم)</h3>
                <canvas id="trendsChart" style="max-height: 300px;"></canvas>
            </div>
        </div>
    `;
    
    // Top products
    const topProductsHtml = `
        <div style="background: var(--card-bg); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 2rem;">
            <h3 style="margin-bottom: 1rem;">أفضل المنتجات</h3>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>المنتج</th>
                            <th>عدد الطلبات</th>
                            <th>الإيرادات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stats.topProducts.map(product => `
                            <tr>
                                <td>${escapeHtml(product.name)}</td>
                                <td><strong>${product.orders}</strong></td>
                                <td>${formatPrice(product.revenue)} د.ع</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            </div>
        `;
    
    container.innerHTML = cardsHtml + chartsHtml + topProductsHtml;
    
    // Render charts
    renderStatusChart(stats.orders.byStatus);
    renderTrendsChart(stats.dailyTrends || []);
}

// Format price helper
function formatPrice(price) {
    if (!price || isNaN(price)) return '0.00';
    return parseFloat(price).toFixed(2);
}

// Render status pie chart
function renderStatusChart(statusData) {
    const ctx = document.getElementById('statusChart');
    if (!ctx) return;
    
    const statusLabels = {
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
    
    const labels = Object.keys(statusData).map(key => statusLabels[key] || key);
    const data = Object.values(statusData);
    const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF', '#FF6384', '#FF6384'];
    
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// Render trends line chart
function renderTrendsChart(trendsData) {
    const ctx = document.getElementById('trendsChart');
    if (!ctx) return;
    
    const labels = trendsData.map(item => new Date(item.date).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }));
    const ordersData = trendsData.map(item => item.orders);
    const revenueData = trendsData.map(item => item.revenue);
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'الطلبات',
                    data: ordersData,
                    borderColor: '#36A2EB',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    tension: 0.4
                },
                {
                    label: 'الإيرادات (د.ع)',
                    data: revenueData,
                    borderColor: '#4BC0C0',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'الطلبات'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'الإيرادات'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top'
                }
            }
        }
    });
}

function switchTab(tab, eventElement) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (eventElement) {
        eventElement.classList.add('active');
    }

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const tabContent = document.getElementById(tab + 'Tab');
    if (tabContent) {
        tabContent.classList.add('active');
    }
    
    // Load data when switching tabs
    if (tab === 'analytics') {
        loadAnalytics();
    } else if (tab === 'orders') {
        loadOrders();
    } else if (tab === 'products') {
        loadProducts();
    } else if (tab === 'delivery-men') {
        loadDeliveryMenList();
    }
}

// Load products
async function loadProducts() {
    const container = document.getElementById('productsContainer');

    try {
        const response = await fetch('/api/products', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            // If unauthorized, redirect to login
            if (response.status === 401) {
                logout();
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const products = await response.json();
        
        // Check if response is an array
        if (!Array.isArray(products)) {
            throw new Error('Invalid response format');
        }

        currentProducts = products;
        filteredProducts = products;
        
        // Apply filters if any
        applyProductFilters();
    } catch (error) {
        console.error('Error loading products:', error);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-error';
        errorDiv.textContent = `حدث خطأ في تحميل المنتجات: ${error.message}`;
        container.innerHTML = '';
        container.appendChild(errorDiv);
    }
}

// Filter products based on search
function applyProductFilters() {
    const searchTerm = (document.getElementById('productSearch')?.value || '').toLowerCase();
    
    filteredProducts = currentProducts.filter(product => {
        if (searchTerm) {
            const name = (product.name || '').toLowerCase();
            const description = (product.description || '').toLowerCase();
            return name.includes(searchTerm) || description.includes(searchTerm);
        }
        return true;
    });
    
    renderProductsTable();
}

// Alias for filterProducts (called from HTML)
function filterProducts() {
    applyProductFilters();
}

// Render products table
function renderProductsTable() {
    const container = document.getElementById('productsContainer');
    
    if (filteredProducts.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.className = 'text-center';
        emptyMsg.style.cssText = 'color: var(--text-light); padding: 2rem;';
        emptyMsg.textContent = currentProducts.length === 0 
            ? 'لا توجد منتجات بعد. قم بإضافة منتج جديد!' 
            : 'لا توجد نتائج للبحث';
        container.innerHTML = '';
        container.appendChild(emptyMsg);
        return;
    }

    // Create table using DOM methods to prevent XSS
    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';
    
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    
    // Header
    const headerRow = document.createElement('tr');
    ['الصورة', 'اسم المنتج', 'السعر', 'رابط المنتج', 'الإجراءات'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    
    // Rows
    filteredProducts.forEach(product => {
            const row = document.createElement('tr');
            
            // Image cell - show first image or multiple indicator
            const imgCell = document.createElement('td');
            const imgContainer = document.createElement('div');
            imgContainer.style.cssText = 'display: flex; align-items: center; gap: 0.25rem;';
            
            const mediaUrls = product.mediaUrls && product.mediaUrls.length > 0 
                ? product.mediaUrls 
                : (product.mediaUrl ? [product.mediaUrl] : []);
            
            if (mediaUrls.length > 0) {
                const firstMedia = mediaUrls[0];
                if (product.mediaType === 'video' || firstMedia.includes('data:video')) {
                    const video = document.createElement('video');
                    video.src = firstMedia;
                    video.style.cssText = 'width: 60px; height: 60px; object-fit: cover; border-radius: 8px;';
                    imgContainer.appendChild(video);
                } else {
                    const img = document.createElement('img');
                    img.src = firstMedia;
                    img.alt = escapeHtml(product.name);
                    img.style.cssText = 'width: 60px; height: 60px; object-fit: cover; border-radius: 8px;';
                    imgContainer.appendChild(img);
                }
                
                // Show count if multiple images
                if (mediaUrls.length > 1) {
                    const countBadge = document.createElement('span');
                    countBadge.style.cssText = 'background: var(--primary); color: white; font-size: 0.7rem; padding: 0.2rem 0.4rem; border-radius: 10px; font-weight: 600;';
                    countBadge.textContent = `+${mediaUrls.length - 1}`;
                    imgContainer.appendChild(countBadge);
                }
            } else {
                imgContainer.textContent = '📦';
            }
            
            imgCell.appendChild(imgContainer);
            row.appendChild(imgCell);
            
            // Name cell
            const nameCell = document.createElement('td');
            const nameStrong = document.createElement('strong');
            nameStrong.textContent = product.name;
            nameCell.appendChild(nameStrong);
            row.appendChild(nameCell);
            
            // Price cell - show discount if available
            const priceCell = document.createElement('td');
            const priceContainer = document.createElement('div');
            priceContainer.style.cssText = 'display: flex; flex-direction: column; gap: 0.25rem;';
            
            if (product.discountPrice && product.discountPrice < product.price) {
                // Show discounted price
                const discountPriceSpan = document.createElement('span');
                discountPriceSpan.className = 'price';
                discountPriceSpan.style.cssText = 'font-size: 1.2rem; color: var(--success); font-weight: 700;';
                discountPriceSpan.textContent = `${product.discountPrice} د.ل`;
                priceContainer.appendChild(discountPriceSpan);
                
                const originalPriceSpan = document.createElement('span');
                originalPriceSpan.style.cssText = 'font-size: 0.9rem; color: var(--text-light); text-decoration: line-through;';
                originalPriceSpan.textContent = `${product.price} د.ل`;
                priceContainer.appendChild(originalPriceSpan);
                
                const discountPercent = Math.round(((product.price - product.discountPrice) / product.price) * 100);
                const discountBadge = document.createElement('span');
                discountBadge.style.cssText = 'font-size: 0.75rem; background: var(--danger); color: white; padding: 0.2rem 0.5rem; border-radius: 4px; display: inline-block; margin-top: 0.25rem;';
                discountBadge.textContent = `خصم ${discountPercent}%`;
                priceContainer.appendChild(discountBadge);
            } else {
                // Show regular price
                const priceSpan = document.createElement('span');
                priceSpan.className = 'price';
                priceSpan.style.fontSize = '1.2rem';
                priceSpan.textContent = `${product.price} د.ل`;
                priceContainer.appendChild(priceSpan);
            }
            
            priceCell.appendChild(priceContainer);
            row.appendChild(priceCell);
            
            // Link cell
            const linkCell = document.createElement('td');
            const copyBtn = document.createElement('button');
            copyBtn.className = 'btn btn-success btn-sm';
            copyBtn.textContent = '📋 نسخ الرابط';
            copyBtn.onclick = () => copyProductLink(product.id);
            linkCell.appendChild(copyBtn);
            row.appendChild(linkCell);
            
            // Actions cell
            const actionsCell = document.createElement('td');
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'flex gap-1';
            
            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-warning btn-sm';
            editBtn.textContent = '✏️ تعديل';
            editBtn.onclick = () => editProduct(product.id);
            actionsDiv.appendChild(editBtn);
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-danger btn-sm';
            deleteBtn.textContent = '🗑️ حذف';
            deleteBtn.onclick = () => deleteProduct(product.id);
            actionsDiv.appendChild(deleteBtn);
            
            actionsCell.appendChild(actionsDiv);
            row.appendChild(actionsCell);
            
            tbody.appendChild(row);
        });
        
        table.appendChild(thead);
        table.appendChild(tbody);
        tableContainer.appendChild(table);
        container.innerHTML = '';
        container.appendChild(tableContainer);
}

// Get status info
function getStatusInfo(status) {
    const statusMap = {
        'pending': { label: 'قيد الانتظار', class: 'badge badge-warning' },
        'assigned': { label: 'مُسند', class: 'badge badge-info' },
        'preparing': { label: 'قيد التحضير', class: 'badge badge-primary' },
        'in_transit': { label: 'قيد التوصيل', class: 'badge badge-primary' },
        'delivered': { label: 'تم التوصيل', class: 'badge badge-success' },
        'completed': { label: 'مكتمل', class: 'badge badge-success' },
        'cancelled': { label: 'ملغي', class: 'badge badge-danger' },
        'on_hold': { label: 'معلق', class: 'badge badge-secondary' },
        'returned': { label: 'مرتجع', class: 'badge badge-warning' },
        'refunded': { label: 'مسترد', class: 'badge badge-danger' }
    };
    return statusMap[status] || { label: status, class: 'badge badge-secondary' };
}

// Load delivery man info
async function loadDeliveryManInfo(deliveryManId, cell) {
    try {
        const response = await fetch(`/api/delivery/info?id=${deliveryManId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const deliveryMan = await response.json();
            cell.innerHTML = `<div><strong>${escapeHtml(deliveryMan.name)}</strong><br><small>${escapeHtml(deliveryMan.phone)}</small></div>`;
        } else {
            cell.textContent = 'غير متوفر';
            cell.style.color = '#999';
        }
    } catch (error) {
        cell.textContent = 'خطأ في التحميل';
        cell.style.color = '#f44336';
    }
}

// Load orders
async function loadOrders() {
    const container = document.getElementById('ordersContainer');

    try {
        const response = await fetch('/api/orders', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            // If unauthorized, redirect to login
            if (response.status === 401) {
                logout();
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const orders = await response.json();
        
        // Check if response is an array
        if (!Array.isArray(orders)) {
            throw new Error('Invalid response format');
        }

        currentOrders = orders;
        filteredOrders = orders;
        
        // Apply filters if any
        applyFilters();
        
        renderOrdersTable();
    } catch (error) {
        console.error('Error loading orders:', error);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-error';
        errorDiv.textContent = `حدث خطأ في تحميل الطلبات: ${error.message}`;
        container.innerHTML = '';
        container.appendChild(errorDiv);
    }
}

// Filter orders based on search and filters
function applyFilters() {
    const searchTerm = (document.getElementById('orderSearch')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    const dateFrom = document.getElementById('dateFrom')?.value || '';
    const dateTo = document.getElementById('dateTo')?.value || '';
    const sortBy = document.getElementById('orderSortBy')?.value || 'date-desc';
    
    filteredOrders = currentOrders.filter(order => {
        // Search filter
        if (searchTerm) {
            const orderNumber = (order.orderNumber || order.id).toLowerCase();
            const customerName = (order.customerName || '').toLowerCase();
            const customerPhone = (order.customerPhone || '').toLowerCase();
            const customerAddress = (order.customerAddress || '').toLowerCase();
            
            if (!orderNumber.includes(searchTerm) && 
                !customerName.includes(searchTerm) && 
                !customerPhone.includes(searchTerm) &&
                !customerAddress.includes(searchTerm)) {
                return false;
            }
        }
        
        // Status filter
        if (statusFilter && order.status !== statusFilter) {
            return false;
        }
        
        // Date range filter
        if (dateFrom || dateTo) {
            const orderDate = new Date(order.createdAt);
            if (dateFrom && orderDate < new Date(dateFrom)) {
                return false;
            }
            if (dateTo) {
                const toDate = new Date(dateTo);
                toDate.setHours(23, 59, 59, 999); // End of day
                if (orderDate > toDate) {
                    return false;
                }
            }
        }
        
        return true;
    });
    
    // Sort orders
    filteredOrders.sort((a, b) => {
        switch(sortBy) {
            case 'date-desc':
                return new Date(b.createdAt) - new Date(a.createdAt);
            case 'date-asc':
                return new Date(a.createdAt) - new Date(b.createdAt);
            case 'status':
                return (a.status || '').localeCompare(b.status || '');
            case 'customer':
                return (a.customerName || '').localeCompare(b.customerName || '');
            case 'orderNumber':
                const aNum = (a.orderNumber || a.id).toLowerCase();
                const bNum = (b.orderNumber || b.id).toLowerCase();
                return aNum.localeCompare(bNum);
            default:
                return 0;
        }
    });
    
    renderOrdersTable();
}

// Alias for filterOrders (called from HTML)
function filterOrders() {
    applyFilters();
}

// Clear all filters
function clearFilters() {
    document.getElementById('orderSearch').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
    applyFilters();
}

// Render orders table
function renderOrdersTable() {
    const container = document.getElementById('ordersContainer');
    
    if (filteredOrders.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.className = 'text-center';
        emptyMsg.style.cssText = 'color: var(--text-light); padding: 2rem;';
        emptyMsg.textContent = currentOrders.length === 0 ? 'لا توجد طلبات بعد' : 'لا توجد نتائج للبحث';
        container.innerHTML = '';
        container.appendChild(emptyMsg);
        updateSelectedCount();
            return;
        }

    // Create table using DOM methods to prevent XSS
    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';
    
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    
    // Header with checkbox
    const headerRow = document.createElement('tr');
    const checkboxHeader = document.createElement('th');
    checkboxHeader.style.width = '40px';
    const checkboxInput = document.createElement('input');
    checkboxInput.type = 'checkbox';
    checkboxInput.id = 'selectAllHeader';
    checkboxInput.onchange = toggleSelectAll;
    checkboxHeader.appendChild(checkboxInput);
    headerRow.appendChild(checkboxHeader);
    
    ['رقم الطلب', 'المنتج', 'اسم العميل', 'رقم الهاتف', 'العنوان', 'الكمية', 'مندوب التوصيل', 'سعر التوصيل', 'المبلغ المستلم', 'التاريخ', 'الحالة', 'الإجراءات'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    
    // Rows
    filteredOrders.forEach(order => {
            const product = currentProducts.find(p => p.id === order.productId);
            const row = document.createElement('tr');
            row.dataset.orderId = order.id;
            
            // Checkbox cell
            const checkboxCell = document.createElement('td');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'order-checkbox';
            checkbox.value = order.id;
            checkbox.onchange = updateSelectedCount;
            checkboxCell.appendChild(checkbox);
            row.appendChild(checkboxCell);
            
            // Order Number (professional format)
            const idCell = document.createElement('td');
            const idStrong = document.createElement('strong');
            const orderNumber = order.orderNumber || order.id;
            // Display full order number if it's in ORD-YYYY-XXXXX format, otherwise show shortened
            if (orderNumber.startsWith('ORD-')) {
                idStrong.textContent = orderNumber;
                idStrong.style.color = '#2196F3';
            } else {
                idStrong.textContent = `#${orderNumber.substring(0, 8)}`;
            }
            idCell.appendChild(idStrong);
            row.appendChild(idCell);
            
            // Product name
            const productCell = document.createElement('td');
            productCell.textContent = product ? product.name : 'غير معروف';
            row.appendChild(productCell);
            
            // Customer name
            const nameCell = document.createElement('td');
            nameCell.textContent = order.customerName;
            row.appendChild(nameCell);
            
            // Phone
            const phoneCell = document.createElement('td');
            const phoneLink = document.createElement('a');
            phoneLink.href = `tel:${order.customerPhone}`;
            phoneLink.textContent = order.customerPhone;
            phoneCell.appendChild(phoneLink);
            row.appendChild(phoneCell);
            
            // Address
            const addressCell = document.createElement('td');
            addressCell.textContent = order.customerAddress;
            row.appendChild(addressCell);
            
            // Quantity
            const qtyCell = document.createElement('td');
            const qtyStrong = document.createElement('strong');
            qtyStrong.textContent = order.quantity;
            qtyCell.appendChild(qtyStrong);
            row.appendChild(qtyCell);
            
            // Delivery Man
            const deliveryManCell = document.createElement('td');
            if (order.deliveryManId) {
                deliveryManCell.innerHTML = '<span class="text-muted">جاري التحميل...</span>';
                loadDeliveryManInfo(order.deliveryManId, deliveryManCell);
            } else {
                deliveryManCell.textContent = 'غير مُسند';
                deliveryManCell.style.color = '#999';
            }
            row.appendChild(deliveryManCell);
            
            // Shipping Price
            const shippingCell = document.createElement('td');
            shippingCell.textContent = order.shippingPrice ? `${parseFloat(order.shippingPrice).toFixed(2)} د.ع` : '-';
            row.appendChild(shippingCell);
            
            // Payment Received
            const paymentCell = document.createElement('td');
            paymentCell.textContent = order.paymentReceived ? `${parseFloat(order.paymentReceived).toFixed(2)} د.ع` : '-';
            row.appendChild(paymentCell);
            
            // Date
            const dateCell = document.createElement('td');
            dateCell.textContent = new Date(order.createdAt).toLocaleDateString('ar-EG');
            row.appendChild(dateCell);
            
            // Status
            const statusCell = document.createElement('td');
            const statusBadge = document.createElement('span');
            const statusInfo = getStatusInfo(order.status);
            statusBadge.className = statusInfo.class;
            statusBadge.textContent = statusInfo.label;
            statusCell.appendChild(statusBadge);
            row.appendChild(statusCell);
            
            // Actions
            const actionsCell = document.createElement('td');
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'flex gap-1';
            
            // Status update button
            const statusBtn = document.createElement('button');
            statusBtn.className = 'btn btn-primary btn-sm';
            statusBtn.textContent = '🔄 تحديث الحالة';
            statusBtn.onclick = () => openOrderStatusModal(order);
            actionsDiv.appendChild(statusBtn);
            
            // View details button
            const viewBtn = document.createElement('button');
            viewBtn.className = 'btn btn-info btn-sm';
            viewBtn.textContent = '👁️ تفاصيل';
            viewBtn.onclick = () => viewOrderDetails(order);
            actionsDiv.appendChild(viewBtn);
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-danger btn-sm';
            deleteBtn.textContent = '🗑️ حذف';
            deleteBtn.onclick = () => deleteOrder(order.id);
            actionsDiv.appendChild(deleteBtn);
            
            actionsCell.appendChild(actionsDiv);
            row.appendChild(actionsCell);
            
            tbody.appendChild(row);
        });
        
        table.appendChild(thead);
        table.appendChild(tbody);
        tableContainer.appendChild(table);
        container.innerHTML = '';
        container.appendChild(tableContainer);
        
        updateSelectedCount();
}

// Toggle select all orders
function toggleSelectAll() {
    const selectAll = document.getElementById('selectAllOrders') || document.getElementById('selectAllHeader');
    const checkboxes = document.querySelectorAll('.order-checkbox');
    const isChecked = selectAll?.checked || false;
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
    });
    
    if (selectAll && selectAll.id === 'selectAllHeader') {
        const selectAllOrders = document.getElementById('selectAllOrders');
        if (selectAllOrders) selectAllOrders.checked = isChecked;
    }
    
    updateSelectedCount();
}

// Update selected count
function updateSelectedCount() {
    const checkboxes = document.querySelectorAll('.order-checkbox:checked');
    const count = checkboxes.length;
    const countSpan = document.getElementById('selectedCount');
    if (countSpan) countSpan.textContent = count;
    
    // Enable/disable bulk action buttons
    const bulkStatusBtn = document.getElementById('bulkStatusBtn');
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    const bulkExportBtn = document.getElementById('bulkExportBtn');
    if (bulkStatusBtn) bulkStatusBtn.disabled = count === 0;
    if (bulkDeleteBtn) bulkDeleteBtn.disabled = count === 0;
    if (bulkExportBtn) bulkExportBtn.disabled = count === 0;
    
    // Update select all checkbox
    const selectAll = document.getElementById('selectAllOrders');
    if (selectAll) {
        const allCheckboxes = document.querySelectorAll('.order-checkbox');
        selectAll.checked = allCheckboxes.length > 0 && checkboxes.length === allCheckboxes.length;
    }
}

// Bulk update status
async function bulkUpdateStatus() {
    const checkboxes = document.querySelectorAll('.order-checkbox:checked');
    if (checkboxes.length === 0) {
        showNotification('الرجاء تحديد طلب واحد على الأقل', 'error');
        return;
    }
    
    const status = prompt('أدخل الحالة الجديدة (pending, assigned, preparing, in_transit, delivered, completed, cancelled, on_hold):');
    if (!status) return;
    
    const validStatuses = ['pending', 'assigned', 'preparing', 'in_transit', 'delivered', 'completed', 'cancelled', 'on_hold'];
    if (!validStatuses.includes(status)) {
        showNotification('حالة غير صحيحة', 'error');
        return;
    }
    
    const orderIds = Array.from(checkboxes).map(cb => cb.value);
    let successCount = 0;
    let failCount = 0;
    
    for (const orderId of orderIds) {
        try {
            const response = await fetch('/api/orders', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ id: orderId, status: status })
            });
            
            if (response.ok) {
                successCount++;
            } else {
                failCount++;
            }
    } catch (error) {
            failCount++;
        }
    }
    
    showNotification(`تم تحديث ${successCount} طلب${failCount > 0 ? `، فشل ${failCount}` : ''}`, successCount > 0 ? 'success' : 'error');
    await loadOrders();
}

// Export orders
function exportOrders() {
    const ordersToExport = filteredOrders.length > 0 ? filteredOrders : currentOrders;
    exportOrdersToCSV(ordersToExport);
}

// Bulk export
function bulkExport() {
    const checkboxes = document.querySelectorAll('.order-checkbox:checked');
    if (checkboxes.length === 0) {
        showNotification('الرجاء تحديد طلب واحد على الأقل', 'error');
        return;
    }
    
    const orderIds = Array.from(checkboxes).map(cb => cb.value);
    const ordersToExport = currentOrders.filter(order => orderIds.includes(order.id));
    exportOrdersToCSV(ordersToExport);
}

// Export orders to CSV
function exportOrdersToCSV(orders) {
    if (orders.length === 0) {
        showNotification('لا توجد طلبات للتصدير', 'error');
        return;
    }
    
    // CSV headers
    const headers = ['رقم الطلب', 'المنتج', 'اسم العميل', 'رقم الهاتف', 'العنوان', 'الكمية', 'الحالة', 'سعر التوصيل', 'المبلغ المستلم', 'تاريخ الإنشاء'];
    
    // CSV rows
    const rows = orders.map(order => {
        const product = currentProducts.find(p => p.id === order.productId);
        const orderNumber = order.orderNumber || order.id;
        const statusInfo = getStatusInfo(order.status);
        
        return [
            orderNumber,
            product ? product.name : 'غير معروف',
            order.customerName || '',
            order.customerPhone || '',
            order.customerAddress || '',
            order.quantity || 0,
            statusInfo.label,
            order.shippingPrice ? parseFloat(order.shippingPrice).toFixed(2) : '',
            order.paymentReceived ? parseFloat(order.paymentReceived).toFixed(2) : '',
            new Date(order.createdAt).toLocaleDateString('ar-EG')
        ];
    });
    
    // Create CSV content
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    // Add BOM for Excel UTF-8 support
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `orders_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification(`تم تصدير ${orders.length} طلب بنجاح`, 'success');
}

// Open product modal
function openProductModal(productId = null) {
    editingProductId = productId;
    const modal = document.getElementById('productModal');
    const form = document.getElementById('productForm');
    const title = document.getElementById('modalTitle');

    form.reset();
    document.getElementById('currentMedia').innerHTML = '';

    if (productId) {
        const product = currentProducts.find(p => p.id === productId);
        if (product) {
            title.textContent = 'تعديل المنتج';
            document.getElementById('productId').value = product.id;
            document.getElementById('productName').value = product.name;
            document.getElementById('productPrice').value = product.price;
            document.getElementById('productDiscountPrice').value = product.discountPrice || '';
            document.getElementById('productDescription').value = product.description || '';

            // Show current media (handle multiple images)
            const currentMediaDiv = document.getElementById('currentMedia');
            currentMediaDiv.innerHTML = '';
            
            const mediaUrls = product.mediaUrls && product.mediaUrls.length > 0 
                ? product.mediaUrls 
                : (product.mediaUrl ? [product.mediaUrl] : []);
            
            if (mediaUrls.length > 0) {
                const label = document.createElement('p');
                label.style.cssText = 'color: var(--text-light); margin-bottom: 0.5rem; font-weight: 600;';
                label.textContent = `الصور الحالية (${mediaUrls.length}):`;
                currentMediaDiv.appendChild(label);
                
                const mediaContainer = document.createElement('div');
                mediaContainer.style.cssText = 'display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem;';
                
                mediaUrls.forEach((url, index) => {
                    const mediaWrapper = document.createElement('div');
                    mediaWrapper.style.cssText = 'position: relative;';
                    
                    if (product.mediaType === 'video' || url.includes('data:video')) {
                        const video = document.createElement('video');
                        video.src = url;
                        video.controls = true;
                        video.style.cssText = 'max-width: 150px; max-height: 150px; border-radius: 8px; object-fit: cover;';
                        mediaWrapper.appendChild(video);
                    } else {
                        const img = document.createElement('img');
                        img.src = url;
                        img.alt = `صورة ${index + 1}`;
                        img.style.cssText = 'max-width: 150px; max-height: 150px; border-radius: 8px; object-fit: cover; border: 2px solid var(--border);';
                        mediaWrapper.appendChild(img);
                    }
                    
                    mediaContainer.appendChild(mediaWrapper);
                });
                
                currentMediaDiv.appendChild(mediaContainer);
            }
        }
    } else {
        title.textContent = 'إضافة منتج جديد';
    }

    modal.classList.add('active');
}

// Close product modal
function closeProductModal() {
    document.getElementById('productModal').classList.remove('active');
    editingProductId = null;
}

// Product form submit
document.getElementById('productForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'جاري الحفظ...';

    try {
        let mediaUrls = [];
        let mediaType = 'image';

        // Upload media files if selected (handle multiple files)
        const mediaFiles = document.getElementById('productMedia').files;
        if (mediaFiles && mediaFiles.length > 0) {
            for (let i = 0; i < mediaFiles.length; i++) {
                const mediaFile = mediaFiles[i];

                // Convert file to base64
                const reader = new FileReader();
                const base64Promise = new Promise((resolve, reject) => {
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(mediaFile);
                });

                try {
                    const base64Data = await base64Promise;
                    mediaType = mediaFile.type.startsWith('video/') ? 'video' : 'image';

                    const uploadResponse = await fetch('/api/upload', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authToken}`
                        },
                        body: JSON.stringify({
                            mediaData: base64Data,
                            mediaType: mediaType
                        })
                    });

                    if (uploadResponse.ok) {
                        const uploadData = await uploadResponse.json();
                        mediaUrls.push(uploadData.mediaUrl);
                    } else {
                        const errorData = await uploadResponse.json().catch(() => ({}));
                        showNotification(errorData.error || 'حدث خطأ في رفع الملف', 'error');
                        submitButton.disabled = false;
                        submitButton.textContent = '💾 حفظ';
                        return;
                    }
                } catch (error) {
                    showNotification('حدث خطأ في قراءة الملف', 'error');
                    submitButton.disabled = false;
                    submitButton.textContent = '💾 حفظ';
                    return;
                }
            }
        } else if (editingProductId) {
            // Keep existing media if no new file uploaded
            const product = currentProducts.find(p => p.id === editingProductId);
            if (product) {
                mediaUrls = product.mediaUrls || (product.mediaUrl ? [product.mediaUrl] : []);
                mediaType = product.mediaType;
            }
        }

        // Validate form data
        const name = document.getElementById('productName').value.trim();
        const price = parseFloat(document.getElementById('productPrice').value);
        const discountPrice = document.getElementById('productDiscountPrice').value ?
            parseFloat(document.getElementById('productDiscountPrice').value) : null;

        if (!name || name.length === 0) {
            showNotification('اسم المنتج مطلوب', 'error');
            submitButton.disabled = false;
            submitButton.textContent = '💾 حفظ';
            return;
        }

        if (isNaN(price) || price < 0) {
            showNotification('السعر غير صحيح', 'error');
            submitButton.disabled = false;
            submitButton.textContent = '💾 حفظ';
            return;
        }

        if (discountPrice !== null && (isNaN(discountPrice) || discountPrice < 0 || discountPrice >= price)) {
            showNotification('سعر الخصم غير صحيح', 'error');
            submitButton.disabled = false;
            submitButton.textContent = '💾 حفظ';
            return;
        }

        // Filter out empty media URLs and ensure all are valid
        const validMediaUrls = mediaUrls
            .filter(url => {
                if (!url) return false;
                const urlStr = typeof url === 'string' ? url.trim() : String(url);
                return urlStr !== '' && urlStr !== 'null' && urlStr !== 'undefined' && urlStr.length > 10;
            })
            .map(url => typeof url === 'string' ? url.trim() : String(url));
        
        console.log('Saving product with media URLs:', validMediaUrls.length, validMediaUrls);

        // Create/update product
        const productData = {
            name: name,
            price: price,
            discountPrice: discountPrice,
            description: document.getElementById('productDescription').value.trim(),
            mediaUrls: validMediaUrls,
            mediaUrl: validMediaUrls[0] || '', // Keep first image as main for backward compatibility
            mediaType: mediaType
        };

        if (editingProductId) {
            productData.id = editingProductId;
        }

        const url = '/api/products';
        const method = editingProductId ? 'PUT' : 'POST';

        // Check if auth token exists
        if (!authToken) {
            showNotification('يجب تسجيل الدخول أولاً', 'error');
            submitButton.disabled = false;
            submitButton.textContent = '💾 حفظ';
            logout();
            return;
        }

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(productData)
        });

        if (response.ok) {
            closeProductModal();
            await loadProducts();
            showNotification(editingProductId ? 'تم تحديث المنتج بنجاح!' : 'تم إضافة المنتج بنجاح!', 'success');
        } else {
            const errorData = await response.json().catch(() => ({}));
            
            // Show detailed error message
            let errorMessage = 'حدث خطأ في حفظ المنتج';
            if (response.status === 401) {
                errorMessage = 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى';
                logout();
            } else if (response.status === 400) {
                if (errorData.errors && Array.isArray(errorData.errors)) {
                    errorMessage = `خطأ في التحقق: ${errorData.errors.join(', ')}`;
                } else if (errorData.error) {
                    errorMessage = errorData.error;
                }
            } else if (errorData.error) {
                errorMessage = errorData.error;
            }
            
            showNotification(errorMessage, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('حدث خطأ في الاتصال', 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = '💾 حفظ';
    }
});

// Edit product
function editProduct(productId) {
    openProductModal(productId);
}

// Delete product
async function deleteProduct(productId) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;

    try {
        const response = await fetch(`/api/products?id=${productId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            await loadProducts();
            showNotification('تم حذف المنتج بنجاح', 'success');
        } else {
            const errorData = await response.json().catch(() => ({}));
            showNotification(errorData.error || errorData.message || 'حدث خطأ في حذف المنتج', 'error');
        }
    } catch (error) {
        showNotification('حدث خطأ في الاتصال', 'error');
    }
}

// Copy product link
function copyProductLink(productId) {
    // Use dynamic base URL (works in all environments)
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/product.html?id=${productId}`;
    navigator.clipboard.writeText(link).then(() => {
        showNotification('تم نسخ رابط المنتج! 🎉', 'success');
    }).catch(() => {
        showNotification('فشل نسخ الرابط', 'error');
    });
}

// Global delivery men list
let deliveryMenList = [];

// Load delivery men list
async function loadDeliveryMen() {
    try {
        const response = await fetch('/api/delivery/list', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            deliveryMenList = await response.json();
            return deliveryMenList;
        }
        return [];
    } catch (error) {
        console.error('Error loading delivery men:', error);
        return [];
    }
}

// Open order status update modal
async function openOrderStatusModal(order) {
    // Load delivery men if not loaded
    if (deliveryMenList.length === 0) {
        await loadDeliveryMen();
    }

    // Create modal if it doesn't exist
    let modal = document.getElementById('orderStatusModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'orderStatusModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>تحديث حالة الطلب</h2>
                    <button class="close-btn" onclick="closeOrderStatusModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <p><strong>رقم الطلب:</strong> <span id="modalOrderNumber"></span></p>
                    <p><strong>الحالة الحالية:</strong> <span id="modalCurrentStatus"></span></p>
                    <div class="form-group">
                        <label for="orderDeliveryManSelect">مندوب التوصيل:</label>
                        <select id="orderDeliveryManSelect" class="form-control">
                            <option value="">غير مُسند</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="orderStatusSelect">الحالة الجديدة:</label>
                        <select id="orderStatusSelect" class="form-control">
                            <option value="pending">قيد الانتظار</option>
                            <option value="assigned">مُسند</option>
                            <option value="preparing">قيد التحضير</option>
                            <option value="in_transit">قيد التوصيل</option>
                            <option value="delivered">تم التوصيل</option>
                            <option value="completed">مكتمل</option>
                            <option value="on_hold">معلق</option>
                            <option value="cancelled">ملغي</option>
                            <option value="returned">مرتجع</option>
                            <option value="refunded">مسترد</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="orderShippingPrice">سعر التوصيل (د.ع):</label>
                        <input type="number" id="orderShippingPrice" class="form-control" step="0.01" placeholder="0.00">
                    </div>
                    <div class="form-group">
                        <label for="orderPaymentReceived">المبلغ المستلم (د.ع):</label>
                        <input type="number" id="orderPaymentReceived" class="form-control" step="0.01" placeholder="0.00">
                    </div>
                    <div class="form-group">
                        <label for="orderNotes">ملاحظات:</label>
                        <textarea id="orderNotes" class="form-control" rows="3" placeholder="ملاحظات إضافية..."></textarea>
                    </div>
                    <button class="btn btn-primary" onclick="updateOrderStatus()">💾 حفظ التغييرات</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Populate delivery men dropdown
    const deliveryManSelect = document.getElementById('orderDeliveryManSelect');
    deliveryManSelect.innerHTML = '<option value="">غير مُسند</option>';
    deliveryMenList.forEach(dm => {
        const option = document.createElement('option');
        option.value = dm.id;
        option.textContent = `${dm.name} - ${dm.phone}`;
        deliveryManSelect.appendChild(option);
    });

    // Populate modal with order data
    const orderNumber = order.orderNumber || order.id;
    document.getElementById('modalOrderNumber').textContent = orderNumber;
    const currentStatusInfo = getStatusInfo(order.status);
    document.getElementById('modalCurrentStatus').innerHTML = `<span class="${currentStatusInfo.class}">${currentStatusInfo.label}</span>`;
    document.getElementById('orderStatusSelect').value = order.status;
    document.getElementById('orderDeliveryManSelect').value = order.deliveryManId || '';
    document.getElementById('orderShippingPrice').value = order.shippingPrice || '';
    document.getElementById('orderPaymentReceived').value = order.paymentReceived || '';
    document.getElementById('orderNotes').value = '';

    // Store current order ID
    modal.dataset.orderId = order.id;

    modal.classList.add('active');
}

// Close order status modal
function closeOrderStatusModal() {
    const modal = document.getElementById('orderStatusModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Update order status
async function updateOrderStatus() {
    const modal = document.getElementById('orderStatusModal');
    if (!modal) return;

    const orderId = modal.dataset.orderId;
    const status = document.getElementById('orderStatusSelect').value;
    const deliveryManId = document.getElementById('orderDeliveryManSelect').value;
    const shippingPrice = document.getElementById('orderShippingPrice').value;
    const paymentReceived = document.getElementById('orderPaymentReceived').value;
    const notes = document.getElementById('orderNotes').value;

    try {
        const response = await fetch('/api/orders', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                id: orderId,
                status: status,
                deliveryManId: deliveryManId || null,
                shippingPrice: shippingPrice || null,
                paymentReceived: paymentReceived || null,
                notes: notes
            })
        });

        if (response.ok) {
            closeOrderStatusModal();
            await loadOrders();
            showNotification('تم تحديث حالة الطلب بنجاح!', 'success');
        } else {
            const errorData = await response.json().catch(() => ({}));
            showNotification(errorData.error || 'حدث خطأ في تحديث الطلب', 'error');
        }
    } catch (error) {
        showNotification('حدث خطأ في الاتصال', 'error');
    }
}

// View order details
function viewOrderDetails(order) {
    const product = currentProducts.find(p => p.id === order.productId);
    const statusInfo = getStatusInfo(order.status);
    
    let details = `رقم الطلب: ${order.orderNumber || order.id}\n\n`;
    details += `المنتج: ${product ? product.name : 'غير معروف'}\n`;
    details += `اسم العميل: ${order.customerName}\n`;
    details += `رقم الهاتف: ${order.customerPhone}\n`;
    details += `العنوان: ${order.customerAddress}\n`;
    details += `الكمية: ${order.quantity}\n`;
    details += `الحالة: ${statusInfo.label}\n`;
    if (order.shippingPrice) details += `سعر التوصيل: ${parseFloat(order.shippingPrice).toFixed(2)} د.ع\n`;
    if (order.paymentReceived) details += `المبلغ المستلم: ${parseFloat(order.paymentReceived).toFixed(2)} د.ع\n`;
    details += `تاريخ الإنشاء: ${new Date(order.createdAt).toLocaleString('ar-EG')}\n`;
    if (order.updatedAt) details += `آخر تحديث: ${new Date(order.updatedAt).toLocaleString('ar-EG')}\n`;
    
    if (order.statusHistory && order.statusHistory.length > 0) {
        details += `\n--- تاريخ التغييرات ---\n`;
        order.statusHistory.forEach((entry, index) => {
            const statusInfo = getStatusInfo(entry.status);
            details += `${index + 1}. ${statusInfo.label} - ${new Date(entry.timestamp).toLocaleString('ar-EG')}\n`;
            if (entry.notes) details += `   ${entry.notes}\n`;
        });
    }
    
    alert(details);
}

// Delete order
async function deleteOrder(orderId) {
    if (!confirm('هل أنت متأكد من حذف هذا الطلب؟')) return;

    try {
        const response = await fetch(`/api/orders?id=${orderId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            await loadOrders();
            showNotification('تم حذف الطلب بنجاح', 'success');
        } else {
            const errorData = await response.json().catch(() => ({}));
            showNotification(errorData.error || 'حدث خطأ في حذف الطلب', 'error');
        }
    } catch (error) {
        showNotification('حدث خطأ في الاتصال', 'error');
    }
}

// Load and render delivery men list (for management tab)
async function loadDeliveryMenList() {
    const container = document.getElementById('deliveryMenContainer');
    if (!container) return;
    
    try {
        container.innerHTML = '<div class="spinner"></div>';
        
        const response = await fetch('/api/delivery/list', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                logout();
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const deliveryMen = await response.json();
        deliveryMenList = deliveryMen;
        
        if (deliveryMen.length === 0) {
            container.innerHTML = '<div class="text-center" style="padding: 2rem; color: var(--text-light);">لا يوجد مندوبو توصيل مسجلون</div>';
            return;
        }

        // Get orders to calculate stats
        const ordersResponse = await fetch('/api/orders', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        const orders = ordersResponse.ok ? await ordersResponse.json() : [];

        // Calculate stats for each delivery man
        const deliveryMenWithStats = deliveryMen.map(dm => {
            const dmOrders = orders.filter(o => o.deliveryManId === dm.id);
            const delivered = dmOrders.filter(o => o.status === 'delivered' || o.status === 'completed').length;
            const inTransit = dmOrders.filter(o => o.status === 'in_transit').length;
            const totalRevenue = dmOrders.reduce((sum, o) => sum + (parseFloat(o.shippingPrice) || 0), 0);
            
            return {
                ...dm,
                totalOrders: dmOrders.length,
                delivered: delivered,
                inTransit: inTransit,
                totalRevenue: totalRevenue
            };
        });

        // Render table
        const tableContainer = document.createElement('div');
        tableContainer.className = 'table-container';
        
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const tbody = document.createElement('tbody');
        
        // Header
        const headerRow = document.createElement('tr');
        ['الاسم', 'رقم الهاتف', 'إجمالي الطلبات', 'تم التوصيل', 'قيد التوصيل', 'إجمالي الإيرادات', 'تاريخ التسجيل'].forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        
        // Rows
        deliveryMenWithStats.forEach(dm => {
            const row = document.createElement('tr');
            
            // Name
            const nameCell = document.createElement('td');
            nameCell.textContent = dm.name;
            row.appendChild(nameCell);
            
            // Phone
            const phoneCell = document.createElement('td');
            const phoneLink = document.createElement('a');
            phoneLink.href = `tel:${dm.phone}`;
            phoneLink.textContent = dm.phone;
            phoneCell.appendChild(phoneLink);
            row.appendChild(phoneCell);
            
            // Total orders
            const totalCell = document.createElement('td');
            totalCell.innerHTML = `<strong>${dm.totalOrders}</strong>`;
            row.appendChild(totalCell);
            
            // Delivered
            const deliveredCell = document.createElement('td');
            deliveredCell.innerHTML = `<span class="badge badge-success">${dm.delivered}</span>`;
            row.appendChild(deliveredCell);
            
            // In transit
            const transitCell = document.createElement('td');
            transitCell.innerHTML = `<span class="badge badge-primary">${dm.inTransit}</span>`;
            row.appendChild(transitCell);
            
            // Revenue
            const revenueCell = document.createElement('td');
            revenueCell.innerHTML = `<strong>${formatPrice(dm.totalRevenue)} د.ع</strong>`;
            row.appendChild(revenueCell);
            
            // Created date
            const dateCell = document.createElement('td');
            dateCell.textContent = dm.createdAt ? new Date(dm.createdAt).toLocaleDateString('ar-EG') : '-';
            row.appendChild(dateCell);
            
            tbody.appendChild(row);
        });
        
        table.appendChild(thead);
        table.appendChild(tbody);
        tableContainer.appendChild(table);
        container.innerHTML = '';
        container.appendChild(tableContainer);
    } catch (error) {
        console.error('Error loading delivery men:', error);
        container.innerHTML = `<div class="alert alert-error">حدث خطأ في تحميل مندوبي التوصيل: ${error.message}</div>`;
    }
}
