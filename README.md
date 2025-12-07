# 🛍️ Facebook Store Management System

A complete store management system for Facebook ads with admin control panel, product pages, and order management.

## ✨ Features

- 🔐 **Admin Control Panel** - Password-protected dashboard
- 📦 **Product Management** - Add, edit, delete products with images/videos
- 📋 **Order Management** - View and manage customer orders
- 🌐 **Arabic RTL Support** - Full right-to-left layout
- 📱 **Mobile Responsive** - Works perfectly on all devices
- 🆓 **100% Free Hosting** - Deploy on Vercel for free
- 📊 **Google Sheets Integration** - (Optional) Backup data to spreadsheets

## 🚀 Quick Start

### 1. Prerequisites

- Node.js installed (v14 or higher)
- Vercel account (free) - [Sign up here](https://vercel.com/signup)

### 2. Install Vercel CLI

```bash
npm install -g vercel
```

### 3. Clone or Download This Project

Make sure all files are in the `facebook_store_page` directory.

### 4. Install Dependencies

```bash
cd facebook_store_page
npm install
```

### 5. Configure Environment Variables

Create a `.env` file in the root directory:

```env
ADMIN_PASSWORD=your_secure_password_here
```

**Important:** Change `your_secure_password_here` to a strong password!

### 6. Test Locally

```bash
npm run dev
```

Then open: `http://localhost:3000`

- Admin panel: `http://localhost:3000/admin.html`
- Default password: `admin123` (or what you set in `.env`)

### 7. Deploy to Vercel

```bash
vercel login
vercel
```

Follow the prompts:
- Set up and deploy? **Yes**
- Which scope? Choose your account
- Link to existing project? **No**
- Project name? Press Enter (or choose a name)
- Directory? Press Enter (current directory)
- Override settings? **No**

### 8. Set Environment Variables on Vercel

After deployment, set your admin password:

```bash
vercel env add ADMIN_PASSWORD
```

Enter your password when prompted, then select **Production**.

Redeploy to apply changes:

```bash
vercel --prod
```

## 📖 How to Use

### Admin Panel

1. Go to `https://your-project.vercel.app/admin.html`
2. Enter your admin password
3. **Products Tab:**
   - Click "➕ إضافة منتج جديد" to add a product
   - Fill in product name (Arabic), price, description, and upload image/video
   - Click "💾 حفظ" to save
   - Click "📋 نسخ الرابط" to copy the product link for your Facebook ad
4. **Orders Tab:**
   - View all customer orders
   - Mark orders as completed
   - Delete processed orders

### Creating Facebook Ads

1. Create a product in the admin panel
2. Copy the product link (e.g., `https://your-project.vercel.app/product/abc123`)
3. Use this link in your Facebook ad
4. When customers click the ad, they'll see the product page
5. Customers fill the order form and submit
6. You see the order in your admin panel!

### Product Store Page

Customers will see:
- Product image or video
- Product name and price in Arabic
- Order form (name, phone, address, quantity)
- Beautiful, mobile-friendly design

## 🔧 Configuration

### Change Admin Password

1. Go to your Vercel dashboard
2. Select your project
3. Go to Settings → Environment Variables
4. Edit `ADMIN_PASSWORD`
5. Redeploy the project

### Custom Domain

1. Go to Vercel dashboard → Your project
2. Settings → Domains
3. Add your custom domain
4. Follow DNS configuration instructions

## 📁 Project Structure

```
facebook_store_page/
├── api/                    # Serverless API functions
│   ├── auth.js            # Authentication
│   ├── products.js        # Products CRUD
│   ├── orders.js          # Orders CRUD
│   └── upload.js          # File uploads
├── public/                # Frontend files
│   ├── index.html         # Landing page
│   ├── admin.html         # Admin panel
│   ├── admin.js           # Admin logic
│   ├── product.html       # Product store page
│   ├── product.js         # Product page logic
│   ├── styles.css         # Global styles
│   └── uploads/           # Uploaded media
├── data/                  # JSON database
│   ├── products.json      # Products data
│   └── orders.json        # Orders data
├── package.json           # Dependencies
├── vercel.json           # Vercel configuration
└── README.md             # This file
```

## 🎨 Customization

### Change Colors

Edit `public/styles.css` and modify the CSS variables:

```css
:root {
  --primary: #6366f1;      /* Main color */
  --secondary: #8b5cf6;    /* Secondary color */
  --success: #10b981;      /* Success color */
  --danger: #ef4444;       /* Danger color */
}
```

### Change Font

The default font is Cairo (Arabic). To change it, edit the Google Fonts link in the HTML files.

## 🐛 Troubleshooting

### "Product not found" error
- Make sure the product ID in the URL is correct
- Check if the product exists in the admin panel

### Orders not showing
- Refresh the orders tab
- Check browser console for errors

### Can't login to admin panel
- Verify your password in Vercel environment variables
- Clear browser cache and try again

### Images not uploading
- Check file size (keep under 5MB)
- Ensure file format is supported (jpg, png, gif, mp4, webm)

## 📊 Google Sheets Integration (Optional)

To backup orders to Google Sheets:

1. Create a Google Cloud project
2. Enable Google Sheets API
3. Create a service account and download credentials
4. Add environment variables in Vercel:
   - `GOOGLE_SHEETS_ENABLED=true`
   - `GOOGLE_SHEETS_ID=your_sheet_id`
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL=...`
   - `GOOGLE_PRIVATE_KEY=...`

## 💡 Tips

- **Test before going live:** Always test locally first
- **Backup your data:** Download `data/products.json` and `data/orders.json` regularly
- **Monitor orders:** Check the admin panel daily for new orders
- **Mobile-first:** Most Facebook users are on mobile, so the design is optimized for mobile

## 🆘 Support

If you encounter issues:
1. Check the browser console for errors (F12)
2. Check Vercel deployment logs
3. Verify environment variables are set correctly

## 📝 License

MIT License - Free to use and modify!

---

**Built with ❤️ for Facebook store owners**

Happy selling! 🎉
