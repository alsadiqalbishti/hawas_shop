const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const PRODUCTS_FILE = path.join(process.cwd(), 'data', 'products.json');

// Helper to read products
async function readProducts() {
    try {
        const data = await readFile(PRODUCTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

// Helper to write products
async function writeProducts(products) {
    await writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2));
}

// Helper to generate unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // GET - List all products or get single product
        if (req.method === 'GET') {
            const products = await readProducts();
            const { id } = req.query;

            if (id) {
                const product = products.find(p => p.id === id);
                if (!product) {
                    return res.status(404).json({ error: 'Product not found' });
                }
                return res.status(200).json(product);
            }

            return res.status(200).json(products);
        }

        // POST - Create new product
        if (req.method === 'POST') {
            const products = await readProducts();
            const { name, price, description, mediaUrl, mediaType } = req.body;

            const newProduct = {
                id: generateId(),
                name,
                price: parseFloat(price),
                description: description || '',
                mediaUrl: mediaUrl || '',
                mediaType: mediaType || 'image',
                createdAt: new Date().toISOString()
            };

            products.push(newProduct);
            await writeProducts(products);

            return res.status(201).json(newProduct);
        }

        // PUT - Update product
        if (req.method === 'PUT') {
            const products = await readProducts();
            const { id, name, price, description, mediaUrl, mediaType } = req.body;

            const index = products.findIndex(p => p.id === id);
            if (index === -1) {
                return res.status(404).json({ error: 'Product not found' });
            }

            products[index] = {
                ...products[index],
                name: name || products[index].name,
                price: price ? parseFloat(price) : products[index].price,
                description: description !== undefined ? description : products[index].description,
                mediaUrl: mediaUrl !== undefined ? mediaUrl : products[index].mediaUrl,
                mediaType: mediaType || products[index].mediaType,
                updatedAt: new Date().toISOString()
            };

            await writeProducts(products);
            return res.status(200).json(products[index]);
        }

        // DELETE - Delete product
        if (req.method === 'DELETE') {
            const products = await readProducts();
            const { id } = req.query;

            const filteredProducts = products.filter(p => p.id !== id);

            if (filteredProducts.length === products.length) {
                return res.status(404).json({ error: 'Product not found' });
            }

            await writeProducts(filteredProducts);
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Products API error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
};
