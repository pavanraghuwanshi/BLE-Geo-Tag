import mongoose from 'mongoose';
import NodeCache from 'node-cache';
import { geotagService } from '../services/geotag.service.js';
import { BLEDevice } from '../Models/bleDevice.model.js';
import { parseToISTTimestamp, formatISTDate, extractPointTimestamp } from '../utils/time.helper.js';

// Cache for identifier -> sn resolution (TTL: 2 hours)
const snResolutionCache = new NodeCache({ stdTTL: 7200, checkperiod: 600 });

// In-memory cache for trajectory/history queries
// Past dates: long TTL (1 hour); Current date: short TTL (30 seconds)
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
 * GET /api/devices/:deviceId/history
 * Fetches location history from official GeoTag Open API (api.geotag.top)
 * using RSA asymmetric encryption + merchant credentials.
 * 
 * Supports exact Indian Standard Time (IST, UTC+05:30) date/time range,
 * and returns ALL historical points for the selected range without page-wise limits.
 * Optimized with in-memory caching and parallel pagination.
 */
export async function getDeviceHistory(req, res) {
  try {
    const identifier = req.params.deviceId || req.params.sn || req.params.identifier;

    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Device identifier is required' });
    }

    // 1. Fast Resolve Serial Number (sn) with in-memory cache
    let targetSn = snResolutionCache.get(identifier) || identifier;

    // If identifier is numeric (e.g. deviceId "28659") or ObjectId and not yet cached
    if (targetSn === identifier && (/^\d+$/.test(identifier) || mongoose.Types.ObjectId.isValid(identifier))) {
      const query = {
        $or: [
          { deviceId: identifier },
          { sn: identifier },
        ],
      };
      if (mongoose.Types.ObjectId.isValid(identifier)) {
        query.$or.push({ _id: new mongoose.Types.ObjectId(identifier) });
      }
      const device = await BLEDevice.findOne(query).select('sn deviceId').lean();
      if (device && device.sn) {
        targetSn = device.sn;
        snResolutionCache.set(identifier, targetSn);
      }
    }

    // 2. Parse date range according to Indian Standard Time (IST, UTC+05:30)
    const now = Date.now();
    let parsedBegin;
    let parsedEnd;

    if (req.query.date) {
      // Single date e.g. "2026-10-28": start from 00:00:00.000 IST to 23:59:59.999 IST
      parsedBegin = parseToISTTimestamp(req.query.date, false);
      parsedEnd = parseToISTTimestamp(req.query.date, true);
    } else {
      const rawStart = req.query.startLocationTime || req.query.beginTime || req.query.from || req.query.startDate;
      const rawEnd = req.query.endLocationTime || req.query.endTime || req.query.to || req.query.endDate;

      parsedBegin = parseToISTTimestamp(rawStart, false);
      parsedEnd = parseToISTTimestamp(rawEnd, true);

      if (!parsedBegin) {
        parsedBegin = now - (Number(req.query.days || 7) * 24 * 60 * 60 * 1000);
      }
      if (!parsedEnd) {
        parsedEnd = now;
      }
    }

    const startLocationTimeStr = formatISTDate(parsedBegin);
    const endLocationTimeStr = formatISTDate(parsedEnd);

    // 3. Check In-Memory Cache (Sub-millisecond response)
    const cacheKey = `${targetSn}:${parsedBegin}:${parsedEnd}`;
    const isRefreshRequested = req.query.refresh === 'true' || req.query.sync === 'true';

    if (!isRefreshRequested) {
      const cachedResponse = historyCache.get(cacheKey);
      if (cachedResponse) {
        return res.status(200).json(cachedResponse);
      }
    }

    // 4. Call GeoTag Open API via geotagService (authenticated with merchant RSA keys)
    // Multi-page traversal automatically fetches all points across pages in parallel
    const cloudData = await geotagService.getDeviceHistory(targetSn, {
      beginTime: parsedBegin,
      endTime: parsedEnd,
      startLocationTime: startLocationTimeStr,
      endLocationTime: endLocationTimeStr,
      fetchAll: true,
    });

    const rawList = Array.isArray(cloudData)
      ? cloudData
      : (cloudData?.list || cloudData?.data || cloudData?.records || cloudData?.rows || []);

    // 5. In-memory range filter to strictly guarantee points are within IST range
    const filteredHistory = rawList.filter((item) => {
      const pointTime = extractPointTimestamp(item);
      if (pointTime === null) return true;
      return pointTime >= parsedBegin && pointTime <= parsedEnd;
    });

    // 6. Enrich each point with readable IST timestamp strings
    const enrichedHistory = filteredHistory.map((item) => {
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

    // 7. Build Response Object
    const responsePayload = {
      success: true,
      sn: targetSn,
      identifier,
      total: enrichedHistory.length,
      timeRange: {
        timezone: 'Asia/Kolkata (IST, UTC+05:30)',
        beginTime: parsedBegin,
        endTime: parsedEnd,
        startLocationTime: startLocationTimeStr,
        endLocationTime: endLocationTimeStr,
      },
      history: enrichedHistory,
    };

    // 8. Cache result: Past dates cached for 1 hour; current/today cached for 30s
    const isPastDateRange = parsedEnd < (now - 3600000); // Ended more than 1 hour ago
    const ttlSeconds = isPastDateRange ? 3600 : 30;
    historyCache.set(cacheKey, responsePayload, ttlSeconds);

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error('[GeoTag getDeviceHistory Error]:', error.message);
    return res.status(error.code && typeof error.code === 'number' ? error.code : 500).json({
      success: false,
      message: error.message,
      code: error.code || 500,
      details: error.rawResponse || null,
    });
  }
}
