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
    loadStorageUsage();
}

// Logout
function logout() {
    localStorage.removeItem('adminToken');
    authToken = null;
    location.reload();
}

// Load storage usage
async function loadStorageUsage() {
    try {
        const response = await fetch('/api/storage', {
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

        const storage = await response.json();
        renderStorageUsage(storage);
    } catch (error) {
        console.error('Error loading storage usage:', error);
        const storageText = document.getElementById('storageText');
        if (storageText) {
            storageText.textContent = 'خطأ في التحميل';
        }
    }
}

// Render storage usage
function renderStorageUsage(storage) {
    const storageText = document.getElementById('storageText');
    const storageFill = document.getElementById('storageFill');
    const storageTooltip = document.getElementById('storageTooltip');
    if (!storageText) return;
    
    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };
    
    const used = formatBytes(storage.total.used);
    const free = formatBytes(storage.total.free);
    const max = formatBytes(storage.total.max);
    const percent = storage.total.percent;
    
    // Update text
    storageText.textContent = `${used} / ${max} (${percent.toFixed(1)}%)`;
    
    // Update progress bar
    if (storageFill) {
        storageFill.style.width = `${percent}%`;
        // Color based on usage
        if (percent > 80) {
            storageFill.style.background = 'var(--danger)';
        } else if (percent > 60) {
            storageFill.style.background = 'var(--warning)';
        } else {
            storageFill.style.background = 'var(--success)';
        }
    }
    
    // Update tooltip
    if (storageTooltip) {
        storageTooltip.innerHTML = `
            <strong>تفاصيل التخزين:</strong><br>
            المنتجات: ${formatBytes(storage.breakdown.products)} (${storage.counts.products} منتج)<br>
            الطلبات: ${formatBytes(storage.breakdown.orders)} (${storage.counts.orders} طلب)<br>
            مندوبو التوصيل: ${formatBytes(storage.breakdown.deliveryMen)} (${storage.counts.deliveryMen} مندوب)<br>
            أخرى: ${formatBytes(storage.breakdown.other)}<br>
            <strong>متبقي: ${free}</strong>
        `;
    }
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
    // Update sidebar nav items
    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
    if (eventElement) {
        eventElement.classList.add('active');
    }
    
    // Also update old tab buttons if they exist
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const tabContent = document.getElementById(tab + 'Tab');
    if (tabContent) {
        tabContent.classList.add('active');
    }
    
    // Update page title
    const pageTitle = document.getElementById('pageTitle');
    const tabTitles = {
        'products': 'المنتجات',
        'orders': 'الطلبات',
        'analytics': 'الإحصائيات',
        'delivery-men': 'مندوبو التوصيل',
        'settings': 'الإعدادات'
    };
    if (pageTitle && tabTitles[tab]) {
        pageTitle.textContent = tabTitles[tab];
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
    } else if (tab === 'settings') {
        loadSettings();
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
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'text-center';
        emptyMsg.style.cssText = 'color: var(--text-light); padding: 4rem 2rem; background: var(--light); border-radius: var(--radius-lg);';
        emptyMsg.innerHTML = `
            <div style="font-size: 4rem; margin-bottom: 1rem;">📦</div>
            <h3 style="font-size: 1.5rem; margin-bottom: 0.5rem; color: var(--text);">${currentProducts.length === 0 ? 'لا توجد منتجات بعد' : 'لا توجد نتائج للبحث'}</h3>
            <p style="color: var(--text-light);">${currentProducts.length === 0 ? 'قم بإضافة منتج جديد للبدء!' : 'جرب البحث بكلمات مختلفة'}</p>
        `;
        container.innerHTML = '';
        container.appendChild(emptyMsg);
        return;
    }

    // Create modern grid layout
    const grid = document.createElement('div');
    grid.className = 'products-grid';
    
    filteredProducts.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        
        // Image section
        const imageSection = document.createElement('div');
        imageSection.style.cssText = 'position: relative; width: 100%; height: 200px; background: var(--light); overflow: hidden;';
        
        const mediaUrls = product.mediaUrls && product.mediaUrls.length > 0 
            ? product.mediaUrls 
            : (product.mediaUrl ? [product.mediaUrl] : []);
        
        if (mediaUrls.length > 0) {
            const firstMedia = mediaUrls[0];
            if (product.mediaType === 'video' || firstMedia.includes('data:video')) {
                const video = document.createElement('video');
                video.src = firstMedia;
                video.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
                imageSection.appendChild(video);
            } else {
                const img = document.createElement('img');
                img.src = firstMedia;
                img.alt = escapeHtml(product.name);
                img.className = 'product-card-image';
                imageSection.appendChild(img);
            }
            
            // Show count badge if multiple images
            if (mediaUrls.length > 1) {
                const countBadge = document.createElement('div');
                countBadge.style.cssText = 'position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.7); color: white; font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: var(--radius-full); font-weight: 600;';
                countBadge.textContent = `+${mediaUrls.length - 1}`;
                imageSection.appendChild(countBadge);
            }
        } else {
            const placeholder = document.createElement('div');
            placeholder.style.cssText = 'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 4rem; color: var(--text-lighter);';
            placeholder.textContent = '📦';
            imageSection.appendChild(placeholder);
        }
        
        card.appendChild(imageSection);
        
        // Body section
        const body = document.createElement('div');
        body.className = 'product-card-body';
        
        // Product name
        const name = document.createElement('h3');
        name.className = 'product-card-title';
        name.textContent = product.name;
        body.appendChild(name);
        
        // Price section
        const priceSection = document.createElement('div');
        priceSection.style.cssText = 'margin: var(--space-2) 0;';
        
        if (product.discountPrice && product.discountPrice < product.price) {
            const discountPrice = document.createElement('div');
            discountPrice.className = 'product-card-price';
            discountPrice.style.color = 'var(--success)';
            discountPrice.textContent = `${product.discountPrice} د.ل`;
            priceSection.appendChild(discountPrice);
            
            const originalPrice = document.createElement('div');
            originalPrice.style.cssText = 'font-size: var(--font-size-sm); color: var(--text-light); text-decoration: line-through; margin-bottom: 0.25rem;';
            originalPrice.textContent = `${product.price} د.ل`;
            priceSection.appendChild(originalPrice);
            
            const discountPercent = Math.round(((product.price - product.discountPrice) / product.price) * 100);
            const discountBadge = document.createElement('span');
            discountBadge.className = 'badge badge-danger';
            discountBadge.textContent = `خصم ${discountPercent}%`;
            priceSection.appendChild(discountBadge);
        } else {
            const price = document.createElement('div');
            price.className = 'product-card-price';
            price.textContent = `${product.price} د.ل`;
            priceSection.appendChild(price);
        }
        
        body.appendChild(priceSection);
        
        // Stock section
        if (product.stock !== null && product.stock !== undefined) {
            const stockSection = document.createElement('div');
            stockSection.style.cssText = 'margin: var(--space-2) 0; padding: var(--space-2); background: var(--light); border-radius: var(--radius-md);';
            
            const stockLabel = document.createElement('div');
            stockLabel.style.cssText = 'font-size: var(--font-size-sm); color: var(--text-light); margin-bottom: 0.25rem;';
            stockLabel.textContent = 'الكمية المتوفرة:';
            
            const stockValue = document.createElement('div');
            stockValue.style.cssText = 'font-size: var(--font-size-lg); font-weight: var(--font-weight-bold);';
            
            if (product.stock === 0) {
                stockValue.style.color = 'var(--danger)';
                stockValue.textContent = 'نفد المخزون';
            } else if (product.stock <= 5) {
                stockValue.style.color = 'var(--warning)';
                stockValue.textContent = `${product.stock} (مخزون منخفض)`;
            } else {
                stockValue.style.color = 'var(--success)';
                stockValue.textContent = product.stock;
            }
            
            stockSection.appendChild(stockLabel);
            stockSection.appendChild(stockValue);
            body.appendChild(stockSection);
        }
        
        // Actions
        const actions = document.createElement('div');
        actions.className = 'product-card-actions';
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-success btn-sm';
        copyBtn.style.flex = '1';
        copyBtn.textContent = '📋 نسخ';
        copyBtn.onclick = () => copyProductLink(product.id);
        actions.appendChild(copyBtn);
        
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-warning btn-sm';
        editBtn.textContent = '✏️';
        editBtn.onclick = () => editProduct(product.id);
        actions.appendChild(editBtn);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-sm';
        deleteBtn.textContent = '🗑️';
        deleteBtn.onclick = () => deleteProduct(product.id);
        actions.appendChild(deleteBtn);
        
        body.appendChild(actions);
        card.appendChild(body);
        grid.appendChild(card);
    });
    
    container.innerHTML = '';
    container.appendChild(grid);
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
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'text-center';
        emptyMsg.style.cssText = 'color: var(--text-light); padding: 4rem 2rem; background: var(--light); border-radius: var(--radius-lg);';
        emptyMsg.innerHTML = `
            <div style="font-size: 4rem; margin-bottom: 1rem;">📋</div>
            <h3 style="font-size: 1.5rem; margin-bottom: 0.5rem; color: var(--text);">${currentOrders.length === 0 ? 'لا توجد طلبات بعد' : 'لا توجد نتائج للبحث'}</h3>
            <p style="color: var(--text-light);">${currentOrders.length === 0 ? 'الطلبات الجديدة ستظهر هنا' : 'جرب البحث بكلمات مختلفة'}</p>
        `;
        container.innerHTML = '';
        container.appendChild(emptyMsg);
        updateSelectedCount();
        return;
    }

    // Create modern grid layout
    const grid = document.createElement('div');
    grid.className = 'orders-grid';
    
    filteredOrders.forEach(order => {
        const product = currentProducts.find(p => p.id === order.productId);
        const card = document.createElement('div');
        card.className = 'order-card';
        card.dataset.orderId = order.id;
        
        // Header with checkbox and order number
        const header = document.createElement('div');
        header.className = 'order-card-header';
        
        const leftSection = document.createElement('div');
        leftSection.className = 'flex items-center gap-2';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'order-checkbox';
        checkbox.value = order.id;
        checkbox.onchange = updateSelectedCount;
        leftSection.appendChild(checkbox);
        
        const orderNumber = order.orderNumber || order.id;
        const orderNumDiv = document.createElement('div');
        orderNumDiv.className = 'order-number';
        if (orderNumber.startsWith('ORD-')) {
            orderNumDiv.textContent = orderNumber;
        } else {
            orderNumDiv.textContent = `#${orderNumber.substring(0, 8)}`;
        }
        leftSection.appendChild(orderNumDiv);
        
        header.appendChild(leftSection);
        
        const dateDiv = document.createElement('div');
        dateDiv.className = 'order-date';
        dateDiv.textContent = new Date(order.createdAt).toLocaleDateString('ar-EG');
        header.appendChild(dateDiv);
        
        card.appendChild(header);
        
        // Order info
        const info = document.createElement('div');
        info.className = 'order-info';
        
        // Status badge at top
        const statusInfo = getStatusInfo(order.status);
        const statusBadge = document.createElement('span');
        statusBadge.className = statusInfo.class;
        statusBadge.style.cssText = 'display: inline-block; margin-bottom: var(--space-3);';
        statusBadge.textContent = statusInfo.label;
        info.appendChild(statusBadge);
        
        // Product
        const productItem = document.createElement('div');
        productItem.className = 'order-info-item';
        const productLabel = document.createElement('span');
        productLabel.className = 'order-info-label';
        productLabel.textContent = 'المنتج:';
        const productValue = document.createElement('span');
        productValue.className = 'order-info-value';
        productValue.textContent = product ? product.name : 'غير معروف';
        productItem.appendChild(productLabel);
        productItem.appendChild(productValue);
        info.appendChild(productItem);
        
        // Customer
        const customerItem = document.createElement('div');
        customerItem.className = 'order-info-item';
        const customerLabel = document.createElement('span');
        customerLabel.className = 'order-info-label';
        customerLabel.textContent = 'العميل:';
        const customerValue = document.createElement('span');
        customerValue.className = 'order-info-value';
        customerValue.textContent = order.customerName;
        customerItem.appendChild(customerLabel);
        customerItem.appendChild(customerValue);
        info.appendChild(customerItem);
        
        // Phone
        const phoneItem = document.createElement('div');
        phoneItem.className = 'order-info-item';
        const phoneLabel = document.createElement('span');
        phoneLabel.className = 'order-info-label';
        phoneLabel.textContent = 'الهاتف:';
        const phoneValue = document.createElement('a');
        phoneValue.href = `tel:${order.customerPhone}`;
        phoneValue.className = 'order-info-value';
        phoneValue.style.color = 'var(--primary)';
        phoneValue.textContent = order.customerPhone;
        phoneItem.appendChild(phoneLabel);
        phoneItem.appendChild(phoneValue);
        info.appendChild(phoneItem);
        
        // Address
        const addressItem = document.createElement('div');
        addressItem.className = 'order-info-item';
        const addressLabel = document.createElement('span');
        addressLabel.className = 'order-info-label';
        addressLabel.textContent = 'العنوان:';
        const addressValue = document.createElement('span');
        addressValue.className = 'order-info-value';
        addressValue.textContent = order.customerAddress;
        addressValue.style.cssText += 'word-break: break-word;';
        addressItem.appendChild(addressLabel);
        addressItem.appendChild(addressValue);
        info.appendChild(addressItem);
        
        // Quantity
        const qtyItem = document.createElement('div');
        qtyItem.className = 'order-info-item';
        const qtyLabel = document.createElement('span');
        qtyLabel.className = 'order-info-label';
        qtyLabel.textContent = 'الكمية:';
        const qtyValue = document.createElement('span');
        qtyValue.className = 'order-info-value';
        qtyValue.textContent = order.quantity;
        qtyItem.appendChild(qtyLabel);
        qtyItem.appendChild(qtyValue);
        info.appendChild(qtyItem);
        
        // Delivery Man
        const deliveryItem = document.createElement('div');
        deliveryItem.className = 'order-info-item';
        const deliveryLabel = document.createElement('span');
        deliveryLabel.className = 'order-info-label';
        deliveryLabel.textContent = 'مندوب التوصيل:';
        const deliveryValue = document.createElement('span');
        deliveryValue.className = 'order-info-value';
        if (order.deliveryManId) {
            deliveryValue.innerHTML = '<span style="color: var(--text-light);">جاري التحميل...</span>';
            loadDeliveryManInfo(order.deliveryManId, deliveryValue);
        } else {
            deliveryValue.textContent = 'غير مُسند';
            deliveryValue.style.color = 'var(--text-light)';
        }
        deliveryItem.appendChild(deliveryLabel);
        deliveryItem.appendChild(deliveryValue);
        info.appendChild(deliveryItem);
        
        // Shipping & Payment
        if (order.shippingPrice || order.paymentReceived) {
            const financialItem = document.createElement('div');
            financialItem.className = 'order-info-item';
            financialItem.style.cssText = 'padding-top: var(--space-2); border-top: 1px solid var(--border-light); margin-top: var(--space-2);';
            const financialText = [];
            if (order.shippingPrice) {
                financialText.push(`شحن: ${parseFloat(order.shippingPrice).toFixed(2)} د.ع`);
            }
            if (order.paymentReceived) {
                financialText.push(`مستلم: ${parseFloat(order.paymentReceived).toFixed(2)} د.ع`);
            }
            financialItem.innerHTML = `<span class="order-info-value" style="color: var(--success); font-weight: 600;">${financialText.join(' | ')}</span>`;
            info.appendChild(financialItem);
        }
        
        // Notes
        if (order.notes && order.notes.trim()) {
            const notesItem = document.createElement('div');
            notesItem.className = 'order-info-item';
            notesItem.style.cssText = 'padding-top: var(--space-2); border-top: 1px solid var(--border-light); margin-top: var(--space-2);';
            const notesLabel = document.createElement('span');
            notesLabel.className = 'order-info-label';
            notesLabel.textContent = 'ملاحظات:';
            const notesValue = document.createElement('span');
            notesValue.className = 'order-info-value';
            notesValue.style.cssText = 'font-style: italic; color: var(--text); word-break: break-word;';
            notesValue.textContent = order.notes;
            notesItem.appendChild(notesLabel);
            notesItem.appendChild(notesValue);
            info.appendChild(notesItem);
        }
        
        card.appendChild(info);
        
        // Actions
        const actions = document.createElement('div');
        actions.className = 'order-actions';
        
        const statusBtn = document.createElement('button');
        statusBtn.className = 'btn btn-primary btn-sm';
        statusBtn.style.flex = '1';
        statusBtn.textContent = '🔄 تحديث';
        statusBtn.onclick = () => openOrderStatusModal(order);
        actions.appendChild(statusBtn);
        
        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn btn-info btn-sm';
        viewBtn.textContent = '👁️';
        viewBtn.onclick = () => viewOrderDetails(order);
        actions.appendChild(viewBtn);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-sm';
        deleteBtn.textContent = '🗑️';
        deleteBtn.onclick = () => deleteOrder(order.id);
        actions.appendChild(deleteBtn);
        
        card.appendChild(actions);
        grid.appendChild(card);
    });
    
    container.innerHTML = '';
    container.appendChild(grid);
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

// Bulk delete orders
async function bulkDelete() {
    const checkboxes = document.querySelectorAll('.order-checkbox:checked');
    if (checkboxes.length === 0) {
        showNotification('الرجاء تحديد طلب واحد على الأقل', 'error');
        return;
    }
    
    const orderIds = Array.from(checkboxes).map(cb => cb.value);
    const orderCount = orderIds.length;
    
    if (!confirm(`هل أنت متأكد من حذف ${orderCount} طلب؟ لا يمكن التراجع عن هذا الإجراء.`)) {
        return;
    }
    
    let successCount = 0;
    let failCount = 0;
    
    for (const orderId of orderIds) {
        try {
            const response = await fetch(`/api/orders?id=${orderId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (response.ok) {
                successCount++;
            } else {
                failCount++;
                const errorData = await response.json().catch(() => ({}));
                console.error(`Failed to delete order ${orderId}:`, errorData.error || 'Unknown error');
            }
        } catch (error) {
            failCount++;
            console.error(`Error deleting order ${orderId}:`, error);
        }
    }
    
    if (successCount > 0) {
        showNotification(`تم حذف ${successCount} طلب بنجاح${failCount > 0 ? `، فشل ${failCount}` : ''}`, 'success');
        await loadOrders();
    } else {
        showNotification(`فشل حذف جميع الطلبات (${failCount})`, 'error');
    }
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
            document.getElementById('productStock').value = product.stock !== null && product.stock !== undefined ? product.stock : '';
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
        const stock = document.getElementById('productStock').value ?
            parseInt(document.getElementById('productStock').value) : null;

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
            stock: stock,
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

// Copy delivery login URL
function copyDeliveryUrl() {
    // Use dynamic base URL (works in all environments)
    const baseUrl = window.location.origin;
    const deliveryUrl = `${baseUrl}/delivery-login.html`;
    navigator.clipboard.writeText(deliveryUrl).then(() => {
        showNotification('تم نسخ رابط صفحة التوصيل! 🚚', 'success');
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = deliveryUrl;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showNotification('تم نسخ رابط صفحة التوصيل! 🚚', 'success');
        } catch (err) {
            showNotification('فشل نسخ الرابط', 'error');
        }
        document.body.removeChild(textArea);
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
    document.getElementById('orderNotes').value = order.notes || '';

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

// Load Settings
async function loadSettings() {
    try {
        const response = await fetch('/api/settings', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                logout();
                return;
            }
            // If settings don't exist, use defaults
            return;
        }

        const settings = await response.json();
        
        // Populate form fields
        if (settings.whatsappNumber) {
            document.getElementById('whatsappNumber').value = settings.whatsappNumber;
        }
        if (settings.phoneNumber) {
            document.getElementById('phoneNumber').value = settings.phoneNumber;
        }
        document.getElementById('enableSharing').checked = settings.enableSharing !== false;
        
        if (settings.shippingTime) {
            document.getElementById('shippingTime').value = settings.shippingTime;
        }
        if (settings.shippingCost) {
            document.getElementById('shippingCost').value = settings.shippingCost;
        }
        if (settings.shippingAreas) {
            document.getElementById('shippingAreas').value = settings.shippingAreas;
        }
        if (settings.shippingMethods) {
            document.getElementById('shippingMethods').value = settings.shippingMethods;
        }
        
        if (settings.returnPeriod) {
            document.getElementById('returnPeriod').value = settings.returnPeriod;
        }
        if (settings.returnConditions) {
            document.getElementById('returnConditions').value = settings.returnConditions;
        }
        if (settings.refundTime) {
            document.getElementById('refundTime').value = settings.refundTime;
        }
        if (settings.returnContact) {
            document.getElementById('returnContact').value = settings.returnContact;
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Save Settings
async function saveSettings() {
    const submitButton = event.target;
    submitButton.disabled = true;
    submitButton.textContent = '💾 جاري الحفظ...';

    try {
        const settings = {
            whatsappNumber: document.getElementById('whatsappNumber').value.trim(),
            phoneNumber: document.getElementById('phoneNumber').value.trim(),
            enableSharing: document.getElementById('enableSharing').checked,
            shippingTime: document.getElementById('shippingTime').value.trim(),
            shippingCost: document.getElementById('shippingCost').value.trim(),
            shippingAreas: document.getElementById('shippingAreas').value.trim(),
            shippingMethods: document.getElementById('shippingMethods').value.trim(),
            returnPeriod: document.getElementById('returnPeriod').value.trim(),
            returnConditions: document.getElementById('returnConditions').value.trim(),
            refundTime: document.getElementById('refundTime').value.trim(),
            returnContact: document.getElementById('returnContact').value.trim()
        };

        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(settings)
        });

        if (!response.ok) {
            if (response.status === 401) {
                logout();
                return;
            }
            throw new Error('فشل حفظ الإعدادات');
        }

        showNotification('تم حفظ الإعدادات بنجاح! ✅', 'success');
    } catch (error) {
        console.error('Error saving settings:', error);
        showNotification('حدث خطأ في حفظ الإعدادات', 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = '💾 حفظ الإعدادات';
    }
}
