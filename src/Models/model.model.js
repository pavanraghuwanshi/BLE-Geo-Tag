import mongoose from "mongoose";
import { dbConnections } from "../Database/db.js";

const { Schema } = mongoose;

const modelSchema = new Schema(
  {
    modelName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
  },
  { timestamps: true }
);


export const Model = dbConnections.db2.model("Model", modelSchema);
