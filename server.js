const express = require('express');
const path = require('path');
// const nodemailer = require('nodemailer'); // temporarily disabled
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// ---------- Email 2FA storage (disabled) ----------
// const codeStore = new Map();

// ---------- Email transporter (disabled) ----------
// const transporter = nodemailer.createTransport({...});

// ---------- Admin login (skip email, issue token directly) ----------
app.post('/api/admin-login', async (req, res) => {
    const { password } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }
    // Temporarily skip email and just issue token
    const token = Buffer.from(Date.now().toString()).toString('base64');
    res.json({ success: true, token });
});

// ---------- verify-code endpoint (disabled, but kept to avoid 404) ----------
app.post('/api/verify-code', (req, res) => {
    res.status(404).json({ error: '2FA temporarily disabled' });
});

// ---------- In-memory storage ----------
let vehicles = [];
let nextId = 1;

// Helper: filter vehicles by search term
function filterVehicles(vehiclesArray, searchTerm) {
    if (!searchTerm) return vehiclesArray;
    const term = searchTerm.toLowerCase();
    return vehiclesArray.filter(v =>
        v.vehicleNumber.toLowerCase().includes(term) ||
        v.ownerName.toLowerCase().includes(term) ||
        v.phoneNumber.includes(term) ||
        (v.countryCode + v.phoneNumber).includes(term)
    );
}

// API: get vehicles with pagination and search
app.get('/api/vehicles', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    let filtered = filterVehicles(vehicles, search);
    const total = filtered.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginated = filtered.slice(start, end);
    res.json({
        vehicles: paginated,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        search
    });
});

// Statistics (total & today)
app.get('/api/stats', (req, res) => {
    const total = vehicles.length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const createdToday = vehicles.filter(v => {
        const d = new Date(v.createdAt);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === today.getTime();
    }).length;
    res.json({ total, createdToday });
});

// Generate QR (with country code)
app.post('/api/generate', (req, res) => {
    try {
        const { vehicleNumber, ownerName, countryCode, phoneNumber } = req.body;
        if (!vehicleNumber || !ownerName || !countryCode || !phoneNumber) {
            return res.status(400).json({ error: 'Missing fields' });
        }
        const fullPhoneNumber = `${countryCode}${phoneNumber}`;
        const qrData = `VEHICLE_${vehicleNumber}_${Date.now()}`;
        const host = req.get('host');
        const qrUrl = `https://${host}/vehicle/${qrData}`;
        const newVehicle = {
            id: nextId++,
            vehicleNumber,
            ownerName,
            countryCode,
            phoneNumber,
            fullPhoneNumber,
            qrData,
            qrUrl,
            createdAt: new Date(),
            scans: 0,
            lastScannedAt: null
        };
        vehicles.push(newVehicle);
        res.json({ success: true, qrData, qrUrl });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal error' });
    }
});

// Update vehicle (edit)
app.put('/api/vehicles/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { vehicleNumber, ownerName, countryCode, phoneNumber } = req.body;
        const index = vehicles.findIndex(v => v.id === id);
        if (index === -1) return res.status(404).json({ error: 'Not found' });
        vehicles[index] = {
            ...vehicles[index],
            vehicleNumber,
            ownerName,
            countryCode,
            phoneNumber,
            fullPhoneNumber: `${countryCode}${phoneNumber}`
        };
        res.json({ success: true, vehicle: vehicles[index] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Update failed' });
    }
});

// Delete vehicle
app.delete('/api/vehicles/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const index = vehicles.findIndex(v => v.id === id);
        if (index === -1) return res.status(404).json({ error: 'Not found' });
        vehicles.splice(index, 1);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// QR scan page – increment scan counter and last seen
app.get('/vehicle/:qrid', (req, res) => {
    const vehicle = vehicles.find(v => v.qrData === req.params.qrid);
    if (!vehicle) {
        return res.status(404).send('<h1>❌ Vehicle not found</h1>');
    }
    vehicle.scans = (vehicle.scans || 0) + 1;
    vehicle.lastScannedAt = new Date();

    const fullNumber = vehicle.fullPhoneNumber || `${vehicle.countryCode}${vehicle.phoneNumber}`;
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(vehicle.vehicleNumber)} | FleetQR</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Inter',sans-serif;background:linear-gradient(145deg,#0f172a,#0a0f1c);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem;}
.card{max-width:450px;width:100%;background:rgba(15,23,42,0.7);backdrop-filter:blur(16px);border-radius:2rem;border:1px solid rgba(255,255,255,0.1);overflow:hidden;}
.vehicle-icon{background:linear-gradient(135deg,#1e293b,#0f172a);padding:2rem;text-align:center;}
.vehicle-icon i{font-size:4rem;color:#60a5fa;}
.content{padding:2rem;}
.badge{background:#3b82f6;padding:0.25rem 1rem;border-radius:2rem;font-size:0.75rem;font-weight:600;display:inline-block;}
h1{font-size:1.8rem;color:white;margin:0.5rem 0 0.25rem;}
.owner{color:#94a3b8;margin-bottom:1.5rem;border-left:3px solid #3b82f6;padding-left:0.75rem;}
.info-row{display:flex;padding:0.8rem 0;border-bottom:1px solid #1e293b;}
.info-icon{width:2rem;color:#60a5fa;}
.info-label{flex:1;font-weight:500;color:#cbd5e1;}
.info-value{font-weight:600;color:white;}
.actions{display:flex;gap:0.8rem;margin:1.5rem 0;}
.btn{flex:1;padding:0.8rem;border-radius:2rem;font-weight:600;display:flex;align-items:center;justify-content:center;gap:0.5rem;text-decoration:none;transition:0.2s;}
.btn-call{background:#10b981;color:white;}
.btn-sms{background:#3b82f6;color:white;}
.btn-wa{background:#25d366;color:white;}
.btn:hover{transform:translateY(-2px);}
.footer{text-align:center;font-size:0.7rem;color:#475569;}
</style>
</head>
<body>
<div class="card">
<div class="vehicle-icon"><i class="fas fa-car"></i></div>
<div class="content">
<span class="badge"><i class="fas fa-qrcode"></i> Digital Passport</span>
<h1>${escapeHtml(vehicle.vehicleNumber)}</h1>
<div class="owner"><i class="fas fa-user-circle"></i> ${escapeHtml(vehicle.ownerName)}</div>
<div class="info-row"><div class="info-icon"><i class="fas fa-phone-alt"></i></div><div class="info-label">Contact</div><div class="info-value">${escapeHtml(fullNumber)}</div></div>
<div class="info-row"><div class="info-icon"><i class="fas fa-calendar-alt"></i></div><div class="info-label">Issued</div><div class="info-value">${new Date(vehicle.createdAt).toLocaleDateString()}</div></div>
<div class="actions">
<a href="tel:${escapeHtml(fullNumber)}" class="btn btn-call"><i class="fas fa-phone-alt"></i> Call</a>
<a href="sms:${escapeHtml(fullNumber)}" class="btn btn-sms"><i class="fas fa-comment"></i> SMS</a>
<a href="https://wa.me/${fullNumber.replace(/[^0-9]/g, '')}" class="btn btn-wa"><i class="fab fa-whatsapp"></i> WhatsApp</a>
</div>
<div class="footer"><i class="fas fa-shield-alt"></i> Secure QR · Report if found</div>
</div>
</div>
</body>
</html>`;
    res.send(html);
});

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : (m === '<' ? '&lt;' : '&gt;'));
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server on port ${PORT}`));
