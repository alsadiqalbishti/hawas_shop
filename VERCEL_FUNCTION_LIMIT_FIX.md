# Vercel Function Limit Fix

## Problem
Vercel Hobby (free) plan allows **maximum 12 serverless functions** per deployment. We currently have **13+ functions**.

## Current API Functions Count

1. `api/analytics.js` ✅ (Keep - Analytics dashboard)
2. `api/auth.js` ✅ (Keep - Admin authentication)
3. `api/debug.js` ❌ (Remove - Debug endpoint, not needed in production)
4. `api/delivery/auth.js` ✅ (Keep - Delivery man auth)
5. `api/delivery/info.js` ✅ (Keep - Get delivery man info)
6. `api/delivery/list.js` ✅ (Keep - List all delivery men)
7. `api/delivery/orders.js` ✅ (Keep - Delivery man orders)
8. `api/orders.js` ✅ (Keep - Order management)
9. `api/product/[id].js` ❌ (Check - May not be needed)
10. `api/products.js` ✅ (Keep - Product management)
11. `api/upload.js` ✅ (Keep - File upload)

**Total: 11 functions (if we remove debug.js)**

## Solutions

### Option 1: Remove Unused Functions (Recommended)
- Remove `api/debug.js` (not needed in production)
- Check if `api/product/[id].js` is actually used

### Option 2: Combine Functions
- Combine `api/delivery/info.js` and `api/delivery/list.js` into one endpoint with query params
- Combine `api/delivery/auth.js` with other delivery endpoints

### Option 3: Upgrade to Pro Plan
- Upgrade to Vercel Pro ($20/month) for unlimited functions

### Option 4: Use API Routes Pattern
- Combine multiple endpoints into single files with route handling

## Recommended Action

**Remove `api/debug.js`** - This should bring us under the limit.

If still over limit, combine delivery endpoints:
- Merge `delivery/info.js` and `delivery/list.js` into `delivery/manage.js` with query params

