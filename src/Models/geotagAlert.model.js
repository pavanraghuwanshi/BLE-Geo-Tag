import mongoose from 'mongoose';
import { dbConnections } from '../Database/db.js';
import './geotagFence.model.js';
import './bleDevice.model.js';
import './child.js';
import './parents.js';

const geotagAlertSchema = new mongoose.Schema(
  {
    fenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GeotagFence',
      required: true,
    },
    fenceName: {
      type: String,
      required: true,
    },
    deviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BLEDevice',
      default: null,
    },
    sn: {
      type: String,
      required: true,
      trim: true,
    },
    childId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Child',
      default: null,
    },
    childName: {
      type: String,
      default: '',
    },
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
    eventType: {
      type: String,
      enum: ['ENTER', 'EXIT'],
      required: true,
    },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      address: { type: String, default: '' },
    },
    distanceFromCenter: {
      type: Number,
      default: null,
    },
    notifiedParents: [
      {
        parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent' },
        parentName: { type: String, default: '' },
        tokensSentCount: { type: Number, default: 0 },
      },
    ],
    isHandled: {
      type: Boolean,
      default: false,
    },
    handledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

geotagAlertSchema.index({ sn: 1, createdAt: -1 });
geotagAlertSchema.index({ childId: 1, createdAt: -1 });
geotagAlertSchema.index({ schoolId: 1, branchId: 1, createdAt: -1 });

export const GeotagAlert = dbConnections.model('GeotagAlert', geotagAlertSchema);
export default GeotagAlert;

