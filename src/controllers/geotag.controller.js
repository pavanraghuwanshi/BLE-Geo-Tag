import axios from 'axios';
import { geotagService } from '../services/geotag.service.js';

export async function getDevices(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const status = req.query.status !== undefined ? parseInt(req.query.status, 10) : 1;
    const data = await geotagService.getDeviceList({ page, pageSize, status });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, code: error.code || 500 });
  }
}

export async function getDeviceDetail(req, res) {
  try {
    const { uuid } = req.params;
    const data = await geotagService.getDeviceDetail(uuid);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, code: error.code || 500 });
  }
}

/**
 * GET /api/devices/:deviceId/trajectory
 * Pure middleware proxy — frontend sends deviceId + all query params,
 * backend forwards as-is to customer.geotag.top and returns response directly.
 */
export async function getDeviceHistory(req, res) {
  try {
    const { deviceId } = req.params;

    const url = `${process.env.GEOTAG_CUSTOMER_BASE_URL || 'https://customer.geotag.top/prod-api'}/device/device/${deviceId}/trajectoryPageList`;

    const headers = { 'Content-Type': 'application/json' };
    if (process.env.GEOTAG_CUSTOMER_TOKEN) {
      headers['Authorization'] = process.env.GEOTAG_CUSTOMER_TOKEN.startsWith('Bearer ')
        ? process.env.GEOTAG_CUSTOMER_TOKEN
        : `Bearer ${process.env.GEOTAG_CUSTOMER_TOKEN}`;
    } else if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    const response = await axios.get(url, {
      params: req.query,  // pass all query params as-is: startLocationTime, endLocationTime, pageNum, pageSize
      headers,
      timeout: 15000,
    });

    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error('[GeoTag Trajectory Error]:', error.message);
    if (error.response) return res.status(error.response.status).json(error.response.data);
    return res.status(500).json({ code: 500, msg: error.message });
  }
}
