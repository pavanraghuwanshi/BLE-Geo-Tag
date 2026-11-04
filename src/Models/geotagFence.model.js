import mongoose from 'mongoose';
import { dbConnections } from '../Database/db.js';
import './school.js';
import './branch.js';
import './child.js';
import './bleDevice.model.js';

const coordinateSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false }
);

const geotagFenceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    fenceType: {
      type: String,
      enum: ['circle', 'polygon'],
      default: 'circle',
    },
    // For Circular Fence
    center: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    radius: {
      type: Number,
      default: 200, // In meters
    },
    // For Polygon Fence: array of { lat, lng } vertices
    coordinates: {
      type: [coordinateSchema],
      default: [],
    },
    // Which triggers to alert on
    alarmRules: {
      type: String,
      enum: ['exit', 'enter', 'both'],
      default: 'both',
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    // Hierarchy bindings
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      default: null,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    childId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Child',
      default: null,
    },
    // Specific devices bound to this fence (if empty, matches all devices for the school/branch/child)
    devices: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BLEDevice',
      },
    ],
    // GPS jitter tolerance buffer in meters
    boundaryToleranceMeter: {
      type: Number,
      default: 5,
    },
    // Minimum minutes between repeated alerts for the same device & fence
    cooldownMinutes: {
      type: Number,
      default: 2,
    },
    // Active schedule window
    scheduleType: {
      type: String,
      enum: ['all', 'custom'],
      default: 'all',
    },
    scheduleStartTime: {
      type: String,
      default: '00:00:00',
    },
    scheduleEndTime: {
      type: String,
      default: '23:59:59',
    },
    remark: {
      type: String,
      default: '',
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    creatorRole: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for fast lookup during webhook evaluation
geotagFenceSchema.index({ schoolId: 1, branchId: 1, status: 1 });
geotagFenceSchema.index({ childId: 1, status: 1 });
geotagFenceSchema.index({ devices: 1, status: 1 });

export const GeotagFence = dbConnections.model('GeotagFence', geotagFenceSchema);
export default GeotagFence;

