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

        // Check if we have multiple images
        if (product.mediaUrls && product.mediaUrls.length > 0) {
            if (product.mediaType === 'video') {
                mediaContainer.innerHTML = `
                    <video src="${product.mediaUrls[0]}" controls class="product-video" autoplay muted loop>
                        متصفحك لا يدعم تشغيل الفيديو
                    </video>
                `;
            } else {

                // Create image slider
                let sliderHTML = `
                    <div class="slider-container">
                        <div class="slider-track" id="sliderTrack">
                `;

                product.mediaUrls.forEach((url, index) => {
                    sliderHTML += `
                        <div class="slider-slide">
                            <img src="${url}" 
                                 alt="${product.name}" 
                                 onclick="openImageZoom('${url}')"
                                 style="cursor: pointer;">
                        </div>
                    `;
                });

                sliderHTML += `
                        </div>
                        <button class="slider-btn prev-btn" onclick="moveSlider(-1)">❮</button>
                        <button class="slider-btn next-btn" onclick="moveSlider(1)">❯</button>
                        <div class="slider-dots">
                `;

                // Add dots
                product.mediaUrls.forEach((_, index) => {
                    sliderHTML += `<div class="dot ${index === 0 ? 'active' : ''}" onclick="goToSlide(${index})"></div>`;
                });

                sliderHTML += `
                        </div>
                    </div>
                `;

                mediaContainer.innerHTML = sliderHTML;

                // Initialize slider state
                window.currentSlide = 0;
                window.totalSlides = product.mediaUrls.length;
            }
            mediaContainer.innerHTML = galleryHTML;
        }
    } else if (product.mediaUrl) {
        // Backward compatibility for single image
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

    // Display description with line breaks preserved
    const descElement = document.getElementById('productDescription');
    if (product.description) {
        descElement.innerHTML = product.description.replace(/\n/g, '<br>');
    } else {
        descElement.textContent = '';
    }

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

// Slider functions
function updateSlider() {
    const track = document.getElementById('sliderTrack');
    const dots = document.querySelectorAll('.dot');

    if (track) {
        track.style.transform = `translateX(${window.currentSlide * 100}%)`; // RTL: positive value moves right
    }

    dots.forEach((dot, index) => {
        if (index === window.currentSlide) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
}

function moveSlider(direction) {
    window.currentSlide = (window.currentSlide + direction + window.totalSlides) % window.totalSlides;
    updateSlider();
}

function goToSlide(index) {
    window.currentSlide = index;
    updateSlider();
}
