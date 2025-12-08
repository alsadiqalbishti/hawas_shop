// Global state
let authToken = localStorage.getItem('adminToken');
let currentProducts = [];
let currentOrders = [];
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

        if (products.length === 0) {
            const emptyMsg = document.createElement('p');
            emptyMsg.className = 'text-center';
            emptyMsg.style.cssText = 'color: var(--text-light); padding: 2rem;';
            emptyMsg.textContent = 'لا توجد منتجات بعد. قم بإضافة منتج جديد!';
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
        products.forEach(product => {
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
    } catch (error) {
        console.error('Error loading products:', error);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-error';
        errorDiv.textContent = `حدث خطأ في تحميل المنتجات: ${error.message}`;
        container.innerHTML = '';
        container.appendChild(errorDiv);
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

        if (orders.length === 0) {
            const emptyMsg = document.createElement('p');
            emptyMsg.className = 'text-center';
            emptyMsg.style.cssText = 'color: var(--text-light); padding: 2rem;';
            emptyMsg.textContent = 'لا توجد طلبات بعد';
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
        ['رقم الطلب', 'المنتج', 'اسم العميل', 'رقم الهاتف', 'العنوان', 'الكمية', 'التاريخ', 'الحالة', 'الإجراءات'].forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        
        // Rows
        orders.forEach(order => {
            const product = currentProducts.find(p => p.id === order.productId);
            const row = document.createElement('tr');
            
            // Order ID
            const idCell = document.createElement('td');
            const idStrong = document.createElement('strong');
            idStrong.textContent = `#${order.id.substring(0, 8)}`;
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
            
            // Date
            const dateCell = document.createElement('td');
            dateCell.textContent = new Date(order.createdAt).toLocaleDateString('ar-EG');
            row.appendChild(dateCell);
            
            // Status
            const statusCell = document.createElement('td');
            const statusBadge = document.createElement('span');
            statusBadge.className = order.status === 'completed' ? 'badge badge-success' : 'badge badge-warning';
            statusBadge.textContent = order.status === 'completed' ? 'مكتمل' : 'قيد المعالجة';
            statusCell.appendChild(statusBadge);
            row.appendChild(statusCell);
            
            // Actions
            const actionsCell = document.createElement('td');
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'flex gap-1';
            
            if (order.status !== 'completed') {
                const completeBtn = document.createElement('button');
                completeBtn.className = 'btn btn-success btn-sm';
                completeBtn.textContent = '✅ اكتمل';
                completeBtn.onclick = () => markOrderComplete(order.id);
                actionsDiv.appendChild(completeBtn);
            }
            
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
    } catch (error) {
        console.error('Error loading orders:', error);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-error';
        errorDiv.textContent = `حدث خطأ في تحميل الطلبات: ${error.message}`;
        container.innerHTML = '';
        container.appendChild(errorDiv);
    }
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

        // Filter out empty media URLs
        const validMediaUrls = mediaUrls.filter(url => url && url.trim() !== '' && url !== 'null' && url !== 'undefined');
        
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

// Mark order complete
async function markOrderComplete(orderId) {
    try {
        const response = await fetch('/api/orders', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ id: orderId, status: 'completed' })
        });

        if (response.ok) {
            await loadOrders();
            showNotification('تم تحديث حالة الطلب', 'success');
        } else {
            const errorData = await response.json().catch(() => ({}));
            showNotification(errorData.error || 'حدث خطأ في تحديث الطلب', 'error');
        }
    } catch (error) {
        showNotification('حدث خطأ في الاتصال', 'error');
    }
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
