import mongoose from 'mongoose';
// const { encrypt, decrypt } = require('./cryptoUtils'); 
import  {dbConnections}  from "../Database/db.js"; 

const branchSchema = new mongoose.Schema({
  branchName: {
    type: String,
    required: true
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  },
  mobileNo:{
    type: String,
    // required: [true, 'Contact number is required'],
    match: [/^\d{10}$/, 'Contact number must be 10 digits'],
    validate: {
      validator: function (v) {
        return /^[6-9]\d{9}$/.test(v);
      },
      message: props => `${props.value} is not a valid contact number!`
    }
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
  fullAccess: {
    type: Boolean,
    default: false
  },
  access: {
    type: Object,
    default: null
  },
  email:{
    type: String,
    default: ''
  },
  role: {
    type: String,  default: 'branch'
  },
  subscriptionExpirationDate:{
    type: Date,
    default: null
  },
  Active: {
    type: Boolean,
    default: true
  },

  fcmToken: [{ type: String, default: null }],
  createdAt: { type: Date, default: () => new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000))},
  lastNotifiedDate: {
     type: Date, 
     default: null 
    },
notificationsEnabled: {
  geofence: { type: Boolean, default: false },
  eta: { type: Boolean, default: false },
  vehicleStatus: { type: Boolean, default: false },
  overspeed: { type: Boolean, default: false },
  sos: { type: Boolean, default: false },
  busWiseTrip: { type: Boolean, default: false }
},
Notification:{ type: Boolean, default: true },



});




export default dbConnections.db2.model('Branch', branchSchema);
