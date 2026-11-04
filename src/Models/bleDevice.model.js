import mongoose from 'mongoose';
import { dbConnections } from '../Database/db.js';
import './school.js';
import './branch.js';
import './supervisor.js';
import './child.js';

const bleDeviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sn: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    deviceId: {
      type: String,
      trim: true,
      default: '',
    },
    mac: {
      type: String,
      trim: true,
      default: '',
    },
    uuid: {
      type: String,
      trim: true,
      default: '',
    },
    model: {
      type: String,
      trim: true,
      default: '',
    },
    category: {
      type: String,
      trim: true,
      default: 'GeoTag',
    },
    status: {
      type: String,
      trim: true,
      default: '',
    },
    battery: {
      type: Number,
      default: null,
    },
    batteryStatus: {
      type: String,
      trim: true,
      default: '',
    },
    // Latest Location snapshot (no history stored as requested)
    lastLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      address: { type: String, default: '' },
      reportedTime: { type: Date, default: null },
      locationTime: { type: Date, default: null },
      accuracy: { type: Number, default: null },
      confidence: { type: Number, default: null },
    },
    lastUpdate: {
      type: Date,
      default: Date.now,
    },
    // Hierarchy References (Exact match with Credence Device model)
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
    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supervisor',
      default: null,
    },
    childId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Child',
      default: null,
    },
    subscriptionEndDate: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Geofence states for real-time breach detection
    fenceStates: [
      {
        fenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'GeotagFence' },
        status: { type: String, enum: ['inside', 'outside', 'unknown'], default: 'unknown' },
        lastEvaluatedAt: { type: Date, default: Date.now },
        lastNotifiedAt: { type: Date, default: null },
        lastEventType: { type: String, enum: ['ENTER', 'EXIT', null], default: null },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const conn = dbConnections.db2 || mongoose;
const BLEDevice = conn.model('BLEDevice', bleDeviceSchema, 'BLEDevice');

export { BLEDevice };
export default BLEDevice;
