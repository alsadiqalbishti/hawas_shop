// Global state
let authToken = localStorage.getItem('adminToken');
let currentProducts = [];
let currentOrders = [];
let editingProductId = null;

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
function switchTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tab + 'Tab').classList.add('active');
}

// Load products
async function loadProducts() {
    const container = document.getElementById('productsContainer');

    try {
        const response = await fetch('/api/products');
        const products = await response.json();
        currentProducts = products;

        if (products.length === 0) {
            container.innerHTML = '<p class="text-center" style="color: var(--text-light); padding: 2rem;">لا توجد منتجات بعد. قم بإضافة منتج جديد!</p>';
            return;
        }

        container.innerHTML = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>الصورة</th>
                            <th>اسم المنتج</th>
                            <th>السعر</th>
                            <th>رابط المنتج</th>
                            <th>الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${products.map(product => `
                            <tr>
                                <td>
                                    ${product.mediaUrl ?
                (product.mediaType === 'video' ?
                    `<video src="${product.mediaUrl}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;"></video>` :
                    `<img src="${product.mediaUrl}" alt="${product.name}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;">`)
                : '📦'}
                                </td>
                                <td><strong>${product.name}</strong></td>
                                <td><span class="price" style="font-size: 1.2rem;">${product.price} د.ل</span></td>
                                <td>
                                    <button onclick="copyProductLink('${product.id}')" class="btn btn-success btn-sm">
                                        📋 نسخ الرابط
                                    </button>
                                </td>
                                <td>
                                    <div class="flex gap-1">
                                        <button onclick="editProduct('${product.id}')" class="btn btn-warning btn-sm">
                                            ✏️ تعديل
                                        </button>
                                        <button onclick="deleteProduct('${product.id}')" class="btn btn-danger btn-sm">
                                            🗑️ حذف
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        container.innerHTML = '<div class="alert alert-error">حدث خطأ في تحميل المنتجات</div>';
    }
}

// Load orders
async function loadOrders() {
    const container = document.getElementById('ordersContainer');

    try {
        const response = await fetch('/api/orders');
        const orders = await response.json();
        currentOrders = orders;

        if (orders.length === 0) {
            container.innerHTML = '<p class="text-center" style="color: var(--text-light); padding: 2rem;">لا توجد طلبات بعد</p>';
            return;
        }

        container.innerHTML = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>رقم الطلب</th>
                            <th>المنتج</th>
                            <th>اسم العميل</th>
                            <th>رقم الهاتف</th>
                            <th>العنوان</th>
                            <th>الكمية</th>
                            <th>التاريخ</th>
                            <th>الحالة</th>
                            <th>الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${orders.map(order => {
            const product = currentProducts.find(p => p.id === order.productId);
            return `
                            <tr>
                                <td><strong>#${order.id.substring(0, 8)}</strong></td>
                                <td>${product ? product.name : 'غير معروف'}</td>
                                <td>${order.customerName}</td>
                                <td><a href="tel:${order.customerPhone}">${order.customerPhone}</a></td>
                                <td>${order.customerAddress}</td>
                                <td><strong>${order.quantity}</strong></td>
                                <td>${new Date(order.createdAt).toLocaleDateString('ar-EG')}</td>
                                <td>
                                    <span class="badge ${order.status === 'completed' ? 'badge-success' : 'badge-warning'}">
                                        ${order.status === 'completed' ? 'مكتمل' : 'قيد المعالجة'}
                                    </span>
                                </td>
                                <td>
                                    <div class="flex gap-1">
                                        ${order.status !== 'completed' ?
                    `<button onclick="markOrderComplete('${order.id}')" class="btn btn-success btn-sm">
                                                ✅ اكتمل
                                            </button>` : ''}
                                        <button onclick="deleteOrder('${order.id}')" class="btn btn-danger btn-sm">
                                            🗑️ حذف
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        container.innerHTML = '<div class="alert alert-error">حدث خطأ في تحميل الطلبات</div>';
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
            document.getElementById('productDescription').value = product.description || '';

            if (product.mediaUrl) {
                const mediaPreview = product.mediaType === 'video' ?
                    `<video src="${product.mediaUrl}" controls style="max-width: 200px; border-radius: 8px;"></video>` :
                    `<img src="${product.mediaUrl}" style="max-width: 200px; border-radius: 8px;">`;
                document.getElementById('currentMedia').innerHTML = `
                    <p style="color: var(--text-light); margin-bottom: 0.5rem;">الصورة الحالية:</p>
                    ${mediaPreview}
                `;
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
        let mediaUrl = '';
        let mediaType = 'image';

        // Upload media file if selected
        const mediaFile = document.getElementById('productMedia').files[0];
        if (mediaFile) {
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
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mediaData: base64Data,
                        mediaType: mediaType
                    })
                });

                if (uploadResponse.ok) {
                    const uploadData = await uploadResponse.json();
                    mediaUrl = uploadData.mediaUrl;
                    mediaType = uploadData.mediaType;
                } else {
                    alert('حدث خطأ في رفع الملف');
                    submitButton.disabled = false;
                    submitButton.textContent = '💾 حفظ';
                    return;
                }
            } catch (error) {
                alert('حدث خطأ في قراءة الملف');
                submitButton.disabled = false;
                submitButton.textContent = '💾 حفظ';
                return;
            }
        } else if (editingProductId) {
            // Keep existing media if no new file uploaded
            const product = currentProducts.find(p => p.id === editingProductId);
            if (product) {
                mediaUrl = product.mediaUrl;
                mediaType = product.mediaType;
            }
        }

        // Create/update product
        const productData = {
            name: document.getElementById('productName').value,
            price: parseFloat(document.getElementById('productPrice').value),
            discountPrice: document.getElementById('productDiscountPrice').value ?
                parseFloat(document.getElementById('productDiscountPrice').value) : null,
            description: document.getElementById('productDescription').value,
            mediaUrls: mediaUrls,
            mediaUrl: mediaUrls[0] || '', // Keep first image as main for backward compatibility
            mediaType: mediaType
        };

        if (editingProductId) {
            productData.id = editingProductId;
        }

        const url = '/api/products';
        const method = editingProductId ? 'PUT' : 'POST';

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
            alert(editingProductId ? 'تم تحديث المنتج بنجاح!' : 'تم إضافة المنتج بنجاح!');
        } else {
            alert('حدث خطأ في حفظ المنتج');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('حدث خطأ في الاتصال');
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
            alert('تم حذف المنتج بنجاح');
        } else {
            alert('حدث خطأ في حذف المنتج');
        }
    } catch (error) {
        alert('حدث خطأ في الاتصال');
    }
}

// Copy product link
function copyProductLink(productId) {
    // Always use production URL, not preview deployments
    const link = `https://hawas-shop.vercel.app/product.html?id=${productId}`;
    navigator.clipboard.writeText(link).then(() => {
        alert('تم نسخ رابط المنتج! 🎉\n' + link);
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
            alert('تم تحديث حالة الطلب');
        } else {
            alert('حدث خطأ في تحديث الطلب');
        }
    } catch (error) {
        alert('حدث خطأ في الاتصال');
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
            alert('تم حذف الطلب بنجاح');
        } else {
            alert('حدث خطأ في حذف الطلب');
        }
    } catch (error) {
        alert('حدث خطأ في الاتصال');
    }
}
