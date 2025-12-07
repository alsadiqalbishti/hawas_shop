// Get product ID from URL query parameter
const urlParams = new URLSearchParams(window.location.search);
const productId = urlParams.get('id');

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

        // Display product media with zoom
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
                    <img src="${product.mediaUrl}" 
                         alt="${product.name}" 
                         class="product-image"
                         onclick="openImageZoom('${product.mediaUrl}')"
                         style="cursor: pointer; transition: transform 0.3s;"
                         onmouseover="this.style.transform='scale(1.02)'"
                         onmouseout="this.style.transform='scale(1)'">
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

        // Display price with discount
        const priceElement = document.getElementById('productPrice');
        const originalPriceElement = document.getElementById('originalPrice');
        const discountBadgeElement = document.getElementById('discountBadge');

        if (product.discountPrice && product.discountPrice < product.price) {
            // Show discounted price
            priceElement.textContent = `${product.discountPrice} د.ل`;
            originalPriceElement.textContent = `${product.price} د.ل`;
            originalPriceElement.classList.remove('hidden');

            // Calculate and show discount percentage
            const discountPercent = Math.round(((product.price - product.discountPrice) / product.price) * 100);
            discountBadgeElement.textContent = `خصم ${discountPercent}%`;
            discountBadgeElement.classList.remove('hidden');
        } else {
            // Show regular price
            priceElement.textContent = `${product.price} د.ل`;
        }

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

// Image zoom modal
function openImageZoom(imageUrl) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        cursor: pointer;
        animation: fadeIn 0.3s;
    `;

    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.cssText = `
        max-width: 95%;
        max-height: 95%;
        border-radius: 8px;
        box-shadow: 0 0 50px rgba(255, 255, 255, 0.3);
    `;

    modal.onclick = () => document.body.removeChild(modal);
    modal.appendChild(img);
    document.body.appendChild(modal);
}
