// Get product ID from URL
const urlParams = new URLSearchParams(window.location.search);
const productId = window.location.pathname.split('/').pop() || urlParams.get('id');

// Load product on page load
window.addEventListener('DOMContentLoaded', loadProduct);

async function loadProduct() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const productContent = document.getElementById('productContent');
    const productNotFound = document.getElementById('productNotFound');

    try {
        const response = await fetch(`/api/products?id=${productId}`);

        if (!response.ok) {
            throw new Error('Product not found');
        }

        const product = await response.json();

        // Update page title
        document.getElementById('pageTitle').textContent = product.name;

        // Display product media
        const mediaContainer = document.getElementById('productMedia');
        if (product.mediaUrl) {
            if (product.mediaType === 'video') {
                mediaContainer.innerHTML = `
                    <video src="${product.mediaUrl}" controls class="product-video" autoplay muted loop>
                        متصفحك لا يدعم تشغيل الفيديو
                    </video>
                `;
            } else {
                mediaContainer.innerHTML = `
                    <img src="${product.mediaUrl}" alt="${product.name}" class="product-image">
                `;
            }
        } else {
            mediaContainer.innerHTML = `
                <div style="font-size: 5rem; margin-bottom: 1rem;">📦</div>
            `;
        }

        // Display product info
        document.getElementById('productName').textContent = product.name;
        document.getElementById('productDescription').textContent = product.description || '';
        document.getElementById('productPrice').textContent = `${product.price} ج.م`;

        // Show product content
        loadingSpinner.classList.add('hidden');
        productContent.classList.remove('hidden');

    } catch (error) {
        loadingSpinner.classList.add('hidden');
        productNotFound.classList.remove('hidden');
    }
}

// Handle order form submission
document.getElementById('orderForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const successDiv = document.getElementById('orderSuccess');
    const errorDiv = document.getElementById('orderError');
    const submitButton = e.target.querySelector('button[type="submit"]');

    // Hide previous messages
    successDiv.classList.add('hidden');
    errorDiv.classList.add('hidden');

    // Disable submit button
    submitButton.disabled = true;
    submitButton.textContent = 'جاري الإرسال...';

    const orderData = {
        productId: productId,
        customerName: document.getElementById('customerName').value,
        customerPhone: document.getElementById('customerPhone').value,
        customerAddress: document.getElementById('customerAddress').value,
        quantity: parseInt(document.getElementById('quantity').value)
    };

    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });

        if (response.ok) {
            // Show success message
            successDiv.classList.remove('hidden');

            // Reset form
            e.target.reset();
            document.getElementById('quantity').value = 1;

            // Scroll to success message
            successDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });

        } else {
            const data = await response.json();
            errorDiv.textContent = data.error || 'حدث خطأ في إرسال الطلب';
            errorDiv.classList.remove('hidden');
        }
    } catch (error) {
        errorDiv.textContent = 'حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.';
        errorDiv.classList.remove('hidden');
    } finally {
        // Re-enable submit button
        submitButton.disabled = false;
        submitButton.textContent = '🛒 اطلب الآن';
    }
});
