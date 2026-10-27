import { geotagService } from '../services/geotag.service.js';

export async function getDevices(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const status = req.query.status !== undefined ? parseInt(req.query.status, 10) : 1;

    const data = await geotagService.getDeviceList({ page, pageSize, status });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      code: error.code || 500,
      details: error.rawResponse || null,
    });
  }
}

export async function getDeviceDetail(req, res) {
  try {
    const { uuid } = req.params;
    const data = await geotagService.getDeviceDetail(uuid);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      code: error.code || 500,
    });
  }
}

export async function getDeviceHistory(req, res) {
  try {
    const { sn } = req.params;
    const beginTime = req.query.beginTime ? parseInt(req.query.beginTime, 10) : undefined;
    const endTime = req.query.endTime ? parseInt(req.query.endTime, 10) : undefined;

    const data = await geotagService.getDeviceHistory(sn, { beginTime, endTime });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      code: error.code || 500,
    });
  }
}
