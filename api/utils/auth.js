// Authentication utility functions

/**
 * Verify JWT token
 */
function verifyToken(token) {
    if (!token) {
        return { valid: false, error: 'No token provided' };
    }

    try {
        // Remove 'Bearer ' prefix if present
        const cleanToken = token.replace(/^Bearer\s+/, '');
        
        // Decode token (simple base64 decode for now, but validate structure)
        const decoded = Buffer.from(cleanToken, 'base64').toString('utf-8');
        const [password, timestamp] = decoded.split(':');
        
        if (!password || !timestamp) {
            return { valid: false, error: 'Invalid token format' };
        }

        // Check token expiration (24 hours)
        const tokenAge = Date.now() - parseInt(timestamp);
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        if (tokenAge > maxAge) {
            return { valid: false, error: 'Token expired' };
        }

        // Verify password matches
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
        if (password !== adminPassword) {
            return { valid: false, error: 'Invalid token' };
        }

        return { valid: true };
    } catch (error) {
        return { valid: false, error: 'Invalid token' };
    }
}

/**
 * Middleware to require authentication
 */
function requireAuth(req, res) {
    const authHeader = req.headers.authorization;
    const token = authHeader || req.headers['x-auth-token'];
    
    const verification = verifyToken(token);
    
    if (!verification.valid) {
        res.status(401).json({ error: 'Unauthorized', message: verification.error });
        return false;
    }
    
    return true;
}

/**
 * Sanitize string to prevent XSS
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

/**
 * Validate and sanitize product data
 */
function validateProduct(data) {
    const errors = [];
    
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
        errors.push('Product name is required');
    }
    if (data.name && data.name.length > 200) {
        errors.push('Product name is too long (max 200 characters)');
    }
    
    const price = parseFloat(data.price);
    if (isNaN(price) || price < 0) {
        errors.push('Valid price is required');
    }
    
    if (data.discountPrice !== undefined && data.discountPrice !== null) {
        const discountPrice = parseFloat(data.discountPrice);
        if (isNaN(discountPrice) || discountPrice < 0) {
            errors.push('Invalid discount price');
        }
        if (discountPrice >= price) {
            errors.push('Discount price must be less than regular price');
        }
    }
    
    if (data.description && data.description.length > 5000) {
        errors.push('Description is too long (max 5000 characters)');
    }
    
    // Stock validation (optional, but if provided must be valid)
    if (data.stock !== undefined && data.stock !== null) {
        const stock = parseInt(data.stock);
        if (isNaN(stock) || stock < 0) {
            errors.push('Stock must be a non-negative integer');
        }
    }
    
    // Base64 images can be very long, so we check size differently
    // Max 5MB for images, 10MB for videos (base64 is ~33% larger)
    if (data.mediaUrl) {
        const isBase64 = data.mediaUrl.startsWith('data:');
        if (isBase64) {
            const estimatedSize = (data.mediaUrl.length * 3) / 4; // Approximate binary size
            const maxSize = data.mediaType === 'video' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
            if (estimatedSize > maxSize) {
                errors.push(`Media file too large. Max ${maxSize / (1024 * 1024)}MB`);
            }
        } else if (data.mediaUrl.length > 2000) {
            // Regular URL shouldn't be that long
            errors.push('Media URL is too long');
        }
    }
    
    if (data.mediaUrls && Array.isArray(data.mediaUrls)) {
        if (data.mediaUrls.length > 10) {
            errors.push('Maximum 10 media files allowed');
        }
        // Check each media URL size
        data.mediaUrls.forEach((url, index) => {
            if (url && url.startsWith('data:')) {
                const estimatedSize = (url.length * 3) / 4;
                const maxSize = data.mediaType === 'video' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
                if (estimatedSize > maxSize) {
                    errors.push(`Media file ${index + 1} too large. Max ${maxSize / (1024 * 1024)}MB`);
                }
            }
        });
    }
    
    return {
        valid: errors.length === 0,
        errors,
        sanitized: {
            name: data.name ? sanitizeString(data.name.trim()) : '',
            price: price,
            discountPrice: data.discountPrice ? parseFloat(data.discountPrice) : null,
            description: data.description ? sanitizeString(data.description) : '',
            mediaUrl: data.mediaUrl || '',
            mediaUrls: Array.isArray(data.mediaUrls) ? data.mediaUrls.slice(0, 10) : [],
            mediaType: ['image', 'video'].includes(data.mediaType) ? data.mediaType : 'image',
            stock: data.stock !== undefined && data.stock !== null ? parseInt(data.stock) : null
        }
    };
}

/**
 * Validate and sanitize order data
 */
function validateOrder(data) {
    const errors = [];
    
    if (!data.productId || typeof data.productId !== 'string' || data.productId.trim().length === 0) {
        errors.push('Product ID is required');
    }
    
    if (!data.customerName || typeof data.customerName !== 'string' || data.customerName.trim().length === 0) {
        errors.push('Customer name is required');
    }
    if (data.customerName && data.customerName.length > 100) {
        errors.push('Customer name is too long');
    }
    
    if (!data.customerPhone || typeof data.customerPhone !== 'string' || data.customerPhone.trim().length === 0) {
        errors.push('Customer phone is required');
    }
    // Basic phone validation (numbers, spaces, +, -, parentheses)
    const phoneRegex = /^[\d\s\+\-\(\)]+$/;
    if (data.customerPhone && !phoneRegex.test(data.customerPhone)) {
        errors.push('Invalid phone number format');
    }
    if (data.customerPhone && data.customerPhone.length > 20) {
        errors.push('Phone number is too long');
    }
    
    if (!data.customerAddress || typeof data.customerAddress !== 'string' || data.customerAddress.trim().length === 0) {
        errors.push('Customer address is required');
    }
    if (data.customerAddress && data.customerAddress.length > 500) {
        errors.push('Address is too long');
    }
    
    const quantity = parseInt(data.quantity);
    if (isNaN(quantity) || quantity < 1 || quantity > 1000) {
        errors.push('Quantity must be between 1 and 1000');
    }
    
    // Notes validation (optional)
    if (data.notes && data.notes.length > 1000) {
        errors.push('Notes are too long (max 1000 characters)');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        sanitized: {
            productId: data.productId.trim(),
            customerName: sanitizeString(data.customerName.trim()),
            customerPhone: data.customerPhone.trim(),
            customerAddress: sanitizeString(data.customerAddress.trim()),
            quantity: quantity,
            notes: data.notes ? sanitizeString(data.notes.trim()) : ''
        }
    };
}

module.exports = {
    verifyToken,
    requireAuth,
    sanitizeString,
    validateProduct,
    validateOrder
};


