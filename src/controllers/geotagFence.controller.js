import mongoose from 'mongoose';
import { GeotagFence } from '../Models/geotagFence.model.js';
import { GeotagAlert } from '../Models/geotagAlert.model.js';
import { BLEDevice } from '../Models/bleDevice.model.js';
import Child from '../Models/child.js';
import Parent from '../Models/parents.js';
import School from '../Models/school.js';
import Branch from '../Models/branch.js';

const ObjectId = mongoose.Types.ObjectId;

function getUserContext(req) {
  if (req.user && req.user.role) {
    return {
      role: req.user.role,
      id: req.user.id || req.user._id,
      AssignedBranch: req.user.AssignedBranch || [],
    };
  }
  return {
    role: req.headers['x-role'] || req.query.role || 'superAdmin',
    id: req.headers['x-user-id'] || req.query.userId || req.query.id,
    AssignedBranch: req.headers['x-assigned-branch']
      ? JSON.parse(req.headers['x-assigned-branch'])
      : (req.query.assignedBranch ? [req.query.assignedBranch] : []),
  };
}

/**
 * 1. Create a new Geofence
 * POST /api/geofences
 */
export async function createGeofence(req, res) {
  try {
    const { role, id } = getUserContext(req);
    const {
      name,
      fenceType = 'circle',
      center,
      radius = 200,
      coordinates = [],
      alarmRules = 'both',
      status = 'active',
      schoolId,
      branchId,
      childId,
      deviceIds = [],
      boundaryToleranceMeter = 5,
      cooldownMinutes = 2,
      scheduleType = 'all',
      scheduleStartTime,
      scheduleEndTime,
      remark,
    } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Fence name is required' });
    }

    if (fenceType === 'circle') {
      if (!center || center.lat == null || center.lng == null) {
        return res.status(400).json({
          success: false,
          message: 'Center coordinates { lat, lng } are required for circular fences',
        });
      }
      if (!radius || Number(radius) <= 0) {
        return res.status(400).json({ success: false, message: 'Valid radius in meters is required' });
      }
    } else if (fenceType === 'polygon') {
      if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
        return res.status(400).json({
          success: false,
          message: 'Polygon fence requires at least 3 coordinates [{ lat, lng }]',
        });
      }
    }

    // Role-based hierarchy assignment
    let effectiveSchoolId = schoolId ? new ObjectId(schoolId) : null;
    let effectiveBranchId = branchId ? new ObjectId(branchId) : null;
    let effectiveChildId = childId && ObjectId.isValid(childId) ? new ObjectId(childId) : null;

    // Convert deviceIds to ObjectIds if passed
    const boundDevices = Array.isArray(deviceIds)
      ? deviceIds.map((d) => (ObjectId.isValid(d) ? new ObjectId(d) : null)).filter(Boolean)
      : [];

    if (role === 'school') {
      effectiveSchoolId = new ObjectId(id);
    } else if (role === 'branch') {
      effectiveBranchId = new ObjectId(id);
    } else if (role === 'parent') {
      // 1. Fetch children belonging to this parent
      const parentChildren = await Child.find({ parentId: new ObjectId(id) }).select('_id schoolId branchId childName');
      if (!parentChildren || parentChildren.length === 0) {
        return res.status(400).json({ success: false, message: 'No registered children found for this parent' });
      }

      let targetChild;
      if (effectiveChildId) {
        targetChild = parentChildren.find((c) => c._id.toString() === effectiveChildId.toString());
        if (!targetChild) {
          return res.status(403).json({ success: false, message: 'You are only allowed to create geofences for your own child' });
        }
      } else if (parentChildren.length === 1) {
        targetChild = parentChildren[0];
        effectiveChildId = targetChild._id;
      } else {
        return res.status(400).json({ success: false, message: 'Please specify childId for which child to create the geofence' });
      }

      // Inherit school and branch from child if not provided
      effectiveSchoolId = targetChild.schoolId ? new ObjectId(targetChild.schoolId) : effectiveSchoolId;
      effectiveBranchId = targetChild.branchId ? new ObjectId(targetChild.branchId) : effectiveBranchId;

      // 2. Automatically bind the child's active BLE device if not explicitly provided
      if (boundDevices.length === 0) {
        const childDevice = await BLEDevice.findOne({ childId: targetChild._id, isActive: true }).select('_id');
        if (childDevice) {
          boundDevices.push(childDevice._id);
        }
      }
    }

    // If childId is provided and schoolId/branchId are not yet set, inherit from Child
    if (effectiveChildId && (!effectiveSchoolId || !effectiveBranchId)) {
      const childDoc = await Child.findById(effectiveChildId).select('schoolId branchId');
      if (childDoc) {
        if (!effectiveSchoolId && childDoc.schoolId) effectiveSchoolId = new ObjectId(childDoc.schoolId);
        if (!effectiveBranchId && childDoc.branchId) effectiveBranchId = new ObjectId(childDoc.branchId);
      }
    }

    const fence = await GeotagFence.create({
      name: name.trim(),
      fenceType,
      center: center ? { lat: Number(center.lat), lng: Number(center.lng) } : null,
      radius: Number(radius) || 200,
      coordinates: Array.isArray(coordinates)
        ? coordinates.map((c) => ({ lat: Number(c.lat), lng: Number(c.lng) }))
        : [],
      alarmRules,
      status,
      schoolId: effectiveSchoolId,
      branchId: effectiveBranchId,
      childId: effectiveChildId,
      devices: boundDevices,
      boundaryToleranceMeter: Number(boundaryToleranceMeter) || 5,
      cooldownMinutes: Number(cooldownMinutes) || 2,
      scheduleType,
      scheduleStartTime,
      scheduleEndTime,
      remark: remark || '',
      createdBy: id && ObjectId.isValid(id) ? new ObjectId(id) : null,
      creatorRole: role,
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: 'Geofence created successfully',
      fence,
    });
  } catch (err) {
    console.error('[Create Geofence Error]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * 2. Get Geofences (Hierarchy-Filtered with Search, Child/Parent/School/Branch Names & Pagination)
 * GET /api/geofences
 */
export async function getGeofences(req, res) {
  try {
    const { role, id, AssignedBranch } = getUserContext(req);
    const {
      page = 1,
      limit = 20,
      search = '',
      name = '',
      fenceName = '',
      childName = '',
      parentName = '',
      partName = '',
      part = '',
      deviceName = '',
      sn = '',
      status,
      fenceType,
      schoolId,
      branchId,
      childId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 20);

    const match = { isActive: true };
    const andConditions = [];

    // 1. Role Hierarchy Filtering
    if (role === 'superAdmin') {
      // SuperAdmin can view all
    } else if (role === 'school') {
      match.schoolId = new ObjectId(id);
    } else if (role === 'branchGroup') {
      const branches = (AssignedBranch || []).map((b) => new ObjectId(b));
      match.branchId = { $in: branches };
    } else if (role === 'branch') {
      match.branchId = new ObjectId(id);
    } else if (role === 'parent') {
      // Find parent's children
      const children = await Child.find({ parentId: new ObjectId(id) }).select('_id');
      const childIds = children.map((c) => c._id);
      match.childId = { $in: childIds };
    }

    // 2. Direct filter params
    const targetFenceName = (name || fenceName).trim();
    if (targetFenceName) {
      match.name = { $regex: targetFenceName, $options: 'i' };
    }
    if (status) match.status = status;
    if (fenceType) match.fenceType = fenceType;
    if (schoolId && ObjectId.isValid(schoolId)) match.schoolId = new ObjectId(schoolId);
    if (branchId && ObjectId.isValid(branchId)) match.branchId = new ObjectId(branchId);
    if (childId && ObjectId.isValid(childId)) match.childId = new ObjectId(childId);

    // 3. Specific Child Name filter
    if (childName && childName.trim()) {
      const matchedChildren = await Child.find({
        childName: { $regex: childName.trim(), $options: 'i' },
      }).select('_id');
      const childIds = matchedChildren.map((c) => c._id);
      andConditions.push({ childId: { $in: childIds } });
    }

    // 4. Specific Parent Name filter (supports parentName, partName, or part)
    const targetParentName = (parentName || partName || part).trim();
    if (targetParentName) {
      const matchedParents = await Parent.find({
        parentName: { $regex: targetParentName, $options: 'i' },
      }).select('_id');
      const parentIds = matchedParents.map((p) => p._id);
      const childrenOfParents = await Child.find({
        parentId: { $in: parentIds },
      }).select('_id');
      const childIds = childrenOfParents.map((c) => c._id);
      andConditions.push({ childId: { $in: childIds } });
    }

    // 5. Device Name or SN filter
    if ((deviceName && deviceName.trim()) || (sn && sn.trim())) {
      const devMatch = {};
      if (deviceName && deviceName.trim()) devMatch.name = { $regex: deviceName.trim(), $options: 'i' };
      if (sn && sn.trim()) devMatch.sn = { $regex: sn.trim(), $options: 'i' };
      const matchedDevs = await BLEDevice.find(devMatch).select('_id');
      andConditions.push({ devices: { $in: matchedDevs.map((d) => d._id) } });
    }

    // 6. Universal Search across Fence Name, Child Name, Parent Name, Device Name, and SN
    if (search && search.trim()) {
      const s = search.trim();
      const searchRegex = { $regex: s, $options: 'i' };

      // Find children matching search
      const matchedChildren = await Child.find({ childName: searchRegex }).select('_id');
      const childIds = matchedChildren.map((c) => c._id);

      // Find parents matching search -> their children
      const matchedParents = await Parent.find({ parentName: searchRegex }).select('_id');
      const parentIds = matchedParents.map((p) => p._id);
      const parentChildIds = (
        await Child.find({ parentId: { $in: parentIds } }).select('_id')
      ).map((c) => c._id);

      const allMatchingChildIds = Array.from(
        new Set([...childIds.map(String), ...parentChildIds.map(String)])
      ).map((cid) => new ObjectId(cid));

      // Find devices matching search
      const matchedDevices = await BLEDevice.find({
        $or: [{ name: searchRegex }, { sn: searchRegex }],
      }).select('_id');
      const devIds = matchedDevices.map((d) => d._id);

      const searchOr = [
        { name: searchRegex },
        { remark: searchRegex },
      ];

      if (allMatchingChildIds.length > 0) {
        searchOr.push({ childId: { $in: allMatchingChildIds } });
      }
      if (devIds.length > 0) {
        searchOr.push({ devices: { $in: devIds } });
      }

      andConditions.push({ $or: searchOr });
    }

    if (andConditions.length > 0) {
      match.$and = andConditions;
    }

    const skip = (parsedPage - 1) * parsedLimit;
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    // Simply populate schoolId, branchId, childId (with parentId for parent info), and devices
    const [rawFences, total] = await Promise.all([
      GeotagFence.find(match)
        .populate('schoolId', 'schoolName email')
        .populate('branchId', 'branchName mobileNo')
        .populate({
          path: 'childId',
          select: 'childName className section rollNumber parentId mobileNo DOB age gender',
          populate: {
            path: 'parentId',
            select: 'parentName mobileNo email',
          },
        })
        .populate('devices', 'name sn')
        .sort(sort)
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      GeotagFence.countDocuments(match),
    ]);

    // Format each fence item extracting schoolName, branchName, parentName, childName directly to top-level
    // while keeping childId clean without duplicated schoolId, branchId, or parentId object
    const fences = rawFences.map((f) => {
      let child = null;
      let parentName = '';
      let parentMobile = '';

      if (f.childId) {
        const parent = f.childId.parentId;
        if (parent && typeof parent === 'object') {
          parentName = parent.parentName || '';
          parentMobile = parent.mobileNo || '';
        }
        child = {
          _id: f.childId._id,
          childName: f.childId.childName || '',
          className: f.childId.className || '',
          section: f.childId.section || '',
          rollNumber: f.childId.rollNumber || '',
          DOB: f.childId.DOB || null,
          age: f.childId.age != null ? f.childId.age : null,
          gender: f.childId.gender || '',
          parentId: parent?._id ? parent._id.toString() : (parent ? parent.toString() : null),
        };
        if (f.childId.mobileNo) {
          child.mobileNo = f.childId.mobileNo;
        }
      }

      const school = f.schoolId || null;
      const branch = f.branchId || null;

      return {
        ...f,
        childId: child,
        schoolName: school?.schoolName || '',
        branchName: branch?.branchName || '',
        childName: child?.childName || '',
        parentName,
        parentMobile,
      };
    });

    const totalPages = Math.ceil(total / parsedLimit);

    return res.json({
      success: true,
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages,
      hasPrevPage: parsedPage > 1,
      hasNextPage: parsedPage < totalPages,
      fences,
    });
  } catch (err) {
    console.error('[Get Geofences Error]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * 3. Get Geofence By ID
 * GET /api/geofences/:id
 */
export async function getGeofenceById(req, res) {
  try {
    const { role, id: userId } = getUserContext(req);
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid geofence ID' });
    }

    const fence = await GeotagFence.findOne({ _id: new ObjectId(id), isActive: true })
      .populate('schoolId', 'schoolName email')
      .populate('branchId', 'branchName mobileNo')
      .populate({
        path: 'childId',
        select: 'childName className section rollNumber parentId mobileNo DOB age gender',
        populate: {
          path: 'parentId',
          select: 'parentName mobileNo email',
        },
      })
      .populate('devices', 'name sn mac battery lastLocation')
      .lean();

    if (!fence) {
      return res.status(404).json({ success: false, message: 'Geofence not found' });
    }

    // Role check for parent: must be linked to parent's child or their child's school
    if (role === 'parent') {
      const parentChildren = await Child.find({ parentId: new ObjectId(userId) }).select('_id schoolId');
      const childIds = parentChildren.map((c) => c._id.toString());
      const schoolIds = parentChildren.map((c) => c.schoolId?.toString()).filter(Boolean);

      const isMyChildFence = fence.childId && childIds.includes(fence.childId._id?.toString() || fence.childId.toString());
      const isMySchoolFence = !fence.childId && fence.schoolId && schoolIds.includes(fence.schoolId._id?.toString() || fence.schoolId.toString());

      if (!isMyChildFence && !isMySchoolFence) {
        return res.status(403).json({ success: false, message: 'Not authorized to view this geofence' });
      }
    }

    let child = null;
    let parentName = '';
    let parentMobile = '';

    if (fence.childId) {
      const parent = fence.childId.parentId;
      if (parent && typeof parent === 'object') {
        parentName = parent.parentName || '';
        parentMobile = parent.mobileNo || '';
      }
      child = {
        _id: fence.childId._id,
        childName: fence.childId.childName || '',
        className: fence.childId.className || '',
        section: fence.childId.section || '',
        rollNumber: fence.childId.rollNumber || '',
        DOB: fence.childId.DOB || null,
        age: fence.childId.age != null ? fence.childId.age : null,
        gender: fence.childId.gender || '',
        parentId: parent?._id ? parent._id.toString() : (parent ? parent.toString() : null),
      };
      if (fence.childId.mobileNo) {
        child.mobileNo = fence.childId.mobileNo;
      }
    }

    const school = fence.schoolId || null;
    const branch = fence.branchId || null;

    return res.json({
      success: true,
      fence: {
        ...fence,
        childId: child,
        schoolName: school?.schoolName || '',
        branchName: branch?.branchName || '',
        childName: child?.childName || '',
        parentName,
        parentMobile,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * 4. Update Geofence
 * PUT /api/geofences/:id
 */
export async function updateGeofence(req, res) {
  try {
    const { role, id: userId } = getUserContext(req);
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid geofence ID' });
    }

    const existingFence = await GeotagFence.findOne({ _id: new ObjectId(id), isActive: true });
    if (!existingFence) {
      return res.status(404).json({ success: false, message: 'Geofence not found' });
    }

    // Role check for parent: can only update geofences for their own children
    if (role === 'parent') {
      const parentChildren = await Child.find({ parentId: new ObjectId(userId) }).select('_id');
      const childIds = parentChildren.map((c) => c._id.toString());
      const isOwner = existingFence.createdBy && existingFence.createdBy.toString() === userId.toString();
      const isMyChildFence = existingFence.childId && childIds.includes(existingFence.childId.toString());

      if (!isOwner && !isMyChildFence) {
        return res.status(403).json({ success: false, message: 'You are only authorized to update geofences for your own child' });
      }
    }

    const updates = { ...req.body };
    delete updates._id;
    delete updates.createdBy;
    delete updates.creatorRole;

    if (updates.deviceIds) {
      updates.devices = updates.deviceIds
        .map((d) => (ObjectId.isValid(d) ? new ObjectId(d) : null))
        .filter(Boolean);
      delete updates.deviceIds;
    }

    const updated = await GeotagFence.findByIdAndUpdate(
      new ObjectId(id),
      { $set: updates },
      { new: true }
    )
      .populate('schoolId', 'schoolName email')
      .populate('branchId', 'branchName mobileNo')
      .populate({
        path: 'childId',
        select: 'childName className section rollNumber parentId mobileNo DOB age gender',
        populate: {
          path: 'parentId',
          select: 'parentName mobileNo email',
        },
      })
      .populate('devices', 'name sn mac battery lastLocation')
      .lean();

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Geofence not found' });
    }

    let child = null;
    let parentName = '';
    let parentMobile = '';

    if (updated.childId) {
      const parent = updated.childId.parentId;
      if (parent && typeof parent === 'object') {
        parentName = parent.parentName || '';
        parentMobile = parent.mobileNo || '';
      }
      child = {
        _id: updated.childId._id,
        childName: updated.childId.childName || '',
        className: updated.childId.className || '',
        section: updated.childId.section || '',
        rollNumber: updated.childId.rollNumber || '',
        DOB: updated.childId.DOB || null,
        age: updated.childId.age != null ? updated.childId.age : null,
        gender: updated.childId.gender || '',
        parentId: parent?._id ? parent._id.toString() : (parent ? parent.toString() : null),
      };
      if (updated.childId.mobileNo) {
        child.mobileNo = updated.childId.mobileNo;
      }
    }

    const school = updated.schoolId || null;
    const branch = updated.branchId || null;

    return res.json({
      success: true,
      message: 'Geofence updated successfully',
      fence: {
        ...updated,
        childId: child,
        schoolName: school?.schoolName || '',
        branchName: branch?.branchName || '',
        childName: child?.childName || '',
        parentName,
        parentMobile,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * 5. Delete Geofence
 * DELETE /api/geofences/:id
 */
export async function deleteGeofence(req, res) {
  try {
    const { role, id: userId } = getUserContext(req);
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid geofence ID' });
    }

    const existingFence = await GeotagFence.findOne({ _id: new ObjectId(id), isActive: true });
    if (!existingFence) {
      return res.status(404).json({ success: false, message: 'Geofence not found' });
    }

    // Role check for parent: can only delete geofences for their own children
    if (role === 'parent') {
      const parentChildren = await Child.find({ parentId: new ObjectId(userId) }).select('_id');
      const childIds = parentChildren.map((c) => c._id.toString());
      const isOwner = existingFence.createdBy && existingFence.createdBy.toString() === userId.toString();
      const isMyChildFence = existingFence.childId && childIds.includes(existingFence.childId.toString());

      if (!isOwner && !isMyChildFence) {
        return res.status(403).json({ success: false, message: 'You are only authorized to delete geofences for your own child' });
      }
    }

    const deleted = await GeotagFence.findByIdAndUpdate(
      new ObjectId(id),
      { $set: { isActive: false, status: 'inactive' } },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Geofence not found' });
    }

    return res.json({ success: true, message: 'Geofence deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * 6. Get Geofence Alert History (with Search, Child/Parent/School/Branch Names & Pagination)
 * GET /api/geofences/alerts
 */
export async function getGeofenceAlerts(req, res) {
  try {
    const { role, id } = getUserContext(req);
    const {
      page = 1,
      limit = 20,
      search = '',
      childName = '',
      parentName = '',
      partName = '',
      part = '',
      fenceName = '',
      sn,
      childId,
      fenceId,
      eventType,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 20);

    const match = {};
    const andConditions = [];

    // 1. Role Hierarchy Filtering
    if (role === 'superAdmin') {
      // All alerts
    } else if (role === 'school') {
      match.schoolId = new ObjectId(id);
    } else if (role === 'branch') {
      match.branchId = new ObjectId(id);
    } else if (role === 'parent') {
      const children = await Child.find({ parentId: new ObjectId(id) }).select('_id');
      const childIds = children.map((c) => c._id);
      match.childId = { $in: childIds };
    }

    if (sn) match.sn = sn.trim();
    if (childId && ObjectId.isValid(childId)) match.childId = new ObjectId(childId);
    if (fenceId && ObjectId.isValid(fenceId)) match.fenceId = new ObjectId(fenceId);
    if (eventType) match.eventType = eventType.toUpperCase();
    if (fenceName && fenceName.trim()) match.fenceName = { $regex: fenceName.trim(), $options: 'i' };

    // 2. Specific Child Name filter
    if (childName && childName.trim()) {
      match.childName = { $regex: childName.trim(), $options: 'i' };
    }

    // 3. Specific Parent Name filter (supports parentName, partName, part)
    const targetParentName = (parentName || partName || part).trim();
    if (targetParentName) {
      const matchedParents = await Parent.find({
        parentName: { $regex: targetParentName, $options: 'i' },
      }).select('_id');
      const parentIds = matchedParents.map((p) => p._id);
      const childrenOfParents = await Child.find({
        parentId: { $in: parentIds },
      }).select('_id');
      const childIds = childrenOfParents.map((c) => c._id);

      andConditions.push({
        $or: [
          { childId: { $in: childIds } },
          { 'notifiedParents.parentName': { $regex: targetParentName, $options: 'i' } },
        ],
      });
    }

    // 4. Universal Search
    if (search && search.trim()) {
      const s = search.trim();
      const searchRegex = { $regex: s, $options: 'i' };

      const matchedParents = await Parent.find({ parentName: searchRegex }).select('_id');
      const parentIds = matchedParents.map((p) => p._id);
      const parentChildIds = (
        await Child.find({ parentId: { $in: parentIds } }).select('_id')
      ).map((c) => c._id);

      const searchOr = [
        { fenceName: searchRegex },
        { childName: searchRegex },
        { sn: searchRegex },
        { 'notifiedParents.parentName': searchRegex },
      ];

      if (parentChildIds.length > 0) {
        searchOr.push({ childId: { $in: parentChildIds } });
      }

      andConditions.push({ $or: searchOr });
    }

    // 5. Date Range Filtering
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    if (andConditions.length > 0) {
      match.$and = andConditions;
    }

    const skip = (parsedPage - 1) * parsedLimit;
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [rawAlerts, total] = await Promise.all([
      GeotagAlert.find(match)
        .populate('fenceId', 'name fenceType radius center')
        .populate('schoolId', 'schoolName email')
        .populate('branchId', 'branchName mobileNo')
        .populate({
          path: 'childId',
          select: 'childName className section rollNumber parentId mobileNo DOB age gender',
          populate: {
            path: 'parentId',
            select: 'parentName mobileNo email',
          },
        })
        .populate('deviceId', 'name sn mac battery lastLocation')
        .sort(sort)
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      GeotagAlert.countDocuments(match),
    ]);

    // Format alerts with schoolName, branchName, childName, and parentName
    // while keeping childId clean without duplicated schoolId, branchId, or parentId object
    const alerts = rawAlerts.map((a) => {
      let child = null;
      let parentName = '';
      let parentMobile = '';

      if (a.childId) {
        const parent = a.childId.parentId || a.notifiedParents?.[0] || null;
        if (parent && typeof parent === 'object') {
          parentName = parent.parentName || '';
          parentMobile = parent.mobileNo || '';
        }
        child = {
          _id: a.childId._id,
          childName: a.childId.childName || '',
          className: a.childId.className || '',
          section: a.childId.section || '',
          rollNumber: a.childId.rollNumber || '',
          DOB: a.childId.DOB || null,
          age: a.childId.age != null ? a.childId.age : null,
          gender: a.childId.gender || '',
          parentId: parent?._id ? parent._id.toString() : (parent ? parent.toString() : null),
        };
        if (a.childId.mobileNo) {
          child.mobileNo = a.childId.mobileNo;
        }
      } else if (a.notifiedParents && a.notifiedParents.length > 0) {
        parentName = a.notifiedParents[0].parentName || '';
        parentMobile = a.notifiedParents[0].mobileNo || '';
      }

      const school = a.schoolId || null;
      const branch = a.branchId || null;

      return {
        ...a,
        childId: child,
        schoolName: school?.schoolName || '',
        branchName: branch?.branchName || '',
        childName: a.childName || child?.childName || '',
        parentName,
        parentMobile,
      };
    });

    const totalPages = Math.ceil(total / parsedLimit);

    return res.json({
      success: true,
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages,
      hasPrevPage: parsedPage > 1,
      hasNextPage: parsedPage < totalPages,
      alerts,
    });
  } catch (err) {
    console.error('[Get Alerts Error]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}
