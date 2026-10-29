import axios from 'axios';
import { config } from '../config/geotag.config.js';
import { encryptAndSignPayload, decryptResponseData } from '../utils/geotag.crypto.js';

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

    const response = await axios.post(url, encryptedBody, {
      headers: { 'Content-Type': 'application/json' },
    });

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
   * GeoTag API paginates descending by time (pageSize max 100).
   * This method automatically traverses pages until all points up to beginTime are fetched,
   * or returns a specific page if requested.
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

    // Auto-fetch all pages covering the time window
    const allList = [];
    let currentPage = 1;
    const batchSize = 100; // GeoTag's maximum pageSize
    let totalRecords = Infinity;

    while ((currentPage - 1) * batchSize < totalRecords) {
      const res = await this._request('/device/getHistory', {
        sn,
        page: currentPage,
        pageSize: batchSize,
        beginTime: bTime,
        endTime: eTime,
        startLocationTime: sTimeStr,
        endLocationTime: eTimeStr,
      });

      if (!res || !res.list || !Array.isArray(res.list) || res.list.length === 0) break;

      totalRecords = typeof res.total === 'number' ? res.total : 0;
      allList.push(...res.list);

      // Since GeoTag returns points descending by locationTime, check the oldest point in this batch
      const oldestPoint = res.list[res.list.length - 1];
      const oldestTime = oldestPoint?.locationTime || oldestPoint?.reportedTime;
      if (oldestTime && bTime && oldestTime < bTime) {
        // We have covered past the requested beginTime, no need to query older pages
        break;
      }

      if (res.list.length < batchSize) break;
      currentPage++;
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
