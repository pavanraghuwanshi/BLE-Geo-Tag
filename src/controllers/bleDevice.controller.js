import mongoose from 'mongoose';
import { BLEDevice } from '../Models/bleDevice.model.js';
import { geotagService } from '../services/geotag.service.js';
import { dbConnections } from '../Database/db.js';

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
      const db = dbConnections.db2 || mongoose.connection;
      const children = await db.collection("children").find({ parentId: new ObjectId(id) }).toArray();
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
      const db = dbConnections.db2 || mongoose.connection;
      const child = await db.collection("children").findOne({ _id: device.childId, parentId: new ObjectId(id) });
      if (!child) {
        return res.status(403).json({ success: false, message: "Unauthorized for this child device" });
      }
    }

    // Attempt to pull freshest real-time coordinates from GeoTag Cloud
    let livePoint = device.lastLocation || {};
    try {
      const cloudHist = await geotagService.getDeviceHistory(device.sn);
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

        // Update DB snapshot
        device.lastLocation = livePoint;
        if (latest.battery !== undefined) device.battery = latest.battery;
        if (latest.batteryStatus !== undefined) device.batteryStatus = latest.batteryStatus;
        device.lastUpdate = new Date();
        await device.save();
      }
    } catch (cloudErr) {
      // Fallback silently to DB cache
    }

    // Populate metadata for response
    const db = dbConnections.db2 || mongoose.connection;
    let school = null;
    let branch = null;
    let child = null;

    if (device.schoolId) {
      school = await db.collection("schools").findOne({ _id: device.schoolId }, { projection: { schoolName: 1 } });
    }
    if (device.branchId) {
      branch = await db.collection("branches").findOne({ _id: device.branchId }, { projection: { branchName: 1 } });
    }
    if (device.childId) {
      child = await db.collection("children").findOne({ _id: device.childId }, { projection: { childName: 1, className: 1, rollNumber: 1 } });
    }

    res.status(200).json({
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
      const db = dbConnections.db2 || mongoose.connection;
      const children = await db.collection("children").find({ parentId: new ObjectId(id) }).toArray();
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
 */
export const getDeviceHistoryHierarchy = async (req, res) => {
  const { role, id, AssignedBranch } = getUserContext(req);
  const { identifier } = req.params;
  const { beginTime, endTime, days = 7 } = req.query;

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
      const db = dbConnections.db2 || mongoose.connection;
      const child = await db.collection("children").findOne({ _id: device.childId, parentId: new ObjectId(id) });
      if (!child) {
        return res.status(403).json({ success: false, message: "Unauthorized for this child device" });
      }
    }

    const now = Date.now();
    const parsedBegin = beginTime ? Number(beginTime) : now - (Number(days) * 24 * 60 * 60 * 1000);
    const parsedEnd = endTime ? Number(endTime) : now;

    const cloudData = await geotagService.getDeviceHistory(device.sn, {
      beginTime: parsedBegin,
      endTime: parsedEnd,
    });

    res.status(200).json({
      success: true,
      sn: device.sn,
      name: device.name,
      battery: device.battery,
      batteryStatus: device.batteryStatus,
      totalPoints: cloudData?.total || (cloudData?.list || []).length,
      history: cloudData?.list || [],
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
    const db = dbConnections.db2 || mongoose.connection;

    // Find children of this parent
    const children = await db.collection("children").find({ parentId: parentObjectId }).toArray();
    if (!children || children.length === 0) {
      return res.status(404).json({ success: false, message: "No children found for this parent" });
    }

    const childIds = children.map((c) => c._id);

    // Find BLE devices assigned to any of these children
    const devices = await BLEDevice.find({ childId: { $in: childIds }, isActive: true });

    // Always fetch freshest live coordinates & battery from GeoTag cloud for parent view
    await Promise.allSettled(
      devices.map(async (dev) => {
        try {
          const cloudHist = await geotagService.getDeviceHistory(dev.sn);
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
            await BLEDevice.updateOne(
              { _id: dev._id },
              {
                $set: {
                  lastLocation: dev.lastLocation,
                  battery: dev.battery,
                  batteryStatus: dev.batteryStatus,
                  lastUpdate: dev.lastUpdate,
                },
              }
            );
          }
        } catch (err) {
          // keep cached location
        }
      })
    );

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
 * 5. Sync Devices from GeoTag Cloud into DB
 * Fetches all cloud devices and latest coordinates, preserving existing school/child assignments.
 */
export const syncFromGeoTagCloud = async (req, res) => {
  try {
    const cloudResult = await geotagService.getDeviceList({ page: 1, pageSize: 100 });
    const cloudDevices = cloudResult?.list || [];

    const summary = { totalFromCloud: cloudDevices.length, synced: 0, errors: [] };

    for (const d of cloudDevices) {
      try {
        let lastLoc = null;
        let battery = null;
        let batteryStatus = "";

        try {
          const hist = await geotagService.getDeviceHistory(d.sn);
          if (hist?.list && hist.list.length > 0) {
            const latest = hist.list[0];
            lastLoc = {
              lat: latest.lat,
              lng: latest.lng,
              address: latest.address,
              reportedTime: latest.reportedTime ? new Date(latest.reportedTime) : null,
              locationTime: latest.locationTime ? new Date(latest.locationTime) : null,
              accuracy: latest.accuracy,
              confidence: latest.confidence,
            };
            battery = latest.battery !== undefined ? latest.battery : null;
            batteryStatus = latest.batteryStatus || "";
          }
        } catch (err) {
          // Continue if history fetch fails
        }

        const cloudStatus = d.status !== undefined ? (d.status === 1 || d.status === '1' || d.status === 'active' ? 'active' : String(d.status)) : '';

        const updateSet = {
          mac: d.mac || "",
          uuid: d.uuid || "",
          lastLocation: lastLoc,
          lastUpdate: new Date(),
        };
        if (battery !== null) updateSet.battery = battery;
        if (batteryStatus) updateSet.batteryStatus = batteryStatus;
        if (cloudStatus) updateSet.status = cloudStatus;
        if (d.model) updateSet.model = d.model;

        await BLEDevice.findOneAndUpdate(
          { sn: d.sn },
          {
            $set: updateSet,
            $setOnInsert: {
              name: d.sn,
              status: cloudStatus || "active",
              isActive: true,
              category: "GeoTag",
              model: d.model || "",
              battery,
              batteryStatus,
              schoolId: null,
              branchId: null,
              supervisorId: null,
              childId: null,
            },
          },
          { upsert: true, returnDocument: 'after' }
        );

        summary.synced += 1;
      } catch (err) {
        summary.errors.push({ sn: d.sn, error: err.message });
      }
    }

    res.status(200).json({
      success: true,
      message: "Sync completed successfully",
      summary,
    });
  } catch (err) {
    console.error("Error in syncFromGeoTagCloud:", err);
    res.status(500).json({ success: false, message: err.message });
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
