export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +05:30 in milliseconds

/**
 * Parses user input date/time to exact UTC millisecond timestamp according to IST (Asia/Kolkata).
 * Handles:
 * - Numeric epoch ms (e.g. 1793048400000 or 10-digit seconds)
 * - Date only (e.g. "2026-10-28") -> 00:00:00.000 IST (start) or 23:59:59.999 IST (end)
 * - Date and time (e.g. "2026-10-28 14:30:00" or "2026-10-28T14:30:00") -> parses as IST (+05:30)
 * - ISO string with explicit timezone (e.g. "2026-10-28T14:30:00+05:30" or "Z")
 * 
 * @param {string|number} val User input
 * @param {boolean} isEndOfDay If true and only date or incomplete time is provided, defaults to end of day (23:59:59.999)
 * @returns {number|null} Unix epoch millisecond timestamp or null
 */
export function parseToISTTimestamp(val, isEndOfDay = false) {
  if (val === undefined || val === null || val === '') return null;

  if (typeof val === 'number') {
    return val < 1e11 ? val * 1000 : val;
  }

  const str = decodeURIComponent(String(val)).trim();
  if (!str) return null;

  // 1. Numeric timestamp in string (10 to 13 digits)
  if (/^\d{10,13}$/.test(str)) {
    const num = Number(str);
    return num < 1e11 ? num * 1000 : num;
  }

  // 2. Date only: YYYY-MM-DD
  const dateOnlyMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dateOnlyMatch) {
    const [, y, m, d] = dateOnlyMatch;
    const timePart = isEndOfDay ? '23:59:59.999' : '00:00:00.000';
    return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${timePart}+05:30`).getTime();
  }

  // 3. Date with time without timezone: YYYY-MM-DD HH:mm:ss or YYYY-MM-DDTHH:mm:ss
  const dateTimeMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d{1,3}))?$/);
  if (dateTimeMatch) {
    const [, y, m, d, hh, mm, ss = (isEndOfDay ? '59' : '00'), ms = (isEndOfDay ? '999' : '000')] = dateTimeMatch;
    return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:${ss.padStart(2, '0')}.${ms.padEnd(3, '0')}+05:30`).getTime();
  }

  // 4. Strings with explicit timezone (e.g. ISO 8601 with Z or +05:30)
  const parsed = new Date(str).getTime();
  return isNaN(parsed) ? null : parsed;
}

/**
 * Formats epoch millisecond timestamp to "YYYY-MM-DD HH:mm:ss" in Indian Standard Time (IST, UTC+05:30)
 * Deterministic and independent of server OS timezone.
 * 
 * @param {number|string} ts Unix epoch timestamp
 * @returns {string} Formatted IST date string
 */
export function formatISTDate(ts) {
  if (!ts) return '';
  const num = typeof ts === 'number' ? ts : Number(ts);
  if (isNaN(num)) return '';
  const d = new Date(num + IST_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * Extracts point timestamp from raw GeoTag point object
 * 
 * @param {Object} point 
 * @returns {number|null} Unix epoch millisecond timestamp
 */
export function extractPointTimestamp(point) {
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

