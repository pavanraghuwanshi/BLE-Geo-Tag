import mongoose from 'mongoose';
import { BLEDevice } from '../Models/bleDevice.model.js';
import { geotagService } from '../services/geotag.service.js';
import { dbConnections } from '../Database/db.js';
import { parseToISTTimestamp, formatISTDate, extractPointTimestamp } from '../utils/time.helper.js';

const ObjectId = mongoose.Types.ObjectId;

/**
 * Helper to extract user identity from either req.user (JWT auth) 
 * or fallback headers/query params (for dev/Postman testing).
 */
function getUserContext(req) {
  if (req.user && req.user.role) {
    return {
      role: req.user.role,
      id: req.user.id || req.user._id,
      AssignedBranch: req.user.AssignedBranch || [],
    };
  }

  // Fallback for direct API testing
  return {
    role: req.headers['x-role'] || req.query.role || 'superAdmin',
    id: req.headers['x-user-id'] || req.query.userId || req.query.id,
    AssignedBranch: req.headers['x-assigned-branch']
      ? JSON.parse(req.headers['x-assigned-branch'])
      : (req.query.assignedBranch ? [req.query.assignedBranch] : []),
  };
}

/**
 * Safely resolves a native or Mongoose collection regardless of connection wrapper
 */
function getDbCollection(collectionName) {
  if (mongoose.connection && mongoose.connection.db) {
    return mongoose.connection.db.collection(collectionName);
  }
  if (mongoose.connection && typeof mongoose.connection.collection === 'function') {
    return mongoose.connection.collection(collectionName);
  }
  if (dbConnections.db2 && typeof dbConnections.db2.collection === 'function') {
    return dbConnections.db2.collection(collectionName);
  }
  const modelName = collectionName === 'children' ? 'Child' : (collectionName === 'schools' ? 'School' : (collectionName === 'branches' ? 'Branch' : null));
  if (modelName && mongoose.models && mongoose.models[modelName]) {
    return mongoose.models[modelName].collection;
  }
  throw new Error(`Database connection not ready for collection '${collectionName}'`);
}

/**
 * 1. Get BLE Devices (Hierarchy-wise Pipeline Matching Credence Pattern)
 * 
 * Supports:
 * - superAdmin: sees all devices
 * - school: devices for schoolId
 * - branchGroup: devices in AssignedBranch
 * - branch: devices for branchId
 * - supervisor: devices for supervisorId
 * - parent: devices assigned to their child(ren)
 */
export const getBLEDevices = async (req, res) => {
  const { role, id, AssignedBranch } = getUserContext(req);
  const {
    page = 1,
    limit = 20,
    search = "",
    deviceName = "",
    sortBy = "createdAt",
    sortOrder = "desc",
    branchId,
    schoolId,
    supervisorId,
    childId,
    isAssigned, // 'true' for assigned tags, 'false' for unassigned tags
  } = req.query;

  try {
    let match = {};

    // Role Hierarchy Filtering
    if (role === "superAdmin") {
      match = {};
    } else if (role === "school") {
      if (!id) return res.status(400).json({ message: "School ID required" });
      match.schoolId = new ObjectId(id);
    } else if (role === "branchGroup") {
      const branches = (AssignedBranch || []).map((b) => new ObjectId(b));
      match.branchId = { $in: branches };
    } else if (role === "branch") {
      if (!id) return res.status(400).json({ message: "Branch ID required" });
      match.branchId = new ObjectId(id);
    } else if (role === "supervisor") {
      if (!id) return res.status(400).json({ message: "Supervisor ID required" });
      match.supervisorId = new ObjectId(id);
    } else if (role === "parent") {
      // Find all children belonging to this parent
      const children = await getDbCollection("children").find({ parentId: new ObjectId(id) }).toArray();
      const childIds = children.map((c) => c._id);
      match.childId = { $in: childIds };
    } else {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Additional query filters
    if (deviceName) match.name = { $regex: deviceName, $options: "i" };
    if (schoolId) match.schoolId = new ObjectId(schoolId);
    if (branchId) match.branchId = new ObjectId(branchId);
    if (supervisorId) match.supervisorId = new ObjectId(supervisorId);
    if (childId) match.childId = new ObjectId(childId);

    // Filter by assigned status (useful for SuperAdmin assigning unassigned tags)
    if (isAssigned === "true") {
      match.schoolId = { $ne: null };
    } else if (isAssigned === "false") {
      match.schoolId = null;
    }

    if (search) {
      match.$or = [
        { name: { $regex: search, $options: "i" } },
        { sn: { $regex: search, $options: "i" } },
        { mac: { $regex: search, $options: "i" } },
        { model: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { "lastLocation.address": { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const direction = sortOrder === "asc" ? 1 : -1;

    // Sorting fields mapping
    const sortFields = {
      name: "name",
      sn: "sn",
      mac: "mac",
      battery: "battery",
      model: "model",
      category: "category",
      status: "status",
      createdAt: "createdAt",
      lastUpdate: "lastUpdate",
      schoolName: "school.schoolName",
      branchName: "branch.branchName",
      childName: "child.childName",
    };

    const sortField = sortFields[sortBy] || "createdAt";

    // Aggregation pipeline matching Credence architecture
    const pipeline = [
      { $match: match },

      // School Lookup
      {
        $lookup: {
          from: "schools",
          localField: "schoolId",
          foreignField: "_id",
          as: "school",
        },
      },
      { $unwind: { path: "$school", preserveNullAndEmptyArrays: true } },

      // Branch Lookup
      {
        $lookup: {
          from: "branches",
          localField: "branchId",
          foreignField: "_id",
          as: "branch",
        },
      },
      { $unwind: { path: "$branch", preserveNullAndEmptyArrays: true } },

      // Supervisor Lookup
      {
        $lookup: {
          from: "supervisors",
          localField: "supervisorId",
          foreignField: "_id",
          as: "supervisor",
        },
      },
      { $unwind: { path: "$supervisor", preserveNullAndEmptyArrays: true } },

      // Child Lookup
      {
        $lookup: {
          from: "children",
          localField: "childId",
          foreignField: "_id",
          as: "child",
        },
      },
      { $unwind: { path: "$child", preserveNullAndEmptyArrays: true } },

      { $sort: { [sortField]: direction } },
      { $skip: skip },
      { $limit: Number(limit) },

      {
        $project: {
          _id: 1,
          name: 1,
          sn: 1,
          deviceId: 1,
          mac: 1,
          uuid: 1,
          model: 1,
          category: 1,
          status: 1,
          battery: 1,
          batteryStatus: 1,
          lastLocation: 1,
          lastUpdate: 1,
          subscriptionEndDate: 1,
          isActive: 1,
          createdAt: 1,

          schoolId: {
            _id: "$school._id",
            schoolName: "$school.schoolName",
            email: "$school.email",
          },

          branchId: {
            _id: "$branch._id",
            branchName: "$branch.branchName",
            mobileNo: "$branch.mobileNo",
          },

          supervisorId: {
            _id: "$supervisor._id",
            supervisorName: "$supervisor.supervisorName",
            mobileNo: "$supervisor.mobileNo",
          },

          childId: {
            _id: "$child._id",
            childName: "$child.childName",
            className: "$child.className",
            rollNumber: "$child.rollNumber",
            section: "$child.section",
          },
        },
      },
    ];

    const devices = await BLEDevice.aggregate(pipeline);
    const total = await BLEDevice.countDocuments(match);

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      limit: Number(limit),
      sortBy,
      sortOrder,
      devices,
    });
  } catch (err) {
    console.error("Error in getBLEDevices:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 2. Live Tracking API (Hierarchy-wise Realtime Coordinates)
 * 
 * Fetches real-time position from GeoTag Cloud, updates latest DB snapshot,
 * and returns ready-to-render location payload.
 */
export const getLiveTrack = async (req, res) => {
  const { role, id, AssignedBranch } = getUserContext(req);
  const { identifier } = req.params; // Accepts MongoDB _id OR serial number (sn)

  try {
    let query = {};
    if (ObjectId.isValid(identifier)) {
      query._id = new ObjectId(identifier);
    } else {
      query.sn = identifier;
    }

    // Use lean query for maximum speed (sub-millisecond plain object)
    const device = await BLEDevice.findOne(query).lean();
    if (!device) {
      return res.status(404).json({ success: false, message: "BLE Device not found" });
    }

    // Role Hierarchy Authorization check
    if (role === "school" && String(device.schoolId) !== String(id)) {
      return res.status(403).json({ success: false, message: "Unauthorized for this device" });
    }
    if (role === "branch" && String(device.branchId) !== String(id)) {
      return res.status(403).json({ success: false, message: "Unauthorized for this device" });
    }
    if (role === "branchGroup" && !(AssignedBranch || []).map(String).includes(String(device.branchId))) {
      return res.status(403).json({ success: false, message: "Unauthorized for this device" });
    }
    if (role === "supervisor" && String(device.supervisorId) !== String(id)) {
      return res.status(403).json({ success: false, message: "Unauthorized for this device" });
    }

    let authChild = null;
    if (role === "parent") {
      authChild = await getDbCollection("children").findOne(
        { _id: device.childId, parentId: new ObjectId(id) },
        { projection: { childName: 1, className: 1, rollNumber: 1 } }
      );
      if (!authChild) {
        return res.status(403).json({ success: false, message: "Unauthorized for this child device" });
      }
    }

    // Fast sub-millisecond retrieval from MongoDB snapshot (kept live via webhooks)
    let livePoint = device.lastLocation || {};

    // ONLY fetch from GeoTag Cloud if location is missing in DB or if refresh=true explicitly requested
    const shouldRefreshCloud = (req.query.refresh === 'true' || req.query.sync === 'true' || !livePoint?.lat);
    if (shouldRefreshCloud) {
      try {
        const cloudHist = await geotagService.getDeviceHistory(device.sn, {
          fetchAll: false,
          page: 1,
          pageSize: 1,
        });
        if (cloudHist?.list && cloudHist.list.length > 0) {
          const latest = cloudHist.list[0];
          livePoint = {
            lat: latest.lat,
            lng: latest.lng,
            address: latest.address,
            reportedTime: latest.reportedTime ? new Date(latest.reportedTime) : new Date(),
            locationTime: latest.locationTime ? new Date(latest.locationTime) : new Date(),
            accuracy: latest.accuracy,
            confidence: latest.confidence,
          };

          // Asynchronously update DB cache in background without delaying user response
          BLEDevice.updateOne(
            { _id: device._id },
            {
              $set: {
                lastLocation: livePoint,
                ...(latest.battery !== undefined ? { battery: latest.battery } : {}),
                ...(latest.batteryStatus !== undefined ? { batteryStatus: latest.batteryStatus } : {}),
                lastUpdate: new Date(),
              },
            }
          ).catch((e) => console.error("Async livePoint update error:", e.message));
        }
      } catch (cloudErr) {
        // Fallback silently to DB cache
      }
    }

    // Fetch related metadata in parallel with Promise.all
    const [school, branch, child] = await Promise.all([
      device.schoolId
        ? getDbCollection("schools").findOne({ _id: device.schoolId }, { projection: { schoolName: 1 } })
        : null,
      device.branchId
        ? getDbCollection("branches").findOne({ _id: device.branchId }, { projection: { branchName: 1 } })
        : null,
      authChild
        ? authChild
        : (device.childId
            ? getDbCollection("children").findOne({ _id: device.childId }, { projection: { childName: 1, className: 1, rollNumber: 1 } })
            : null),
    ]);

    return res.status(200).json({
      success: true,
      deviceId: device._id,
      sn: device.sn,
      name: device.name,
      battery: device.battery,
      batteryStatus: device.batteryStatus,
      status: device.status,
      lastUpdate: device.lastUpdate,
      location: livePoint,
      school: school ? { _id: school._id, schoolName: school.schoolName } : null,
      branch: branch ? { _id: branch._id, branchName: branch.branchName } : null,
      child: child ? { _id: child._id, childName: child.childName, className: child.className } : null,
    });
  } catch (err) {
    console.error("Error in getLiveTrack:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 2b. Live Tracking for ALL Devices (Hierarchy-wise)
 * Returns live coordinates, battery, and address for all devices visible to the user.
 * Perfect for rendering multi-marker real-time fleet/tag maps on the dashboard.
 */
export const getLiveTrackAll = async (req, res) => {
  const { role, id, AssignedBranch } = getUserContext(req);
  const {
    page = 1,
    limit = 20,
    search = "",
    deviceName = "",
    schoolId,
    branchId,
    supervisorId,
    childId,
    status,
    batteryStatus,
    isAssigned,
    hasLocation,
    sortBy = "updatedAt",
    sortOrder = "desc",
    all = false,
    refresh = false,
  } = req.query;

  try {
    let match = { isActive: true };

    // Role Hierarchy Filtering
    if (role === "superAdmin") {
      match.isActive = true;
    } else if (role === "school") {
      if (!id) return res.status(400).json({ success: false, message: "School ID required" });
      match.schoolId = new ObjectId(id);
    } else if (role === "branchGroup") {
      const branches = (AssignedBranch || []).map((b) => new ObjectId(b));
      match.branchId = { $in: branches };
    } else if (role === "branch") {
      if (!id) return res.status(400).json({ success: false, message: "Branch ID required" });
      match.branchId = new ObjectId(id);
    } else if (role === "supervisor") {
      if (!id) return res.status(400).json({ success: false, message: "Supervisor ID required" });
      match.supervisorId = new ObjectId(id);
    } else if (role === "parent") {
      const children = await getDbCollection("children").find({ parentId: new ObjectId(id) }).toArray();
      const childIds = children.map((c) => c._id);
      match.childId = { $in: childIds };
    } else {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    // Filters
    if (deviceName) match.name = { $regex: deviceName, $options: "i" };
    if (schoolId) match.schoolId = new ObjectId(schoolId);
    if (branchId) match.branchId = new ObjectId(branchId);
    if (supervisorId) match.supervisorId = new ObjectId(supervisorId);
    if (childId) match.childId = new ObjectId(childId);
    if (status) match.status = status;
    if (batteryStatus) match.batteryStatus = batteryStatus;

    if (isAssigned === "true") {
      match.schoolId = { $ne: null };
    } else if (isAssigned === "false") {
      match.schoolId = null;
    }

    if (hasLocation === "true") {
      match["lastLocation.lat"] = { $ne: null };
      match["lastLocation.lng"] = { $ne: null };
    }

    if (search) {
      match.$or = [
        { name: { $regex: search, $options: "i" } },
        { sn: { $regex: search, $options: "i" } },
        { mac: { $regex: search, $options: "i" } },
        { model: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { "lastLocation.address": { $regex: search, $options: "i" } },
      ];
    }

    const direction = sortOrder === "asc" ? 1 : -1;
    const sortField = sortBy === "name" ? "name" : (sortBy === "battery" ? "battery" : "updatedAt");

    const total = await BLEDevice.countDocuments(match);

    let query = BLEDevice.find(match)
      .populate("schoolId", "schoolName")
      .populate("branchId", "branchName")
      .populate("childId", "childName className rollNumber")
      .sort({ [sortField]: direction });

    const isAll = all === "true" || Number(limit) === 0;
    if (!isAll) {
      const skip = (Number(page) - 1) * Number(limit);
      query = query.skip(skip).limit(Number(limit));
    }

    const devices = await query;

    // If refresh=true requested, fetch fresh telemetry from GeoTag cloud in parallel
    if (refresh === "true" || refresh === true) {
      await Promise.allSettled(
        devices.map(async (d) => {
          try {
            const cloudHist = await geotagService.getDeviceHistory(d.sn);
            if (cloudHist?.list && cloudHist.list.length > 0) {
              const latest = cloudHist.list[0];
              d.lastLocation = {
                lat: latest.lat,
                lng: latest.lng,
                address: latest.address,
                reportedTime: latest.reportedTime ? new Date(latest.reportedTime) : new Date(),
                locationTime: latest.locationTime ? new Date(latest.locationTime) : new Date(),
                accuracy: latest.accuracy,
                confidence: latest.confidence,
              };
              if (latest.battery !== undefined) d.battery = latest.battery;
              if (latest.batteryStatus !== undefined) d.batteryStatus = latest.batteryStatus;
              d.lastUpdate = new Date();
              await BLEDevice.updateOne(
                { _id: d._id },
                {
                  $set: {
                    lastLocation: d.lastLocation,
                    battery: d.battery,
                    batteryStatus: d.batteryStatus,
                    lastUpdate: d.lastUpdate,
                  },
                }
              );
            }
          } catch (err) {
            // keep existing cached point
          }
        })
      );
    }

    const liveMarkers = devices.map((d) => ({
      _id: d._id,
      sn: d.sn,
      deviceId: d.deviceId || null,
      name: d.name,
      battery: d.battery,
      batteryStatus: d.batteryStatus,
      status: d.status,
      lat: d.lastLocation?.lat || null,
      lng: d.lastLocation?.lng || null,
      address: d.lastLocation?.address || "",
      locationTime: d.lastLocation?.locationTime || null,
      accuracy: d.lastLocation?.accuracy || null,
      schoolId: d.schoolId?._id || null,
      schoolName: d.schoolId?.schoolName || null,
      branchId: d.branchId?._id || null,
      branchName: d.branchId?.branchName || null,
      childId: d.childId?._id || null,
      childName: d.childId?.childName || null,
      className: d.childId?.className || null,
      rollNumber: d.childId?.rollNumber || null,
    }));

    res.status(200).json({
      success: true,
      role,
      total,
      page: isAll ? 1 : Number(page),
      limit: isAll ? total : Number(limit),
      totalPages: isAll ? 1 : Math.ceil(total / Number(limit)),
      devices: liveMarkers,
    });
  } catch (err) {
    console.error("Error in getLiveTrackAll:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 2c. Location History for a specific device (Hierarchy-wise)
 * Fetches tracking breadcrumb points from GeoTag Cloud for a given device.
 * Parsed in Indian Standard Time (IST, UTC+05:30) and returns all points in the selected range.
 */
export const getDeviceHistoryHierarchy = async (req, res) => {
  const { role, id, AssignedBranch } = getUserContext(req);
  const { identifier } = req.params;
  const {
    date,
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

  try {
    let query = {};
    if (ObjectId.isValid(identifier)) {
      query._id = new ObjectId(identifier);
    } else {
      query.sn = identifier;
    }

    const device = await BLEDevice.findOne(query);
    if (!device) {
      return res.status(404).json({ success: false, message: "BLE Device not found" });
    }

    // Role Hierarchy Authorization check
    if (role === "school" && String(device.schoolId) !== String(id)) {
      return res.status(403).json({ success: false, message: "Unauthorized for this device" });
    }
    if (role === "branch" && String(device.branchId) !== String(id)) {
      return res.status(403).json({ success: false, message: "Unauthorized for this device" });
    }
    if (role === "branchGroup" && !(AssignedBranch || []).map(String).includes(String(device.branchId))) {
      return res.status(403).json({ success: false, message: "Unauthorized for this device" });
    }
    if (role === "supervisor" && String(device.supervisorId) !== String(id)) {
      return res.status(403).json({ success: false, message: "Unauthorized for this device" });
    }
    if (role === "parent") {
      const child = await getDbCollection("children").findOne({ _id: device.childId, parentId: new ObjectId(id) });
      if (!child) {
        return res.status(403).json({ success: false, message: "Unauthorized for this child device" });
      }
    }

    const now = Date.now();
    let parsedBegin;
    let parsedEnd;

    if (date) {
      parsedBegin = parseToISTTimestamp(date, false);
      parsedEnd = parseToISTTimestamp(date, true);
    } else {
      const rawStart = startLocationTime || beginTime || from || startDate;
      const rawEnd = endLocationTime || endTime || to || endDate;

      parsedBegin = parseToISTTimestamp(rawStart, false) || (now - (Number(days) * 24 * 60 * 60 * 1000));
      parsedEnd = parseToISTTimestamp(rawEnd, true) || now;
    }

    const startLocationTimeStr = formatISTDate(parsedBegin);
    const endLocationTimeStr = formatISTDate(parsedEnd);

    const cloudData = await geotagService.getDeviceHistory(device.sn, {
      beginTime: parsedBegin,
      endTime: parsedEnd,
      startLocationTime: startLocationTimeStr,
      endLocationTime: endLocationTimeStr,
      fetchAll: true,
    });

    const rawList = Array.isArray(cloudData)
      ? cloudData
      : (cloudData?.list || cloudData?.data || cloudData?.records || cloudData?.rows || []);

    // Filter points strictly between parsedBegin and parsedEnd
    const filteredHistory = rawList.filter((item) => {
      const pointTime = extractPointTimestamp(item);
      if (pointTime === null) return true;
      return pointTime >= parsedBegin && pointTime <= parsedEnd;
    });

    // Enrich with readable IST strings
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

    res.status(200).json({
      success: true,
      sn: device.sn,
      name: device.name,
      battery: device.battery,
      batteryStatus: device.batteryStatus,
      totalPoints: enrichedHistory.length,
      timeRange: {
        timezone: 'Asia/Kolkata (IST, UTC+05:30)',
        beginTime: parsedBegin,
        endTime: parsedEnd,
        startLocationTime: startLocationTimeStr,
        endLocationTime: endLocationTimeStr,
      },
      history: enrichedHistory,
      list: enrichedHistory,
      data: enrichedHistory,
    });
  } catch (err) {
    console.error("Error in getDeviceHistoryHierarchy:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 3. Parent API: Get My Child's Assigned BLE Tag & Live Position
 */
export const getParentBLEDevice = async (req, res) => {
  const { role, id } = getUserContext(req);

  try {
    if (role !== "parent" && role !== "superAdmin") {
      return res.status(403).json({ success: false, message: "Only parents can access this endpoint" });
    }

    const parentObjectId = new ObjectId(id);

    // Find children of this parent
    const children = await getDbCollection("children").find({ parentId: parentObjectId }).toArray();
    if (!children || children.length === 0) {
      return res.status(404).json({ success: false, message: "No children found for this parent" });
    }

    const childIds = children.map((c) => c._id);

    // Find BLE devices assigned to any of these children
    const devices = await BLEDevice.find({ childId: { $in: childIds }, isActive: true });

    // Fetch freshest live coordinates & battery from GeoTag cloud only if missing or refresh requested
    const shouldRefreshParent = (req.query.refresh === 'true' || req.query.sync === 'true');
    if (shouldRefreshParent || devices.some((d) => !d.lastLocation?.lat)) {
      await Promise.allSettled(
        devices.map(async (dev) => {
          if (!shouldRefreshParent && dev.lastLocation?.lat) return;
          try {
            const cloudHist = await geotagService.getDeviceHistory(dev.sn, {
              fetchAll: false,
              page: 1,
              pageSize: 1,
            });
            if (cloudHist?.list && cloudHist.list.length > 0) {
              const latest = cloudHist.list[0];
              dev.lastLocation = {
                lat: latest.lat,
                lng: latest.lng,
                address: latest.address,
                reportedTime: latest.reportedTime ? new Date(latest.reportedTime) : new Date(),
                locationTime: latest.locationTime ? new Date(latest.locationTime) : new Date(),
                accuracy: latest.accuracy,
                confidence: latest.confidence,
              };
              if (latest.battery !== undefined) dev.battery = latest.battery;
              if (latest.batteryStatus !== undefined) dev.batteryStatus = latest.batteryStatus;
              dev.lastUpdate = new Date();
              BLEDevice.updateOne(
                { _id: dev._id },
                {
                  $set: {
                    lastLocation: dev.lastLocation,
                    battery: dev.battery,
                    batteryStatus: dev.batteryStatus,
                    lastUpdate: dev.lastUpdate,
                  },
                }
              ).catch((e) => console.error("Async parent device update error:", e.message));
            }
          } catch (err) {
            // keep cached location
          }
        })
      );
    }

    const result = devices.map((dev) => {
      const matchedChild = children.find((c) => String(c._id) === String(dev.childId));
      return {
        _id: dev._id,
        name: dev.name,
        sn: dev.sn,
        battery: dev.battery,
        batteryStatus: dev.batteryStatus,
        lastLocation: dev.lastLocation,
        lastUpdate: dev.lastUpdate,
        child: matchedChild ? {
          _id: matchedChild._id,
          childName: matchedChild.childName,
          className: matchedChild.className,
          rollNumber: matchedChild.rollNumber,
        } : null,
      };
    });

    res.status(200).json({
      success: true,
      total: result.length,
      devices: result,
    });
  } catch (err) {
    console.error("Error in getParentBLEDevice:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 4. Assign / Update BLE Device Hierarchy
 * Allows SuperAdmin or School to assign device to a School, Branch, Supervisor, or Child
 */
export const assignBLEDevice = async (req, res) => {
  const { id } = req.params;
  const {
    name,
    model,
    category,
    schoolId,
    branchId,
    supervisorId,
    childId,
    subscriptionEndDate,
    status,
    isActive,
  } = req.body;

  try {
    const update = {};
    if (name !== undefined) update.name = name;
    if (model !== undefined) update.model = model;
    if (category !== undefined) update.category = category;
    if (schoolId !== undefined) update.schoolId = schoolId ? new ObjectId(schoolId) : null;
    if (branchId !== undefined) update.branchId = branchId ? new ObjectId(branchId) : null;
    if (supervisorId !== undefined) update.supervisorId = supervisorId ? new ObjectId(supervisorId) : null;
    if (childId !== undefined) update.childId = childId ? new ObjectId(childId) : null;
    if (subscriptionEndDate !== undefined) update.subscriptionEndDate = subscriptionEndDate ? new Date(subscriptionEndDate) : null;
    if (status !== undefined) update.status = status;
    if (isActive !== undefined) update.isActive = isActive;

    const device = await BLEDevice.findByIdAndUpdate(id, update, { returnDocument: 'after' });
    if (!device) {
      return res.status(404).json({ success: false, message: "BLE Device not found" });
    }

    res.status(200).json({
      success: true,
      message: "BLE Device assignment updated successfully",
      device,
    });
  } catch (err) {
    console.error("Error in assignBLEDevice:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 5. Sync Devices from GeoTag Cloud / Webhook into DB
 * Fetches all cloud devices if available, updates MongoDB, 
 * and returns all active devices (including those ingested via Webhook).
 */
export const syncFromGeoTagCloud = async (req, res) => {
  try {
    let cloudDevices = [];
    let cloudError = null;

    // 1. Try fetching from GeoTag Cloud
    try {
      const cloudResult = await geotagService.getDeviceList({ page: 1, pageSize: 50 });
      cloudDevices = Array.isArray(cloudResult)
        ? cloudResult
        : (cloudResult?.list || cloudResult?.data || cloudResult?.records || []);
    } catch (err) {
      console.warn("[Sync] GeoTag Cloud getDeviceList warning:", err.message);
      cloudError = err.message;
    }

    const summary = {
      totalFromCloud: cloudDevices.length,
      synced: 0,
      cloudApiStatus: cloudError ? `Unavailable (${cloudError})` : 'Connected',
    };

    // 2. If cloud returned devices, safely upsert them into MongoDB
    for (const d of cloudDevices) {
      const sn = d.sn || d.deviceSn || d.serialNumber;
      if (!sn) continue;

      try {
        const cloudStatus = d.status !== undefined
          ? (d.status === 1 || d.status === '1' || d.status === 'active' ? 'active' : String(d.status))
          : 'active';

        const deviceId = d.id !== undefined && d.id !== null
          ? String(d.id)
          : (d.deviceId ? String(d.deviceId) : '');

        const updateSet = {
          mac: d.mac || '',
          uuid: d.uuid || '',
          model: d.model || 'GeoTag',
          status: cloudStatus,
          lastUpdate: new Date(),
        };

        if (deviceId) {
          updateSet.deviceId = deviceId;
        }

        if (d.lat !== undefined && d.lng !== undefined && d.lat !== null && d.lng !== null) {
          updateSet.lastLocation = {
            lat: Number(d.lat),
            lng: Number(d.lng),
            address: d.address || '',
            reportedTime: d.reportedTime ? new Date(d.reportedTime) : new Date(),
            locationTime: d.locationTime ? new Date(d.locationTime) : new Date(),
            accuracy: d.accuracy !== undefined ? Number(d.accuracy) : null,
            confidence: d.confidence !== undefined ? Number(d.confidence) : null,
          };
        }

        if (d.battery !== undefined && d.battery !== null) {
          updateSet.battery = Number(d.battery);
        }
        if (d.batteryStatus) {
          updateSet.batteryStatus = String(d.batteryStatus);
        }

        await BLEDevice.findOneAndUpdate(
          { sn },
          {
            $set: updateSet,
            $setOnInsert: {
              name: d.name || sn,
              category: 'GeoTag',
              isActive: true,
              schoolId: null,
              branchId: null,
              supervisorId: null,
              childId: null,
            },
          },
          { upsert: true, new: true }
        );

        summary.synced += 1;
      } catch (err) {
        console.warn(`[Sync] Failed to upsert device ${sn}:`, err.message);
      }
    }

    // 3. Always query and return all active devices from MongoDB (ingested from Webhook or Cloud)
    const allDbDevices = await BLEDevice.find({ isActive: true })
      .populate('schoolId', 'schoolName')
      .populate('branchId', 'branchName')
      .populate('childId', 'childName className rollNumber')
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      message: cloudError
        ? `Loaded ${allDbDevices.length} devices from Webhook database (Cloud API: ${cloudError})`
        : `Successfully synced ${summary.synced} devices from GeoTag Cloud`,
      total: allDbDevices.length,
      summary,
      devices: allDbDevices,
    });
  } catch (err) {
    console.error("Error in syncFromGeoTagCloud:", err);
    try {
      const fallbackDevices = await BLEDevice.find({ isActive: true }).sort({ updatedAt: -1 });
      return res.status(200).json({
        success: true,
        message: "Retrieved devices from database fallback",
        total: fallbackDevices.length,
        devices: fallbackDevices,
      });
    } catch (dbErr) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
};

/**
 * 6. Delete BLE Device
 */
export const deleteBLEDevice = async (req, res) => {
  try {
    const { id } = req.params;
    await BLEDevice.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: "BLE Device deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
