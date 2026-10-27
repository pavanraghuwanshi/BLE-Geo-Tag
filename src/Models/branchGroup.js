import mongoose from 'mongoose';
import  {dbConnections}  from "../Database/db.js"; 

const branchSchema = new mongoose.Schema({
  branchGroupName: {
    type: String,
    required: true
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  },
  AssignedBranch:[{
     type:mongoose.Schema.Types.ObjectId,
     ref:'Branch'
  }],
 mobileNo:{
    type: String,
   default: ''
  },
  username: {
  type: String,
  required: true,
  unique: true,
  lowercase: true,
  trim: true
  },
  password:{
    type: String,
    default: ''
  },
  email:{
    type: String,
    default: ''
  },
  fullAccess: {
    type: Boolean,
    default: false
  },
  access: {
    type: Object,
    default: null
  },
  role: {
    type: String,  default: 'branchGroup'
  },
  Active: {
    type: Boolean,
    default: true
  },
  Notification:{ type: Boolean, default: true },
  fcmToken: [{ type: String, default: null }],
  createdAt: { type: Date, default: () => new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000))}

});


export default dbConnections.db2.model('BranchGroup', branchSchema);
