// Delivery man authentication (signup/login)

const API_BASE = window.location.origin;

// Show notification
function showNotification(message, type = 'error') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#f44336' : '#4caf50'};
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        z-index: 10000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Signup
if (document.getElementById('signupForm')) {
    document.getElementById('signupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            name: formData.get('name'),
            phone: formData.get('phone'),
            password: formData.get('password'),
            action: 'signup'
        };

        try {
            const response = await fetch(`${API_BASE}/api/delivery/auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            if (response.ok && result.success) {
                localStorage.setItem('deliveryToken', result.token);
                localStorage.setItem('deliveryMan', JSON.stringify(result.deliveryMan));
                window.location.href = 'delivery-dashboard.html';
            } else {
                showNotification(result.error || 'حدث خطأ في التسجيل');
            }
        } catch (error) {
            showNotification('حدث خطأ في الاتصال بالخادم');
        }
    });
}

// Login
if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            phone: formData.get('phone'),
            password: formData.get('password'),
            action: 'login'
        };

        try {
            const response = await fetch(`${API_BASE}/api/delivery/auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            if (response.ok && result.success) {
                localStorage.setItem('deliveryToken', result.token);
                localStorage.setItem('deliveryMan', JSON.stringify(result.deliveryMan));
                window.location.href = 'delivery-dashboard.html';
            } else {
                showNotification(result.error || 'رقم الهاتف أو كلمة المرور غير صحيحة');
            }
        } catch (error) {
            showNotification('حدث خطأ في الاتصال بالخادم');
        }
    });
}

