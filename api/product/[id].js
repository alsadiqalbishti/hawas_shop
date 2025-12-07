const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
    // Read the product.html file
    const htmlPath = path.join(process.cwd(), 'public', 'product.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Set content type to HTML
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
};
