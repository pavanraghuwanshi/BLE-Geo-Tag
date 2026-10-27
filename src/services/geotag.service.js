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
   * Fetch location history for a device
   * @param {string} sn Device Serial Number (e.g., GeoTag-57559208)
   * @param {Object} options { beginTime, endTime } (timestamps in ms)
   */
  async getDeviceHistory(sn, { beginTime, endTime } = {}) {
    if (!sn) throw new Error('sn is required');

    const now = Date.now();
    const payload = {
      sn,
      beginTime: beginTime || now - (7 * 24 * 60 * 60 * 1000), // Default: last 7 days
      endTime: endTime || now,
    };

    return this._request('/device/getHistory', payload);
  }
}

// Export default singleton instance
export const geotagService = new GeoTagService();
