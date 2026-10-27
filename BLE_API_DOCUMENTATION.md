# 📡 BLE Device & Live Tracking API Documentation

This documentation covers the BLE GeoTag device integration APIs for the **Frontend & Mobile Application** teams.

---

## 🔐 Authentication & Roles

These APIs integrate with Credence's existing JWT Auth middleware (`req.user`).  
For local development or Postman testing, you can also pass headers or query params:

### Header Parameters:
| Header | Description | Default |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <JWT_TOKEN>` | Required in Production |
| `x-role` | User role (`superAdmin`, `school`, `branchGroup`, `branch`, `supervisor`, `parent`) | `superAdmin` |
| `x-user-id` | MongoDB `_id` of the logged-in entity (school, branch, parent, etc.) | Optional |
| `x-assigned-branch` | JSON array of branch IDs for `branchGroup` role (e.g., `["64f..."]`) | Optional |

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
x-role: superAdmin
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

### 2c. Device Location History (Hierarchy-Wise)

Fetches historical breadcrumb points for a device. Hierarchy-authorized (e.g., a School or Parent can only view history for devices assigned to them).

- **URL:** `GET /api/ble-devices/:identifier/history`
- **URL Parameter:** `:identifier` = MongoDB `_id` OR serial number (e.g. `GeoTag-57559208`).
- **Query Parameters:**
  - `days`: Number of past days to retrieve (default: `7`)
  - `beginTime`: Millisecond timestamp
  - `endTime`: Millisecond timestamp

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

### 3. Parent API: Get My Child's BLE Tag & Location

Convenience endpoint designed specifically for the Parent mobile app / web portal. It identifies the parent from `req.user.id`, looks up their children, and returns the assigned BLE tag with location data.

- **URL:** `GET /api/ble-devices/parent/my-device`

#### Request Example:
```http
GET /api/ble-devices/parent/my-device HTTP/1.1
Host: localhost:4000
x-role: parent
x-user-id: 67161021f7c469273c524110
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

Pulls all devices registered in your GeoTag Cloud account and adds new ones to your MongoDB collection. **Existing assignments (school, branch, child) are preserved and never overwritten.**

- **URL:** `POST /api/ble-devices/sync`

#### Response Example (200 OK):
```json
{
  "success": true,
  "message": "Sync completed successfully",
  "summary": {
    "totalFromCloud": 21,
    "synced": 21,
    "errors": []
  }
}
```

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

- `GET /api/devices?page=1&pageSize=10` - Raw device list from cloud
- `GET /api/devices/:uuid` - Raw device detail from cloud
- `GET /api/devices/:sn/history` - Raw location history array from cloud

*Requires: `Authorization: Bearer <TOKEN>` with `superAdmin` role.*

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
