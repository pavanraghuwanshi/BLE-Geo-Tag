import mongoose from 'mongoose';
import { dbConnections } from '../Database/db.js';
import './school.js';
import './branch.js';
import './supervisor.js';

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
  },
  {
    timestamps: true,
  }
);

// Ensure Child model schema is registered for Mongoose populate
const conn = dbConnections.db2 || mongoose;
if (!conn.models.Child) {
  conn.model('Child', new mongoose.Schema({
    childName: String,
    className: String,
    rollNumber: String,
    section: String,
  }, { timestamps: true }), 'children');
}

const BLEDevice = conn.model('BLEDevice', bleDeviceSchema, 'BLEDevice');

export { BLEDevice };
export default BLEDevice;
