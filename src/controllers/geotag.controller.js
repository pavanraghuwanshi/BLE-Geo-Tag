import NodeCache from 'node-cache';
import { geotagService } from '../services/geotag.service.js';
import { parseToISTTimestamp, formatISTDate, extractPointTimestamp } from '../utils/time.helper.js';

// In-memory cache for trajectory/history queries
// Past dates: 1 hour (3600s); Today/Active: 30 seconds
const historyCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

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
 * GET /api/devices/:sn/history
 * Fetches location history from official GeoTag Open API (api.geotag.top) by SN.
 * 
 * Query Parameters:
 * - date: Single date (YYYY-MM-DD) in IST
 * - startLocationTime: Start datetime (YYYY-MM-DD HH:mm:ss) in IST
 * - endLocationTime: End datetime (YYYY-MM-DD HH:mm:ss) in IST
 * - refresh: "true" to force bypass in-memory cache
 */
export async function getDeviceHistory(req, res) {
  try {
    const { sn } = req.params;

    if (!sn) {
      return res.status(400).json({ success: false, message: 'Device sn is required' });
    }

    const { date, startLocationTime, endLocationTime, refresh } = req.query;

    // 1. Parse date range in Indian Standard Time (IST, UTC+05:30)
    const now = Date.now();
    let parsedBegin;
    let parsedEnd;

    if (date) {
      parsedBegin = parseToISTTimestamp(date, false);
      parsedEnd = parseToISTTimestamp(date, true);
    } else {
      parsedBegin = parseToISTTimestamp(startLocationTime, false) || (now - 7 * 24 * 60 * 60 * 1000);
      parsedEnd = parseToISTTimestamp(endLocationTime, true) || now;
    }

    const startLocationTimeStr = formatISTDate(parsedBegin);
    const endLocationTimeStr = formatISTDate(parsedEnd);

    // 2. Check In-Memory Cache (sub-millisecond response)
    const cacheKey = `${sn}:${parsedBegin}:${parsedEnd}`;
    if (refresh !== 'true') {
      const cached = historyCache.get(cacheKey);
      if (cached) {
        return res.status(200).json(cached);
      }
    }

    // 3. Call GeoTag Open API via geotagService (parallel multi-page traversal)
    const cloudData = await geotagService.getDeviceHistory(sn, {
      beginTime: parsedBegin,
      endTime: parsedEnd,
      startLocationTime: startLocationTimeStr,
      endLocationTime: endLocationTimeStr,
      fetchAll: true,
    });

    const rawList = Array.isArray(cloudData)
      ? cloudData
      : (cloudData?.list || cloudData?.data || cloudData?.records || []);

    // 4. In-memory filter strictly between parsedBegin and parsedEnd
    const filteredHistory = rawList.filter((item) => {
      const pointTime = extractPointTimestamp(item);
      if (pointTime === null) return true;
      return pointTime >= parsedBegin && pointTime <= parsedEnd;
    });

    // 5. Enrich points with readable IST timestamps
    const history = filteredHistory.map((item) => {
      const locTs = extractPointTimestamp(item);
      const repTs = item.reportedTime
        ? (typeof item.reportedTime === 'number'
            ? (item.reportedTime < 1e11 ? item.reportedTime * 1000 : item.reportedTime)
            : Number(item.reportedTime))
        : null;

      return {
        ...item,
        locationTime: locTs || item.locationTime,
        locationTimeIST: locTs ? formatISTDate(locTs) : null,
        reportedTime: repTs || item.reportedTime,
        reportedTimeIST: repTs ? formatISTDate(repTs) : null,
      };
    });

    // 6. Clean, readable response
    const responsePayload = {
      success: true,
      sn,
      total: history.length,
      timeRange: {
        timezone: 'Asia/Kolkata (IST, UTC+05:30)',
        startLocationTime: startLocationTimeStr,
        endLocationTime: endLocationTimeStr,
      },
      history,
    };

    // 7. Cache result: Past dates 1 hour; Today/Active 30 seconds
    const isPastDateRange = parsedEnd < (now - 3600000);
    const ttlSeconds = isPastDateRange ? 3600 : 30;
    historyCache.set(cacheKey, responsePayload, ttlSeconds);

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error('[GeoTag getDeviceHistory Error]:', error.message);
    return res.status(error.code && typeof error.code === 'number' ? error.code : 500).json({
      success: false,
      message: error.message,
      code: error.code || 500,
    });
  }
}
