import mongoose from 'mongoose';
import { dbConnections } from "../Database/db.js";

const driverSchema = new mongoose.Schema({
  driverName: {
    type: String,
    required: true
  },
 username: {
  type: String,
  required: true,
  unique: true,
  lowercase: true,
  trim: true
  },
  password: {
    type: String,
    required: true
  },
  email: {
    type: String,
  },
  mobileNo: {
    type: String
  },
   isApproved:{
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  routeObjId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
  },
  role: {
    type: String,
    default: "driver"
  },
  address:{
    type:String
  },
  Active: {
    type: Boolean,
    default: true
  },
  fcmToken:[ { type: String, default: null }],
  Notification:{ type: Boolean, default: true },
}, { timestamps: true });

export default dbConnections.db2.model('Driver', driverSchema);
