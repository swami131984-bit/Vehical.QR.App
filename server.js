const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Simple admin login (single user)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
app.post('/api/admin-login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        const token = Buffer.from(Date.now().toString()).toString('base64');
        res.json({ success: true, token });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// In-memory storage (reset each deploy)
let vehicles = [];
let nextId = 1;

// ========== API ROUTES ==========

// Generate QR code (with country code + phone number)
app.post('/api/generate', (req, res) => {
  try {
    const { vehicleNumber, ownerName, countryCode, phoneNumber } = req.body;
    if (!vehicleNumber || !ownerName || !countryCode || !phoneNumber) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const fullPhoneNumber = `${countryCode}${phoneNumber}`;
    const qrData = `VEHICLE_${vehicleNumber}_${Date.now()}`;
    const host = req.get('host');
    const qrUrl = `https://${host}/vehicle/${qrData}`;
    const newVehicle = {
      id: nextId++,
      vehicleNumber,
      ownerName,
      phoneNumber,        // store local part only
      countryCode,        // store country code separately
      fullPhoneNumber,    // combined for convenience
      qrData,
      qrUrl,
      createdAt: new Date()
    };
    vehicles.push(newVehicle);
    res.json({ success: true, qrData, qrUrl });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List all vehicles with pagination
app.get('/api/vehicles', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const start = (page - 1) * limit;
  const end = start + limit;
  const paginatedVehicles = vehicles.slice(start, end);
  res.json({
    vehicles: paginatedVehicles,
    total: vehicles.length,
    page,
    totalPages: Math.ceil(vehicles.length / limit)
  });
});

// UPDATE vehicle by id (edit)
app.put('/api/vehicles/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { vehicleNumber, ownerName, countryCode, phoneNumber } = req.body;
    const index = vehicles.findIndex(v => v.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }
    // Update fields, keep QR data unchanged
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
    console.error('Update error:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// DELETE vehicle by id
app.delete('/api/vehicles/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const index = vehicles.findIndex(v => v.id === id);
        if (index === -1) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }
        vehicles.splice(index, 1);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// ========== QR SCAN PAGE ==========
app.get('/vehicle/:qrid', (req, res) => {
  const vehicle = vehicles.find(v => v.qrData === req.params.qrid);
  if (!vehicle) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not Found</title>
      <style>body{font-family:Arial;text-align:center;padding:50px;background:#0f172a;color:white}</style>
      </head>
      <body><h1>❌ Vehicle not found</h1><p>This QR code is invalid or has been removed.</p></body>
      </html>
    `);
  }

  const fullNumber = vehicle.fullPhoneNumber || `${vehicle.countryCode}${vehicle.phoneNumber}`;
  const scanHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${escapeHtml(vehicle.vehicleNumber)} | FleetQR</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Inter',sans-serif;background:linear-gradient(145deg,#0f172a 0%,#0a0f1c 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem;}
    .card{max-width:450px;width:100%;background:rgba(15,23,42,0.7);backdrop-filter:blur(16px);border-radius:2rem;border:1px solid rgba(255,255,255,0.1);overflow:hidden;box-shadow:0 25px 45px -12px black;}
    .vehicle-icon{background:linear-gradient(135deg,#1e293b,#0f172a);padding:2rem;text-align:center;}
    .vehicle-icon i{font-size:4rem;color:#60a5fa;}
    .content{padding:2rem;}
    .badge{display:inline-block;background:#3b82f6;padding:0.25rem 1rem;border-radius:2rem;font-size:0.75rem;font-weight:600;margin-bottom:1rem;}
    h1{font-size:1.8rem;color:white;margin-bottom:0.25rem;}
    .owner{color:#94a3b8;margin-bottom:1.5rem;border-left:3px solid #3b82f6;padding-left:0.75rem;}
    .info-row{display:flex;padding:0.8rem 0;border-bottom:1px solid #1e293b;}
    .info-icon{width:2rem;color:#60a5fa;}
    .info-label{flex:1;font-weight:500;color:#cbd5e1;}
    .info-value{font-weight:600;color:white;}
    .actions{display:flex;gap:0.8rem;margin-top:2rem;}
    .btn{flex:1;padding:0.8rem;border-radius:2rem;font-weight:600;display:flex;align-items:center;justify-content:center;gap:0.5rem;text-decoration:none;transition:0.2s;}
    .btn-call{background:#10b981;color:white;}
    .btn-sms{background:#3b82f6;color:white;}
    .btn-wa{background:#25d366;color:white;}
    .btn:hover{transform:translateY(-2px);filter:brightness(1.05);}
    .footer{text-align:center;font-size:0.7rem;color:#475569;margin-top:1.5rem;}
  </style>
</head>
<body>
  <div class="card">
    <div class="vehicle-icon"><i class="fas fa-car"></i></div>
    <div class="content">
      <span class="badge"><i class="fas fa-qrcode"></i> Digital Passport</span>
      <h1>${escapeHtml(vehicle.vehicleNumber)}</h1>
      <div class="owner"><i class="fas fa-user-circle"></i> ${escapeHtml(vehicle.ownerName)}</div>
      <div class="info-row">
        <div class="info-icon"><i class="fas fa-phone-alt"></i></div>
        <div class="info-label">Contact</div>
        <div class="info-value">${escapeHtml(fullNumber)}</div>
      </div>
      <div class="info-row">
        <div class="info-icon"><i class="fas fa-calendar-alt"></i></div>
        <div class="info-label">Issued</div>
        <div class="info-value">${new Date(vehicle.createdAt).toLocaleDateString()}</div>
      </div>
      <div class="actions">
        <a href="tel:${escapeHtml(fullNumber)}" class="btn btn-call"><i class="fas fa-phone-alt"></i> Call</a>
        <a href="sms:${escapeHtml(fullNumber)}" class="btn btn-sms"><i class="fas fa-comment"></i> SMS</a>
        <a href="https://wa.me/${fullNumber.replace(/[^0-9]/g, '')}" class="btn btn-wa"><i class="fab fa-whatsapp"></i> WhatsApp</a>
      </div>
      <div class="footer"><i class="fas fa-shield-alt"></i> Secure QR • Report if found</div>
    </div>
  </div>
</body>
</html>`;
  res.send(scanHtml);
});

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ========== FRONTEND ROUTES ==========
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`👉 Open https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost'}`);
});
