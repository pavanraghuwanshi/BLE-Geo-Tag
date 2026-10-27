import mongoose from "mongoose";
// const { encrypt, decrypt } = require('./cryptoUtils');
import { dbConnections } from "../Database/db.js";
import branch from "./branch.js";

// Define the schema for the School model
const ParentSchema = new mongoose.Schema(
  {
    parentName: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      // required: true
    },
    fullAccess: {
      type: Boolean,
      default: false,
    },
    mobileNo: {
      type: String,
      // required: [true, 'Contact number is required'],
      match: [/^\d{10}$/, "Contact number must be 10 digits"],
      validate: {
        validator: function (v) {
          return /^[6-9]\d{9}$/.test(v);
        },
        message: (props) => `${props.value} is not a valid contact number!`,
      },
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
    role: {
      type: String,
      default: "parent",
    },
    fcmToken: [{ type: String, default: null }],
    Notification:{ type: Boolean, default: true },
    Active: {
    type: Boolean,
    default: true
  },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

export default dbConnections.db2.model("Parent", ParentSchema);
