import mongoose from 'mongoose';
// const { encrypt, decrypt } = require('./cryptoUtils'); 
import  {dbConnections}  from "../Database/db.js"; 

// Define the schema for the School model
const schoolSchema = new mongoose.Schema({
  schoolName: {
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
    required: true
  },
  mobileNo:{
    type: String
  },
  fullAccess: {
    type:Boolean,
    default:false
  },
  access: {
    type: Object,
    default: null
  },
  role: {
    type: String,
    default: "school"
  },
   Active: {
    type: Boolean,
    default: true
  },
  fcmToken:[{type: String, default: null}],
  Notification:{ type: Boolean, default: true },

},{
    versionKey: false,
    timestamps: true 
  }); 


export default dbConnections.db2.model("School", schoolSchema);