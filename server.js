import express from 'express';
import { config } from './src/config/geotag.config.js';
import { connectDB } from './src/Database/db.js';
import geotagRoutes from './src/routes/geotag.routes.js';
import bleDeviceRoutes from './src/routes/bleDevice.routes.js';
import { geotagService } from './src/services/geotag.service.js';

const app = express();

app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    businessNo: config.businessNo,
    timestamp: new Date().toISOString(),
  });
});

// Mount Routes
app.use('/api', geotagRoutes);
app.use('/api', bleDeviceRoutes);

// Export service for direct usage in other modules/projects
export { geotagService };

// Start server
const PORT = config.port;

async function bootstrap() {
  // Connect to MongoDB
  await connectDB();

  app.listen(PORT, async () => {
    console.log(`====================================================`);
    console.log(`🚀 BLE GeoTag Service running on http://localhost:${PORT}`);
    console.log(`📡 Business No: ${config.businessNo}`);
    console.log(`====================================================`);
    console.log(`Available Endpoints:`);
    console.log(` - GET  /health`);
    console.log(` - GET  /api/ble-devices (List by hierarchy: superAdmin/school/branch/supervisor)`);
    console.log(` - POST /api/ble-devices (Register BLE Device)`);
    console.log(` - PUT  /api/ble-devices/:id (Assign/update hierarchy)`);
    console.log(` - POST /api/ble-devices/sync (Sync from GeoTag Cloud into DB)`);
    console.log(` - GET  /api/devices (Raw Cloud List)`);
    console.log(` - GET  /api/devices/:sn/history (Raw Cloud History)`);
    console.log(`====================================================`);

    // Verify GeoTag Cloud Connectivity
    try {
      const list = await geotagService.getDeviceList({ page: 1, pageSize: 1 });
      console.log(`✅ GeoTag Cloud Connection: OK (Found ${list.total || 0} registered devices)`);
    } catch (err) {
      console.warn(`⚠️ GeoTag Connection Warning: ${err.message}`);
    }
  });
}

bootstrap();