# Updated `server.js` for FleetQR Pro with Working Email 2FA

Replace your current `server.js` with this full code.

```js
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// ---------- Email 2FA storage ----------
const codeStore = new Map();

// ---------- Email transporter ----------
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verify transporter connection
transporter.verify((error, success) => {
    if (error) {
        console.log('❌ Email transporter error:');
        console.log(error);
    } else {
        console.log('✅ Email server ready');
    }
});

// ---------- Admin login (step 1: send code) ----------
app.post('/api/admin-login', async (req, res) => {
    try {
        const { password } = req.body;

        if (password !== process.env.ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        const adminEmail = process.env.ADMIN_EMAIL;

        if (!adminEmail) {
            return res.status(500).json({ error: 'Admin email not set' });
        }

        // Generate OTP
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // Expire in 5 minutes
        const expiresAt = Date.now() + 5 * 60 * 1000;

        codeStore.set(adminEmail, {
            code,
            expiresAt
        });

        console.log('📨 Sending OTP to:', adminEmail);
        console.log('🔑 OTP:', code);

        const info = await transporter.sendMail({
            from: `"FleetQR Pro" <${process.env.EMAIL_USER}>`,
            to: adminEmail,
            subject: 'FleetQR Pro – Login Verification Code',
            html: `
                <div style="font-family:Arial;padding:20px">
                    <h2>FleetQR Pro Login</h2>
                    <p>Your verification code is:</p>
                    <h1 style="letter-spacing:5px;color:#2563eb">${code}</h1>
                    <p>This code is valid for 5 minutes.</p>
                </div>
            `
        });

        console.log('✅ Email sent:', info.response);

        res.json({
            success: true,
            message: 'Verification code sent'
        });

    } catch (err) {
        console.error('❌ Email sending error:');
        console.error(err);

        res.status(500).json({
            error: 'Failed to send email',
            details: err.message
        });
    }
});

// ---------- Step 2: verify code and issue token ----------
app.post('/api/verify-code', (req, res) => {
    const { code } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL;

    const record = codeStore.get(adminEmail);

    if (!record) {
        return res.status(401).json({ error: 'No code requested or expired' });
    }

    if (Date.now() > record.expiresAt) {
        codeStore.delete(adminEmail);
        return res.status(401).json({ error: 'Code expired, login again' });
    }

    if (record.code !== code) {
        return res.status(401).json({ error: 'Invalid code' });
    }

    codeStore.delete(adminEmail);

    const token = Buffer.from(Date.now().toString()).toString('base64');

    res.json({
        success: true,
        token
    });
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

// Statistics
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

// Generate QR
app.post('/api/generate', (req, res) => {
    try {
        const {
            vehicleNumber,
            ownerName,
            countryCode,
            phoneNumber
        } = req.body;

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

        res.json({
            success: true,
            qrData,
            qrUrl
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal error' });
    }
});

// Update vehicle
app.put('/api/vehicles/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);

        const {
            vehicleNumber,
            ownerName,
            countryCode,
            phoneNumber
        } = req.body;

        const index = vehicles.findIndex(v => v.id === id);

        if (index === -1) {
            return res.status(404).json({ error: 'Not found' });
        }

        vehicles[index] = {
            ...vehicles[index],
            vehicleNumber,
            ownerName,
            countryCode,
            phoneNumber,
            fullPhoneNumber: `${countryCode}${phoneNumber}`
        };

        res.json({
            success: true,
            vehicle: vehicles[index]
        });

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

        if (index === -1) {
            return res.status(404).json({ error: 'Not found' });
        }

        vehicles.splice(index, 1);

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// QR scan page
app.get('/vehicle/:qrid', (req, res) => {
    const vehicle = vehicles.find(v => v.qrData === req.params.qrid);

    if (!vehicle) {
        return res.status(404).send('<h1>❌ Vehicle not found</h1>');
    }

    vehicle.scans = (vehicle.scans || 0) + 1;
    vehicle.lastScannedAt = new Date();

    const fullNumber = vehicle.fullPhoneNumber || `${vehicle.countryCode}${vehicle.phoneNumber}`;

    res.send(`
        <h1>${vehicle.vehicleNumber}</h1>
        <p>Owner: ${vehicle.ownerName}</p>
        <p>Phone: ${fullNumber}</p>
    `);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
});
```

## IMPORTANT Railway Variables

Add these in Railway → Variables:

```env
EMAIL_USER=yourgmail@gmail.com
EMAIL_PASS=your16digitapppassword
ADMIN_EMAIL=yourgmail@gmail.com
ADMIN_PASSWORD=yourpassword
```

After uploading to GitHub:

1. Railway auto deploy will start
2. Wait 1–2 minutes
3. Test login again
