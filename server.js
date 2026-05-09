const express = require('express');
const path = require('path');
const { Resend } = require('resend');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// ---------- Resend setup (for anonymous messages) ----------
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ---------- Static 2FA login ----------
app.post('/api/admin-login', (req, res) => {
    const { password, code2fa } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }
    const required2FA = process.env.ADMIN_2FA_CODE;
    if (required2FA && code2fa !== required2FA) {
        return res.status(401).json({ error: 'Invalid 2FA code' });
    }
    const token = Buffer.from(Date.now().toString()).toString('base64');
    res.json({ success: true, token });
});

// ---------- In-memory vehicle storage ----------
let vehicles = [];
let nextId = 1;

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

// ---------- Anonymous messaging endpoint ----------
app.post('/api/send-message', async (req, res) => {
    const { qrData, message, senderContact } = req.body;
    const vehicle = vehicles.find(v => v.qrData === qrData);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    const ownerEmail = process.env.ADMIN_EMAIL;
    if (!ownerEmail || !resend) {
        console.log('Message from scanner:', { vehicle: vehicle.vehicleNumber, message, senderContact });
        return res.json({ success: true, message: 'Message received (email not configured).' });
    }

    try {
        await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: ownerEmail,
            subject: `New message for vehicle ${vehicle.vehicleNumber}`,
            html: `
                <h3>New message about vehicle ${vehicle.vehicleNumber}</h3>
                <p><strong>From:</strong> ${senderContact || 'Anonymous'}</p>
                <p><strong>Message:</strong></p>
                <p>${message.replace(/\n/g, '<br>')}</p>
                <p>You can reply directly to this email if the sender provided their contact info.</p>
            `
        });
        res.json({ success: true, message: 'Your message has been sent to the owner.' });
    } catch (err) {
        console.error('Email error:', err);
        res.status(500).json({ error: 'Failed to send message. Please try later.' });
    }
});

// ---------- QR scan page (fixed support button, no issued date, anonymous messaging) ----------
app.get('/vehicle/:qrid', (req, res) => {
    const vehicle = vehicles.find(v => v.qrData === req.params.qrid);
    if (!vehicle) {
        return res.status(404).send('<h1>❌ Vehicle not found</h1>');
    }
    vehicle.scans = (vehicle.scans || 0) + 1;
    vehicle.lastScannedAt = new Date();

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
.support-btn {
    background: #10b981;
    color: white;
    border: none;
    padding: 0.8rem;
    border-radius: 2rem;
    font-weight: 600;
    width: 100%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin: 1rem 0;
    transition: 0.2s;
}
.support-btn:hover { background: #059669; transform: translateY(-2px); }
.message-form{margin-top:1rem;}
.message-form textarea, .message-form input{width:100%;padding:0.8rem;border-radius:1rem;background:#0f172a;border:1px solid #334155;color:white;margin:0.5rem 0;font-family:inherit;}
.message-form button{background:#3b82f6;color:white;border:none;padding:0.8rem;border-radius:2rem;cursor:pointer;width:100%;font-weight:600;}
.message-form button:hover{background:#2563eb;}
.footer{text-align:center;font-size:0.7rem;color:#475569;margin-top:1rem;}
</style>
</head>
<body>
<div class="card">
<div class="vehicle-icon"><i class="fas fa-car"></i></div>
<div class="content">
<span class="badge"><i class="fas fa-qrcode"></i> Digital Passport</span>
<h1>${escapeHtml(vehicle.vehicleNumber)}</h1>
<div class="owner"><i class="fas fa-user-circle"></i> ${escapeHtml(vehicle.ownerName)}</div>

<!-- Fixed customer support button – change the phone number below -->
<button class="support-btn" onclick="window.location.href='tel:+1234567890'">
    <i class="fas fa-headset"></i> Call Customer Support
</button>

<div class="message-form">
    <p><i class="fas fa-envelope"></i> Send a private message to the owner</p>
    <textarea id="msg" rows="4" placeholder="Your message..."></textarea>
    <input type="text" id="contact" placeholder="Your email or phone (optional, for reply)">
    <button id="sendBtn">Send Message</button>
    <div id="status" style="margin-top:0.5rem; font-size:0.8rem;"></div>
</div>
<div class="footer"><i class="fas fa-shield-alt"></i> Your contact info stays private</div>
</div>
</div>
<script>
document.getElementById('sendBtn').addEventListener('click', async () => {
    const message = document.getElementById('msg').value.trim();
    const senderContact = document.getElementById('contact').value.trim();
    if (!message) { alert('Please write a message'); return; }
    const btn = document.getElementById('sendBtn');
    btn.disabled = true; btn.innerText = 'Sending...';
    const qrData = window.location.pathname.split('/').pop();
    try {
        const res = await fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qrData, message, senderContact })
        });
        const data = await res.json();
        const statusDiv = document.getElementById('status');
        if (data.success) {
            statusDiv.innerHTML = '<span style="color:#10b981;">✅ Message sent. The owner may reply if they wish.</span>';
            document.getElementById('msg').value = '';
            document.getElementById('contact').value = '';
        } else {
            statusDiv.innerHTML = '<span style="color:#f87171;">❌ ' + (data.error || 'Failed') + '</span>';
        }
    } catch(err) {
        document.getElementById('status').innerHTML = '<span style="color:#f87171;">❌ Network error. Try again.</span>';
    } finally {
        btn.disabled = false; btn.innerText = 'Send Message';
    }
});
</script>
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
