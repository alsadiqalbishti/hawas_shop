# Order Status Workflow Guide

## 📋 Order Status Overview

This document explains how orders move through different statuses and what actions Admin and Delivery Men can perform.

---

## 🎯 Order Statuses

### 1. **pending** (قيد الانتظار)
- **Initial Status**: All new orders start here
- **Description**: Order received, waiting for admin action
- **Color**: Yellow/Warning

### 2. **assigned** (مُسند)
- **Description**: Admin assigned order to a delivery man
- **Color**: Blue/Info
- **Action Required**: Admin assigns delivery man

### 3. **preparing** (قيد التحضير)
- **Description**: Order is being prepared/packaged
- **Color**: Primary/Purple
- **Action Required**: Admin or Delivery Man updates status

### 4. **in_transit** (قيد التوصيل)
- **Description**: Order is out for delivery
- **Color**: Purple
- **Action Required**: Delivery Man updates when starting delivery

### 5. **delivered** (تم التوصيل)
- **Description**: Order successfully delivered to customer
- **Color**: Green/Success
- **Action Required**: Delivery Man confirms delivery

### 6. **completed** (مكتمل)
- **Description**: Order fully completed (payment received, etc.)
- **Color**: Green/Success
- **Terminal Status**: Cannot be changed after this
- **Action Required**: Admin marks as completed

### 7. **cancelled** (ملغي)
- **Description**: Order cancelled
- **Color**: Red/Danger
- **Terminal Status**: Cannot be changed after this
- **Action Required**: Admin cancels order

### 8. **on_hold** (معلق)
- **Description**: Order temporarily paused
- **Color**: Gray/Secondary
- **Action Required**: Admin puts order on hold

### 9. **returned** (مرتجع)
- **Description**: Order returned by customer
- **Color**: Yellow/Warning
- **Action Required**: Admin marks as returned

### 10. **refunded** (مسترد)
- **Description**: Order refunded
- **Color**: Red/Danger
- **Terminal Status**: Cannot be changed after this
- **Action Required**: Admin processes refund

---

## 👨‍💼 Admin Actions & Permissions

### ✅ Admin Can:

1. **Assign Delivery Man**
   - Change status from `pending` → `assigned`
   - Select delivery man from dropdown
   - Add notes

2. **Update Status** (Full Control)
   - `pending` → `assigned`, `cancelled`, `on_hold`
   - `assigned` → `preparing`, `cancelled`, `on_hold`
   - `preparing` → `in_transit`, `cancelled`, `on_hold`
   - `in_transit` → `delivered`, `cancelled`, `on_hold`
   - `delivered` → `completed`, `returned`, `on_hold`
   - `on_hold` → Any status (can resume from hold)
   - `returned` → `refunded`, `cancelled`

3. **Cancel Orders**
   - Can cancel from ANY status (except terminal states)
   - Terminal states: `completed`, `cancelled`, `refunded`

4. **Mark as Completed**
   - Only from `delivered` status
   - Final step after delivery confirmation

5. **Put on Hold**
   - Can pause order from any status
   - Can resume from `on_hold` to any appropriate status

6. **Process Returns & Refunds**
   - Mark as `returned` from `delivered`
   - Mark as `refunded` from `returned`

### 📝 Admin Can Also:
- Edit order details (customer info, quantity, etc.)
- Update shipping price
- Update payment received status
- Add notes to orders
- View full order history
- Bulk update multiple orders
- Export orders to CSV

---

## 🚚 Delivery Man Actions & Permissions

### ✅ Delivery Man Can:

1. **View Orders**
   - Only see orders assigned to them (`deliveryManId` matches)
   - Cannot see all orders or unassigned orders

2. **Update Status** (Limited - Forward Only)
   - Can only move forward in delivery workflow:
     - `assigned` → `preparing`
     - `preparing` → `in_transit`
     - `in_transit` → `delivered`
   - **Cannot go backwards** or skip steps
   - **Cannot cancel** orders
   - **Cannot mark as completed** (admin only)

3. **Update Shipping Details**
   - Set shipping price
   - Mark payment received
   - Add notes

4. **Quick Actions**
   - One-tap status updates (if valid transition)
   - Update order details

### ❌ Delivery Man Cannot:
- Cancel orders
- Assign orders to themselves
- Change status backwards
- Mark orders as completed
- See orders not assigned to them
- Access admin panel

---

## 🔄 Status Transition Flow

### Normal Flow (Happy Path):
```
pending → assigned → preparing → in_transit → delivered → completed
```

### With Hold:
```
pending → on_hold → assigned → preparing → in_transit → delivered → completed
```

### Cancelled:
```
pending → cancelled (or any status → cancelled by admin)
```

### Returned:
```
delivered → returned → refunded
```

---

## 📊 Status Transition Rules

### Admin Transitions:
- **From `pending`**: Can go to `assigned`, `cancelled`, `on_hold`
- **From `assigned`**: Can go to `preparing`, `cancelled`, `on_hold`
- **From `preparing`**: Can go to `in_transit`, `cancelled`, `on_hold`
- **From `in_transit`**: Can go to `delivered`, `cancelled`, `on_hold`
- **From `delivered`**: Can go to `completed`, `returned`, `on_hold`
- **From `on_hold`**: Can go to `pending`, `assigned`, `preparing`, `in_transit`, `cancelled`
- **From `returned`**: Can go to `refunded`, `cancelled`
- **Special**: Admin can cancel from ANY status
- **Special**: Admin can mark `completed` only from `delivered`

### Delivery Man Transitions:
- **From `assigned`**: Can only go to `preparing`
- **From `preparing`**: Can only go to `in_transit`
- **From `in_transit`**: Can only go to `delivered`
- **Cannot**: Go backwards, cancel, or mark as completed

---

## 🎨 Status Colors (Visual Indicators)

- **pending**: 🟡 Yellow/Warning
- **assigned**: 🔵 Blue/Info
- **preparing**: 🟣 Purple/Primary
- **in_transit**: 🟣 Purple
- **delivered**: 🟢 Green/Success
- **completed**: 🟢 Green/Success
- **cancelled**: 🔴 Red/Danger
- **on_hold**: ⚪ Gray/Secondary
- **returned**: 🟡 Yellow/Warning
- **refunded**: 🔴 Red/Danger

---

## 📝 Status History

Every status change is tracked with:
- **Status**: New status
- **Timestamp**: When changed
- **Changed By**: User ID (admin or delivery man)
- **Notes**: Optional notes about the change

This creates a complete audit trail of order lifecycle.

---

## 💡 Best Practices

### For Admin:
1. **Assign orders promptly** after receiving them
2. **Use notes** to communicate with delivery men
3. **Monitor `on_hold`** orders and resume them
4. **Complete orders** after confirming payment received
5. **Track returns** and process refunds quickly

### For Delivery Men:
1. **Update status** as you progress through delivery
2. **Mark `in_transit`** when leaving for delivery
3. **Mark `delivered`** immediately after successful delivery
4. **Add notes** if there are any issues
5. **Update shipping price** if different from expected

---

## 🔒 Security & Permissions

- **Admin**: Full access to all orders and status changes
- **Delivery Man**: Limited to assigned orders only, forward-only transitions
- **System**: Validates all transitions before allowing changes
- **History**: All changes are logged and cannot be deleted

---

## 📱 Where to Update Status

### Admin Panel:
- **Orders Tab**: Click on any order card
- **Status Dropdown**: Select new status
- **Delivery Man Dropdown**: Assign delivery man
- **Notes Field**: Add notes
- **Bulk Actions**: Update multiple orders at once

### Delivery Dashboard:
- **Order Cards**: Each assigned order shows current status
- **Quick Actions**: One-tap status updates
- **Update Form**: Full form for status, shipping price, payment
- **Notes**: Add delivery notes

---

This workflow ensures proper order management with clear responsibilities for both admin and delivery personnel.

