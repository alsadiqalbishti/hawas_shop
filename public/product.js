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
        
        
        // Check if we have multiple images or videos
        if (validMediaUrls.length > 0) {
            if (product.mediaType === 'video' || validMediaUrls.some(url => url.includes('data:video') || url.includes('.mp4') || url.includes('.webm'))) {
                // Handle multiple videos or mixed media
                createVideoGallery(validMediaUrls, product.name, mediaContainer);
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
                    img.style.cssText = 'width: 100%; height: 100%; object-fit: contain; border-radius: 12px; cursor: pointer; display: block; transition: transform 0.3s ease;';
                    img.loading = index === 0 ? 'eager' : 'lazy';
                    img.onerror = function() {
                        this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="18" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3Eفشل تحميل الصورة%3C/text%3E%3C/svg%3E';
                    };
                    img.onclick = () => openImageZoom(url);
                    
                    // Image zoom on hover wrapper
                    const imageWrapper = document.createElement('div');
                    imageWrapper.style.cssText = 'position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: 12px;';
                    imageWrapper.onmouseenter = function() {
                        img.style.transform = 'scale(1.3)';
                        img.style.cursor = 'zoom-in';
                    };
                    imageWrapper.onmouseleave = function() {
                        img.style.transform = 'scale(1)';
                    };
                    imageWrapper.onmousemove = function(e) {
                        const rect = this.getBoundingClientRect();
                        const x = ((e.clientX - rect.left) / rect.width) * 100;
                        const y = ((e.clientY - rect.top) / rect.height) * 100;
                        img.style.transformOrigin = `${x}% ${y}%`;
                    };
                    imageWrapper.appendChild(img);
                    slide.appendChild(imageWrapper);
                    sliderTrack.appendChild(slide);
                });

                // Create image thumbnails if multiple images
                if (validMediaUrls.length > 1) {
                    createImageThumbnails(validMediaUrls, product.name);
                }

                // For RTL: 
                // - Right button (prev) should point LEFT (❮) to go to previous slide (visually to the right)
                // - Left button (next) should point RIGHT (❯) to go to next slide (visually to the left)
                const prevBtn = document.createElement('button');
                prevBtn.className = 'slider-btn prev-btn';
                prevBtn.textContent = '❮'; // Left arrow for right button (goes to previous/right)
                prevBtn.onclick = () => moveSlider(1); // In RTL, prev moves right (positive)
                prevBtn.setAttribute('aria-label', 'الصورة السابقة');

                const nextBtn = document.createElement('button');
                nextBtn.className = 'slider-btn next-btn';
                nextBtn.textContent = '❯'; // Right arrow for left button (goes to next/left)
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

        // Display stock badge with countdown urgency
        const stockBadge = document.getElementById('stockBadge');
        if (product.stock !== undefined && product.stock !== null) {
            stockBadge.classList.remove('hidden');
            if (product.stock === 0) {
                stockBadge.className = 'stock-badge out-of-stock';
                stockBadge.innerHTML = '❌ <span>نفد المخزون</span>';
            } else if (product.stock <= 5) {
                stockBadge.className = 'stock-badge low-stock';
                stockBadge.innerHTML = `⚠️ <span>فقط ${product.stock} متبقي في المخزون! - مخزون منخفض</span>`;
                stockBadge.style.animation = 'pulse 2s infinite';
            } else if (product.stock <= 20) {
                stockBadge.className = 'stock-badge low-stock';
                stockBadge.innerHTML = `⚠️ <span>فقط ${product.stock} متبقي في المخزون</span>`;
            } else {
                stockBadge.className = 'stock-badge in-stock';
                stockBadge.innerHTML = `✅ <span>متوفر (${product.stock} قطعة)</span>`;
            }
        }

        // Display product SKU/ID (enhanced)
        const productSku = document.getElementById('productSku');
        if (product.id) {
            productSku.innerHTML = `<strong>رقم المنتج:</strong> <span style="font-family: monospace; background: var(--light); padding: 2px 8px; border-radius: 4px;">${product.id}</span>`;
            productSku.classList.remove('hidden');
            productSku.style.cssText = 'font-size: var(--font-size-sm); color: var(--text-light); margin-top: var(--space-2);';
        }
        
        // Display dynamic features
        displayProductFeatures(product);

        // Load store settings (shipping info, return policy, etc.)
        loadStoreSettings();

        // Display specifications if available
        displaySpecifications(product);

        // Display product variants if available
        displayProductVariants(product);

        // Show size chart button if applicable
        checkSizeChart(product);

        // Load bundle deals
        loadBundleDeals(product);

        // Load related products
        loadRelatedProducts(product);

        // Add to recently viewed
        addToRecentlyViewed(product);

        // Load recently viewed products
        loadRecentlyViewed();

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

// Full-Screen Image Viewer (Lightbox) with Navigation
let lightboxImages = [];
let currentLightboxIndex = 0;

function openImageZoom(imageUrl) {
    if (!currentProduct || !currentProduct.mediaUrls) return;
    
    // Get all valid image URLs
    const validMediaUrls = (currentProduct.mediaUrls || [])
        .filter(url => {
            if (!url) return false;
            const urlStr = typeof url === 'string' ? url.trim() : String(url);
            return urlStr !== '' && urlStr !== 'null' && urlStr !== 'undefined' && urlStr.length > 10;
        })
        .map(url => typeof url === 'string' ? url.trim() : String(url));
    
    if (validMediaUrls.length === 0) return;
    
    lightboxImages = validMediaUrls;
    currentLightboxIndex = validMediaUrls.indexOf(imageUrl);
    if (currentLightboxIndex === -1) currentLightboxIndex = 0;
    
    const lightbox = document.getElementById('imageLightbox');
    const lightboxImage = document.getElementById('lightboxImage');
    const lightboxCounter = document.getElementById('lightboxCounter');
    
    if (lightbox && lightboxImage) {
        lightboxImage.src = lightboxImages[currentLightboxIndex];
        lightboxCounter.textContent = `${currentLightboxIndex + 1} / ${lightboxImages.length}`;
        lightbox.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        
        // Show/hide navigation buttons
        const prevBtn = document.querySelector('.lightbox-prev');
        const nextBtn = document.querySelector('.lightbox-next');
        if (prevBtn) prevBtn.style.display = lightboxImages.length > 1 ? 'flex' : 'none';
        if (nextBtn) nextBtn.style.display = lightboxImages.length > 1 ? 'flex' : 'none';
    }
}

function closeLightbox() {
    const lightbox = document.getElementById('imageLightbox');
    if (lightbox) {
        lightbox.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

function lightboxPrev() {
    if (lightboxImages.length === 0) return;
    currentLightboxIndex = (currentLightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
    updateLightboxImage();
}

function lightboxNext() {
    if (lightboxImages.length === 0) return;
    currentLightboxIndex = (currentLightboxIndex + 1) % lightboxImages.length;
    updateLightboxImage();
}

function updateLightboxImage() {
    const lightboxImage = document.getElementById('lightboxImage');
    const lightboxCounter = document.getElementById('lightboxCounter');
    
    if (lightboxImage && lightboxImages[currentLightboxIndex]) {
        lightboxImage.src = lightboxImages[currentLightboxIndex];
        lightboxCounter.textContent = `${currentLightboxIndex + 1} / ${lightboxImages.length}`;
    }
}

// Keyboard navigation for lightbox
document.addEventListener('keydown', (e) => {
    const lightbox = document.getElementById('imageLightbox');
    if (lightbox && !lightbox.classList.contains('hidden')) {
        if (e.key === 'Escape') {
            closeLightbox();
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            // In RTL: ArrowRight goes to previous, ArrowLeft goes to next
            if (e.key === 'ArrowRight') {
                lightboxPrev();
            } else {
                lightboxNext();
            }
        }
    }
});

// Load Bundle Deals
async function loadBundleDeals(currentProduct) {
    try {
        const response = await fetch('/api/products');
        if (!response.ok) return;
        
        const allProducts = await response.json();
        if (!Array.isArray(allProducts)) return;
        
        // Check if current product has bundle deals configured
        const bundleProductIds = currentProduct.bundleProducts || [];
        if (!bundleProductIds || bundleProductIds.length === 0) return;
        
        // Get bundle products
        const bundleProducts = allProducts.filter(p => bundleProductIds.includes(p.id));
        if (bundleProducts.length === 0) return;
        
        const section = document.getElementById('bundleDealsSection');
        const grid = document.getElementById('bundleDealsGrid');
        
        if (!section || !grid) return;
        
        section.style.display = 'block';
        grid.innerHTML = '';
        
        // Calculate bundle price
        const bundlePrice = bundleProducts.reduce((sum, p) => {
            const price = p.discountPrice && p.discountPrice < p.price ? p.discountPrice : p.price;
            return sum + parseFloat(price);
        }, parseFloat(currentProduct.discountPrice && currentProduct.discountPrice < currentProduct.price ? currentProduct.discountPrice : currentProduct.price));
        
        const bundleDiscount = currentProduct.bundleDiscount || 10; // Default 10% discount
        const finalBundlePrice = bundlePrice * (1 - bundleDiscount / 100);
        
        // Bundle header
        const bundleHeader = document.createElement('div');
        bundleHeader.style.cssText = 'grid-column: 1 / -1; background: linear-gradient(135deg, var(--primary), var(--secondary)); color: white; padding: var(--space-4); border-radius: var(--radius-lg); margin-bottom: var(--space-3);';
        bundleHeader.innerHTML = `
            <h3 style="margin: 0 0 var(--space-2) 0; font-size: var(--font-size-xl);">🎁 اشترِ معاً ووفر ${bundleDiscount}%</h3>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="text-decoration: line-through; opacity: 0.8; font-size: var(--font-size-lg);">${formatPrice(bundlePrice)} د.ل</div>
                    <div style="font-size: var(--font-size-2xl); font-weight: bold;">${formatPrice(finalBundlePrice)} د.ل</div>
                </div>
                <div style="background: rgba(255,255,255,0.2); padding: var(--space-2) var(--space-4); border-radius: var(--radius-full);">
                    وفر ${formatPrice(bundlePrice - finalBundlePrice)} د.ل
                </div>
            </div>
        `;
        grid.appendChild(bundleHeader);
        
        // Current product in bundle
        const currentProductCard = createBundleProductCard(currentProduct, true);
        grid.appendChild(currentProductCard);
        
        // Bundle products
        bundleProducts.forEach(product => {
            const card = createBundleProductCard(product, false);
            grid.appendChild(card);
        });
        
    } catch (error) {
        console.error('Error loading bundle deals:', error);
    }
}

// Create bundle product card
function createBundleProductCard(product, isMain = false) {
    const card = document.createElement('div');
    card.className = 'bundle-product-card';
    card.style.cssText = 'background: var(--white); border-radius: var(--radius-lg); padding: var(--space-3); box-shadow: var(--shadow-md); display: flex; gap: var(--space-3); align-items: center;';
    if (isMain) card.style.border = '2px solid var(--primary)';
    
    const image = document.createElement('img');
    const mediaUrls = product.mediaUrls || [];
    const firstImage = mediaUrls.length > 0 ? mediaUrls[0] : (product.mediaUrl || '');
    image.src = firstImage || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3C/svg%3E';
    image.style.cssText = 'width: 80px; height: 80px; object-fit: cover; border-radius: var(--radius-md);';
    image.alt = escapeHtml(product.name);
    
    const info = document.createElement('div');
    info.style.flex = '1';
    
    const name = document.createElement('div');
    name.style.cssText = 'font-weight: bold; margin-bottom: var(--space-1); color: var(--dark);';
    name.textContent = product.name;
    
    const price = document.createElement('div');
    price.style.cssText = 'color: var(--primary); font-weight: bold;';
    const displayPrice = product.discountPrice && product.discountPrice < product.price 
        ? product.discountPrice 
        : product.price;
    price.textContent = `${formatPrice(displayPrice)} د.ل`;
    
    info.appendChild(name);
    info.appendChild(price);
    
    card.appendChild(image);
    card.appendChild(info);
    
    return card;
}

// Print Product Page
function printProductPage() {
    const printWindow = window.open('', '_blank');
    const productName = currentProduct ? escapeHtml(currentProduct.name) : 'المنتج';
    const productPrice = currentProduct ? formatPrice(currentProduct.discountPrice && currentProduct.discountPrice < currentProduct.price ? currentProduct.discountPrice : currentProduct.price) : '';
    const productDescription = currentProduct ? escapeHtml(currentProduct.description || '') : '';
    const productId = currentProduct ? currentProduct.id : '';
    
    const mediaUrls = currentProduct && currentProduct.mediaUrls ? currentProduct.mediaUrls : [];
    const firstImage = mediaUrls.length > 0 ? mediaUrls[0] : (currentProduct && currentProduct.mediaUrl ? currentProduct.mediaUrl : '');
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>${productName} - طباعة</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                .print-header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                .print-content { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
                .print-image { max-width: 100%; height: auto; border: 1px solid #ddd; }
                .print-info h1 { margin: 0 0 20px 0; }
                .print-price { font-size: 24px; font-weight: bold; color: #6366f1; margin: 20px 0; }
                .print-description { margin-top: 20px; line-height: 1.8; }
                .print-footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #666; }
                @media print {
                    body { padding: 0; }
                    .print-header { page-break-after: avoid; }
                }
            </style>
        </head>
        <body>
            <div class="print-header">
                <h1>${productName}</h1>
                <p>رقم المنتج: ${productId}</p>
            </div>
            <div class="print-content">
                <div>
                    ${firstImage ? `<img src="${firstImage}" alt="${productName}" class="print-image">` : ''}
                </div>
                <div class="print-info">
                    <h1>${productName}</h1>
                    <div class="print-price">${productPrice} د.ل</div>
                    <div class="print-description">${productDescription}</div>
                </div>
            </div>
            <div class="print-footer">
                <p>تم الطباعة من: ${window.location.href}</p>
                <p>تاريخ الطباعة: ${new Date().toLocaleString('ar-EG')}</p>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
    }, 250);
}

// Related Products
async function loadRelatedProducts(currentProduct) {
    try {
        const response = await fetch('/api/products');
        if (!response.ok) return;
        
        const allProducts = await response.json();
        if (!Array.isArray(allProducts)) return;
        
        // Filter out current product and get up to 4 related products
        const related = allProducts
            .filter(p => p.id !== currentProduct.id)
            .slice(0, 4);
        
        if (related.length === 0) return;
        
        const section = document.getElementById('relatedProductsSection');
        const grid = document.getElementById('relatedProductsGrid');
        
        if (!section || !grid) return;
        
        grid.innerHTML = '';
        
        related.forEach(product => {
            const card = document.createElement('a');
            card.href = `/product.html?id=${product.id}`;
            card.className = 'related-product-card';
            
            const image = document.createElement('img');
            const mediaUrls = product.mediaUrls || [];
            const firstImage = mediaUrls.length > 0 ? mediaUrls[0] : (product.mediaUrl || '');
            image.src = firstImage || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3C/svg%3E';
            image.className = 'related-product-image';
            image.alt = escapeHtml(product.name);
            image.onerror = function() {
                this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3C/svg%3E';
            };
            
            const info = document.createElement('div');
            info.className = 'related-product-info';
            
            const name = document.createElement('div');
            name.className = 'related-product-name';
            name.textContent = product.name;
            
            const price = document.createElement('div');
            price.className = 'related-product-price';
            const displayPrice = product.discountPrice && product.discountPrice < product.price 
                ? product.discountPrice 
                : product.price;
            price.textContent = `${formatPrice(displayPrice)} د.ل`;
            
            info.appendChild(name);
            info.appendChild(price);
            
            card.appendChild(image);
            card.appendChild(info);
            grid.appendChild(card);
        });
        
        section.style.display = 'block';
    } catch (error) {
        console.error('Error loading related products:', error);
    }
}

// Recently Viewed Products
function addToRecentlyViewed(product) {
    try {
        let recentlyViewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
        
        // Remove if already exists
        recentlyViewed = recentlyViewed.filter(p => p.id !== product.id);
        
        // Add to beginning
        recentlyViewed.unshift({
            id: product.id,
            name: product.name,
            price: product.price,
            discountPrice: product.discountPrice,
            mediaUrl: (product.mediaUrls && product.mediaUrls[0]) || product.mediaUrl || ''
        });
        
        // Keep only last 4
        recentlyViewed = recentlyViewed.slice(0, 4);
        
        localStorage.setItem('recentlyViewed', JSON.stringify(recentlyViewed));
    } catch (error) {
        console.error('Error saving to recently viewed:', error);
    }
}

function loadRecentlyViewed() {
    try {
        const recentlyViewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
        
        // Filter out current product
        const filtered = recentlyViewed.filter(p => p.id !== productId);
        
        if (filtered.length === 0) return;
        
        const section = document.getElementById('recentlyViewedSection');
        const grid = document.getElementById('recentlyViewedGrid');
        
        if (!section || !grid) return;
        
        grid.innerHTML = '';
        
        filtered.forEach(product => {
            const card = document.createElement('a');
            card.href = `/product.html?id=${product.id}`;
            card.className = 'related-product-card';
            
            const image = document.createElement('img');
            image.src = product.mediaUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3C/svg%3E';
            image.className = 'related-product-image';
            image.alt = escapeHtml(product.name);
            image.onerror = function() {
                this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3C/svg%3E';
            };
            
            const info = document.createElement('div');
            info.className = 'related-product-info';
            
            const name = document.createElement('div');
            name.className = 'related-product-name';
            name.textContent = product.name;
            
            const price = document.createElement('div');
            price.className = 'related-product-price';
            const displayPrice = product.discountPrice && product.discountPrice < product.price 
                ? product.discountPrice 
                : product.price;
            price.textContent = `${formatPrice(displayPrice)} د.ل`;
            
            info.appendChild(name);
            info.appendChild(price);
            
            card.appendChild(image);
            card.appendChild(info);
            grid.appendChild(card);
        });
        
        section.style.display = 'block';
    } catch (error) {
        console.error('Error loading recently viewed:', error);
    }
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

// Load Store Settings
async function loadStoreSettings() {
    try {
        const response = await fetch('/api/settings');
        if (!response.ok) {
            // Use default values if settings not found
            return;
        }
        
        const settings = await response.json();
        
        // Update shipping information with visibility control
        const shippingTimeItem = document.getElementById('shippingTimeItem');
        if (shippingTimeItem) {
            if (settings.showShippingTime !== false && settings.shippingTime) {
                shippingTimeItem.style.display = '';
                const el = document.getElementById('shippingTime');
                if (el) el.textContent = settings.shippingTime;
            } else {
                shippingTimeItem.style.display = 'none';
            }
        }
        
        const shippingCostItem = document.getElementById('shippingCostItem');
        if (shippingCostItem) {
            if (settings.showShippingCost !== false && settings.shippingCost) {
                shippingCostItem.style.display = '';
                const el = document.getElementById('shippingCost');
                if (el) el.textContent = settings.shippingCost;
            } else {
                shippingCostItem.style.display = 'none';
            }
        }
        
        const shippingAreasItem = document.getElementById('shippingAreasItem');
        if (shippingAreasItem) {
            if (settings.showShippingAreas !== false && settings.shippingAreas) {
                shippingAreasItem.style.display = '';
                const el = document.getElementById('shippingAreas');
                if (el) el.textContent = settings.shippingAreas;
            } else {
                shippingAreasItem.style.display = 'none';
            }
        }
        
        const shippingMethodsItem = document.getElementById('shippingMethodsItem');
        if (shippingMethodsItem) {
            if (settings.showShippingMethods !== false && settings.shippingMethods) {
                shippingMethodsItem.style.display = '';
                const el = document.getElementById('shippingMethods');
                if (el) el.textContent = settings.shippingMethods;
            } else {
                shippingMethodsItem.style.display = 'none';
            }
        }
        
        // Update return policy with visibility control
        const returnPeriodItem = document.getElementById('returnPeriodItem');
        if (returnPeriodItem) {
            if (settings.showReturnPeriod !== false && settings.returnPeriod) {
                returnPeriodItem.style.display = '';
                const el = document.getElementById('returnPeriod');
                if (el) el.textContent = settings.returnPeriod;
            } else {
                returnPeriodItem.style.display = 'none';
            }
        }
        
        const returnConditionsItem = document.getElementById('returnConditionsItem');
        if (returnConditionsItem) {
            if (settings.showReturnConditions !== false && settings.returnConditions) {
                returnConditionsItem.style.display = '';
                const el = document.getElementById('returnConditions');
                if (el) el.textContent = settings.returnConditions;
            } else {
                returnConditionsItem.style.display = 'none';
            }
        }
        
        const refundTimeItem = document.getElementById('refundTimeItem');
        if (refundTimeItem) {
            if (settings.showRefundTime !== false && settings.refundTime) {
                refundTimeItem.style.display = '';
                const el = document.getElementById('refundTime');
                if (el) el.textContent = settings.refundTime;
            } else {
                refundTimeItem.style.display = 'none';
            }
        }
        
        const returnContactItem = document.getElementById('returnContactItem');
        if (returnContactItem) {
            if (settings.showReturnContact !== false && settings.returnContact) {
                returnContactItem.style.display = '';
                const el = document.getElementById('returnContact');
                if (el) {
                    // Use textContent to prevent HTML/phone auto-linking
                    el.textContent = settings.returnContact;
                    // Ensure no phone number auto-linking
                    el.style.userSelect = 'none';
                    el.style.webkitTouchCallout = 'none';
                }
            } else {
                returnContactItem.style.display = 'none';
            }
        }
        
        // Hide entire sections if all items are hidden
        const shippingInfoCard = document.getElementById('shippingInfoCard');
        if (shippingInfoCard) {
            const visibleItems = ['shippingTimeItem', 'shippingCostItem', 'shippingAreasItem', 'shippingMethodsItem']
                .map(id => document.getElementById(id))
                .filter(el => el && el.style.display !== 'none');
            if (visibleItems.length === 0) {
                shippingInfoCard.style.display = 'none';
            }
        }
        
        const returnPolicyCard = document.getElementById('returnPolicyCard');
        if (returnPolicyCard) {
            const visibleItems = ['returnPeriodItem', 'returnConditionsItem', 'refundTimeItem', 'returnContactItem']
                .map(id => document.getElementById(id))
                .filter(el => el && el.style.display !== 'none');
            if (visibleItems.length === 0) {
                returnPolicyCard.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error loading store settings:', error);
        // Use default values on error
    }
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

// Display dynamic product features
function displayProductFeatures(product) {
    const featuresContainer = document.getElementById('productFeatures');
    if (!featuresContainer) return;
    
    // Get features from product data or use default from store settings
    let features = product.features;
    
    // If no product features, try to get from store settings
    if (!features || !Array.isArray(features) || features.length === 0) {
        // Try to load from localStorage (store settings)
        const storeSettings = localStorage.getItem('storeSettings');
        if (storeSettings) {
            try {
                const settings = JSON.parse(storeSettings);
                features = settings.productFeatures || [];
            } catch (e) {
                // Use default features
                features = [
                    { icon: '🚚', text: 'توصيل سريع لجميع المدن' },
                    { icon: '✅', text: 'ضمان الجودة والأصالة' },
                    { icon: '💳', text: 'الدفع عند الاستلام' },
                    { icon: '🎯', text: 'خدمة عملاء متميزة' }
                ];
            }
        } else {
            // Default features
            features = [
                { icon: '🚚', text: 'توصيل سريع لجميع المدن' },
                { icon: '✅', text: 'ضمان الجودة والأصالة' },
                { icon: '💳', text: 'الدفع عند الاستلام' },
                { icon: '🎯', text: 'خدمة عملاء متميزة' }
            ];
        }
    }
    
    // Render features
    featuresContainer.innerHTML = '';
    features.forEach(feature => {
        const featureItem = document.createElement('div');
        featureItem.className = 'feature-item';
        const featureText = typeof feature === 'string' ? feature : (feature.text || feature);
        const featureIcon = typeof feature === 'object' && feature.icon ? feature.icon : '✅';
        featureItem.innerHTML = `
            <div class="feature-icon">${featureIcon}</div>
            <div class="feature-text">${escapeHtml(featureText)}</div>
        `;
        featuresContainer.appendChild(featureItem);
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

// Video Gallery Support (Enhanced with thumbnails and better controls)
function createVideoGallery(videoUrls, productName, container) {
    container.innerHTML = '';
    
    if (videoUrls.length === 1) {
        // Single video with enhanced controls
        const videoWrapper = document.createElement('div');
        videoWrapper.style.cssText = 'position: relative; width: 100%; border-radius: 12px; overflow: hidden; background: #000;';
        
        const video = document.createElement('video');
        video.src = videoUrls[0];
        video.controls = true;
        video.className = 'product-video';
        video.style.cssText = 'width: 100%; max-height: 70vh; display: block;';
        video.preload = 'metadata';
        video.textContent = 'متصفحك لا يدعم تشغيل الفيديو';
        
        videoWrapper.appendChild(video);
        container.appendChild(videoWrapper);
    } else {
        // Multiple videos - create gallery with thumbnails
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-gallery';
        videoContainer.style.cssText = 'display: grid; gap: var(--space-3);';
        
        // Main video player
        const mainVideoWrapper = document.createElement('div');
        mainVideoWrapper.style.cssText = 'position: relative; width: 100%; border-radius: 12px; overflow: hidden; background: #000;';
        
        const mainVideo = document.createElement('video');
        mainVideo.src = videoUrls[0];
        mainVideo.controls = true;
        mainVideo.className = 'product-video';
        mainVideo.style.cssText = 'width: 100%; max-height: 70vh; display: block;';
        mainVideo.preload = 'metadata';
        mainVideo.id = 'mainProductVideo';
        
        mainVideoWrapper.appendChild(mainVideo);
        videoContainer.appendChild(mainVideoWrapper);
        
        // Video thumbnails
        const thumbnailsContainer = document.createElement('div');
        thumbnailsContainer.className = 'video-thumbnails';
        thumbnailsContainer.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: var(--space-2); margin-top: var(--space-3);';
        
        videoUrls.forEach((url, index) => {
            const thumbWrapper = document.createElement('div');
            thumbWrapper.className = 'video-thumbnail';
            thumbWrapper.style.cssText = 'position: relative; aspect-ratio: 16/9; border-radius: 8px; overflow: hidden; cursor: pointer; border: 2px solid transparent; transition: all 0.3s;';
            if (index === 0) thumbWrapper.style.borderColor = 'var(--primary)';
            
            const thumbVideo = document.createElement('video');
            thumbVideo.src = url;
            thumbVideo.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
            thumbVideo.muted = true;
            thumbVideo.preload = 'metadata';
            
            // Play overlay
            const playOverlay = document.createElement('div');
            playOverlay.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 2rem; color: white;';
            playOverlay.innerHTML = '▶️';
            
            thumbWrapper.onclick = function() {
                mainVideo.src = url;
                mainVideo.load();
                document.querySelectorAll('.video-thumbnail').forEach(t => t.style.borderColor = 'transparent');
                this.style.borderColor = 'var(--primary)';
            };
            
            thumbWrapper.onmouseenter = function() {
                this.style.transform = 'scale(1.05)';
                thumbVideo.play();
            };
            thumbWrapper.onmouseleave = function() {
                this.style.transform = 'scale(1)';
                thumbVideo.pause();
                thumbVideo.currentTime = 0;
            };
            
            thumbWrapper.appendChild(thumbVideo);
            thumbWrapper.appendChild(playOverlay);
            thumbnailsContainer.appendChild(thumbWrapper);
        });
        
        videoContainer.appendChild(thumbnailsContainer);
        container.appendChild(videoContainer);
    }
}

// Product Variants
function displayProductVariants(product) {
    const variantsSection = document.getElementById('productVariants');
    const variantsContainer = document.getElementById('variantsContainer');
    
    if (!variantsSection || !variantsContainer) return;
    
    // Check if product has variants (e.g., size, color)
    const variants = product.variants || {};
    
    if (Object.keys(variants).length === 0) return;
    
    variantsContainer.innerHTML = '';
    
    Object.entries(variants).forEach(([variantType, options]) => {
        const group = document.createElement('div');
        group.className = 'variant-group';
        
        const label = document.createElement('div');
        label.className = 'variant-label';
        label.textContent = variantType === 'size' ? 'المقاس' : variantType === 'color' ? 'اللون' : variantType;
        
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'variant-options';
        
        if (Array.isArray(options)) {
            options.forEach(option => {
                const optionBtn = document.createElement('button');
                optionBtn.type = 'button';
                optionBtn.className = 'variant-option';
                optionBtn.textContent = option.label || option;
                optionBtn.onclick = () => selectVariant(variantType, option);
                optionsContainer.appendChild(optionBtn);
            });
        }
        
        group.appendChild(label);
        group.appendChild(optionsContainer);
        variantsContainer.appendChild(group);
    });
    
    variantsSection.classList.remove('hidden');
}

function selectVariant(variantType, option) {
    // Remove selected class from all options in this group
    const group = event.target.closest('.variant-group');
    if (group) {
        group.querySelectorAll('.variant-option').forEach(btn => {
            btn.classList.remove('selected');
        });
        
        // Add selected class to clicked option
        event.target.classList.add('selected');
        
        // Store selected variant (can be used when ordering)
        if (!window.selectedVariants) window.selectedVariants = {};
        window.selectedVariants[variantType] = option;
    }
}

// Size Chart
function checkSizeChart(product) {
    const sizeChartSection = document.getElementById('sizeChartSection');
    if (!sizeChartSection) return;
    
    // Show size chart if product has size-related keywords or if explicitly set
    const hasSize = product.name?.toLowerCase().includes('مقاس') || 
                    product.description?.toLowerCase().includes('مقاس') ||
                    product.category === 'clothing' ||
                    product.category === 'shoes' ||
                    product.hasSizeChart === true;
    
    if (hasSize) {
        sizeChartSection.classList.remove('hidden');
    }
}

function openSizeChart() {
    const modal = document.getElementById('sizeChartModal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

function closeSizeChart() {
    const modal = document.getElementById('sizeChartModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    const modal = document.getElementById('sizeChartModal');
    if (modal && !modal.classList.contains('hidden')) {
        if (e.target === modal) {
            closeSizeChart();
        }
    }
});

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
