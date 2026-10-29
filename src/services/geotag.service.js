import https from 'https';
import axios from 'axios';
import { config } from '../config/geotag.config.js';
import { encryptAndSignPayload, decryptResponseData } from '../utils/geotag.crypto.js';

// HTTP Keep-Alive agent to reuse TCP/TLS connections to api.geotag.top
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  keepAliveMsecs: 60000,
});

const apiClient = axios.create({
  httpsAgent,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export class GeoTagService {
  constructor(customConfig = {}) {
    this.config = { ...config, ...customConfig };
  }

  /**
   * Internal helper to make an encrypted request to GeoTag
   */
  async _request(endpointPath, payload = {}) {
    const url = `${this.config.baseUrl}${endpointPath}`;

    const encryptedBody = encryptAndSignPayload(payload, {
      businessNo: this.config.businessNo,
      platformPublicKey: this.config.platformPublicKey,
      merchantPrivateKey: this.config.merchantPrivateKey,
    });

    const response = await apiClient.post(url, encryptedBody);

    const { code, msg, data } = response.data || {};

    if (code !== 200) {
      const error = new Error(`GeoTag API error [${code}]: ${msg}`);
      error.code = code;
      error.rawResponse = response.data;
      throw error;
    }

    if (!data) {
      return null;
    }

    return decryptResponseData(data, this.config.merchantPrivateKey);
  }

  /**
   * Fetch device list
   * @param {Object} options { page, pageSize, status }
   */
  async getDeviceList({ page = 1, pageSize = 10, status = 1 } = {}) {
    return this._request('/device/getList', { page, pageSize, status });
  }

  /**
   * Fetch device detail by UUID
   * @param {string} uuid Device UUID
   */
  async getDeviceDetail(uuid) {
    if (!uuid) throw new Error('uuid is required');
    return this._request('/device/getDetail', { uuid });
  }

  /**
   * Fetch location history for a device.
   * Optimized with parallel multi-page retrieval and HTTP keep-alive.
   * 
   * @param {string} sn Device Serial Number (e.g., GeoTag-57559208)
   * @param {Object} options { beginTime, endTime, startLocationTime, endLocationTime, page, pageSize, fetchAll }
   */
  async getDeviceHistory(sn, { beginTime, endTime, startLocationTime, endLocationTime, page, pageSize, fetchAll = true } = {}) {
    if (!sn) throw new Error('sn is required');

    const now = Date.now();
    const bTime = beginTime || now - (7 * 24 * 60 * 60 * 1000);
    const eTime = endTime || now;

    const pad = (n) => String(n).padStart(2, '0');
    const toDateStr = (ts) => {
      const d = new Date(ts);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const sTimeStr = startLocationTime || toDateStr(bTime);
    const eTimeStr = endLocationTime || toDateStr(eTime);

    // If caller specifically requested a single page without auto-fetching all
    if (!fetchAll || page) {
      const payload = {
        sn,
        page: page || 1,
        pageSize: pageSize || 100,
        beginTime: bTime,
        endTime: eTime,
        startLocationTime: sTimeStr,
        endLocationTime: eTimeStr,
      };
      return this._request('/device/getHistory', payload);
    }

    const batchSize = 100; // GeoTag's maximum pageSize

    // 1. Fetch Page 1 first
    const firstRes = await this._request('/device/getHistory', {
      sn,
      page: 1,
      pageSize: batchSize,
      beginTime: bTime,
      endTime: eTime,
      startLocationTime: sTimeStr,
      endLocationTime: eTimeStr,
    });

    if (!firstRes || !firstRes.list || !Array.isArray(firstRes.list) || firstRes.list.length === 0) {
      return { total: 0, list: [] };
    }

    const allList = [...firstRes.list];
    const totalRecords = typeof firstRes.total === 'number' ? firstRes.total : firstRes.list.length;
    const totalPages = Math.ceil(totalRecords / batchSize);

    // Check if the oldest point in Page 1 is already older than beginTime
    const oldestPoint = firstRes.list[firstRes.list.length - 1];
    const oldestTime = oldestPoint?.locationTime || oldestPoint?.reportedTime;

    // If there are more pages and Page 1 hasn't already covered past beginTime,
    // fetch all remaining pages in parallel!
    if (totalPages > 1 && (!oldestTime || !bTime || oldestTime >= bTime)) {
      const pagePromises = [];
      for (let p = 2; p <= totalPages; p++) {
        pagePromises.push(
          this._request('/device/getHistory', {
            sn,
            page: p,
            pageSize: batchSize,
            beginTime: bTime,
            endTime: eTime,
            startLocationTime: sTimeStr,
            endLocationTime: eTimeStr,
          })
        );
      }

      const results = await Promise.all(pagePromises);
      for (const res of results) {
        if (res?.list && Array.isArray(res.list)) {
          allList.push(...res.list);
        }
      }
    }

    return {
      total: allList.length,
      list: allList,
    };
  }

  /**
   * Fetch failed webhook records (up to 7 days)
   * @param {Object} options { page, pageSize, beginTime, endTime, sn }
   */
  async getWebHookFail({ page = 1, pageSize = 20, beginTime, endTime, sn } = {}) {
    const payload = { page, pageSize };
    if (beginTime) payload.beginTime = beginTime;
    if (endTime) payload.endTime = endTime;
    if (sn) payload.sn = sn;
    return this._request('/device/getWebHookFail', payload);
  }
}

// Export default singleton instance
export const geotagService = new GeoTagService();
