import mongoose from "mongoose";
import { dbConnections } from "../Database/db.js";

const deviceSubscriptionHistorySchema = new mongoose.Schema(
  {
    deviceObjId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Device",
      required: true,
    },

    oldEndDate: {
      type: Date,
      default: null,
    },

    newEndDate: {
      type: Date,
      required: true,
    },

    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "changedByModel",
    },

    changedByModel: {
      type: String,
      required: true,
      enum: ["School", "Branch", "BranchGroup", "SuperAdmin"],
    },

    changedByRole: {
      type: String,
      required: true,
      enum: ["school", "branch", "branchGroup", "superAdmin"],
    },

    changedAt: {
      type: Date,
      default: Date.now,
    },

    remark: {
      type: String,
      default: "Subscription updated",
    },
  },
  { timestamps: true }
);


const DeviceSubscriptionHistory = dbConnections.db2.model("DeviceSubscriptionHistory", deviceSubscriptionHistorySchema);

export { DeviceSubscriptionHistory };