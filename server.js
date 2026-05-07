const express = require('express');
const app = express();
app.use(express.json());
app.use(express.static(__dirname));
let vehicles = [];
let nextId = 1;
app.post('/api/generate', (req, res) => {
  const { vehicleNumber, ownerName, phoneNumber } = req.body;
  if (!vehicleNumber || !ownerName || !phoneNumber) return res.status(400).json({ error: 'Missing fields' });
  const qrData = `VEHICLE_${vehicleNumber}_${Date.now()}`;
  const qrUrl = `https://${req.get('host')}/vehicle/${qrData}`;
  vehicles.push({ id: nextId++, vehicleNumber, ownerName, phoneNumber, qrData, qrUrl, createdAt: new Date() });
  res.json({ success: true, qrData, qrUrl });
});
app.get('/vehicle/:qrid', (req, res) => {
  const v = vehicles.find(v => v.qrData === req.params.qrid);
  if (!v) return res.status(404).send('Vehicle not found');
  res.send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vehicle Info</title><style>body{font-family:Arial;text-align:center;padding:20px}.card{max-width:400px;margin:auto;background:white;padding:20px;border-radius:20px;box-shadow:0 4px 8px rgba(0,0,0,0.1)}button{background:#1E40AF;color:white;padding:12px;margin:5px;border:none;border-radius:10px;width:100%}</style></head><body><div class="card"><h1>🚗 ${v.vehicleNumber}</h1><p><strong>Owner:</strong> ${v.ownerName}</p><p><strong>Phone:</strong> ${v.phoneNumber}</p><button onclick="location.href='tel:${v.phoneNumber}'">📞 Call</button><button onclick="location.href='sms:${v.phoneNumber}'">💬 SMS</button><button onclick="location.href='https://wa.me/${v.phoneNumber.replace(/[^0-9]/g, '')}'">💚 WhatsApp</button></div></body></html>`);
});
app.get('/admin.html', (req, res) => res.sendFile(__dirname + '/admin.html'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server on port ${PORT}`));