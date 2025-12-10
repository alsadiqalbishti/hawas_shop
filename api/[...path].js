// Single API Router - Consolidates all endpoints into one serverless function
// This reduces the function count from 10+ to just 1

const Redis = require('ioredis');
const { requireAuth, requireDeliveryAuth, validateProduct, validateOrder, sanitizeString } = require('./utils/auth');
const { 
    generateOrderNumber, 
    canTransitionStatus, 
    addStatusHistory,
    getStatusLabel,
    getStatusColor
} = require('./utils/orders');
const { getDeliveryManById, generateId: generateDeliveryId } = require('./utils/delivery');

// Shared Redis connection
let redis;
let redisReady = false;

function getRedis() {
    if (!redis) {
        const redisUrl = process.env.STORAGE_REDIS_URL || process.env.REDIS_URL;
        if (!redisUrl) {
            throw new Error('Redis URL not configured');
        }
        
        redis = new Redis(redisUrl, {
            retryStrategy: (times) => Math.min(times * 50, 2000),
            maxRetriesPerRequest: 3,
            enableOfflineQueue: true,
            connectTimeout: 15000,
            lazyConnect: false
        });
        
        redis.on('error', (err) => {
            console.error('Redis connection error:', err.message);
            redisReady = false;
        });
        
        redis.on('ready', () => {
            redisReady = true;
        });
        
        redis.on('close', () => {
            redisReady = false;
        });
    }
    return redis;
}

async function waitForRedis(maxWait = 5000) {
    const startTime = Date.now();
    while (!redisReady && (Date.now() - startTime) < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return redisReady;
}

async function safeRedisOperation(operation, errorMessage = 'Redis operation failed', allowEmpty = false) {
    try {
        const client = getRedis();
        await waitForRedis(3000);
        return await operation(client);
    } catch (error) {
        console.error('Redis operation error:', error.message);
        if (allowEmpty) return [];
        throw new Error(`${errorMessage}: ${error.message}`);
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// CORS headers
function setCORS(res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
}

module.exports = async (req, res) => {
    // LOG EVERY REQUEST IMMEDIATELY - BEFORE ANYTHING ELSE
    console.log('📥📥📥 INCOMING REQUEST 📥📥📥');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Full URL string:', String(req.url || ''));
    const urlStr = String(req.url || '').toLowerCase();
    const hasDelivery = urlStr.includes('delivery');
    const hasDeliveryList = urlStr.includes('delivery/list');
    console.log('Contains delivery:', hasDelivery ? 'YES ✅' : 'NO');
    console.log('Contains delivery/list:', hasDeliveryList ? 'YES ✅✅✅' : 'NO');
    
    // ULTRA-EARLY CHECK: If URL contains delivery/list, handle it immediately
    if (hasDeliveryList && req.method === 'GET') {
        console.log('🚨🚨🚨 ULTRA-EARLY DELIVERY/LIST DETECTED 🚨🚨🚨');
        console.log('URL:', req.url);
        console.log('Query:', JSON.stringify(req.query));
    }
    
    setCORS(res);
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // COMPREHENSIVE DEBUG LOGGING
    console.log('=== API REQUEST DEBUG START ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Full URL check:', req.url?.includes('delivery/list') ? 'YES - CONTAINS delivery/list' : 'NO');
    console.log('Query:', JSON.stringify(req.query));
    console.log('Query["...path"]:', req.query?.['...path']);
    console.log('Query.path:', req.query?.path);
    console.log('Query["...path"] type:', typeof req.query?.['...path']);
    console.log('Query["...path"] isArray:', Array.isArray(req.query?.['...path']));
    const actualQueryPath = req.query?.['...path'] || req.query?.path;
    if (actualQueryPath) {
        console.log('Query path length:', Array.isArray(actualQueryPath) ? actualQueryPath.length : 'N/A');
        console.log('Query path values:', actualQueryPath);
    }
    console.log('Headers:', JSON.stringify(req.headers));

    // IMMEDIATE CHECK: Handle delivery/list endpoint directly if detected
    // Vercel uses "...path" as the query key for catch-all routes
    const queryPath = req.query?.['...path'] || req.query?.path;
    const rawUrlForCheck = String(req.url || '').toLowerCase();
    console.log('Immediate check - queryPath:', queryPath);
    console.log('Immediate check - req.query["...path"]:', req.query?.['...path']);
    console.log('Immediate check - req.query.path:', req.query?.path);
    console.log('Immediate check - isArray:', Array.isArray(queryPath));
    console.log('Immediate check - length:', Array.isArray(queryPath) ? queryPath.length : 'N/A');
    console.log('Immediate check - rawUrl:', rawUrlForCheck);
    
    // Check if URL contains delivery/list (most direct check)
    let isDeliveryListRequest = req.method === 'GET' && (
        rawUrlForCheck.includes('/api/delivery/list') || 
        rawUrlForCheck.includes('delivery/list') ||
        rawUrlForCheck === '/api/delivery/list' ||
        rawUrlForCheck.endsWith('/delivery/list')
    );
    
    console.log('🔍 DELIVERY/LIST CHECK - isDeliveryListRequest (URL):', isDeliveryListRequest);
    console.log('🔍 DELIVERY/LIST CHECK - rawUrlForCheck:', rawUrlForCheck);
    
    // Check queryPath - handle both array and string formats
    if (!isDeliveryListRequest && queryPath) {
        if (Array.isArray(queryPath) && queryPath.length >= 2) {
            const first = String(queryPath[0] || '').toLowerCase().trim();
            const second = String(queryPath[1] || '').toLowerCase().trim();
            console.log('Immediate check - first:', first, 'second:', second);
            if (first === 'delivery' && second === 'list' && req.method === 'GET') {
                isDeliveryListRequest = true;
                console.log('✅ IMMEDIATE HANDLER TRIGGERED for delivery/list (queryPath array match)');
            }
        } else if (typeof queryPath === 'string') {
            // Handle string format like "delivery/list"
            const pathLower = queryPath.toLowerCase();
            console.log('Immediate check - queryPath string:', pathLower);
            if (pathLower === 'delivery/list' || pathLower.includes('delivery/list')) {
                if (req.method === 'GET') {
                    isDeliveryListRequest = true;
                    console.log('✅ IMMEDIATE HANDLER TRIGGERED for delivery/list (queryPath string match)');
                }
            }
        }
    }
    
    if (isDeliveryListRequest) {
        console.log('🚀🚀🚀 IMMEDIATE HANDLER TRIGGERED for delivery/list 🚀🚀🚀');
        // Directly handle delivery/list endpoint
        if (!requireAuth(req, res)) return;
            try {
                const deliveryMen = await safeRedisOperation(async (client) => {
                    const deliveryManIds = await client.smembers('delivery-men') || [];
                    const deliveryMenList = [];
                    for (const id of deliveryManIds) {
                        try {
                            if (!id) continue;
                            const keys = await client.keys('delivery:*');
                            for (const key of keys) {
                                try {
                                    const data = await client.get(key);
                                    if (data) {
                                        const deliveryMan = JSON.parse(data);
                                        if (deliveryMan.id === id) {
                                            const { password, ...safeInfo } = deliveryMan;
                                            deliveryMenList.push(safeInfo);
                                            break;
                                        }
                                    }
                                } catch (error) {
                                    console.error(`Error parsing delivery man from key ${key}:`, error);
                                }
                            }
                        } catch (error) {
                            console.error(`Error processing delivery man ID ${id}:`, error);
                        }
                    }
                    try {
                        const phoneKeys = await client.keys('delivery:*');
                        for (const key of phoneKeys) {
                            try {
                                if (key.startsWith('delivery:') && key.split(':').length === 2) {
                                    const data = await client.get(key);
                                    if (data) {
                                        const deliveryMan = JSON.parse(data);
                                        if (!deliveryMenList.find(dm => dm.id === deliveryMan.id)) {
                                            const { password, ...safeInfo } = deliveryMan;
                                            deliveryMenList.push(safeInfo);
                                        }
                                    }
                                }
                            } catch (error) {
                                console.error(`Error processing delivery key ${key}:`, error);
                            }
                        }
                    } catch (error) {
                        console.error('Error getting delivery phone keys:', error);
                    }
                    return deliveryMenList.filter((dm, index, self) =>
                        index === self.findIndex(d => d.id === dm.id)
                    );
                }, 'Failed to fetch delivery men', true);
                console.log('IMMEDIATE HANDLER SUCCESS - returning', deliveryMen?.length || 0, 'delivery men');
                return res.status(200).json(deliveryMen || []);
            } catch (error) {
                console.error('IMMEDIATE HANDLER ERROR:', error);
                return res.status(200).json([]);
            }
    } else {
        console.log('Immediate check - delivery/list request not detected');
    }

    // ULTRA-AGGRESSIVE URL MATCHING FOR DELIVERY ENDPOINTS (check FIRST, before anything else)
    const rawUrl = String(req.url || '').toLowerCase();
    
    // Check if this is a delivery endpoint request - multiple ways
    let isDeliveryEndpoint = false;
    let deliverySubEndpoint = '';
    
    // PRIORITY CHECK: Direct query["...path"] array check (most reliable for Vercel)
    // Vercel uses "...path" as the query parameter name
    const priorityQueryPath = req.query?.['...path'] || req.query?.path;
    if (priorityQueryPath && Array.isArray(priorityQueryPath) && priorityQueryPath.length >= 2) {
        const first = String(priorityQueryPath[0] || '').toLowerCase().trim();
        const second = String(priorityQueryPath[1] || '').toLowerCase().trim();
        console.log('PRIORITY CHECK - first:', first, 'second:', second);
        if (first === 'delivery') {
            if (second === 'list' && req.method === 'GET') {
                isDeliveryEndpoint = true;
                deliverySubEndpoint = 'list';
                console.log('✅ PRIORITY CHECK MATCHED: delivery/list');
            } else if (second === 'auth' && req.method === 'POST') {
                isDeliveryEndpoint = true;
                deliverySubEndpoint = 'auth';
            } else if (second === 'orders') {
                isDeliveryEndpoint = true;
                deliverySubEndpoint = 'orders';
            } else if (second === 'info' && req.method === 'GET') {
                isDeliveryEndpoint = true;
                deliverySubEndpoint = 'info';
            } else if (second) {
                isDeliveryEndpoint = true;
                deliverySubEndpoint = second;
            }
        }
    }
    
    // Method 1: Check raw URL (handle both /api/delivery/list and /delivery/list formats)
    const normalizedRawUrl = rawUrl.replace(/^\/api\//, '/').replace(/^\/+/, '/');
    if (normalizedRawUrl.includes('/delivery/list') && req.method === 'GET') {
        isDeliveryEndpoint = true;
        deliverySubEndpoint = 'list';
    } else if (normalizedRawUrl.includes('/delivery/auth') && req.method === 'POST') {
        isDeliveryEndpoint = true;
        deliverySubEndpoint = 'auth';
    } else if (normalizedRawUrl.includes('/delivery/orders')) {
        isDeliveryEndpoint = true;
        deliverySubEndpoint = 'orders';
    } else if (normalizedRawUrl.includes('/delivery/info') && req.method === 'GET') {
        isDeliveryEndpoint = true;
        deliverySubEndpoint = 'info';
    } else if (rawUrl.includes('delivery/list') && req.method === 'GET') {
        // Fallback: check original rawUrl
        isDeliveryEndpoint = true;
        deliverySubEndpoint = 'list';
    } else if (rawUrl.includes('delivery/auth') && req.method === 'POST') {
        isDeliveryEndpoint = true;
        deliverySubEndpoint = 'auth';
    } else if (rawUrl.includes('delivery/orders')) {
        isDeliveryEndpoint = true;
        deliverySubEndpoint = 'orders';
    } else if (rawUrl.includes('delivery/info') && req.method === 'GET') {
        isDeliveryEndpoint = true;
        deliverySubEndpoint = 'info';
    }
    
    // Method 2: Check query.path (Vercel's catch-all format)
    if (!isDeliveryEndpoint && queryPath) {
        // Check array format first (most common in Vercel)
        if (Array.isArray(queryPath) && queryPath.length >= 2) {
            const first = String(queryPath[0] || '').toLowerCase().trim();
            const second = String(queryPath[1] || '').toLowerCase().trim();
            if (first === 'delivery') {
                if (second === 'list' && req.method === 'GET') {
                    isDeliveryEndpoint = true;
                    deliverySubEndpoint = 'list';
                } else if (second === 'auth' && req.method === 'POST') {
                    isDeliveryEndpoint = true;
                    deliverySubEndpoint = 'auth';
                } else if (second === 'orders') {
                    isDeliveryEndpoint = true;
                    deliverySubEndpoint = 'orders';
                } else if (second === 'info' && req.method === 'GET') {
                    isDeliveryEndpoint = true;
                    deliverySubEndpoint = 'info';
                } else if (second) {
                    isDeliveryEndpoint = true;
                    deliverySubEndpoint = second;
                }
            }
        } else {
            // String format fallback
            const pathStr = String(queryPath);
            const pathLower = pathStr.toLowerCase();
            if (pathLower.includes('delivery/list') && req.method === 'GET') {
                isDeliveryEndpoint = true;
                deliverySubEndpoint = 'list';
            } else if (pathLower.includes('delivery/auth') && req.method === 'POST') {
                isDeliveryEndpoint = true;
                deliverySubEndpoint = 'auth';
            } else if (pathLower.includes('delivery/orders')) {
                isDeliveryEndpoint = true;
                deliverySubEndpoint = 'orders';
            } else if (pathLower.includes('delivery/info') && req.method === 'GET') {
                isDeliveryEndpoint = true;
                deliverySubEndpoint = 'info';
            } else if (pathLower.startsWith('delivery/')) {
                const match = pathLower.match(/delivery\/([^\/]+)/);
                if (match) {
                    isDeliveryEndpoint = true;
                    deliverySubEndpoint = match[1];
                }
            }
        }
    }

    // Parse the path from the catch-all route
    // In Vercel, api/[...path].js receives paths like:
    // - req.query["...path"] as array: ['delivery', 'list'] for /api/delivery/list
    // - req.query["...path"] as string: "delivery/list" for /api/delivery/list
    // - req.url might be '/api/delivery/list' or '/delivery/list'
    let pathParts = [];
    
    // Method 1: Try req.query["...path"] (Vercel's catch-all format) - PRIORITY
    // Vercel uses "...path" as the query parameter name for catch-all routes
    const queryPathArray = req.query?.['...path'] || req.query?.path;
    console.log('🔍 PATH PARSING - queryPathArray:', queryPathArray, 'type:', typeof queryPathArray, 'isArray:', Array.isArray(queryPathArray));
    
    if (queryPathArray !== undefined && queryPathArray !== null) {
        if (Array.isArray(queryPathArray)) {
            // Filter and map, but preserve all parts
            pathParts = queryPathArray.map(p => String(p || '').trim()).filter(p => p.length > 0);
            console.log('🔍 PATH PARSING - Extracted from array:', pathParts);
        } else if (typeof queryPathArray === 'string' && queryPathArray.trim().length > 0) {
            // Handle both "delivery/list" and "delivery" formats
            pathParts = queryPathArray.split('/').map(p => p.trim()).filter(p => p.length > 0);
            console.log('🔍 PATH PARSING - Extracted from string:', pathParts);
        }
    }
    
    // CRITICAL: If pathParts has delivery and list, handle it immediately
    if (pathParts.length >= 2 && pathParts[0].toLowerCase() === 'delivery' && pathParts[1].toLowerCase() === 'list' && req.method === 'GET') {
        console.log('🚨🚨🚨 CRITICAL PATH MATCH: delivery/list detected in pathParts 🚨🚨🚨');
        if (!requireAuth(req, res)) return;
        try {
            const deliveryMen = await safeRedisOperation(async (client) => {
                const deliveryManIds = await client.smembers('delivery-men') || [];
                const deliveryMenList = [];
                for (const id of deliveryManIds) {
                    try {
                        if (!id) continue;
                        const keys = await client.keys('delivery:*');
                        for (const key of keys) {
                            try {
                                const data = await client.get(key);
                                if (data) {
                                    const deliveryMan = JSON.parse(data);
                                    if (deliveryMan.id === id) {
                                        const { password, ...safeInfo } = deliveryMan;
                                        deliveryMenList.push(safeInfo);
                                        break;
                                    }
                                }
                            } catch (error) {
                                console.error(`Error parsing delivery man from key ${key}:`, error);
                            }
                        }
                    } catch (error) {
                        console.error(`Error processing delivery man ID ${id}:`, error);
                    }
                }
                try {
                    const phoneKeys = await client.keys('delivery:*');
                    for (const key of phoneKeys) {
                        try {
                            if (key.startsWith('delivery:') && key.split(':').length === 2) {
                                const data = await client.get(key);
                                if (data) {
                                    const deliveryMan = JSON.parse(data);
                                    if (!deliveryMenList.find(dm => dm.id === deliveryMan.id)) {
                                        const { password, ...safeInfo } = deliveryMan;
                                        deliveryMenList.push(safeInfo);
                                    }
                                }
                            }
                        } catch (error) {
                            console.error(`Error processing delivery key ${key}:`, error);
                        }
                    }
                } catch (error) {
                    console.error('Error getting delivery phone keys:', error);
                }
                return deliveryMenList.filter((dm, index, self) =>
                    index === self.findIndex(d => d.id === dm.id)
                );
            }, 'Failed to fetch delivery men', true);
            console.log('✅✅✅ CRITICAL PATH HANDLER SUCCESS - returning', deliveryMen?.length || 0, 'delivery men');
            return res.status(200).json(deliveryMen || []);
        } catch (error) {
            console.error('❌❌❌ CRITICAL PATH HANDLER ERROR:', error);
            return res.status(200).json([]);
        }
    }
    
    // Method 2: Parse from req.url if pathParts is still empty
    if (pathParts.length === 0 && req.url) {
        let urlPath = req.url.split('?')[0]; // Remove query string
        urlPath = urlPath.replace(/^\/+/, '').replace(/\/+$/, ''); // Remove leading/trailing slashes
        
        // Remove 'api' prefix if present (case insensitive)
        if (urlPath.toLowerCase().startsWith('api/')) {
            urlPath = urlPath.substring(4);
        } else if (urlPath.toLowerCase() === 'api') {
            urlPath = '';
        }
        
        // Split into parts
        if (urlPath && urlPath.trim().length > 0) {
            pathParts = urlPath.split('/').filter(p => p && p.trim().length > 0).map(p => p.trim());
        }
    }
    
    // Method 3: Try parsing from the full URL pathname (fallback)
    if (pathParts.length === 0 && req.url) {
        try {
            // Try to extract path from full URL
            const urlObj = new URL(req.url, 'http://localhost');
            let pathname = urlObj.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
            if (pathname.toLowerCase().startsWith('api/')) {
                pathname = pathname.substring(4);
            }
            if (pathname && pathname.trim().length > 0) {
                pathParts = pathname.split('/').filter(p => p && p.trim().length > 0).map(p => p.trim());
            }
        } catch (e) {
            // URL parsing failed, ignore
        }
    }
    
    // DIRECT URL MATCHING FIRST (before pathParts parsing)
    // Vercel's path parsing can be inconsistent, so we check the URL directly first
    const urlLower = rawUrl;
    let urlPath = urlLower.split('?')[0]; // Remove query string
    
    // Normalize URL path - remove /api prefix if present
    if (urlPath.startsWith('/api/')) {
        urlPath = urlPath.substring(5);
    } else if (urlPath.startsWith('api/')) {
        urlPath = urlPath.substring(4);
    } else if (urlPath.startsWith('/')) {
        urlPath = urlPath.substring(1);
    }
    
    // Extract endpoint and subEndpoint from pathParts (fallback)
    let endpoint = (pathParts[0] || '').toLowerCase().trim();
    let subEndpoint = (pathParts[1] || '').toLowerCase().trim();
    
    // If we detected a delivery endpoint early, use that (highest priority)
    if (isDeliveryEndpoint && deliverySubEndpoint) {
        endpoint = 'delivery';
        subEndpoint = deliverySubEndpoint;
    } else {
        // Check pathParts directly (most reliable for Vercel catch-all routes)
        if (pathParts.length >= 2 && pathParts[0].toLowerCase() === 'delivery') {
            endpoint = 'delivery';
            subEndpoint = pathParts[1].toLowerCase().trim();
        } else {
            // Explicit checks for delivery endpoints (fallback if early detection didn't work)
            // Check raw URL, normalized path, and pathParts - whichever matches first
            const allUrlChecks = (rawUrl + ' ' + urlPath + ' ' + urlLower).toLowerCase();
            
            if (allUrlChecks.includes('delivery/list') && req.method === 'GET') {
                endpoint = 'delivery';
                subEndpoint = 'list';
            } else if (allUrlChecks.includes('delivery/auth') && req.method === 'POST') {
                endpoint = 'delivery';
                subEndpoint = 'auth';
            } else if (allUrlChecks.includes('delivery/orders')) {
                endpoint = 'delivery';
                subEndpoint = 'orders';
            } else if (allUrlChecks.includes('delivery/info') && req.method === 'GET') {
                endpoint = 'delivery';
                subEndpoint = 'info';
            } else if (allUrlChecks.includes('delivery/')) {
                // Generic delivery endpoint extraction - try multiple patterns
                let deliveryMatch = allUrlChecks.match(/delivery\/([^\/\?\s]+)/);
                if (!deliveryMatch) {
                    deliveryMatch = rawUrl.match(/delivery[\/\-_]([^\/\?\s]+)/i);
                }
                if (deliveryMatch) {
                    endpoint = 'delivery';
                    subEndpoint = deliveryMatch[1].toLowerCase().trim();
                }
            }
        }
    }
    
    // FINAL OVERRIDE: If endpoint still not set correctly, do one more aggressive check
    console.log('FINAL OVERRIDE CHECK - endpoint:', endpoint, 'subEndpoint:', subEndpoint);
    if (endpoint !== 'delivery' || !subEndpoint) {
        console.log('FINAL OVERRIDE - endpoint not delivery, checking alternatives...');
        // Check pathParts one more time (most reliable)
        if (pathParts.length >= 2 && pathParts[0].toLowerCase() === 'delivery') {
            console.log('FINAL OVERRIDE - Found in pathParts:', pathParts);
            endpoint = 'delivery';
            subEndpoint = pathParts[1].toLowerCase().trim();
        }
        // Check query.path one more time
        else if (queryPath) {
            console.log('FINAL OVERRIDE - Checking queryPath:', queryPath);
            if (Array.isArray(queryPath) && queryPath.length >= 2) {
                const first = String(queryPath[0] || '').toLowerCase().trim();
                const second = String(queryPath[1] || '').toLowerCase().trim();
                console.log('FINAL OVERRIDE - queryPath values:', first, second);
                if (first === 'delivery' && second) {
                    endpoint = 'delivery';
                    subEndpoint = second;
                    console.log('FINAL OVERRIDE - Set endpoint from queryPath');
                }
            }
        }
        // Check rawUrl one more time as absolute last resort
        else if (rawUrl.includes('delivery/list') && req.method === 'GET') {
            console.log('FINAL OVERRIDE - Found in rawUrl');
            endpoint = 'delivery';
            subEndpoint = 'list';
        } else if (rawUrl.includes('delivery/auth') && req.method === 'POST') {
            endpoint = 'delivery';
            subEndpoint = 'auth';
        } else if (rawUrl.includes('delivery/orders')) {
            endpoint = 'delivery';
            subEndpoint = 'orders';
        } else if (rawUrl.includes('delivery/info') && req.method === 'GET') {
            endpoint = 'delivery';
            subEndpoint = 'info';
        }
    }
    console.log('FINAL OVERRIDE RESULT - endpoint:', endpoint, 'subEndpoint:', subEndpoint);
    
    // Debug logging
    console.log('=== ENDPOINT DETECTION RESULT ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Query:', JSON.stringify(req.query));
    console.log('Query.path:', req.query?.path);
    console.log('PathParts:', pathParts);
    console.log('Endpoint:', endpoint);
    console.log('SubEndpoint:', subEndpoint);
    console.log('isDeliveryEndpoint:', isDeliveryEndpoint);
    console.log('deliverySubEndpoint:', deliverySubEndpoint);
    console.log('rawUrl:', rawUrl);
    console.log('urlLower:', urlLower);
    console.log('urlPath:', urlPath);

    try {
        
        // ============================================
        // AUTH ENDPOINTS
        // ============================================
        if (endpoint === 'auth' && req.method === 'POST') {
            const { password } = req.body;
            const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
            
            if (password === adminPassword) {
                const timestamp = Date.now();
                const token = Buffer.from(`${password}:${timestamp}`).toString('base64');
                return res.status(200).json({
                    success: true,
                    token: token,
                    expiresIn: 24 * 60 * 60 * 1000
                });
            } else {
                return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
            }
        }

        // ============================================
        // PRODUCTS ENDPOINTS
        // ============================================
        if (endpoint === 'products') {
            // GET - List all products or get single product
            if (req.method === 'GET') {
                const { id } = req.query;
                
                if (id) {
                    try {
                        const productData = await safeRedisOperation(async (client) => {
                            return await client.get(`product:${id}`);
                        });
                        if (!productData) {
                            return res.status(404).json({ error: 'Product not found' });
                        }
                        return res.status(200).json(JSON.parse(productData));
                    } catch (error) {
                        return res.status(503).json({ error: 'Service temporarily unavailable' });
                    }
                }

                try {
                    const products = await safeRedisOperation(async (client) => {
                        try {
                            const productIds = await client.smembers('products');
                            if (!Array.isArray(productIds)) {
                                return [];
                            }
                            const productsList = [];
                            for (const productId of productIds) {
                                try {
                                    if (!productId) continue;
                                    const productData = await client.get(`product:${productId}`);
                                    if (productData) {
                                        productsList.push(JSON.parse(productData));
                                    }
                                } catch (error) {
                                    console.error(`Error fetching product ${productId}:`, error);
                                    // Continue with other products
                                }
                            }
                            return productsList;
                        } catch (error) {
                            console.error('Error in products safeRedisOperation:', error);
                            throw error;
                        }
                    }, 'Failed to fetch products', true);
                    return res.status(200).json(products || []);
                } catch (error) {
                    console.error('Error in GET /api/products:', error);
                    return res.status(200).json([]);
                }
            }

            // POST - Create product
            if (req.method === 'POST') {
                if (!requireAuth(req, res)) return;
                const validation = validateProduct(req.body);
                if (!validation.valid) {
                    return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
                }

                try {
                    const newProduct = await safeRedisOperation(async (client) => {
                        const product = {
                            id: generateId(),
                            ...validation.sanitized,
                            createdAt: new Date().toISOString()
                        };
                        await client.set(`product:${product.id}`, JSON.stringify(product));
                        await client.sadd('products', product.id);
                        return product;
                    });
                    return res.status(201).json(newProduct);
                } catch (error) {
                    return res.status(503).json({ error: 'Service temporarily unavailable' });
                }
            }

            // PUT - Update product
            if (req.method === 'PUT') {
                if (!requireAuth(req, res)) return;
                const { id } = req.body;
                if (!id) {
                    return res.status(400).json({ error: 'Product ID is required' });
                }

                try {
                    const updatedProduct = await safeRedisOperation(async (client) => {
                        const productData = await client.get(`product:${id}`);
                        if (!productData) throw new Error('Product not found');
                        
                        const product = JSON.parse(productData);
                        const mergedData = {
                            name: req.body.name !== undefined ? req.body.name : product.name,
                            price: req.body.price !== undefined ? req.body.price : product.price,
                            discountPrice: req.body.discountPrice !== undefined ? req.body.discountPrice : product.discountPrice,
                            stock: req.body.stock !== undefined ? req.body.stock : product.stock,
                            description: req.body.description !== undefined ? req.body.description : product.description,
                            mediaUrl: req.body.mediaUrl !== undefined ? req.body.mediaUrl : product.mediaUrl,
                            mediaUrls: req.body.mediaUrls !== undefined ? req.body.mediaUrls : product.mediaUrls,
                            mediaType: req.body.mediaType !== undefined ? req.body.mediaType : product.mediaType
                        };
                        
                        const validation = validateProduct(mergedData);
                        if (!validation.valid) {
                            throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
                        }

                        const updated = { ...product, ...validation.sanitized, updatedAt: new Date().toISOString() };
                        await client.set(`product:${id}`, JSON.stringify(updated));
                        return updated;
                    });
                    return res.status(200).json(updatedProduct);
                } catch (error) {
                    if (error.message === 'Product not found') {
                        return res.status(404).json({ error: 'Product not found' });
                    }
                    return res.status(400).json({ error: error.message });
                }
            }

            // DELETE - Delete product
            if (req.method === 'DELETE') {
                if (!requireAuth(req, res)) return;
                const { id } = req.query;
                if (!id) {
                    return res.status(400).json({ error: 'Product ID is required' });
                }

                try {
                    await safeRedisOperation(async (client) => {
                        if (!(await client.exists(`product:${id}`))) {
                            throw new Error('Product not found');
                        }
                        const orderIds = await client.smembers('orders');
                        for (const orderId of orderIds) {
                            const orderData = await client.get(`order:${orderId}`);
                            if (orderData) {
                                const order = JSON.parse(orderData);
                                if (order.productId === id) {
                                    throw new Error('Cannot delete product with existing orders');
                                }
                            }
                        }
                        await client.del(`product:${id}`);
                        await client.srem('products', id);
                    });
                    return res.status(200).json({ success: true });
                } catch (error) {
                    if (error.message === 'Product not found') {
                        return res.status(404).json({ error: 'Product not found' });
                    }
                    if (error.message.includes('existing orders')) {
                        return res.status(400).json({ error: 'Cannot delete product with existing orders' });
                    }
                    return res.status(503).json({ error: 'Service temporarily unavailable' });
                }
            }
        }

        // ============================================
        // ORDERS ENDPOINTS
        // ============================================
        if (endpoint === 'orders') {
            // GET - List all orders
            if (req.method === 'GET') {
                if (!requireAuth(req, res)) return;
                
                try {
                    const orders = await safeRedisOperation(async (client) => {
                        const orderIds = await client.smembers('orders');
                        const ordersList = [];
                        for (const orderId of orderIds) {
                            try {
                                const orderData = await client.get(`order:${orderId}`);
                                if (orderData) {
                                    ordersList.push(JSON.parse(orderData));
                                }
                            } catch (error) {
                                console.error(`Error fetching order ${orderId}:`, error);
                                // Continue with other orders
                            }
                        }
                        ordersList.sort((a, b) => {
                            try {
                                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
                            } catch (e) {
                                return 0;
                            }
                        });
                        return ordersList;
                    }, 'Failed to fetch orders', true);
                    return res.status(200).json(orders || []);
                } catch (error) {
                    console.error('Error in GET /api/orders:', error);
                    // Return empty array on error instead of 500
                    // Log full error details for debugging
                    console.error('Full error details:', {
                        message: error.message,
                        stack: error.stack,
                        name: error.name
                    });
                    return res.status(200).json([]);
                }
            }

            // POST - Create order
            if (req.method === 'POST') {
                const validation = validateOrder(req.body);
                if (!validation.valid) {
                    return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
                }

                try {
                    const newOrder = await safeRedisOperation(async (client) => {
                        const productData = await client.get(`product:${validation.sanitized.productId}`);
                        if (!productData) throw new Error('Product not found');
                        
                        const product = JSON.parse(productData);
                        if (product.stock !== null && product.stock !== undefined) {
                            const requestedQuantity = validation.sanitized.quantity || 1;
                            if (product.stock < requestedQuantity) {
                                throw new Error(`Insufficient stock. Available: ${product.stock}, Requested: ${requestedQuantity}`);
                            }
                        }

                        const orderNumber = await generateOrderNumber(client);
                        const order = {
                            id: orderNumber,
                            orderNumber: orderNumber,
                            ...validation.sanitized,
                            notes: validation.sanitized.notes || '',
                            status: 'pending',
                            deliveryManId: null,
                            shippingPrice: null,
                            paymentReceived: null,
                            updatedBy: null,
                            statusHistory: [],
                            createdAt: new Date().toISOString()
                        };
                        
                        if (product.stock !== null && product.stock !== undefined) {
                            product.stock -= (validation.sanitized.quantity || 1);
                            await client.set(`product:${product.id}`, JSON.stringify(product));
                        }

                        addStatusHistory(order, 'pending', 'system', 'Order created');
                        await client.set(`order:${order.id}`, JSON.stringify(order));
                        await client.sadd('orders', order.id);
                        return order;
                    });
                    return res.status(201).json(newOrder);
                } catch (error) {
                    if (error.message === 'Product not found') {
                        return res.status(404).json({ error: 'Product not found' });
                    }
                    return res.status(400).json({ error: error.message });
                }
            }

            // PUT - Update order
            if (req.method === 'PUT') {
                if (!requireAuth(req, res)) return;
                const { id, status, deliveryManId, shippingPrice, paymentReceived, notes } = req.body;
                if (!id) {
                    return res.status(400).json({ error: 'Order ID is required' });
                }

                try {
                    const updatedOrder = await safeRedisOperation(async (client) => {
                        const orderData = await client.get(`order:${id}`);
                        if (!orderData) throw new Error('Order not found');
                        
                        const order = JSON.parse(orderData);
                        const currentStatus = order.status;
                        let finalStatus = status || currentStatus;
                        
                        if (deliveryManId !== undefined && deliveryManId && order.status === 'pending' && !status) {
                            finalStatus = 'assigned';
                        }
                        
                        if (finalStatus !== currentStatus && !canTransitionStatus(currentStatus, finalStatus, 'admin')) {
                            throw new Error(`Invalid status transition from ${currentStatus} to ${finalStatus}`);
                        }

                        const validStatuses = ['pending', 'assigned', 'preparing', 'in_transit', 'delivered', 'completed', 'cancelled', 'on_hold', 'returned', 'refunded'];
                        if (!validStatuses.includes(finalStatus)) {
                            throw new Error(`Invalid status. Valid statuses: ${validStatuses.join(', ')}`);
                        }

                        const updated = {
                            ...order,
                            status: finalStatus,
                            updatedAt: new Date().toISOString()
                        };

                        if (deliveryManId !== undefined) updated.deliveryManId = deliveryManId || null;
                        if (shippingPrice !== undefined) updated.shippingPrice = shippingPrice ? parseFloat(shippingPrice) : null;
                        if (paymentReceived !== undefined) updated.paymentReceived = paymentReceived ? parseFloat(paymentReceived) : null;
                        if (notes !== undefined) updated.notes = notes ? notes.trim() : '';

                        if (finalStatus !== currentStatus) {
                            const changedBy = req.headers['x-user-id'] || 'admin';
                            const historyNote = notes || (deliveryManId && currentStatus === 'pending' && finalStatus === 'assigned' 
                                ? 'تم إسناد الطلب إلى مندوب التوصيل' 
                                : `Status changed to ${getStatusLabel(finalStatus)}`);
                            addStatusHistory(updated, finalStatus, changedBy, historyNote);
                        }

                        await client.set(`order:${id}`, JSON.stringify(updated));
                        return updated;
                    });
                    return res.status(200).json(updatedOrder);
                } catch (error) {
                    if (error.message === 'Order not found') {
                        return res.status(404).json({ error: 'Order not found' });
                    }
                    return res.status(400).json({ error: error.message });
                }
            }

            // DELETE - Delete order
            if (req.method === 'DELETE') {
                if (!requireAuth(req, res)) return;
                const { id } = req.query;
                if (!id) {
                    return res.status(400).json({ error: 'Order ID is required' });
                }

                try {
                    await safeRedisOperation(async (client) => {
                        if (!(await client.exists(`order:${id}`))) {
                            throw new Error('Order not found');
                        }
                        await client.del(`order:${id}`);
                        await client.srem('orders', id);
                    });
                    return res.status(200).json({ success: true });
                } catch (error) {
                    if (error.message === 'Order not found') {
                        return res.status(404).json({ error: 'Order not found' });
                    }
                    return res.status(503).json({ error: 'Service temporarily unavailable' });
                }
            }
        }

        // ============================================
        // UPLOAD ENDPOINT
        // ============================================
        if (endpoint === 'upload' && req.method === 'POST') {
            if (!requireAuth(req, res)) return;
            
            const { mediaData, mediaType } = req.body;
            if (!mediaData) {
                return res.status(400).json({ error: 'No media data provided' });
            }

            const validTypes = ['image', 'video'];
            const type = mediaType || 'image';
            if (!validTypes.includes(type)) {
                return res.status(400).json({ error: 'Invalid media type' });
            }

            const maxSize = type === 'video' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
            const estimatedBinarySize = (mediaData.length * 3) / 4;
            
            if (estimatedBinarySize > maxSize) {
                const maxSizeMB = maxSize / (1024 * 1024);
                return res.status(400).json({ error: `File too large. Maximum size is ${maxSizeMB}MB for ${type}s` });
            }

            if (!mediaData.startsWith('data:') || !mediaData.includes(';base64,')) {
                return res.status(400).json({ error: 'Invalid base64 data format' });
            }

            return res.status(200).json({
                success: true,
                mediaUrl: mediaData,
                mediaType: type
            });
        }

        // ============================================
        // ANALYTICS ENDPOINT
        // ============================================
        if (endpoint === 'analytics' && req.method === 'GET') {
            if (!requireAuth(req, res)) return;

            try {
                const { period = 'all' } = req.query;
                let dateFrom = null;
                let dateTo = null;
                
                if (period === 'today') {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    dateFrom = today.toISOString();
                    dateTo = new Date().toISOString();
                } else if (period === 'week') {
                    const weekAgo = new Date();
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    weekAgo.setHours(0, 0, 0, 0);
                    dateFrom = weekAgo.toISOString();
                    dateTo = new Date().toISOString();
                } else if (period === 'month') {
                    const monthAgo = new Date();
                    monthAgo.setMonth(monthAgo.getMonth() - 1);
                    monthAgo.setHours(0, 0, 0, 0);
                    dateFrom = monthAgo.toISOString();
                    dateTo = new Date().toISOString();
                }

                const analyticsData = await safeRedisOperation(async (client) => {
                    const orderIds = await client.smembers('orders') || [];
                    const productIds = await client.smembers('products') || [];
                
                    const orders = [];
                    const products = [];
                    
                    for (const orderId of orderIds) {
                        try {
                            if (!orderId) continue;
                            const orderData = await client.get(`order:${orderId}`);
                            if (orderData) {
                                const order = JSON.parse(orderData);
                                const orderDate = new Date(order.createdAt);
                                if (dateFrom && orderDate < new Date(dateFrom)) continue;
                                if (dateTo) {
                                    const toDate = new Date(dateTo);
                                    toDate.setHours(23, 59, 59, 999);
                                    if (orderDate > toDate) continue;
                                }
                                orders.push(order);
                            }
                        } catch (error) {
                            console.error(`Error fetching order ${orderId} for analytics:`, error);
                        }
                    }
                    
                    for (const productId of productIds) {
                        try {
                            if (!productId) continue;
                            const productData = await client.get(`product:${productId}`);
                            if (productData) {
                                products.push(JSON.parse(productData));
                            }
                        } catch (error) {
                            console.error(`Error fetching product ${productId} for analytics:`, error);
                        }
                    }
                
                const stats = {
                    orders: {
                        total: orders.length,
                        byStatus: {},
                        today: orders.filter(o => {
                            const today = new Date();
                            return new Date(o.createdAt).toDateString() === today.toDateString();
                        }).length,
                        thisWeek: orders.filter(o => {
                            const weekAgo = new Date();
                            weekAgo.setDate(weekAgo.getDate() - 7);
                            return new Date(o.createdAt) >= weekAgo;
                        }).length,
                        thisMonth: orders.filter(o => {
                            const monthAgo = new Date();
                            monthAgo.setMonth(monthAgo.getMonth() - 1);
                            return new Date(o.createdAt) >= monthAgo;
                        }).length
                    },
                    products: { total: products.length },
                    revenue: { total: 0, byStatus: {}, averageOrderValue: 0 },
                    topProducts: [],
                    deliveryMen: {}
                };
                
                orders.forEach(order => {
                    stats.orders.byStatus[order.status] = (stats.orders.byStatus[order.status] || 0) + 1;
                    const product = products.find(p => p.id === order.productId);
                    if (product) {
                        const price = product.discountPrice || product.price;
                        const orderValue = price * order.quantity;
                        stats.revenue.total += orderValue;
                        stats.revenue.byStatus[order.status] = (stats.revenue.byStatus[order.status] || 0) + orderValue;
                    }
                });
                
                if (orders.length > 0) {
                    stats.revenue.averageOrderValue = stats.revenue.total / orders.length;
                }
                
                const productOrders = {};
                orders.forEach(order => {
                    if (!productOrders[order.productId]) {
                        productOrders[order.productId] = { count: 0, revenue: 0 };
                    }
                    productOrders[order.productId].count += order.quantity;
                    const product = products.find(p => p.id === order.productId);
                    if (product) {
                        const price = product.discountPrice || product.price;
                        productOrders[order.productId].revenue += price * order.quantity;
                    }
                });
                
                stats.topProducts = Object.entries(productOrders)
                    .map(([productId, data]) => {
                        const product = products.find(p => p.id === productId);
                        return {
                            productId,
                            name: product ? product.name : 'غير معروف',
                            orders: data.count,
                            revenue: data.revenue
                        };
                    })
                    .sort((a, b) => b.orders - a.orders)
                    .slice(0, 10);
                
                const deliveryManStats = {};
                orders.forEach(order => {
                    if (order.deliveryManId) {
                        if (!deliveryManStats[order.deliveryManId]) {
                            deliveryManStats[order.deliveryManId] = { totalOrders: 0, delivered: 0, inTransit: 0 };
                        }
                        deliveryManStats[order.deliveryManId].totalOrders++;
                        if (order.status === 'delivered' || order.status === 'completed') {
                            deliveryManStats[order.deliveryManId].delivered++;
                        } else if (order.status === 'in_transit') {
                            deliveryManStats[order.deliveryManId].inTransit++;
                        }
                    }
                });
                stats.deliveryMen = deliveryManStats;
                
                const dailyTrends = {};
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                
                orders.filter(o => new Date(o.createdAt) >= thirtyDaysAgo).forEach(order => {
                    const date = new Date(order.createdAt).toISOString().split('T')[0];
                    if (!dailyTrends[date]) {
                        dailyTrends[date] = { orders: 0, revenue: 0 };
                    }
                    dailyTrends[date].orders++;
                    const product = products.find(p => p.id === order.productId);
                    if (product) {
                        const price = product.discountPrice || product.price;
                        dailyTrends[date].revenue += price * order.quantity;
                    }
                });
                
                    stats.dailyTrends = Object.entries(dailyTrends)
                        .map(([date, data]) => ({ date, ...data }))
                        .sort((a, b) => a.date.localeCompare(b.date));
                    
                    return stats;
                }, 'Failed to fetch analytics', true);
                
                return res.status(200).json(analyticsData || {
                    orders: { total: 0, byStatus: {}, today: 0, thisWeek: 0, thisMonth: 0 },
                    products: { total: 0 },
                    revenue: { total: 0, byStatus: {}, averageOrderValue: 0 },
                    topProducts: [],
                    deliveryMen: {},
                    dailyTrends: []
                });
            } catch (error) {
                console.error('Error in GET /api/analytics:', error);
                // Return empty analytics instead of 500
                return res.status(200).json({
                    orders: { total: 0, byStatus: {}, today: 0, thisWeek: 0, thisMonth: 0 },
                    products: { total: 0 },
                    revenue: { total: 0, byStatus: {}, averageOrderValue: 0 },
                    topProducts: [],
                    deliveryMen: {},
                    dailyTrends: []
                });
            }
        }

        // ============================================
        // STORAGE ENDPOINT
        // ============================================
        if (endpoint === 'storage' && req.method === 'GET') {
            if (!requireAuth(req, res)) return;

            try {
                const storageData = await safeRedisOperation(async (client) => {
                    const productIds = await client.smembers('products') || [];
                    const orderIds = await client.smembers('orders') || [];
                    const deliveryManIds = await client.smembers('delivery-men') || [];
                    
                    let totalSize = 0;
                    let productsSize = 0;
                    let ordersSize = 0;
                    let deliveryMenSize = 0;
                    let otherSize = 0;
                    
                    // Calculate products size
                    for (const productId of productIds) {
                        try {
                            if (!productId) continue;
                            const productData = await client.get(`product:${productId}`);
                            if (productData) {
                                const size = Buffer.byteLength(productData, 'utf8');
                                productsSize += size;
                                totalSize += size;
                            }
                        } catch (error) {
                            console.error(`Error calculating size for product ${productId}:`, error);
                        }
                    }
                    
                    // Calculate orders size
                    for (const orderId of orderIds) {
                        try {
                            if (!orderId) continue;
                            const orderData = await client.get(`order:${orderId}`);
                            if (orderData) {
                                const size = Buffer.byteLength(orderData, 'utf8');
                                ordersSize += size;
                                totalSize += size;
                            }
                        } catch (error) {
                            console.error(`Error calculating size for order ${orderId}:`, error);
                        }
                    }
                    
                    // Calculate delivery men size
                    try {
                        const keys = await client.keys('delivery:*');
                        for (const key of keys) {
                            try {
                                const data = await client.get(key);
                                if (data) {
                                    const deliveryMan = JSON.parse(data);
                                    if (deliveryManIds.includes(deliveryMan.id)) {
                                        const size = Buffer.byteLength(data, 'utf8');
                                        deliveryMenSize += size;
                                        totalSize += size;
                                    }
                                }
                            } catch (error) {
                                console.error(`Error calculating size for delivery key ${key}:`, error);
                            }
                        }
                    } catch (error) {
                        console.error('Error getting delivery keys:', error);
                    }
                    
                    // Calculate other size (simplified - avoid expensive keys('*') operation)
                    try {
                        const settingsData = await client.get('store:settings');
                        if (settingsData) {
                            const size = Buffer.byteLength(settingsData, 'utf8');
                            otherSize += size;
                            totalSize += size;
                        }
                    } catch (error) {
                        console.error('Error calculating settings size:', error);
                    }
                    
                    const maxStorage = 30 * 1024 * 1024;
                    const usedStorage = totalSize;
                    const freeStorage = maxStorage - usedStorage;
                    const usagePercent = (usedStorage / maxStorage) * 100;
                    
                    return {
                        total: {
                            used: usedStorage,
                            free: freeStorage,
                            max: maxStorage,
                            percent: Math.round(usagePercent * 100) / 100
                        },
                        breakdown: {
                            products: productsSize,
                            orders: ordersSize,
                            deliveryMen: deliveryMenSize,
                            other: otherSize
                        },
                        counts: {
                            products: productIds.length,
                            orders: orderIds.length,
                            deliveryMen: deliveryManIds.length
                        }
                    };
                }, 'Failed to calculate storage usage', true);
                
                return res.status(200).json(storageData || {
                    total: { used: 0, free: 30 * 1024 * 1024, max: 30 * 1024 * 1024, percent: 0 },
                    breakdown: { products: 0, orders: 0, deliveryMen: 0, other: 0 },
                    counts: { products: 0, orders: 0, deliveryMen: 0 }
                });
            } catch (error) {
                console.error('Error in GET /api/storage:', error);
                // Return default storage data instead of 500
                return res.status(200).json({
                    total: { used: 0, free: 30 * 1024 * 1024, max: 30 * 1024 * 1024, percent: 0 },
                    breakdown: { products: 0, orders: 0, deliveryMen: 0, other: 0 },
                    counts: { products: 0, orders: 0, deliveryMen: 0 }
                });
            }
        }

        // ============================================
        // DELIVERY ENDPOINTS
        // ============================================
        console.log('=== CHECKING DELIVERY ENDPOINT ===');
        console.log('endpoint === "delivery":', endpoint === 'delivery');
        console.log('endpoint value:', endpoint);
        console.log('subEndpoint value:', subEndpoint);
        console.log('req.method:', req.method);
        
        if (endpoint === 'delivery') {
            console.log('DELIVERY ENDPOINT MATCHED! Checking subEndpoint:', subEndpoint);
            // Delivery auth
            if (subEndpoint === 'auth' && req.method === 'POST') {
                console.log('Handling delivery/auth');
                const { name, phone, password, action } = req.body;
                if (!phone || !password) {
                    return res.status(400).json({ error: 'رقم الهاتف وكلمة المرور مطلوبة' });
                }
                if (action === 'signup' && !name) {
                    return res.status(400).json({ error: 'الاسم مطلوب للتسجيل' });
                }

                try {
                    const redisClient = getRedis();
                    const deliveryManKey = `delivery:${phone}`;

                    if (action === 'signup') {
                        if (await redisClient.exists(deliveryManKey)) {
                            return res.status(400).json({ error: 'رقم الهاتف مسجل بالفعل' });
                        }

                        const deliveryMan = {
                            id: generateDeliveryId(),
                            name: name.trim(),
                            phone: phone.trim(),
                            password: password,
                            createdAt: new Date().toISOString()
                        };

                        await redisClient.set(deliveryManKey, JSON.stringify(deliveryMan));
                        await redisClient.sadd('delivery-men', deliveryMan.id);

                        const token = Buffer.from(`${deliveryMan.id}:${Date.now()}`).toString('base64');
                        return res.status(201).json({
                            success: true,
                            token: token,
                            deliveryMan: { id: deliveryMan.id, name: deliveryMan.name, phone: deliveryMan.phone }
                        });
                    } else {
                        const deliveryManData = await redisClient.get(deliveryManKey);
                        if (!deliveryManData) {
                            return res.status(401).json({ error: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
                        }

                        const deliveryMan = JSON.parse(deliveryManData);
                        if (deliveryMan.password !== password) {
                            return res.status(401).json({ error: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
                        }

                        const token = Buffer.from(`${deliveryMan.id}:${Date.now()}`).toString('base64');
                        return res.status(200).json({
                            success: true,
                            token: token,
                            deliveryMan: { id: deliveryMan.id, name: deliveryMan.name, phone: deliveryMan.phone }
                        });
                    }
                } catch (error) {
                    return res.status(500).json({ error: 'حدث خطأ في الخادم' });
                }
            }

            // Delivery orders
            if (subEndpoint === 'orders') {
                // GET - Get orders assigned to delivery man
                if (req.method === 'GET') {
                    const deliveryManId = requireDeliveryAuth(req, res);
                    if (!deliveryManId) return;

                    try {
                        const redisClient = getRedis();
                        const orderIds = await redisClient.smembers('orders');
                        const orders = [];

                        for (const orderId of orderIds) {
                            const orderData = await redisClient.get(`order:${orderId}`);
                            if (orderData) {
                                const order = JSON.parse(orderData);
                                if (order.deliveryManId === deliveryManId) {
                                    const productData = await redisClient.get(`product:${order.productId}`);
                                    if (productData) {
                                        order.product = JSON.parse(productData);
                                    }
                                    orders.push(order);
                                }
                            }
                        }

                        orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                        return res.status(200).json(orders);
                    } catch (error) {
                        console.error('Error in delivery orders GET:', error);
                        return res.status(200).json([]);
                    }
                }

                // PUT - Update order
                if (req.method === 'PUT') {
                    const deliveryManId = requireDeliveryAuth(req, res);
                    if (!deliveryManId) return;

                    const { id, status, shippingPrice, paymentReceived } = req.body;
                    if (!id) {
                        return res.status(400).json({ error: 'Order ID is required' });
                    }

                    try {
                        const redisClient = getRedis();
                        const orderData = await redisClient.get(`order:${id}`);
                        if (!orderData) {
                            return res.status(404).json({ error: 'Order not found' });
                        }

                        const order = JSON.parse(orderData);
                        const currentStatus = order.status;
                        const newStatus = status || currentStatus;
                        
                        if (newStatus !== currentStatus && !canTransitionStatus(currentStatus, newStatus, 'delivery')) {
                            return res.status(400).json({ 
                                error: `Invalid status transition from ${getStatusLabel(currentStatus)} to ${getStatusLabel(newStatus)}`
                            });
                        }

                        const validStatuses = ['assigned', 'preparing', 'in_transit', 'delivered'];
                        if (newStatus && !validStatuses.includes(newStatus)) {
                            return res.status(400).json({ error: 'Invalid status for delivery man' });
                        }

                        const updatedOrder = {
                            ...order,
                            status: newStatus,
                            deliveryManId: deliveryManId,
                            shippingPrice: shippingPrice !== undefined ? (shippingPrice ? parseFloat(shippingPrice) : null) : order.shippingPrice,
                            paymentReceived: paymentReceived !== undefined ? (paymentReceived ? parseFloat(paymentReceived) : null) : order.paymentReceived,
                            updatedAt: new Date().toISOString(),
                            updatedBy: deliveryManId
                        };

                        if (newStatus !== currentStatus) {
                            addStatusHistory(updatedOrder, newStatus, deliveryManId, `Status updated by delivery man`);
                        }

                        await redisClient.set(`order:${id}`, JSON.stringify(updatedOrder));
                        return res.status(200).json(updatedOrder);
                    } catch (error) {
                        console.error('Error in delivery orders PUT:', error);
                        return res.status(400).json({ error: 'Failed to update order', message: error.message });
                    }
                }
            }

            // Delivery list
            if (subEndpoint === 'list' && req.method === 'GET') {
                console.log('DELIVERY/LIST HANDLER REACHED!');
                if (!requireAuth(req, res)) {
                    console.log('DELIVERY/LIST - Auth failed');
                    return;
                }
                console.log('DELIVERY/LIST - Auth passed, fetching delivery men...');

                try {
                    const deliveryMen = await safeRedisOperation(async (client) => {
                        const deliveryManIds = await client.smembers('delivery-men') || [];
                        const deliveryMenList = [];

                        // Get delivery men by ID
                        for (const id of deliveryManIds) {
                            try {
                                if (!id) continue;
                                const keys = await client.keys('delivery:*');
                                for (const key of keys) {
                                    try {
                                        const data = await client.get(key);
                                        if (data) {
                                            const deliveryMan = JSON.parse(data);
                                            if (deliveryMan.id === id) {
                                                const { password, ...safeInfo } = deliveryMan;
                                                deliveryMenList.push(safeInfo);
                                                break;
                                            }
                                        }
                                    } catch (error) {
                                        console.error(`Error parsing delivery man from key ${key}:`, error);
                                    }
                                }
                            } catch (error) {
                                console.error(`Error processing delivery man ID ${id}:`, error);
                            }
                        }

                        // Also get delivery men by phone keys
                        try {
                            const phoneKeys = await client.keys('delivery:*');
                            for (const key of phoneKeys) {
                                try {
                                    if (key.startsWith('delivery:') && key.split(':').length === 2) {
                                        const data = await client.get(key);
                                        if (data) {
                                            const deliveryMan = JSON.parse(data);
                                            if (!deliveryMenList.find(dm => dm.id === deliveryMan.id)) {
                                                const { password, ...safeInfo } = deliveryMan;
                                                deliveryMenList.push(safeInfo);
                                            }
                                        }
                                    }
                                } catch (error) {
                                    console.error(`Error processing delivery key ${key}:`, error);
                                }
                            }
                        } catch (error) {
                            console.error('Error getting delivery phone keys:', error);
                        }

                        // Remove duplicates
                        return deliveryMenList.filter((dm, index, self) =>
                            index === self.findIndex(d => d.id === dm.id)
                        );
                    }, 'Failed to fetch delivery men', true);

                    console.log('DELIVERY/LIST - Success! Returning', deliveryMen?.length || 0, 'delivery men');
                    return res.status(200).json(deliveryMen || []);
                } catch (error) {
                    console.error('DELIVERY/LIST - Error:', error);
                    console.error('DELIVERY/LIST - Error stack:', error.stack);
                    // Return empty array instead of 500
                    return res.status(200).json([]);
                }
            } else {
                console.log('DELIVERY/LIST - Handler not matched. subEndpoint:', subEndpoint, 'method:', req.method);
            }

            // Delivery info
            if (subEndpoint === 'info' && req.method === 'GET') {
                if (!requireAuth(req, res)) return;

                const { id } = req.query;
                if (!id) {
                    return res.status(400).json({ error: 'Delivery man ID is required' });
                }

                try {
                    const deliveryMan = await getDeliveryManById(id);
                    if (!deliveryMan) {
                        return res.status(404).json({ error: 'Delivery man not found' });
                    }

                    const { password, ...safeInfo } = deliveryMan;
                    return res.status(200).json(safeInfo);
                } catch (error) {
                    console.error('Error in delivery info GET:', error);
                    return res.status(404).json({ error: 'Delivery man not found' });
                }
            }
        }

        // ============================================
        // SETTINGS ENDPOINT
        // ============================================
        if (endpoint === 'settings') {
            // GET - Load settings
            if (req.method === 'GET') {
                // No auth required for public GET (product page needs it)
                try {
                    const settingsData = await safeRedisOperation(async (client) => {
                        return await client.get('store:settings');
                    }, 'Failed to fetch settings', true);
                    
                    if (settingsData) {
                        return res.status(200).json(JSON.parse(settingsData));
                    } else {
                        // Return default settings
                        return res.status(200).json({
                            shippingTime: 'من 24 إلى 48 ساعة داخل المدينة',
                            showShippingTime: true,
                            shippingCost: 'مجاني للطلبات فوق 50 دينار | 5 دينار للطلبات الأخرى',
                            showShippingCost: true,
                            shippingAreas: 'جميع المدن الرئيسية',
                            showShippingAreas: true,
                            shippingMethods: 'توصيل مباشر | نقاط الاستلام',
                            showShippingMethods: true,
                            returnPeriod: '7 أيام من تاريخ الاستلام',
                            showReturnPeriod: true,
                            returnConditions: 'المنتج يجب أن يكون بحالته الأصلية مع جميع الملحقات',
                            showReturnConditions: true,
                            refundTime: 'يتم استرداد المبلغ خلال 3-5 أيام عمل',
                            showRefundTime: true,
                            returnContact: 'اتصل بنا على واتساب أو الهاتف',
                            showReturnContact: true,
                            enableSharing: false,
                            whatsappNumber: '',
                            phoneNumber: ''
                        });
                    }
                } catch (error) {
                    console.error('Error in GET /api/settings:', error);
                    // Return default settings instead of 503
                    return res.status(200).json({
                        shippingTime: 'من 24 إلى 48 ساعة داخل المدينة',
                        showShippingTime: true,
                        shippingCost: 'مجاني للطلبات فوق 50 دينار | 5 دينار للطلبات الأخرى',
                        showShippingCost: true,
                        shippingAreas: 'جميع المدن الرئيسية',
                        showShippingAreas: true,
                        shippingMethods: 'توصيل مباشر | نقاط الاستلام',
                        showShippingMethods: true,
                        returnPeriod: '7 أيام من تاريخ الاستلام',
                        showReturnPeriod: true,
                        returnConditions: 'المنتج يجب أن يكون بحالته الأصلية مع جميع الملحقات',
                        showReturnConditions: true,
                        refundTime: 'يتم استرداد المبلغ خلال 3-5 أيام عمل',
                        showRefundTime: true,
                        returnContact: 'اتصل بنا على واتساب أو الهاتف',
                        showReturnContact: true,
                        enableSharing: false,
                        whatsappNumber: '',
                        phoneNumber: ''
                    });
                }
            }

            // POST - Save settings
            if (req.method === 'POST') {
                if (!requireAuth(req, res)) return;

                try {
                    const settings = {
                        whatsappNumber: req.body.whatsappNumber || '',
                        phoneNumber: req.body.phoneNumber || '',
                        enableSharing: req.body.enableSharing !== false,
                        shippingTime: req.body.shippingTime || 'من 24 إلى 48 ساعة داخل المدينة',
                        showShippingTime: req.body.showShippingTime !== false,
                        shippingCost: req.body.shippingCost || 'مجاني للطلبات فوق 50 دينار | 5 دينار للطلبات الأخرى',
                        showShippingCost: req.body.showShippingCost !== false,
                        shippingAreas: req.body.shippingAreas || 'جميع المدن الرئيسية',
                        showShippingAreas: req.body.showShippingAreas !== false,
                        shippingMethods: req.body.shippingMethods || 'توصيل مباشر | نقاط الاستلام',
                        showShippingMethods: req.body.showShippingMethods !== false,
                        returnPeriod: req.body.returnPeriod || '7 أيام من تاريخ الاستلام',
                        showReturnPeriod: req.body.showReturnPeriod !== false,
                        returnConditions: req.body.returnConditions || 'المنتج يجب أن يكون بحالته الأصلية مع جميع الملحقات',
                        showReturnConditions: req.body.showReturnConditions !== false,
                        refundTime: req.body.refundTime || 'يتم استرداد المبلغ خلال 3-5 أيام عمل',
                        showRefundTime: req.body.showRefundTime !== false,
                        returnContact: req.body.returnContact || 'اتصل بنا على واتساب أو الهاتف',
                        showReturnContact: req.body.showReturnContact !== false,
                        updatedAt: new Date().toISOString()
                    };

                    await safeRedisOperation(async (client) => {
                        await client.set('store:settings', JSON.stringify(settings));
                    });

                    return res.status(200).json(settings);
                } catch (error) {
                    console.error('Error in POST /api/settings:', error);
                    return res.status(503).json({ error: 'Service temporarily unavailable', message: error.message });
                }
            }
        }

        // ============================================
        // 404 - Endpoint not found
        // ============================================
        console.log('=== 404 ERROR - ENDPOINT NOT FOUND ===');
        console.log('Endpoint:', endpoint);
        console.log('SubEndpoint:', subEndpoint);
        console.log('PathParts:', pathParts);
        console.log('URL:', req.url);
        console.log('Method:', req.method);
        console.log('Query:', JSON.stringify(req.query));
        console.log('Query.path:', req.query?.path);
        console.log('isDeliveryEndpoint:', isDeliveryEndpoint);
        console.log('deliverySubEndpoint:', deliverySubEndpoint);
        console.log('rawUrl:', rawUrl);
        console.log('urlLower:', urlLower);
        console.log('urlPath:', urlPath);
        console.log('=== END 404 DEBUG ===');
        return res.status(404).json({ 
            error: 'Endpoint not found', 
            endpoint: endpoint,
            subEndpoint: subEndpoint,
            pathParts: pathParts,
            url: req.url,
            query: req.query,
            debug: {
                isDeliveryEndpoint,
                deliverySubEndpoint,
                rawUrl,
                urlLower,
                urlPath
            }
        });

    } catch (error) {
        console.error('API Router error:', error);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
};

