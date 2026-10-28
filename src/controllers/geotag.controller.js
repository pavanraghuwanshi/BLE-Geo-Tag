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

function parseTimeInput(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    return val < 1e11 ? val * 1000 : val;
  }
  const str = String(val).trim();
  if (/^\d{10,13}$/.test(str)) {
    const num = Number(str);
    return num < 1e11 ? num * 1000 : num;
  }
  const parsed = new Date(str).getTime();
  return isNaN(parsed) ? null : parsed;
}

function extractPointTimestamp(point) {
  if (!point) return null;
  const val = point.locationTime || point.reportedTime || point.time || point.timestamp || point.createTime || point.createdAt;
  if (!val) return null;
  if (typeof val === 'number') {
    return val < 1e11 ? val * 1000 : val;
  }
  const str = String(val).trim();
  if (/^\d{10,13}$/.test(str)) {
    const num = Number(str);
    return num < 1e11 ? num * 1000 : num;
  }
  const parsed = new Date(str).getTime();
  return isNaN(parsed) ? null : parsed;
}

function formatGeoTagDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export async function getDeviceHistory(req, res) {
  try {
    const { sn } = req.params;
    const {
      beginTime,
      endTime,
      from,
      to,
      startLocationTime,
      endLocationTime,
      startDate,
      endDate,
      days = 7,
    } = req.query;

    const now = Date.now();
    const parsedBegin =
      parseTimeInput(beginTime) ||
      parseTimeInput(from) ||
      parseTimeInput(startLocationTime) ||
      parseTimeInput(startDate) ||
      now - (Number(days) * 24 * 60 * 60 * 1000);

    const parsedEnd =
      parseTimeInput(endTime) ||
      parseTimeInput(to) ||
      parseTimeInput(endLocationTime) ||
      parseTimeInput(endDate) ||
      now;

    const startLocationTimeStr = formatGeoTagDate(parsedBegin);
    const endLocationTimeStr = formatGeoTagDate(parsedEnd);

    const data = await geotagService.getDeviceHistory(sn, {
      beginTime: parsedBegin,
      endTime: parsedEnd,
      startLocationTime: startLocationTimeStr,
      endLocationTime: endLocationTimeStr,
    });

    const rawList = Array.isArray(data)
      ? data
      : (data?.list || data?.data || data?.records || data?.rows || []);

    const filtered = rawList.filter((item) => {
      const pointTime = extractPointTimestamp(item);
      if (pointTime === null) return true;
      return pointTime >= parsedBegin && pointTime <= parsedEnd;
    });

    res.json({
      success: true,
      total: filtered.length,
      data: Array.isArray(data) ? filtered : { ...data, list: filtered, total: filtered.length },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      code: error.code || 500,
      details: error.rawResponse || null,
    });
  }
}
