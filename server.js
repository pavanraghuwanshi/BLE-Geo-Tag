import express from 'express';
import cors from 'cors';
import { config } from './src/config/geotag.config.js';
import { connectDB } from './src/Database/db.js';
import geotagRoutes from './src/routes/geotag.routes.js';
import bleDeviceRoutes from './src/routes/bleDevice.routes.js';
import { geotagService } from './src/services/geotag.service.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Mount Routes
app.use('/api', geotagRoutes);
app.use('/api', bleDeviceRoutes);

// Export service for direct usage in other modules/projects
export { geotagService };

// Start server
const PORT = config.port || 4000;

async function bootstrap() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`🚀 BLE GeoTag Service running on port ${PORT}`);
    });
  } catch (err) {
    console.error(`❌ Failed to start server:`, err.message);
    process.exit(1);
  }
}

bootstrap();