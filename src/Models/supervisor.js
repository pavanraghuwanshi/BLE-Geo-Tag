import mongoose from 'mongoose';
// const { encrypt, decrypt } = require('./cryptoUtils'); 
import  {dbConnections}  from "../Database/db.js"; 

// Define the schema for the School model
const supervisorSchema = new mongoose.Schema({
  supervisorName: {
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
  email:{
    type: String,
  },
  mobileNo:{
    type: String
  },
 status:{
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
    default: "supervisor"
  },
   Active: {
    type: Boolean,
    default: true
  },
  fcmToken:[{type: String, default: null, select: false}],
  Notification:{ type: Boolean, default: true },

},{ timestamps: true }
);



export default dbConnections.db2.model('Supervisor', supervisorSchema);
