# 📡 BLE Device & Live Tracking API Documentation

This documentation covers the BLE GeoTag device integration APIs for the **Frontend & Mobile Application** teams.

---

## 🔐 Authentication & Roles

All BLE Device APIs are protected and require a standard Credence JWT token in the `Authorization` header:

```http
Authorization: Bearer <JWT_TOKEN>
```

The user's role (`superAdmin`, `school`, `branchGroup`, `branch`, `supervisor`, `parent`), user ID, and hierarchy permissions are automatically extracted and verified from the token.

---

## 🏢 Role Hierarchy Overview

| Role | Access Level |
| :--- | :--- |
| **`superAdmin`** | Sees **all** BLE devices across the entire system. Can assign any tag to any school, branch, or child. |
| **`school`** | Sees only BLE devices assigned to their `schoolId`. |
| **`branchGroup`**| Sees only BLE devices belonging to branches in their `AssignedBranch` array. |
| **`branch`** | Sees only BLE devices assigned to their `branchId`. |
| **`supervisor`** | Sees only BLE devices assigned to their `supervisorId`. |
| **`parent`** | Sees only the BLE device(s) assigned to their child(ren). |

---

## 📌 API Endpoints

### 1. Get BLE Devices (Hierarchy-Filtered with Search & Pagination)

Retrieves all devices accessible to the current user's role.

- **URL:** `GET /api/ble-devices`
- **Query Parameters:**

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `page` | `Number` | `1` | Page number |
| `limit` | `Number` | `20` | Items per page |
| `search` | `String` | `""` | Search by device name, SN, MAC, model, or address |
| `deviceName` | `String` | `""` | Filter by specific tag name |
| `schoolId` | `String` | `""` | Filter by School ID |
| `branchId` | `String` | `""` | Filter by Branch ID |
| `supervisorId` | `String` | `""` | Filter by Supervisor ID |
| `childId` | `String` | `""` | Filter by Child ID |
| `isAssigned` | `Boolean` | - | `true` for assigned devices, `false` for unassigned tags |
| `sortBy` | `String` | `"createdAt"` | Field to sort: `name`, `sn`, `battery`, `createdAt`, `schoolName` |
| `sortOrder` | `String` | `"desc"` | Sort direction: `asc` or `desc` |

#### Request Example:
```http
GET /api/ble-devices?page=1&limit=10&sortBy=createdAt&sortOrder=desc HTTP/1.1
Host: localhost:4000
x-role: superAdmin
```

#### Response Example (200 OK):
```json
{
  "success": true,
  "total": 21,
  "page": 1,
  "limit": 10,
  "sortBy": "createdAt",
  "sortOrder": "desc",
  "devices": [
    {
      "_id": "6ae076a6ad042369b9f4cf04",
      "name": "Aarav School Bag Tag",
      "uniqueId": "GeoTag-57559208",
      "sn": "GeoTag-57559208",
      "mac": "EB:A1:28:A0:F1:6F",
      "uuid": "63c105c678f71495eb42ad034c3b117e",
      "model": "GeoTag",
      "category": "BLE",
      "status": "active",
      "battery": 100,
      "batteryStatus": "OK",
      "lastLocation": {
        "lat": 21.1286332,
        "lng": 79.1037043,
        "address": "Chandan Nagar, Nagpur, Maharashtra, 440024, India",
        "reportedTime": "2026-10-27T09:11:42.000Z",
        "locationTime": "2026-10-27T09:11:42.000Z",
        "accuracy": 54,
        "confidence": 139
      },
      "lastUpdate": "2026-10-27T10:02:23.931Z",
      "subscriptionEndDate": "2027-10-27T00:00:00.000Z",
      "isActive": true,
      "createdAt": "2026-10-27T10:02:14.446Z",
      "schoolId": {
        "_id": "67160ad3f7c469273c524021",
        "schoolName": "Delhi Public School",
        "email": "contact@dpsnagpur.edu"
      },
      "branchId": {
        "_id": "67160b1bf7c469273c524029",
        "branchName": "Nagpur Main Branch",
        "mobileNo": "9876543210"
      },
      "supervisorId": {
        "_id": "67160c18f7c469273c524045",
        "supervisorName": "Ramesh Sharma",
        "mobileNo": "9123456789"
      },
      "childId": {
        "_id": "67160d5cf7c469273c524098",
        "childName": "Aarav Sharma",
        "className": "5th",
        "rollNumber": "A-12",
        "section": "A"
      }
    }
  ]
}
```

---

### 2. Live Tracking API (Real-Time Coordinates for Map View)

Fetches the live GPS/BLE location point of a device. It checks GeoTag cloud in real-time, caches the snapshot in MongoDB, and returns coordinate data ready for Google Maps / Leaflet.

- **URL:** `GET /api/ble-devices/live/:identifier`
- **URL Parameter:**
  - `:identifier` = MongoDB `_id` OR serial number (e.g. `GeoTag-57559208`).

#### Request Example:
```http
GET /api/ble-devices/live/GeoTag-57559208 HTTP/1.1
Host: localhost:4000
Authorization: Bearer <JWT_TOKEN>
```

#### Response Example (200 OK):
```json
{
  "success": true,
  "deviceId": "6ae076a6ad042369b9f4cf04",
  "sn": "GeoTag-57559208",
  "name": "Aarav School Bag Tag",
  "battery": 100,
  "batteryStatus": "OK",
  "status": "active",
  "lastUpdate": "2026-10-27T10:02:23.931Z",
  "location": {
    "lat": 21.1286332,
    "lng": 79.1037043,
    "address": "Chandan Nagar, Nagpur, Maharashtra, 440024, India",
    "reportedTime": "2026-10-27T09:11:42.000Z",
    "locationTime": "2026-10-27T09:11:42.000Z",
    "accuracy": 54,
    "confidence": 139
  },
  "school": {
    "_id": "67160ad3f7c469273c524021",
    "schoolName": "Delhi Public School"
  },
  "branch": {
    "_id": "67160b1bf7c469273c524029",
    "branchName": "Nagpur Main Branch"
  },
  "child": {
    "_id": "67160d5cf7c469273c524098",
    "childName": "Aarav Sharma",
    "className": "5th"
  }
}
```

---

### 2b. Live Tracking for ALL Devices (Multi-Marker Fleet Map)

Returns live coordinates, address, and battery for **all devices visible to the user's role**.
- **SuperAdmin**: Returns all 21+ devices across the entire system.
- **School**: Returns all devices belonging to their `schoolId`.
- **Branch**: Returns all devices belonging to their `branchId`.

- **URL:** `GET /api/ble-devices/live-all`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <TOKEN>`

#### Query Parameters:

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `page` | `Number` | `1` | Page number |
| `limit` | `Number` | `20` | Markers per page |
| `all` | `Boolean` | `false` | Pass `true` to return all map markers at once (unpaginated for map view) |
| `search` | `String` | `""` | Search by device name, SN, MAC, or address |
| `deviceName` | `String` | `""` | Filter by specific tag name |
| `schoolId` | `String` | `""` | Filter by School ID |
| `branchId` | `String` | `""` | Filter by Branch ID |
| `supervisorId` | `String` | `""` | Filter by Supervisor ID |
| `childId` | `String` | `""` | Filter by Child ID |
| `status` | `String` | `""` | Filter by status (`active`, `inactive`) |
| `batteryStatus` | `String` | `""` | Filter by battery status (`OK`, `LOW`) |
| `isAssigned` | `Boolean` | - | `true` for assigned devices, `false` for unassigned tags |
| `hasLocation` | `Boolean` | - | `true` to return only devices that have reported live GPS coordinates |
| `refresh` | `Boolean` | `false` | Pass `true` to force live parallel refresh of coordinates & battery directly from GeoTag Cloud |
| `sortBy` | `String` | `"updatedAt"`| Sort by: `updatedAt`, `name`, `battery` |
| `sortOrder` | `String` | `"desc"` | Sort direction: `asc` or `desc` |

#### Response Example (200 OK):
```json
{
  "success": true,
  "role": "superAdmin",
  "total": 21,
  "devices": [
    {
      "_id": "6ae076a6ad042369b9f4cf04",
      "sn": "GeoTag-57559208",
      "name": "Aarav School Bag Tag",
      "battery": 100,
      "batteryStatus": "OK",
      "status": "active",
      "lat": 21.128633,
      "lng": 79.1037042,
      "address": "Chandan Nagar, Nagpur, Maharashtra, 440024, India",
      "locationTime": "2026-10-27T10:20:22.000Z",
      "accuracy": 71,
      "schoolName": "Delhi Public School",
      "branchName": "Nagpur Main Branch",
      "childName": "Aarav Sharma",
      "className": "5th"
    }
  ]
}
```

---

### 2c. Device Location History (Trajectory) — Hierarchy-Wise

Fetches historical breadcrumb/trajectory points for a device. Hierarchy-authorized (e.g., a School or Parent can only view history for devices assigned to them).

> **How it works:** Validates user role authorization against device assignments (School/Branch/Supervisor/Parent), resolves the device `sn`, and fetches historical points directly from GeoTag Open API authenticated with your merchant RSA keys.

- **URL:** `GET /api/ble-devices/:identifier/history`
- **URL Parameter:** `:identifier` = MongoDB `_id` OR serial number (e.g. `GeoTag-57559208`)
- **Query Parameters:**

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `beginTime` | `Number` | 7 days ago | Millisecond timestamp (e.g. `1793125800000`) |
| `endTime` | `Number` | now | Millisecond timestamp (e.g. `1793212199999`) |
| `from` | `String` | - | ISO date string (e.g. `2026-10-27T18:30:00.000Z`) |
| `to` | `String` | - | ISO date string (e.g. `2026-10-28T18:29:59.999Z`) |
| `days` | `Number` | `7` | Fallback: number of past days if no time range provided |

#### Request Example:
```http
GET /api/ble-devices/GeoTag-57559208/history?beginTime=1793125800000&endTime=1793212199999 HTTP/1.1
Host: localhost:4000
Authorization: Bearer <JWT_TOKEN>
```

#### Response Example (200 OK):
```json
{
  "success": true,
  "sn": "GeoTag-57559208",
  "name": "Aarav School Bag Tag",
  "battery": 100,
  "batteryStatus": "OK",
  "totalPoints": 48,
  "history": [
    {
      "sn": "GeoTag-57559208",
      "address": "Chandan Nagar, Nagpur, Maharashtra, 440024, India",
      "lat": 21.128633,
      "lng": 79.1037042,
      "battery": 100,
      "reportedTime": 1793098222000,
      "locationTime": 1793098222000,
      "accuracy": 71,
      "confidence": 139,
      "batteryStatus": "OK"
    }
  ]
}
```

---

### 2d. Device Location History (GeoTag Open API)

Fetches location history directly from the official **GeoTag Open API (`api.geotag.top`)** using RSA asymmetric digital signature & encryption (`merchant_private.pem` + `platformPublicKey`). 

> **Key Features:**
> - **IST (Indian Standard Time, UTC+05:30) Native:** All dates/times (`date`, `startLocationTime`, `endLocationTime`) sent from frontend are parsed and formatted in **IST**.
> - **All Data in Range Returned:** Automatically retrieves all records across all pages from GeoTag for the selected time window (no pagination truncation).
> - **No Web Portal Token Required:** It authenticates server-to-server using merchant credentials, so it never expires and never fails with 401.

- **URL:** `GET /api/devices/:sn/history`
- **URL Parameter:** `:sn` = Device serial number (e.g. `GeoTag-57559208`)
- **Query Parameters:**

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `date` | `String` | - | Specific single date in IST (e.g. `2026-10-28`). Automatically filters 00:00:00 to 23:59:59 IST |
| `startLocationTime` | `String` | 7 days ago | Range start in IST: `YYYY-MM-DD HH:mm:ss` (URL-encoded) |
| `endLocationTime` | `String` | now | Range end in IST: `YYYY-MM-DD HH:mm:ss` (URL-encoded) |
| `refresh` | `Boolean` | `false` | Pass `true` to force bypass in-memory cache and fetch fresh from cloud |

#### Request Examples:

**By specific single date (IST):**
```http
GET /api/devices/GeoTag-57559208/history?date=2026-10-28 HTTP/1.1
Host: localhost:4000
Authorization: Bearer <JWT_TOKEN>
```

**By date-time range (IST):**
```http
GET /api/devices/GeoTag-57559208/history?startLocationTime=2026-10-27%2000%3A00%3A00&endLocationTime=2026-10-29%2023%3A59%3A59 HTTP/1.1
Host: localhost:4000
Authorization: Bearer <JWT_TOKEN>
```

#### Response (200 OK):
```json
{
  "success": true,
  "sn": "GeoTag-57559208",
  "total": 222,
  "timeRange": {
    "timezone": "Asia/Kolkata (IST, UTC+05:30)",
    "startLocationTime": "2026-10-27 00:00:00",
    "endLocationTime": "2026-10-29 23:59:59"
  },
  "history": [
    {
      "sn": "GeoTag-57559208",
      "lat": 21.1285607,
      "lng": 79.1037312,
      "address": "Block no 07 , Vidarbha premier building, Krida Square Rd, Near Medical Chowk, Hanuman Nagar, Nagpur, Maharashtra",
      "locationTime": 1793255803000,
      "locationTimeIST": "2026-10-29 12:06:43",
      "reportedTime": 1793255941000,
      "reportedTimeIST": "2026-10-29 12:09:01",
      "battery": 100,
      "batteryStatus": "OK",
      "accuracy": 98,
      "confidence": 139
    }
  ]
}
```

---

### 3. Parent API: Get My Child's BLE Tag & Location

Convenience endpoint designed specifically for the Parent mobile app / web portal. It identifies the parent from `req.user.id`, looks up their children, and returns the assigned BLE tag with location data.

- **URL:** `GET /api/ble-devices/parent/my-device`

#### Request Example:
```http
GET /api/ble-devices/parent/my-device HTTP/1.1
Host: localhost:4000
Authorization: Bearer <PARENT_JWT_TOKEN>
```

#### Response Example (200 OK):
```json
{
  "success": true,
  "total": 1,
  "devices": [
    {
      "_id": "6ae076a6ad042369b9f4cf04",
      "name": "Aarav School Bag Tag",
      "sn": "GeoTag-57559208",
      "battery": 100,
      "batteryStatus": "OK",
      "lastLocation": {
        "lat": 21.1286332,
        "lng": 79.1037043,
        "address": "Chandan Nagar, Nagpur, Maharashtra, 440024, India",
        "locationTime": "2026-10-27T09:11:42.000Z",
        "accuracy": 54
      },
      "lastUpdate": "2026-10-27T10:02:23.931Z",
      "child": {
        "_id": "67160d5cf7c469273c524098",
        "childName": "Aarav Sharma",
        "className": "5th",
        "rollNumber": "A-12"
      }
    }
  ]
}
```

---

### 4. Assign / Update BLE Device Hierarchy

Allows SuperAdmin (or School Admin) to assign a device to a School, Branch, Supervisor, or Child. To unassign a field, pass `null`.

- **URL:** `PUT /api/ble-devices/:id/assign`
- **Request Body (JSON):**

```json
{
  "name": "Rohan's Bag Tag",
  "schoolId": "67160ad3f7c469273c524021",
  "branchId": "67160b1bf7c469273c524029",
  "supervisorId": "67160c18f7c469273c524045",
  "childId": "67160d5cf7c469273c524098",
  "subscriptionEndDate": "2027-10-27T00:00:00.000Z",
  "status": "active"
}
```

#### Response Example (200 OK):
```json
{
  "success": true,
  "message": "BLE Device assignment updated successfully",
  "device": {
    "_id": "6ae076a6ad042369b9f4cf04",
    "name": "Rohan's Bag Tag",
    "sn": "GeoTag-57559208",
    "schoolId": "67160ad3f7c469273c524021",
    "branchId": "67160b1bf7c469273c524029",
    "childId": "67160d5cf7c469273c524098",
    "status": "active",
    "updatedAt": "2026-10-27T10:05:00.000Z"
  }
}
```

---

### 5. Sync from GeoTag Cloud

Pulls all devices registered in your GeoTag Cloud account and adds new ones to your MongoDB collection. **Existing assignments (school, branch, child) are preserved and never overwritten.** Also stores `deviceId` (numeric GeoTag ID) for each device, which enables the trajectory proxy API.

- **URL:** `GET /api/ble-devices/sync` *(no token needed)*
- **URL:** `POST /api/ble-devices/sync` *(requires JWT)*

#### Response Example (200 OK):
```json
{
  "success": true,
  "message": "Successfully synced 21 devices from GeoTag Cloud",
  "total": 21,
  "summary": {
    "totalFromCloud": 21,
    "synced": 21,
    "cloudApiStatus": "Connected"
  },
  "devices": [
    {
      "_id": "6ae076a6ad042369b9f4cf04",
      "sn": "GeoTag-57559208",
      "deviceId": "28659",
      "name": "Aarav School Bag Tag",
      "battery": 100,
      "status": "active"
    }
  ]
}
```

> **Fallback:** If GeoTag Cloud is unreachable, returns all devices already stored in MongoDB from previous syncs and webhook pings.

---

### 6. Delete Device

Removes a BLE Device from MongoDB.

- **URL:** `DELETE /api/ble-devices/:id`

#### Response Example (200 OK):
```json
{
  "success": true,
  "message": "BLE Device deleted successfully"
}
```

---

### 7. Direct GeoTag Cloud Endpoints (SuperAdmin Only)

Direct pass-through endpoints to inspect raw GeoTag cloud responses.

- `GET /api/devices?page=1&pageSize=10` — Raw device list from GeoTag Cloud
- `GET /api/devices/:uuid` — Raw device detail from GeoTag Cloud
- `GET /api/devices/:deviceId/history` — Device trajectory / history (see section 2d above)

*Requires: `Authorization: Bearer <TOKEN>`*

> **Env Variable:** Uses `GEOTAG_BASE_URL=https://api.geotag.top` with merchant RSA private key signature and AES encryption.

---

### 8. GeoTag Cloud Webhook (Real-Time Push)

GeoTag Cloud officially supports real-time webhooks. When enabled, **GeoTag immediately pushes data to your server the moment a tag reports a new location or battery level**, eliminating the need for constant background polling.

- **Webhook URL:** `POST /api/geotag/webhook`
- **Authentication:** Public (No JWT header needed; securely authenticated via GeoTag RSA asymmetric key decryption).
- **Setup in GeoTag Portal:**
  1. Open your GeoTag Enterprise Dashboard.
  2. Navigate to **API Settings / Webhook Configuration**.
  3. Enter your server's Webhook URL:
     ```
     https://api.yourdomain.com/api/geotag/webhook
     ```
  4. Save the configuration.

#### What happens on incoming Webhook:
* Automatically decrypts payload using your `merchant_private.pem`.
* Updates `lastLocation` (lat, lng, address, timestamps, accuracy) and `battery` / `batteryStatus` in MongoDB.
* **Stores/updates `deviceId`** — the numeric GeoTag ID (from the `id` field in the payload) is always saved and kept current so the trajectory API works correctly.
* **100% Preserves your custom `category`** (`"ID Card"`, `"Bag"`), custom `name`, and school/branch/child hierarchy assignments.
* Returns `{ "code": 200, "msg": "success" }` to GeoTag Cloud.

---

## 🗺️ Frontend Map Integration Guide

To render a live tracking marker on **Google Maps** or **Leaflet / OpenStreetMap**:

```javascript
// Example React / Vue fetch
async function loadLiveMarker(deviceId) {
  const response = await fetch(`/api/ble-devices/live/${deviceId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json();

  if (data.success && data.location.lat && data.location.lng) {
    const position = { lat: data.location.lat, lng: data.location.lng };

    // Update map marker
    marker.setPosition(position);
    map.panTo(position);

    // Update battery indicator & address in UI
    document.getElementById('battery').textContent = `${data.battery}% (${data.batteryStatus})`;
    document.getElementById('address').textContent = data.location.address;
    document.getElementById('time').textContent = new Date(data.location.locationTime).toLocaleTimeString();
  }
}
```
