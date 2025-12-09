// Utility: Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Utility: Format price with thousand separators
function formatPrice(price) {
    return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Get product ID from URL query parameter
const urlParams = new URLSearchParams(window.location.search);
const productId = urlParams.get('id');

// Store current product data
let currentProduct = null;

// Load product on page load
window.addEventListener('DOMContentLoaded', loadProduct);

async function loadProduct() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const productContent = document.getElementById('productContent');
    const productNotFound = document.getElementById('productNotFound');

    // Validate productId
    if (!productId || productId.trim() === '') {
        loadingSpinner.classList.add('hidden');
        productNotFound.classList.remove('hidden');
        return;
    }

    try {
        const response = await fetch(`/api/products?id=${encodeURIComponent(productId)}`);

        if (!response.ok) {
            throw new Error('Product not found');
        }

        const product = await response.json();
        
        // Store product data globally
        currentProduct = product;

        // Update page title
        document.getElementById('pageTitle').textContent = product.name;
        
        // Update breadcrumb
        const breadcrumbProduct = document.getElementById('breadcrumbProduct');
        if (breadcrumbProduct) {
            breadcrumbProduct.textContent = product.name;
        }

        // Display product media with zoom
        const mediaContainer = document.getElementById('productMedia');

        // Clear container
        mediaContainer.innerHTML = '';

        // Filter out empty URLs and get valid media URLs
        const validMediaUrls = (product.mediaUrls || [])
            .filter(url => {
                if (!url) return false;
                const urlStr = typeof url === 'string' ? url.trim() : String(url);
                return urlStr !== '' && urlStr !== 'null' && urlStr !== 'undefined' && urlStr.length > 10;
            })
            .map(url => typeof url === 'string' ? url.trim() : String(url));
        
        console.log('Loading product with media URLs:', validMediaUrls.length, validMediaUrls);
        
        // Check if we have multiple images
        if (validMediaUrls.length > 0) {
            if (product.mediaType === 'video') {
                const video = document.createElement('video');
                video.src = validMediaUrls[0];
                video.controls = true;
                video.className = 'product-video';
                video.muted = true;
                video.loop = true;
                video.textContent = 'متصفحك لا يدعم تشغيل الفيديو';
                mediaContainer.appendChild(video);
            } else {
                // Create image slider using DOM methods
                const sliderContainer = document.createElement('div');
                sliderContainer.className = 'slider-container';

                const sliderTrack = document.createElement('div');
                sliderTrack.className = 'slider-track';
                sliderTrack.id = 'sliderTrack';

                validMediaUrls.forEach((url, index) => {
                    const slide = document.createElement('div');
                    slide.className = 'slider-slide';
                    slide.style.cssText = 'min-width: 100%; width: 100%; flex-shrink: 0;';

                    const img = document.createElement('img');
                    img.src = url;
                    img.alt = escapeHtml(product.name) + ` - صورة ${index + 1}`;
                    img.style.cssText = 'width: 100%; height: 100%; object-fit: contain; border-radius: 12px; cursor: pointer; display: block;';
                    img.loading = index === 0 ? 'eager' : 'lazy';
                    img.onerror = function() {
                        this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="18" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3Eفشل تحميل الصورة%3C/text%3E%3C/svg%3E';
                    };
                    img.onclick = () => openImageZoom(url);

                    slide.appendChild(img);
                    sliderTrack.appendChild(slide);
                });

                // Create image thumbnails if multiple images
                if (validMediaUrls.length > 1) {
                    createImageThumbnails(validMediaUrls, product.name);
                }

                // For RTL: 
                // - Right button (prev) should point right (❯) and go to previous slide (moves right)
                // - Left button (next) should point left (❮) and go to next slide (moves left)
                const prevBtn = document.createElement('button');
                prevBtn.className = 'slider-btn prev-btn';
                prevBtn.textContent = '❯'; // Right arrow for right button (goes right/previous)
                prevBtn.onclick = () => moveSlider(1); // In RTL, prev moves right (positive)
                prevBtn.setAttribute('aria-label', 'الصورة السابقة');

                const nextBtn = document.createElement('button');
                nextBtn.className = 'slider-btn next-btn';
                nextBtn.textContent = '❮'; // Left arrow for left button (goes left/next)
                nextBtn.onclick = () => moveSlider(-1); // In RTL, next moves left (negative)
                nextBtn.setAttribute('aria-label', 'الصورة التالية');

                const dotsContainer = document.createElement('div');
                dotsContainer.className = 'slider-dots';

                validMediaUrls.forEach((_, index) => {
                    const dot = document.createElement('div');
                    dot.className = `dot ${index === 0 ? 'active' : ''}`;
                    dot.onclick = () => goToSlide(index);
                    dot.setAttribute('aria-label', `انتقل إلى الصورة ${index + 1}`);
                    dotsContainer.appendChild(dot);
                });

                sliderContainer.appendChild(sliderTrack);
                sliderContainer.appendChild(prevBtn);
                sliderContainer.appendChild(nextBtn);
                sliderContainer.appendChild(dotsContainer);
                mediaContainer.appendChild(sliderContainer);

                // Initialize slider state
                window.currentSlide = 0;
                window.totalSlides = validMediaUrls.length;
                
                // Update slider to show first slide
                setTimeout(() => updateSlider(), 100);
            }

        } else if (product.mediaUrl && product.mediaUrl.trim() !== '') {
            // Backward compatibility for single image
            if (product.mediaType === 'video') {
                const videoWrapper = document.createElement('div');
                videoWrapper.style.cssText = 'width: 100%; height: 500px; display: flex; align-items: center; justify-content: center;';
                
                const video = document.createElement('video');
                video.src = product.mediaUrl;
                video.controls = true;
                video.className = 'product-video';
                video.style.cssText = 'max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain;';
                video.muted = true;
                video.loop = true;
                video.textContent = 'متصفحك لا يدعم تشغيل الفيديو';
                
                videoWrapper.appendChild(video);
                mediaContainer.appendChild(videoWrapper);
            } else {
                const imgWrapper = document.createElement('div');
                imgWrapper.style.cssText = 'width: 100%; height: 500px; display: flex; align-items: center; justify-content: center;';
                
                const img = document.createElement('img');
                img.src = product.mediaUrl;
                img.alt = escapeHtml(product.name);
                img.className = 'product-image';
                img.style.cssText = 'max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; border-radius: 12px; cursor: pointer; transition: transform 0.3s;';
                img.loading = 'lazy';
                img.onerror = function() {
                    this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="18" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3Eفشل تحميل الصورة%3C/text%3E%3C/svg%3E';
                };
                img.onclick = () => openImageZoom(product.mediaUrl);
                img.onmouseover = () => img.style.transform = 'scale(1.02)';
                img.onmouseout = () => img.style.transform = 'scale(1)';
                
                imgWrapper.appendChild(img);
                mediaContainer.appendChild(imgWrapper);
            }
        } else {
            const placeholder = document.createElement('div');
            placeholder.style.cssText = 'font-size: 5rem; margin-bottom: 1rem; text-align: center;';
            placeholder.textContent = '📦';
            mediaContainer.appendChild(placeholder);
        }

        // Display product info (safe - already sanitized by backend)
        document.getElementById('productName').textContent = product.name;

        // Display description with line breaks preserved (safe - already sanitized)
        const descElement = document.getElementById('productDescription');
        if (product.description) {
            // Use textContent and preserve line breaks with CSS
            descElement.textContent = product.description.trim();
            // CSS already handles white-space: pre-wrap
        } else {
            descElement.textContent = '';
        }

        // Display price with discount
        const priceElement = document.getElementById('productPrice');
        const originalPriceElement = document.getElementById('originalPrice');
        const discountBadgeElement = document.getElementById('discountBadge');

        if (product.discountPrice && product.discountPrice < product.price) {
            // Show discounted price
            priceElement.textContent = `${formatPrice(product.discountPrice)} د.ل`;
            originalPriceElement.textContent = `${formatPrice(product.price)} د.ل`;
            originalPriceElement.classList.remove('hidden');

            // Calculate and show discount percentage
            const discountPercent = Math.round(((product.price - product.discountPrice) / product.price) * 100);
            discountBadgeElement.textContent = `خصم ${discountPercent}%`;
            discountBadgeElement.classList.remove('hidden');
        } else {
            // Show regular price
            priceElement.textContent = `${formatPrice(product.price)} د.ل`;
        }

        // Display stock badge
        const stockBadge = document.getElementById('stockBadge');
        if (product.stock !== undefined && product.stock !== null) {
            stockBadge.classList.remove('hidden');
            if (product.stock === 0) {
                stockBadge.className = 'stock-badge out-of-stock';
                stockBadge.innerHTML = '❌ <span>نفد المخزون</span>';
            } else if (product.stock <= 5) {
                stockBadge.className = 'stock-badge low-stock';
                stockBadge.innerHTML = `⚠️ <span>مخزون منخفض (${product.stock} متبقي)</span>`;
            } else {
                stockBadge.className = 'stock-badge in-stock';
                stockBadge.innerHTML = `✅ <span>متوفر (${product.stock} قطعة)</span>`;
            }
        }

        // Display product SKU/ID
        const productSku = document.getElementById('productSku');
        if (product.id) {
            productSku.textContent = `رقم المنتج: ${product.id}`;
            productSku.classList.remove('hidden');
        }

        // Setup contact buttons
        setupContactButtons(product);

        // Show product content
        loadingSpinner.classList.add('hidden');
        productContent.classList.remove('hidden');

    } catch (error) {
        console.error('Error loading product:', error);
        loadingSpinner.classList.add('hidden');
        productNotFound.classList.remove('hidden');
        
        // Show error message if it's a network error
        if (error.message && error.message.includes('fetch')) {
            const errorMsg = document.createElement('p');
            errorMsg.style.cssText = 'color: var(--danger); margin-top: 1rem;';
            errorMsg.textContent = 'حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.';
            productNotFound.appendChild(errorMsg);
        }
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

    // Validate form data
    const customerName = document.getElementById('customerName').value.trim();
    const customerPhone = document.getElementById('customerPhone').value.trim();
    const customerAddress = document.getElementById('customerAddress').value.trim();
    const quantity = parseInt(document.getElementById('quantity').value);

    // Client-side validation
    if (!customerName) {
        errorDiv.textContent = 'الرجاء إدخال الاسم الكامل';
        errorDiv.classList.remove('hidden');
        submitButton.disabled = false;
        submitButton.textContent = '🛒 تأكيد الطلب';
        return;
    }

    if (!customerPhone || customerPhone.length < 8) {
        errorDiv.textContent = 'الرجاء إدخال رقم هاتف صحيح';
        errorDiv.classList.remove('hidden');
        submitButton.disabled = false;
        submitButton.textContent = '🛒 تأكيد الطلب';
        return;
    }

    if (!customerAddress || customerAddress.length < 10) {
        errorDiv.textContent = 'الرجاء إدخال عنوان كامل';
        errorDiv.classList.remove('hidden');
        submitButton.disabled = false;
        submitButton.textContent = '🛒 تأكيد الطلب';
        return;
    }

    if (isNaN(quantity) || quantity < 1 || quantity > 1000) {
        errorDiv.textContent = 'الكمية يجب أن تكون بين 1 و 1000';
        errorDiv.classList.remove('hidden');
        submitButton.disabled = false;
        submitButton.textContent = '🛒 تأكيد الطلب';
        return;
    }

    // Check stock availability
    if (currentProduct && currentProduct.stock !== undefined && currentProduct.stock !== null) {
        if (currentProduct.stock === 0) {
            errorDiv.textContent = 'عذراً، هذا المنتج غير متوفر حالياً';
            errorDiv.classList.remove('hidden');
            submitButton.disabled = false;
            submitButton.textContent = '🛒 تأكيد الطلب';
            return;
        }
        if (quantity > currentProduct.stock) {
            errorDiv.textContent = `عذراً، الكمية المتوفرة هي ${currentProduct.stock} قطعة فقط`;
            errorDiv.classList.remove('hidden');
            submitButton.disabled = false;
            submitButton.textContent = '🛒 تأكيد الطلب';
            return;
        }
    }

    const orderData = {
        productId: productId,
        customerName: customerName,
        customerPhone: customerPhone,
        customerAddress: customerAddress,
        quantity: quantity
    };

    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });

        if (response.ok) {
            const orderData = await response.json();
            const orderNumber = orderData.orderNumber || orderData.id;
            
            // Show success message with order number
            successDiv.innerHTML = `
                <div style="text-align: center; padding: var(--space-3);">
                    <h3 style="color: var(--success); margin-bottom: var(--space-2); font-size: var(--font-size-xl);">✅ تم إرسال الطلب بنجاح!</h3>
                    <p style="font-size: var(--font-size-lg); margin: var(--space-2) 0;">
                        <strong>رقم الطلب:</strong> 
                        <span style="color: var(--primary); font-weight: var(--font-weight-bold); font-size: var(--font-size-2xl);">${orderNumber}</span>
                    </p>
                    <p style="color: var(--text-light); margin-top: var(--space-2);">سيتم التواصل معك قريباً لتأكيد الطلب</p>
                </div>
            `;
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
        submitButton.textContent = '🛒 تأكيد الطلب';
    }
});

// Image zoom modal
function openImageZoom(imageUrl) {
    const modal = document.createElement('div');
    modal.className = 'image-zoom-modal';
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
        animation: fadeIn 0.3s ease;
    `;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'تكبير الصورة');

    const imgContainer = document.createElement('div');
    imgContainer.style.cssText = `
        position: relative;
        max-width: 95%;
        max-height: 95%;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.cssText = `
        max-width: 100%;
        max-height: 95vh;
        border-radius: 8px;
        box-shadow: 0 0 50px rgba(255, 255, 255, 0.3);
        object-fit: contain;
    `;
    img.alt = 'صورة المنتج';
    img.onerror = function() {
        imgContainer.innerHTML = '<p style="color: white;">فشل تحميل الصورة</p>';
    };

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
        position: absolute;
        top: 20px;
        right: 20px;
        background: rgba(255, 255, 255, 0.2);
        border: 2px solid white;
        color: white;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        font-size: 24px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s;
        z-index: 10001;
    `;
    closeBtn.setAttribute('aria-label', 'إغلاق');
    closeBtn.onmouseover = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.4)';
    closeBtn.onmouseout = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';

    const closeModal = () => {
        document.body.removeChild(modal);
        document.body.style.overflow = '';
    };

    closeBtn.onclick = (e) => {
        e.stopPropagation();
        closeModal();
    };

    modal.onclick = (e) => {
        if (e.target === modal) {
            closeModal();
        }
    };

    // Keyboard support
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleKeyDown);
        }
    };
    document.addEventListener('keydown', handleKeyDown);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    imgContainer.appendChild(img);
    imgContainer.appendChild(closeBtn);
    modal.appendChild(imgContainer);
    document.body.appendChild(modal);
}

// Slider functions
function updateSlider() {
    const track = document.getElementById('sliderTrack');
    const dots = document.querySelectorAll('.dot');

    if (track && window.totalSlides) {
        // For RTL: positive value moves right (to previous slide), negative moves left (to next slide)
        const translateValue = window.currentSlide * 100;
        track.style.transform = `translateX(${translateValue}%)`;
        track.style.transition = 'transform 0.3s ease';
    }

    if (dots && dots.length > 0) {
        dots.forEach((dot, index) => {
            if (index === window.currentSlide) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
    }
}

function moveSlider(direction) {
    // In RTL: direction 1 = move right (previous), direction -1 = move left (next)
    window.currentSlide = (window.currentSlide - direction + window.totalSlides) % window.totalSlides;
    updateSlider();
}

function goToSlide(index) {
    window.currentSlide = index;
    updateSlider();
    
    // Update thumbnail active state
    const thumbnails = document.querySelectorAll('.thumbnail-item');
    thumbnails.forEach((thumb, i) => {
        if (i === index) {
            thumb.classList.add('active');
        } else {
            thumb.classList.remove('active');
        }
    });
}

// Share Functions
function shareToFacebook() {
    const productUrl = window.location.href;
    const productName = currentProduct ? currentProduct.name : 'منتج';
    const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(productUrl)}`;
    window.open(shareUrl, '_blank', 'width=600,height=400');
}

function shareToWhatsApp() {
    const productUrl = window.location.href;
    const productName = currentProduct ? currentProduct.name : 'منتج';
    const message = `شاهد هذا المنتج: ${productName}\n${productUrl}`;
    const shareUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(shareUrl, '_blank');
}

function copyProductLink() {
    const productUrl = window.location.href;
    navigator.clipboard.writeText(productUrl).then(() => {
        showNotification('تم نسخ رابط المنتج! 🎉', 'success');
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = productUrl;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showNotification('تم نسخ رابط المنتج! 🎉', 'success');
        } catch (err) {
            showNotification('فشل نسخ الرابط', 'error');
        }
        document.body.removeChild(textArea);
    });
}

// Quantity Functions
function increaseQuantity() {
    const quantityInput = document.getElementById('quantity');
    const max = parseInt(quantityInput.getAttribute('max')) || 1000;
    const current = parseInt(quantityInput.value) || 1;
    
    if (currentProduct && currentProduct.stock !== undefined && currentProduct.stock !== null) {
        const maxQuantity = Math.min(max, currentProduct.stock);
        if (current < maxQuantity) {
            quantityInput.value = current + 1;
        } else {
            showNotification(`الكمية المتوفرة هي ${maxQuantity} قطعة فقط`, 'warning');
        }
    } else {
        if (current < max) {
            quantityInput.value = current + 1;
        }
    }
}

function decreaseQuantity() {
    const quantityInput = document.getElementById('quantity');
    const current = parseInt(quantityInput.value) || 1;
    const min = parseInt(quantityInput.getAttribute('min')) || 1;
    
    if (current > min) {
        quantityInput.value = current - 1;
    }
}

// Contact Functions
function setupContactButtons(product) {
    // You can configure these phone numbers in admin panel or use default
    const whatsappNumber = '1234567890'; // Replace with actual WhatsApp number
    const phoneNumber = '1234567890'; // Replace with actual phone number
    
    const whatsappBtn = document.getElementById('whatsappBtn');
    const phoneBtn = document.getElementById('phoneBtn');
    
    if (whatsappBtn) {
        whatsappBtn.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`مرحباً، أريد الاستفسار عن المنتج: ${product.name}`)}`;
    }
    
    if (phoneBtn) {
        phoneBtn.href = `tel:${phoneNumber}`;
    }
}

function openWhatsApp() {
    const whatsappBtn = document.getElementById('whatsappBtn');
    if (whatsappBtn && whatsappBtn.href) {
        window.open(whatsappBtn.href, '_blank');
    }
}

function callPhone() {
    const phoneBtn = document.getElementById('phoneBtn');
    if (phoneBtn && phoneBtn.href) {
        window.location.href = phoneBtn.href;
    }
}

// Image Thumbnails
function createImageThumbnails(imageUrls, productName) {
    const thumbnailsContainer = document.getElementById('imageThumbnails');
    if (!thumbnailsContainer) return;
    
    thumbnailsContainer.innerHTML = '';
    thumbnailsContainer.classList.remove('hidden');
    
    imageUrls.forEach((url, index) => {
        const thumbnail = document.createElement('div');
        thumbnail.className = 'thumbnail-item';
        if (index === 0) thumbnail.classList.add('active');
        
        const img = document.createElement('img');
        img.src = url;
        img.alt = escapeHtml(productName) + ` - صورة ${index + 1}`;
        img.loading = 'lazy';
        
        thumbnail.onclick = () => {
            // Remove active class from all thumbnails
            document.querySelectorAll('.thumbnail-item').forEach(item => {
                item.classList.remove('active');
            });
            // Add active class to clicked thumbnail
            thumbnail.classList.add('active');
            // Change main slider to this image
            goToSlide(index);
        };
        
        thumbnail.appendChild(img);
        thumbnailsContainer.appendChild(thumbnail);
    });
}

// Display Product Specifications
function displaySpecifications(product) {
    const specsCard = document.getElementById('specificationsCard');
    const specsContent = document.getElementById('specificationsContent');
    
    if (!specsCard || !specsContent) return;
    
    // Check if product has specifications data
    // You can add specifications to product data in admin panel
    const specifications = product.specifications || {};
    
    if (Object.keys(specifications).length > 0) {
        specsCard.style.display = 'block';
        
        const table = document.createElement('table');
        table.className = 'spec-table';
        
        Object.entries(specifications).forEach(([key, value]) => {
            const row = document.createElement('tr');
            const keyCell = document.createElement('td');
            const valueCell = document.createElement('td');
            
            keyCell.textContent = key;
            valueCell.textContent = value;
            
            row.appendChild(keyCell);
            row.appendChild(valueCell);
            table.appendChild(row);
        });
        
        specsContent.innerHTML = '';
        specsContent.appendChild(table);
    }
}

// Notification function
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : type === 'warning' ? 'var(--warning)' : 'var(--primary)'};
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
