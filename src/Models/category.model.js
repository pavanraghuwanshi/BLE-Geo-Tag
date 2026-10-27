import mongoose from "mongoose";
import { dbConnections } from "../Database/db.js";

const { Schema } = mongoose;

const categorySchema = new Schema(
  {
    categoryName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
  },
  { timestamps: true }
);


export const Category = dbConnections.db2.model("Category", categorySchema);
